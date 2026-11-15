import { useEffect, useRef, useState } from 'react'
import { ZoomIn, ZoomOut } from 'lucide-react'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { Loading, ErrorState } from './PreviewShell'
import { errorMessage } from '../lib/format'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/**
 * 日本語PDF用の CMap や標準フォントを、メインプロセス経由 (IPC) で読み込むファクトリ。
 * file:// からの fetch が使えない Electron のビルド版でも動くようにするため。
 */
class IpcBinaryDataFactory {
  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const dir = { cMapUrl: 'cmaps', standardFontDataUrl: 'standard_fonts', wasmUrl: 'wasm' }[kind]
    if (!dir) throw new Error(`unknown kind ${kind}`)
    return window.api.pdfAsset(dir, filename)
  }
}

const PAGE_STEP = 20

export function PdfPreview({ path }: { path: string }): React.JSX.Element {
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(1)
  const [limit, setLimit] = useState(PAGE_STEP)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    let task: pdfjs.PDFDocumentLoadingTask | null = null
    setDoc(null)
    setError('')
    setLimit(PAGE_STEP)
    window.api
      .readBytes(path)
      .then((bytes) => {
        if (!alive) return null
        task = pdfjs.getDocument({
          data: bytes,
          BinaryDataFactory: IpcBinaryDataFactory,
          useWorkerFetch: false,
          cMapUrl: 'cmaps/',
          cMapPacked: true,
          standardFontDataUrl: 'standard_fonts/',
          wasmUrl: 'wasm/'
        })
        return task.promise
      })
      .then((d) => {
        if (alive && d) setDoc(d)
      })
      .catch((e) => alive && setError(`PDF を表示できません: ${errorMessage(e)}`))
    return () => {
      alive = false
      task?.destroy()
    }
  }, [path])

  if (error) return <ErrorState text={error} />
  if (!doc) return <Loading />

  const count = Math.min(doc.numPages, limit)
  return (
    <div className="pdf">
      <div className="floating-tools">
        <button
          className="btn-icon small"
          onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.15).toFixed(2)))}
        >
          <ZoomOut size={15} />
        </button>
        <span className="zoom-label">{Math.round(zoom * 100)}%</span>
        <button
          className="btn-icon small"
          onClick={() => setZoom((z) => Math.min(3, +(z + 0.15).toFixed(2)))}
        >
          <ZoomIn size={15} />
        </button>
        <span className="zoom-label">{doc.numPages} ページ</span>
      </div>
      <div className="pdf-pages" ref={containerRef}>
        {Array.from({ length: count }, (_, i) => (
          <PdfPage key={`${path}-${i}`} doc={doc} pageNumber={i + 1} zoom={zoom} />
        ))}
        {doc.numPages > count && (
          <button className="btn" onClick={() => setLimit((l) => l + PAGE_STEP)}>
            さらに表示（残り {doc.numPages - count} ページ）
          </button>
        )}
      </div>
    </div>
  )
}

function PdfPage({
  doc,
  pageNumber,
  zoom
}: {
  doc: pdfjs.PDFDocumentProxy
  pageNumber: number
  zoom: number
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(pageNumber <= 2)

  // 画面に近づいたページだけ描画する
  useEffect(() => {
    const el = wrapRef.current
    if (!el || visible) return
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '600px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible) return
    let task: pdfjs.RenderTask | null = null
    let cancelled = false
    doc.getPage(pageNumber).then((page) => {
      if (cancelled || !canvasRef.current) return
      const base = page.getViewport({ scale: 1 })
      const width = (wrapRef.current?.parentElement?.clientWidth ?? 700) - 40
      const scale = (width / base.width) * zoom
      const dpr = window.devicePixelRatio || 1
      const vp = page.getViewport({ scale: scale * dpr })
      const canvas = canvasRef.current
      canvas.width = vp.width
      canvas.height = vp.height
      canvas.style.width = `${vp.width / dpr}px`
      canvas.style.height = `${vp.height / dpr}px`
      task = page.render({ canvas, viewport: vp })
      task.promise.catch(() => {})
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, pageNumber, zoom, visible])

  return (
    <div className="pdf-page" ref={wrapRef} style={visible ? undefined : { minHeight: 600 }}>
      <canvas ref={canvasRef} />
    </div>
  )
}

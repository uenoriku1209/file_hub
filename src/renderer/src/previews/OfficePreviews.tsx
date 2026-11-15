import { useEffect, useState } from 'react'
import type { DocxPreview as DocxData, SheetPreview, SlidePreview } from '../../../shared/types'
import { Loading, ErrorState } from './PreviewShell'
import { decodeText, errorMessage, parseCsv } from '../lib/format'

/** 非同期読み込みの共通フック */
function useLoad<T>(
  path: string,
  loader: (p: string) => Promise<T>
): { data: T | null; error: string } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    setData(null)
    setError('')
    loader(path)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(errorMessage(e)))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])
  return { data, error }
}

/* ---------- Word ---------- */
export function DocxPreview({ path }: { path: string }): React.JSX.Element {
  const { data, error } = useLoad<DocxData>(path, window.api.previewDocx)
  if (error) return <ErrorState text={`Word ファイルを表示できません: ${error}`} />
  if (!data) return <Loading />
  return (
    <div className="paper-wrap">
      <article
        className="paper docx"
        dangerouslySetInnerHTML={{ __html: data.html || '<p>（本文がありません）</p>' }}
      />
    </div>
  )
}

/* ---------- Excel / CSV ---------- */
function SheetTable({ sheet }: { sheet: SheetPreview }): React.JSX.Element {
  const cols = Math.max(0, ...sheet.rows.map((r) => r.length))
  const colName = (i: number): string => {
    let s = ''
    let n = i + 1
    while (n > 0) {
      const m = (n - 1) % 26
      s = String.fromCharCode(65 + m) + s
      n = Math.floor((n - 1) / 26)
    }
    return s
  }
  if (sheet.rows.length === 0) return <div className="state">（このシートは空です）</div>
  return (
    <div className="sheet-scroll">
      <table className="sheet">
        <thead>
          <tr>
            <th className="corner" />
            {Array.from({ length: cols }, (_, i) => (
              <th key={i}>{colName(i)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((r, ri) => (
            <tr key={ri}>
              <th>{ri + 1}</th>
              {Array.from({ length: cols }, (_, ci) => (
                <td key={ci}>{r[ci] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {(sheet.totalRows > sheet.rows.length || sheet.totalCols > cols) && (
        <div className="note">
          全 {sheet.totalRows} 行 × {sheet.totalCols} 列のうち、先頭の一部を表示しています
        </div>
      )}
    </div>
  )
}

function Sheets({ sheets }: { sheets: SheetPreview[] }): React.JSX.Element {
  const [active, setActive] = useState(0)
  const sheet = sheets[Math.min(active, sheets.length - 1)]
  if (!sheet) return <div className="state">シートがありません</div>
  return (
    <div className="sheets">
      <SheetTable sheet={sheet} />
      <div className="sheet-tabs">
        {sheets.map((s, i) => (
          <button
            key={i}
            className={`sheet-tab ${i === active ? 'active' : ''}`}
            onClick={() => setActive(i)}
          >
            {s.name}
          </button>
        ))}
      </div>
    </div>
  )
}

export function XlsxPreview({ path }: { path: string }): React.JSX.Element {
  const { data, error } = useLoad<SheetPreview[]>(path, window.api.previewXlsx)
  if (error) return <ErrorState text={`Excel ファイルを表示できません: ${error}`} />
  if (!data) return <Loading />
  return <Sheets sheets={data} />
}

export function CsvPreview({ path, name }: { path: string; name: string }): React.JSX.Element {
  const { data, error } = useLoad<SheetPreview[]>(path, async (p) => {
    const text = decodeText(await window.api.readBytes(p, 5 * 1024 * 1024))
    const rows = parseCsv(text)
    return [
      { name, rows, totalRows: rows.length, totalCols: Math.max(0, ...rows.map((r) => r.length)) }
    ]
  })
  if (error) return <ErrorState text={error} />
  if (!data) return <Loading />
  return <Sheets sheets={data} />
}

/* ---------- PowerPoint ---------- */
export function PptxPreview({ path }: { path: string }): React.JSX.Element {
  const { data, error } = useLoad<SlidePreview[]>(path, window.api.previewPptx)
  if (error) return <ErrorState text={`PowerPoint ファイルを表示できません: ${error}`} />
  if (!data) return <Loading />
  if (data.length === 0) return <div className="state">スライドがありません</div>
  return (
    <div className="slides">
      <div className="note">
        テキストと画像の簡易プレビューです。レイアウトは「PowerPoint で編集」で確認できます。
      </div>
      {data.map((s) => (
        <div key={s.index} className="slide">
          <div className="slide-no">{s.index}</div>
          <div className="slide-body">
            <h3>{s.title || <span className="muted">（タイトルなし）</span>}</h3>
            {s.paragraphs.length > 0 && (
              <ul>
                {s.paragraphs.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            )}
            {s.images.length > 0 && (
              <div className="slide-images">
                {s.images.map((src, i) => (
                  <img key={i} src={src} alt="" />
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---------- 画像 / テキスト ---------- */
const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  svg: 'image/svg+xml'
}

export function ImagePreview({ path, ext }: { path: string; ext: string }): React.JSX.Element {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let u = ''
    let alive = true
    setUrl('')
    setError('')
    window.api
      .readBytes(path)
      .then((b) => {
        if (!alive) return
        u = URL.createObjectURL(
          new Blob([b as BlobPart], { type: MIME[ext] ?? 'application/octet-stream' })
        )
        setUrl(u)
      })
      .catch((e) => alive && setError(errorMessage(e)))
    return () => {
      alive = false
      if (u) URL.revokeObjectURL(u)
    }
  }, [path, ext])
  if (error) return <ErrorState text={error} />
  if (!url) return <Loading />
  return (
    <div className="image-view">
      <img src={url} alt="" />
    </div>
  )
}

export function TextPreview({ path }: { path: string }): React.JSX.Element {
  const { data, error } = useLoad<string>(path, async (p) =>
    decodeText(await window.api.readBytes(p, 2 * 1024 * 1024))
  )
  if (error) return <ErrorState text={error} />
  if (data === null) return <Loading />
  return (
    <div className="paper-wrap">
      <pre className="paper plain">{data}</pre>
    </div>
  )
}

export function Unsupported({ ext }: { ext: string }): React.JSX.Element {
  return (
    <div className="state">
      <span>.{ext} 形式はアプリ内でのプレビューに対応していません。</span>
      <span className="muted">右上のボタンからアプリで開いて確認・編集できます。</span>
    </div>
  )
}

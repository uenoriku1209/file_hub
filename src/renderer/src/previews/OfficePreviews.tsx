import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type {
  CellStyle,
  DocxPreview as DocxData,
  SheetPreview,
  SlidePreview
} from '../../../shared/types'
import type { PdfEngines } from '../../../shared/pdf'
import { PdfPreview } from './PdfPreview'
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

/* ---------- 表示方法の切り替え ---------- */

type Mode = 'layout' | 'text' | 'pdf'

let enginesPromise: Promise<PdfEngines> | null = null
/** Office / LibreOffice があるか (PDF での正確な表示ができるか) */
function usePdfAvailable(): boolean {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    enginesPromise ??= window.api.pdfEngines()
    enginesPromise.then((e) => setOk(e.office || !!e.libreoffice)).catch(() => setOk(false))
  }, [])
  return ok
}

/** 表示方法を覚えておく (種類ごと) */
function useMode(key: string, initial: Mode): [Mode, (m: Mode) => void] {
  const [mode, setMode] = useState<Mode>(() => {
    const v = localStorage.getItem(`preview.mode.${key}`)
    return v === 'layout' || v === 'text' || v === 'pdf' ? v : initial
  })
  return [
    mode,
    (m) => {
      setMode(m)
      localStorage.setItem(`preview.mode.${key}`, m)
    }
  ]
}

function ModeBar({
  modes,
  mode,
  onMode,
  pdf
}: {
  modes: { id: Mode; label: string; title: string }[]
  mode: Mode
  onMode: (m: Mode) => void
  pdf: boolean
}): React.JSX.Element {
  return (
    <div className="mode-bar">
      {modes.map((m) => (
        <button
          key={m.id}
          className={mode === m.id ? 'active' : ''}
          onClick={() => onMode(m.id)}
          title={m.title}
        >
          {m.label}
        </button>
      ))}
      <button
        className={mode === 'pdf' ? 'active' : ''}
        disabled={!pdf}
        onClick={() => onMode('pdf')}
        title={
          pdf
            ? 'Office（または LibreOffice）で PDF にして、実際の印刷イメージどおりに表示します（一度作ったものは使い回します）'
            : 'Microsoft Office か LibreOffice がインストールされていると使えます'
        }
      >
        PDF で正確に
      </button>
    </div>
  )
}

/** Office で PDF にしたものを表示する */
function ExactPdf({ path }: { path: string }): React.JSX.Element {
  const [pdf, setPdf] = useState<string | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    setPdf(null)
    setError('')
    window.api
      .pdfForPreview(path)
      .then((p) => alive && setPdf(p))
      .catch((e) => alive && setError(errorMessage(e)))
    return () => {
      alive = false
    }
  }, [path])
  if (error) return <ErrorState text={`PDF にできませんでした: ${error}`} />
  if (!pdf)
    return (
      <div className="state">
        <Loader2 className="spin" size={22} />
        Office で PDF にしています…（初回だけ時間がかかります）
      </div>
    )
  return <PdfPreview path={pdf} />
}

/** 欄の幅に合わせて縮める (ページの幅が欄より広いとき) */
function useFitZoom(
  outer: React.RefObject<HTMLDivElement | null>,
  measure: () => number,
  deps: unknown[]
): number {
  const [zoom, setZoom] = useState(1)
  useEffect(() => {
    const el = outer.current
    if (!el) return
    const update = (): void => {
      const w = measure()
      if (w > 0) setZoom(Math.min(1, (el.clientWidth - 28) / w))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return zoom
}

/* ---------- Word ---------- */

/** Word に近い見た目 (ページ・余白・フォント・表・画像・ヘッダー/フッター) で表示 */
function DocxLayout({ path, onFail }: { path: string; onFail: () => void }): React.JSX.Element {
  const outer = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const styles = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'done' | 'error'>('loading')
  const [error, setError] = useState('')
  const [pageW, setPageW] = useState(0)

  useEffect(() => {
    let alive = true
    setState('loading')
    ;(async () => {
      const [bytes, lib] = await Promise.all([
        window.api.readBytes(path, 150 * 1024 * 1024),
        import('docx-preview')
      ])
      if (!alive || !body.current || !styles.current) return
      body.current.innerHTML = ''
      styles.current.innerHTML = ''
      await lib.renderAsync(bytes, body.current, styles.current, {
        className: 'docx',
        inWrapper: true,
        breakPages: true,
        ignoreLastRenderedPageBreak: false,
        ignoreFonts: true,
        useBase64URL: true,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
        renderComments: false,
        experimental: true
      })
      if (!alive) return
      const pages = body.current.querySelectorAll<HTMLElement>('section.docx')
      setPageW(Math.max(0, ...Array.from(pages).map((p) => p.offsetWidth)))
      setState('done')
    })().catch((e) => {
      if (!alive) return
      setError(errorMessage(e))
      setState('error')
    })
    return () => {
      alive = false
    }
  }, [path])

  const zoom = useFitZoom(outer, () => pageW, [pageW])

  return (
    <div className="docx-layout" ref={outer}>
      {state === 'loading' && <Loading />}
      {state === 'error' && (
        <div className="state">
          <span>レイアウト表示にできませんでした: {error}</span>
          <button className="btn" onClick={onFail}>
            テキスト表示で見る
          </button>
        </div>
      )}
      <div ref={styles} />
      <div ref={body} className="docx-pages" style={{ zoom }} />
    </div>
  )
}

/** 文字中心の軽い表示 (以前の表示) */
function DocxText({ path }: { path: string }): React.JSX.Element {
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

export function DocxPreview({ path }: { path: string }): React.JSX.Element {
  const pdf = usePdfAvailable()
  const [mode, setMode] = useMode('docx', 'layout')
  return (
    <div className="office-preview">
      <ModeBar
        mode={mode}
        onMode={setMode}
        pdf={pdf}
        modes={[
          {
            id: 'layout',
            label: 'レイアウト',
            title: 'ページ・フォント・表・画像を Word に近い見た目で表示'
          },
          { id: 'text', label: 'テキスト', title: '文字中心の軽い表示' }
        ]}
      />
      <div className="office-body">
        {mode === 'pdf' && pdf ? (
          <ExactPdf path={path} />
        ) : mode === 'text' ? (
          <DocxText path={path} />
        ) : (
          <DocxLayout path={path} onFail={() => setMode('text')} />
        )}
      </div>
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

/** 列番号 (0 始まり) → A, B, … AA */
function colName(i: number): string {
  let out = ''
  let n = i + 1
  while (n > 0) {
    const m = (n - 1) % 26
    out = String.fromCharCode(65 + m) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

function cssOf(st: CellStyle | undefined, num: boolean | undefined): React.CSSProperties {
  const css: React.CSSProperties = {}
  if (num && !st?.align) css.textAlign = 'right'
  if (!st) return css
  if (st.bold) css.fontWeight = 700
  if (st.italic) css.fontStyle = 'italic'
  if (st.underline || st.strike)
    css.textDecoration = [st.underline && 'underline', st.strike && 'line-through']
      .filter(Boolean)
      .join(' ')
  if (st.color) css.color = st.color
  if (st.bg) css.background = st.bg
  if (st.size) css.fontSize = `${st.size}pt`
  if (st.font) css.fontFamily = `"${st.font}", var(--sheet-font)`
  if (st.align) css.textAlign = st.align
  if (st.valign) css.verticalAlign = st.valign
  if (st.wrap) css.whiteSpace = 'pre-wrap'
  if (st.indent) css.paddingLeft = 4 + st.indent * 9
  if (st.bt) css.borderTop = st.bt
  if (st.br) css.borderRight = st.br
  if (st.bb) css.borderBottom = st.bb
  if (st.bl) css.borderLeft = st.bl
  return css
}

/** 書式つきの Excel シート (色・罫線・結合セル・列幅・行の高さ・数式) */
function StyledSheet({ sheet }: { sheet: SheetPreview }): React.JSX.Element {
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null)
  const cells = sheet.cells ?? []
  const rowNums = sheet.rowNumbers ?? cells.map((_, i) => i + 1)
  const colNums = sheet.colNumbers ?? (cells[0] ?? []).map((_, i) => i + 1)

  // 結合セル: 左上のセルに行数・列数、それ以外は描かない
  const { spans, covered } = useMemo(() => {
    const spans = new Map<string, { rs: number; cs: number }>()
    const covered = new Set<string>()
    for (const m of sheet.merges ?? []) {
      spans.set(`${m.r},${m.c}`, { rs: m.rs, cs: m.cs })
      for (let r = m.r; r < m.r + m.rs; r++)
        for (let c = m.c; c < m.c + m.cs; c++) if (r !== m.r || c !== m.c) covered.add(`${r},${c}`)
    }
    return { spans, covered }
  }, [sheet])

  if (cells.length === 0) return <div className="state">（このシートは空です）</div>
  const selCell = sel ? cells[sel.r]?.[sel.c] : null
  const selAddr = sel ? `${colName(colNums[sel.c] - 1)}${rowNums[sel.r]}` : ''

  return (
    <div className="styled-sheet">
      <div className="formula-bar">
        <span className="fx-addr">{selAddr || '—'}</span>
        <span className="fx-icon">fx</span>
        <span className={`fx-value ${selCell?.f ? 'formula' : ''}`}>
          {selCell
            ? selCell.f
              ? `=${selCell.f}`
              : selCell.t
            : 'セルを選ぶと、中身（数式）が表示されます'}
        </span>
      </div>
      <div className="sheet-scroll">
        <table className={`sheet styled ${sheet.gridLines === false ? 'no-grid' : ''}`}>
          <colgroup>
            <col style={{ width: 44 }} />
            {colNums.map((_, i) => (
              <col key={i} style={{ width: sheet.colWidths?.[i] ?? 64 }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="corner" />
              {colNums.map((n, i) => (
                <th key={i} className={sel?.c === i ? 'hl' : ''}>
                  {colName(n - 1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cells.map((row, ri) => (
              <tr key={ri} style={{ height: sheet.rowHeights?.[ri] ?? 20 }}>
                <th className={sel?.r === ri ? 'hl' : ''}>{rowNums[ri]}</th>
                {row.map((cell, ci) => {
                  const k = `${ri},${ci}`
                  if (covered.has(k)) return null
                  const span = spans.get(k)
                  const st = cell?.s !== undefined ? sheet.styles?.[cell.s] : undefined
                  return (
                    <td
                      key={ci}
                      rowSpan={span?.rs}
                      colSpan={span?.cs}
                      style={cssOf(st, cell?.num)}
                      className={sel?.r === ri && sel?.c === ci ? 'sel' : ''}
                      onClick={() => setSel({ r: ri, c: ci })}
                      title={cell?.f ? `=${cell.f}` : undefined}
                    >
                      {cell?.t}
                      {cell?.f && <i className="has-formula" />}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {(sheet.totalRows > rowNums.length || sheet.totalCols > colNums.length) && (
          <div className="note">
            全 {sheet.totalRows} 行 × {sheet.totalCols} 列のうち、先頭の {rowNums.length} 行 ×{' '}
            {colNums.length} 列を表示しています（非表示の行・列は省いています）
          </div>
        )}
      </div>
    </div>
  )
}

function StyledSheets({ sheets }: { sheets: SheetPreview[] }): React.JSX.Element {
  const [active, setActive] = useState(0)
  const sheet = sheets[Math.min(active, sheets.length - 1)]
  if (!sheet) return <div className="state">シートがありません</div>
  return (
    <div className="sheets">
      <StyledSheet key={active} sheet={sheet} />
      <div className="sheet-tabs">
        {sheets.map((s, i) => (
          <button
            key={i}
            className={`sheet-tab ${i === active ? 'active' : ''}`}
            onClick={() => setActive(i)}
            style={s.tabColor ? { boxShadow: `inset 0 -3px 0 ${s.tabColor}` } : undefined}
          >
            {s.name}
          </button>
        ))}
      </div>
    </div>
  )
}

export function XlsxPreview({ path }: { path: string }): React.JSX.Element {
  const pdf = usePdfAvailable()
  const [mode, setMode] = useMode('xlsx', 'layout')
  const { data, error } = useLoad<SheetPreview[]>(path, window.api.previewXlsx)
  return (
    <div className="office-preview">
      <ModeBar
        mode={mode === 'text' ? 'layout' : mode}
        onMode={setMode}
        pdf={pdf}
        modes={[{ id: 'layout', label: 'シート', title: '色・罫線・結合セル・列の幅・数式を表示' }]}
      />
      <div className="office-body">
        {mode === 'pdf' && pdf ? (
          <ExactPdf path={path} />
        ) : error ? (
          <ErrorState text={`Excel ファイルを表示できません: ${error}`} />
        ) : !data ? (
          <Loading />
        ) : (
          <StyledSheets sheets={data} />
        )}
      </div>
    </div>
  )
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

/**
 * 目次 ([Content_Types].xml) に載っているのに中身がない部品を目次から外す。
 * pptxgenjs で作ったファイル (File Hub の新規作成を含む) にはこれがあり、
 * そのままだと表示ライブラリが途中で止まってしまうため。
 */
async function tidyPptx(bytes: Uint8Array): Promise<ArrayBuffer> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(bytes)
  const ct = zip.file('[Content_Types].xml')
  if (ct) {
    const xml = await ct.async('string')
    const fixed = xml.replace(
      /<Override\b[^>]*PartName="\/([^"]+)"[^>]*\/>/g,
      (tag, part: string) => (zip.file(part) ? tag : '')
    )
    if (fixed !== xml) {
      zip.file('[Content_Types].xml', fixed)
      return zip.generateAsync({ type: 'arraybuffer' })
    }
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** スライドの図形・文字・画像を、実際の配置どおりに描く */
function PptxLayout({ path, onFail }: { path: string; onFail: () => void }): React.JSX.Element {
  const outer = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'done' | 'error'>('loading')
  const [error, setError] = useState('')
  const [width, setWidth] = useState(0)

  // 欄の幅を測る (幅が変わったら描き直す。細かな変化では描き直さない)
  useEffect(() => {
    const el = outer.current
    if (!el) return
    const update = (): void => {
      const w = Math.max(240, Math.floor((el.clientWidth - 32) / 40) * 40)
      setWidth((cur) => (cur === w ? cur : w))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!width) return
    let alive = true
    let viewer: { destroy: () => void } | null = null
    setState('loading')
    ;(async () => {
      const [bytes, lib] = await Promise.all([
        window.api.readBytes(path, 150 * 1024 * 1024),
        import('pptx-preview')
      ])
      if (!alive || !host.current) return
      host.current.innerHTML = ''
      const v = lib.init(host.current, {
        width,
        height: Math.round((width * 9) / 16),
        mode: 'list'
      })
      viewer = v
      await v.preview(await tidyPptx(bytes))
      if (alive) setState('done')
    })().catch((e) => {
      if (!alive) return
      setError(errorMessage(e))
      setState('error')
    })
    return () => {
      alive = false
      try {
        viewer?.destroy()
      } catch {
        /* 何もしない */
      }
    }
  }, [path, width])

  return (
    <div className="pptx-layout" ref={outer}>
      {state === 'loading' && <Loading />}
      {state === 'error' && (
        <div className="state">
          <span>スライドを描けませんでした: {error}</span>
          <button className="btn" onClick={onFail}>
            簡易表示で見る
          </button>
        </div>
      )}
      <div ref={host} className="pptx-host" />
    </div>
  )
}

export function PptxPreview({ path }: { path: string }): React.JSX.Element {
  const pdf = usePdfAvailable()
  const [mode, setMode] = useMode('pptx', 'layout')
  return (
    <div className="office-preview">
      <ModeBar
        mode={mode}
        onMode={setMode}
        pdf={pdf}
        modes={[
          { id: 'layout', label: 'スライド', title: '図形・文字・画像を実際の配置どおりに表示' },
          { id: 'text', label: '簡易', title: 'スライドごとの文字と画像だけを並べる軽い表示' }
        ]}
      />
      <div className="office-body">
        {mode === 'pdf' && pdf ? (
          <ExactPdf path={path} />
        ) : mode === 'text' ? (
          <PptxSimple path={path} />
        ) : (
          <PptxLayout path={path} onFail={() => setMode('text')} />
        )}
      </div>
    </div>
  )
}

/* 簡易表示 (文字と画像だけ) */
function PptxSimple({ path }: { path: string }): React.JSX.Element {
  const { data, error } = useLoad<SlidePreview[]>(path, window.api.previewPptx)
  if (error) return <ErrorState text={`PowerPoint ファイルを表示できません: ${error}`} />
  if (!data) return <Loading />
  if (data.length === 0) return <div className="state">スライドがありません</div>
  return (
    <div className="slides">
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

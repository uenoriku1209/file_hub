import ExcelJS from 'exceljs'
import type { CellStyle, SheetCell, SheetPreview } from '../shared/types'

const MAX_ROWS = 500
const MAX_COLS = 60

/* ---------------- 色 ---------------- */

/** 標準の Office テーマ (ファイルにテーマがない場合) */
const DEFAULT_THEME = [
  'FFFFFF',
  '000000',
  'E7E6E6',
  '44546A',
  '4472C4',
  'ED7D31',
  'A5A5A5',
  'FFC000',
  '5B9BD5',
  '70AD47',
  '0563C1',
  '954F72'
]

/** 旧形式の色番号 (インデックスカラー) */
// prettier-ignore
const INDEXED = [
  '000000','FFFFFF','FF0000','00FF00','0000FF','FFFF00','FF00FF','00FFFF',
  '000000','FFFFFF','FF0000','00FF00','0000FF','FFFF00','FF00FF','00FFFF',
  '800000','008000','000080','808000','800080','008080','C0C0C0','808080',
  '9999FF','993366','FFFFCC','CCFFFF','660066','FF8080','0066CC','CCCCFF',
  '000080','FF00FF','FFFF00','00FFFF','800080','800000','008080','0000FF',
  '00CCFF','CCFFFF','CCFFCC','FFFF99','99CCFF','FF99CC','CC99FF','FFCC99',
  '3366FF','33CCCC','99CC00','FFCC00','FF9900','FF6600','666699','969696',
  '003366','339966','003300','333300','993300','993366','333399','333333'
]

/** ブックのテーマの色 (theme1.xml の clrScheme) を、Excel のテーマ番号の順に並べる */
function themeColors(wb: ExcelJS.Workbook): string[] {
  const xml = (wb as unknown as { _themes?: Record<string, string> })._themes?.theme1
  if (!xml) return DEFAULT_THEME
  const pick = (tag: string): string | null => {
    const m = xml.match(new RegExp(`<a:${tag}>([\\s\\S]*?)</a:${tag}>`))
    if (!m) return null
    const v =
      m[1].match(/srgbClr val="([0-9A-Fa-f]{6})"/) ?? m[1].match(/lastClr="([0-9A-Fa-f]{6})"/)
    return v ? v[1].toUpperCase() : null
  }
  // Excel のテーマ番号: 0=lt1 1=dk1 2=lt2 3=dk2 4〜9=accent1〜6 10=hlink 11=folHlink
  const order = [
    'lt1',
    'dk1',
    'lt2',
    'dk2',
    'accent1',
    'accent2',
    'accent3',
    'accent4',
    'accent5',
    'accent6',
    'hlink',
    'folHlink'
  ]
  return order.map((t, i) => pick(t) ?? DEFAULT_THEME[i])
}

/** Excel の「明るさ」(tint) を反映する */
function applyTint(hex: string, tint: number): string {
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  let l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h /= 6
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint
  const hue = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  let rr = l
  let gg = l
  let bb = l
  if (s !== 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    rr = hue(p, q, h + 1 / 3)
    gg = hue(p, q, h)
    bb = hue(p, q, h - 1 / 3)
  }
  const to = (v: number): string =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `${to(rr)}${to(gg)}${to(bb)}`.toUpperCase()
}

type XColor = Partial<{ argb: string; theme: number; tint: number; indexed: number }> | undefined

function colorOf(c: XColor, theme: string[]): string | undefined {
  if (!c) return undefined
  let hex: string | undefined
  if (c.argb && /^[0-9A-Fa-f]{8}$/.test(c.argb)) hex = c.argb.slice(2)
  else if (c.argb && /^[0-9A-Fa-f]{6}$/.test(c.argb)) hex = c.argb
  else if (c.theme !== undefined) hex = theme[c.theme]
  else if (c.indexed !== undefined)
    hex = INDEXED[c.indexed] ?? (c.indexed === 64 ? '000000' : undefined)
  if (!hex) return undefined
  if (c.tint) hex = applyTint(hex, c.tint)
  return `#${hex.toUpperCase()}`
}

/* ---------------- 表示形式 ---------------- */

const pad = (n: number): string => String(n).padStart(2, '0')

function formatDate(d: Date, fmt: string): string {
  // ExcelJS の日付は UTC で入っている
  const y = d.getUTCFullYear()
  const mo = d.getUTCMonth() + 1
  const day = d.getUTCDate()
  const hasDate = /[yd]/i.test(fmt) || !/[hs]/i.test(fmt)
  const hasTime = /h|ss|AM\/PM/i.test(fmt)
  const parts: string[] = []
  if (hasDate) parts.push(/年/.test(fmt) ? `${y}年${mo}月${day}日` : `${y}/${mo}/${day}`)
  if (hasTime)
    parts.push(
      `${d.getUTCHours()}:${pad(d.getUTCMinutes())}${/ss/i.test(fmt) ? `:${pad(d.getUTCSeconds())}` : ''}`
    )
  return parts.join(' ')
}

/** よく使う表示形式 (桁区切り・小数の桁数・％・通貨記号) だけを反映する */
function formatNumber(n: number, fmt: string | undefined): string {
  const f = (fmt ?? 'General')
    .split(';')[0]
    .replace(/\[[^\]]*\]/g, '')
    .replace(/"([^"]*)"/g, '$1')
  if (!fmt || /^general$/i.test(f.trim())) {
    if (Math.abs(n) >= 1e11 || (Math.abs(n) < 1e-9 && n !== 0))
      return n.toExponential(5).replace(/\.?0+e/, 'E')
    return String(Math.round(n * 1e10) / 1e10)
  }
  const percent = f.includes('%')
  const dec = f.match(/\.(0+)/)?.[1].length ?? 0
  const group = /#,##|0,0/.test(f)
  const v = percent ? n * 100 : n
  let out = Math.abs(v).toLocaleString('en-US', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
    useGrouping: group
  })
  if (percent) out += '%'
  const currency = f.match(/[¥￥$€£]/)?.[0]
  if (currency) out = currency + out
  return (v < 0 && Math.round(Math.abs(v) * 10 ** dec) !== 0 ? '-' : '') + out
}

function cellText(cell: ExcelJS.Cell): { t: string; num: boolean } {
  let v: unknown = cell.value
  if (v && typeof v === 'object' && 'result' in (v as object)) v = (v as { result: unknown }).result
  if (v === null || v === undefined) return { t: '', num: false }
  if (v instanceof Date) return { t: formatDate(v, cell.numFmt ?? ''), num: true }
  if (typeof v === 'number') return { t: formatNumber(v, cell.numFmt), num: true }
  if (typeof v === 'boolean') return { t: v ? 'TRUE' : 'FALSE', num: false }
  if (typeof v === 'object') {
    const o = v as {
      richText?: { text: string }[]
      text?: unknown
      error?: string
      hyperlink?: string
    }
    if (o.richText) return { t: o.richText.map((r) => r.text).join(''), num: false }
    if (o.error) return { t: o.error, num: false }
    if (o.text !== undefined)
      return {
        t: String(
          typeof o.text === 'object'
            ? ((o.text as { richText?: { text: string }[] }).richText
                ?.map((r) => r.text)
                .join('') ?? '')
            : o.text
        ),
        num: false
      }
    return { t: '', num: false }
  }
  return { t: String(v), num: false }
}

/* ---------------- 罫線・書式 ---------------- */

const BORDER: Record<string, string> = {
  thin: '1px solid',
  hair: '1px solid',
  dotted: '1px dotted',
  dashed: '1px dashed',
  dashDot: '1px dashed',
  dashDotDot: '1px dashed',
  medium: '2px solid',
  mediumDashed: '2px dashed',
  mediumDashDot: '2px dashed',
  mediumDashDotDot: '2px dashed',
  slantDashDot: '2px dashed',
  thick: '3px solid',
  double: '3px double'
}

function borderOf(b: Partial<ExcelJS.Border> | undefined, theme: string[]): string | undefined {
  if (!b?.style || !BORDER[b.style]) return undefined
  return `${BORDER[b.style]} ${colorOf(b.color as XColor, theme) ?? '#000000'}`
}

function styleOf(cell: ExcelJS.Cell, theme: string[]): CellStyle {
  const st: CellStyle = {}
  const f = cell.font
  if (f) {
    if (f.bold) st.bold = true
    if (f.italic) st.italic = true
    if (f.underline) st.underline = true
    if (f.strike) st.strike = true
    if (f.size && f.size !== 11) st.size = f.size
    if (f.name) st.font = f.name
    const c = colorOf(f.color as XColor, theme)
    if (c && c !== '#000000') st.color = c
  }
  const fill = cell.fill as ExcelJS.FillPattern | undefined
  if (fill?.type === 'pattern' && fill.pattern && fill.pattern !== 'none') {
    const bg = colorOf(fill.fgColor as XColor, theme) ?? colorOf(fill.bgColor as XColor, theme)
    if (bg) st.bg = bg
  }
  const a = cell.alignment
  if (a) {
    if (a.horizontal && ['left', 'center', 'right', 'justify'].includes(a.horizontal))
      st.align = a.horizontal as CellStyle['align']
    else if (a.horizontal === 'centerContinuous') st.align = 'center'
    if (a.vertical === 'top' || a.vertical === 'bottom') st.valign = a.vertical
    else if (a.vertical === 'middle') st.valign = 'middle'
    if (a.wrapText) st.wrap = true
    if (a.indent) st.indent = a.indent
  }
  const b = cell.border
  if (b) {
    const bt = borderOf(b.top, theme)
    const br = borderOf(b.right, theme)
    const bb = borderOf(b.bottom, theme)
    const bl = borderOf(b.left, theme)
    if (bt) st.bt = bt
    if (br) st.br = br
    if (bb) st.bb = bb
    if (bl) st.bl = bl
  }
  return st
}

/** "B3" → 0 始まりの [行, 列] */
function parseRef(ref: string): [number, number] {
  const m = ref.match(/^\$?([A-Z]+)\$?(\d+)$/)!
  let col = 0
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
  return [Number(m[2]) - 1, col - 1]
}

/* ---------------- 入口 ---------------- */

export async function previewXlsx(p: string): Promise<SheetPreview[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(p)
  const theme = themeColors(wb)

  return wb.worksheets
    .filter((ws) => ws.state !== 'hidden' && ws.state !== 'veryHidden')
    .map((ws) => {
      const totalRows = ws.actualRowCount ? ws.rowCount : 0
      const totalCols = ws.actualColumnCount ? ws.columnCount : 0

      // 非表示の行・列は飛ばす
      const rowNumbers: number[] = []
      for (let r = 1; r <= totalRows && rowNumbers.length < MAX_ROWS; r++)
        if (!ws.getRow(r).hidden) rowNumbers.push(r)
      const colNumbers: number[] = []
      for (let c = 1; c <= totalCols && colNumbers.length < MAX_COLS; c++)
        if (!ws.getColumn(c).hidden) colNumbers.push(c)

      const styleKeys = new Map<string, number>()
      const styles: CellStyle[] = []
      const rows: string[][] = []
      const cells: (SheetCell | null)[][] = []

      for (const r of rowNumbers) {
        const row = ws.getRow(r)
        const textRow: string[] = []
        const cellRow: (SheetCell | null)[] = []
        for (const c of colNumbers) {
          const cell = row.getCell(c)
          let info: { t: string; num: boolean }
          try {
            info = cellText(cell)
          } catch {
            info = { t: '', num: false }
          }
          textRow.push(info.t)
          const st = styleOf(cell, theme)
          const key = JSON.stringify(st)
          let s: number | undefined
          if (key !== '{}') {
            s = styleKeys.get(key)
            if (s === undefined) {
              s = styles.length
              styles.push(st)
              styleKeys.set(key, s)
            }
          }
          let formula: string | undefined
          try {
            formula = cell.formula || undefined
          } catch {
            formula = undefined
          }
          cellRow.push(
            info.t || s !== undefined || formula
              ? { t: info.t, s, f: formula, num: info.num || undefined }
              : null
          )
        }
        rows.push(textRow)
        cells.push(cellRow)
      }

      // 結合セル (表示している行・列の番号に直す)
      const rIndex = new Map(rowNumbers.map((r, i) => [r - 1, i]))
      const cIndex = new Map(colNumbers.map((c, i) => [c - 1, i]))
      const merges: NonNullable<SheetPreview['merges']> = []
      const rawMerges = ((ws.model as unknown as { merges?: string[] }).merges ?? []) as string[]
      for (const m of rawMerges) {
        const [a, b] = m.split(':')
        if (!a || !b) continue
        const [r1, c1] = parseRef(a)
        const [r2, c2] = parseRef(b)
        const r = rIndex.get(r1)
        const c = cIndex.get(c1)
        if (r === undefined || c === undefined) continue
        let rs = 0
        for (let x = r1; x <= r2; x++) if (rIndex.has(x)) rs++
        let cs = 0
        for (let x = c1; x <= c2; x++) if (cIndex.has(x)) cs++
        if (rs * cs > 1) merges.push({ r, c, rs, cs })
      }

      const defaultW = ws.properties.defaultColWidth ?? 8.43
      const defaultH = ws.properties.defaultRowHeight ?? 15
      const colWidths = colNumbers.map((c) =>
        Math.round((ws.getColumn(c).width ?? defaultW) * 7 + 5)
      )
      const rowHeights = rowNumbers.map((r) =>
        Math.round((ws.getRow(r).height ?? defaultH) * (4 / 3))
      )
      const view = ws.views?.[0] as { showGridLines?: boolean } | undefined

      return {
        name: ws.name,
        rows,
        totalRows,
        totalCols,
        cells,
        styles,
        merges,
        colWidths,
        rowHeights,
        rowNumbers,
        colNumbers,
        gridLines: view?.showGridLines !== false,
        tabColor: colorOf(ws.properties.tabColor as XColor, theme)
      } as SheetPreview
    })
}

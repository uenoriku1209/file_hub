// メイン / プリロード / レンダラーで共有する型定義

export interface FsEntry {
  name: string
  path: string
  isDir: boolean
  /** 小文字・ドットなしの拡張子 (例: "docx") */
  ext: string
  size: number
  mtime: number
  /** 再帰検索時、検索起点フォルダからの相対パス */
  rel?: string
}

export interface ScanResult {
  entries: FsEntry[]
  truncated: boolean
}

export interface DocxPreview {
  html: string
  messages: string[]
}

/** セルの書式 (Excel のプレビュー用。同じ書式はまとめて styles に入れる) */
export interface CellStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  /** 文字色・背景色 (#RRGGBB) */
  color?: string
  bg?: string
  /** 文字の大きさ (pt) */
  size?: number
  font?: string
  align?: 'left' | 'center' | 'right' | 'justify'
  valign?: 'top' | 'middle' | 'bottom'
  wrap?: boolean
  indent?: number
  /** 罫線 (CSS の border の値) */
  bt?: string
  br?: string
  bb?: string
  bl?: string
}

export interface SheetCell {
  /** 表示する文字 (表示形式を反映したもの) */
  t: string
  /** 数式 (= なし) */
  f?: string
  /** styles の番号 */
  s?: number
  /** 数値・日付 (既定で右寄せ) */
  num?: boolean
}

export interface SheetPreview {
  name: string
  rows: string[][]
  totalRows: number
  totalCols: number
  /** 以下は Excel ファイルのとき (CSV にはない) */
  cells?: (SheetCell | null)[][]
  styles?: CellStyle[]
  /** 結合セル (0 始まりの行・列と、行数・列数) */
  merges?: { r: number; c: number; rs: number; cs: number }[]
  /** 列の幅・行の高さ (px) */
  colWidths?: number[]
  rowHeights?: number[]
  /** 表示している行・列の、元の番号 (非表示の行・列を飛ばしているため) */
  rowNumbers?: number[]
  colNumbers?: number[]
  gridLines?: boolean
  tabColor?: string
}

export interface SlidePreview {
  index: number
  title: string
  paragraphs: string[]
  images: string[] // data URL
}

export interface WordCreateOptions {
  kind: 'word'
  dir: string
  fileName: string
  title: string
  body: string
  pageCount: number
  images: string[]
  imagePlacement: 'first' | 'perPage'
  imageMaxWidth: number
}

export interface ExcelCreateOptions {
  kind: 'excel'
  dir: string
  fileName: string
  sheets: { name: string }[]
  headers: string
  freezeHeader: boolean
  images: string[]
  imageSheet: number
}

export interface PptCreateOptions {
  kind: 'ppt'
  dir: string
  fileName: string
  layout: '16x9' | '4x3'
  slides: { title: string }[]
  images: string[]
  imagePlacement: 'perSlide' | 'newSlides'
}

export type CreateOptions = WordCreateOptions | ExcelCreateOptions | PptCreateOptions

export interface ShellInfo {
  id: string
  label: string
  file: string
  args: string[]
}

export interface Result<T> {
  ok: boolean
  value?: T
  error?: string
}

/** 圧縮ファイルの中身 1 件 */
export interface ArchiveEntry {
  path: string
  dir: boolean
  size: number
  date: number
}

export interface ArchiveListing {
  /** 中身を一覧できたか (zip のみ対応。7z・rar などは展開のみ) */
  supported: boolean
  entries: ArchiveEntry[]
  /** 全件数 (entries は先頭 2,000 件まで) */
  total: number
  /** 7-Zip がインストールされているか */
  sevenZip: boolean
}

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

export interface SheetPreview {
  name: string
  rows: string[][]
  totalRows: number
  totalCols: number
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

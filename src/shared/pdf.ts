// PDF 変換で使う共通定義 (メイン / レンダラー両方から使用)

export type PdfEngine = 'auto' | 'office' | 'libreoffice'

/** 変換方法の種類 */
export type PdfKind = 'word' | 'excel' | 'ppt' | 'image' | 'html'

const WORD = ['docx', 'doc', 'docm', 'rtf', 'odt']
const EXCEL = ['xlsx', 'xls', 'xlsm', 'csv', 'ods']
const PPT = ['pptx', 'ppt', 'pptm', 'odp']
const IMAGE = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg']
/** テキスト・コード・Markdown は HTML にしてから PDF 化する */
const HTML = [
  'txt',
  'log',
  'md',
  'mdx',
  'markdown',
  'ts',
  'tsx',
  'mts',
  'cts',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'pyw',
  'pyi',
  'c',
  'h',
  'cpp',
  'cc',
  'cxx',
  'c++',
  'hpp',
  'hh',
  'hxx',
  'ino',
  'cs',
  'java',
  'kt',
  'kts',
  'go',
  'rs',
  'html',
  'htm',
  'css',
  'scss',
  'sass',
  'less',
  'vue',
  'svelte',
  'json',
  'jsonc',
  'yaml',
  'yml',
  'toml',
  'xml',
  'ini',
  'cfg',
  'sh',
  'bash',
  'zsh',
  'ps1',
  'psm1',
  'bat',
  'cmd',
  'sql',
  'rb',
  'php',
  'swift',
  'dart',
  'lua',
  'r',
  'pl',
  'scala',
  'vb'
]

export function pdfKindOf(ext: string): PdfKind | null {
  if (WORD.includes(ext)) return 'word'
  if (EXCEL.includes(ext)) return 'excel'
  if (PPT.includes(ext)) return 'ppt'
  if (IMAGE.includes(ext)) return 'image'
  if (HTML.includes(ext)) return 'html'
  return null
}

export interface PdfOptions {
  /** 出力先フォルダ (無ければ作成) */
  outDir: string
  /** 同名の PDF がある場合に上書きするか (false なら「名前 (2).pdf」) */
  overwrite: boolean
  engine: PdfEngine
}

export interface PdfHtmlOptions {
  outDir: string
  baseName: string
  overwrite: boolean
  landscape?: boolean
}

export interface PdfResult {
  output: string
  /** 実際に使った変換方法 (表示用) */
  engine: string
}

export interface PdfEngines {
  office: boolean
  libreoffice: string | null
}

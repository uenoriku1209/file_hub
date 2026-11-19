export interface Category {
  id: string
  label: string
  exts: string[]
  color: string
}

/** 圧縮ファイル (Office・Code どちらの画面にも表示して、展開できるようにする) */
export const ARCHIVE_EXTS = ['zip', '7z', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'xz']
const ARCHIVE: Category = { id: 'archive', label: 'ZIP', exts: ARCHIVE_EXTS, color: '#b0883a' }

/** Office ページで扱うファイル */
export const OFFICE_CATEGORIES: Category[] = [
  { id: 'pdf', label: 'PDF', exts: ['pdf'], color: '#e5636b' },
  { id: 'word', label: 'WORD', exts: ['docx', 'doc', 'docm', 'rtf', 'odt'], color: '#3d7fe0' },
  { id: 'excel', label: 'EXCEL', exts: ['xlsx', 'xlsm', 'xls', 'csv', 'ods'], color: '#25a865' },
  { id: 'ppt', label: 'POWERPOINT', exts: ['pptx', 'pptm', 'ppt', 'odp'], color: '#e8823a' },
  {
    id: 'image',
    label: 'IMAGE',
    exts: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'],
    color: '#9a6be0'
  },
  { id: 'text', label: 'TEXT', exts: ['txt', 'log'], color: '#8796a5' },
  ARCHIVE
]

/** Code ページで扱うファイル */
export const CODE_CATEGORIES: Category[] = [
  { id: 'ts', label: 'TypeScript', exts: ['ts', 'tsx', 'mts', 'cts'], color: '#3178c6' },
  { id: 'js', label: 'JavaScript', exts: ['js', 'jsx', 'mjs', 'cjs'], color: '#d4a514' },
  { id: 'py', label: 'Python', exts: ['py', 'pyw', 'pyi'], color: '#3a75a8' },
  {
    id: 'cpp',
    label: 'C / C++',
    exts: ['c', 'h', 'cpp', 'cc', 'cxx', 'c++', 'hpp', 'hh', 'hxx', 'ino'],
    color: '#5e7fc2'
  },
  { id: 'cs', label: 'C#', exts: ['cs'], color: '#8a5ac7' },
  { id: 'java', label: 'Java / Kotlin', exts: ['java', 'kt', 'kts'], color: '#c96f3a' },
  { id: 'go', label: 'Go', exts: ['go'], color: '#1ea7c4' },
  { id: 'rust', label: 'Rust', exts: ['rs'], color: '#b0573a' },
  {
    id: 'web',
    label: 'HTML / CSS',
    exts: ['html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte'],
    color: '#e0583a'
  },
  {
    id: 'data',
    label: 'JSON / YAML',
    exts: ['json', 'jsonc', 'yaml', 'yml', 'toml', 'xml', 'ini', 'cfg'],
    color: '#6a8a3a'
  },
  {
    id: 'shell',
    label: 'Shell',
    exts: ['sh', 'bash', 'zsh', 'ps1', 'psm1', 'bat', 'cmd'],
    color: '#4a5a6a'
  },
  { id: 'sql', label: 'SQL', exts: ['sql'], color: '#c2577a' },
  {
    id: 'other',
    label: 'その他',
    exts: ['rb', 'php', 'swift', 'dart', 'lua', 'r', 'pl', 'scala', 'vb'],
    color: '#7a8a9a'
  },
  { id: 'md', label: 'Markdown', exts: ['md', 'mdx', 'markdown'], color: '#18a39d' },
  ARCHIVE
]

export function categoryOf(ext: string, cats: Category[]): Category | undefined {
  return cats.find((c) => c.exts.includes(ext))
}

/** 拡張子 → highlight.js の言語名 */
const LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  pyw: 'python',
  pyi: 'python',
  c: 'c',
  h: 'cpp',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  'c++': 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  hxx: 'cpp',
  ino: 'cpp',
  cs: 'csharp',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  go: 'go',
  rs: 'rust',
  html: 'xml',
  htm: 'xml',
  vue: 'xml',
  svelte: 'xml',
  xml: 'xml',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  json: 'json',
  jsonc: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  cfg: 'ini',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  ps1: 'plaintext',
  psm1: 'plaintext',
  bat: 'plaintext',
  cmd: 'plaintext',
  sql: 'sql',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  lua: 'lua',
  r: 'r',
  pl: 'perl',
  vb: 'vbnet',
  md: 'markdown',
  mdx: 'markdown',
  markdown: 'markdown'
}

export function languageOf(ext: string): string {
  return LANG[ext] ?? 'plaintext'
}

/** 「編集」ボタンに表示するアプリ名 */
export function editLabel(ext: string): string {
  if (['docx', 'doc', 'docm', 'rtf', 'odt'].includes(ext)) return 'Word で編集'
  if (['xlsx', 'xlsm', 'xls', 'csv', 'ods'].includes(ext)) return 'Excel で編集'
  if (['pptx', 'pptm', 'ppt', 'odp'].includes(ext)) return 'PowerPoint で編集'
  return '既定のアプリで開く'
}

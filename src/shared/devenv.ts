/** 開発環境 (Python / Node) の検出・プロジェクト作成・パッケージ管理で使う型 */

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export interface ToolInfo {
  /** バージョン (例: "10.9.0")。見つからなければ null */
  version: string | null
  path: string | null
}

export interface NodeVersion {
  /** "22.11.0" の形 */
  version: string
  /** その Node の実行ファイルがあるフォルダ。null = いま PATH で使われている Node */
  binDir: string | null
  /** どこで見つけたか (例: "既定", "fnm", "nvm", "Volta") */
  source: string
  isDefault: boolean
}

export interface PythonVersion {
  /** "3.12" の形 (uv に渡す値) */
  minor: string
  /** 見つかったうち一番新しいパッチ ("3.12.7") */
  latest: string
  /** このパソコンにすでにあるか (false = uv が自動でダウンロードする) */
  installed: boolean
}

export type UvInstallMethod = 'winget' | 'brew' | 'official'

export interface DevEnv {
  platform: string
  node: NodeVersion[]
  managers: Record<PackageManager, ToolInfo>
  uv: ToolInfo
  /** uv が使える場合だけ。新しい順 */
  python: PythonVersion[]
  /** uv をインストールできる方法 (おすすめ順) */
  uvInstallMethods: UvInstallMethod[]
  git: ToolInfo
}

export type AppTemplate =
  | 'vite-react-ts'
  | 'vite-vue-ts'
  | 'vite-svelte-ts'
  | 'vite-vanilla-ts'
  | 'next-turbopack'
  | 'electron-vite-react-ts'
  | 'node-ts'

export interface AppTemplateInfo {
  id: AppTemplate
  label: string
  description: string
  /** dev サーバーを起動するコマンド (package.json の scripts 名) */
  devScript: string
}

export const APP_TEMPLATES: AppTemplateInfo[] = [
  {
    id: 'vite-react-ts',
    label: 'Vite + React',
    description: 'React + TypeScript の Web アプリ。いちばん定番',
    devScript: 'dev'
  },
  {
    id: 'next-turbopack',
    label: 'Next.js + Turbopack',
    description: 'App Router・Tailwind CSS・ESLint 入り。開発サーバーは Turbopack',
    devScript: 'dev'
  },
  {
    id: 'electron-vite-react-ts',
    label: 'Electron + Vite (electron-vite)',
    description: 'File Hub と同じ構成のデスクトップアプリ (React + TypeScript)',
    devScript: 'dev'
  },
  {
    id: 'vite-vue-ts',
    label: 'Vite + Vue',
    description: 'Vue 3 + TypeScript の Web アプリ',
    devScript: 'dev'
  },
  {
    id: 'vite-svelte-ts',
    label: 'Vite + Svelte',
    description: 'Svelte + TypeScript の Web アプリ',
    devScript: 'dev'
  },
  {
    id: 'vite-vanilla-ts',
    label: 'Vite (フレームワークなし)',
    description: 'TypeScript だけの軽い Web ページ',
    devScript: 'dev'
  },
  {
    id: 'node-ts',
    label: 'Node.js + TypeScript (CLI・スクリプト)',
    description: '画面なし。tsx で src/index.ts をそのまま実行',
    devScript: 'dev'
  }
]

export interface AppProjectOptions {
  kind: 'app'
  parentDir: string
  name: string
  template: AppTemplate
  manager: PackageManager
  /** 使う Node (NodeVersion.version)。null = 既定 */
  nodeVersion: string | null
  /** 作成後に依存パッケージを入れる (node_modules を作る) */
  install: boolean
  git: boolean
}

export interface PythonProjectOptions {
  kind: 'python'
  parentDir: string
  name: string
  /** "3.12" など */
  python: string
  /** app = アプリ・スクリプト / lib = ライブラリ */
  layout: 'app' | 'lib'
  /** 最初から入れるパッケージ (空白区切り) */
  packages: string[]
  git: boolean
}

export type ProjectOptions = AppProjectOptions | PythonProjectOptions

/** 実行中のコマンドの出力 1 行 (または区切り) */
export interface DevLog {
  /** どの作業のログか (レンダラー側で発行した番号) */
  job: string
  kind: 'cmd' | 'out' | 'err' | 'info' | 'done' | 'fail'
  text: string
}

export interface PackageEntry {
  name: string
  /** 設定ファイルに書かれた範囲 (例: ">=2.31", "^19.0.0") */
  spec: string
  /** lock や node_modules から分かった、実際のバージョン */
  installed: string | null
  dev: boolean
}

export interface ProjectInfo {
  kind: 'uv' | 'node'
  dir: string
  name: string
  packages: PackageEntry[]
  /** lock ファイルがあるか */
  locked: boolean
  /** .venv / node_modules があるか */
  envReady: boolean
  /** uv: requires-python / node: engines.node */
  runtime: string | null
  /** node のみ: lock ファイルから判断したパッケージマネージャー */
  manager?: PackageManager
  /** uv のみ: .python-version の中身 */
  pythonPin?: string | null
  scripts?: string[]
}

export type PackageAction =
  | { op: 'add'; packages: string[]; dev: boolean }
  | { op: 'remove'; packages: string[]; dev: boolean }
  | { op: 'sync' }
  | { op: 'upgrade' }

/** パッケージ名・バージョン指定として受け付ける文字 (シェルの特殊文字は通さない) */
export const PACKAGE_SPEC = /^[@A-Za-z0-9._\-/[\]<>=!~^,:+*]+$/

/** プロジェクト名として受け付ける文字 */
export function projectNameError(name: string, kind: 'app' | 'python'): string | null {
  const n = name.trim()
  if (!n) return 'プロジェクト名を入力してください'
  if (n.length > 64) return '64 文字以内にしてください'
  if (kind === 'app') {
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(n))
      return '半角の小文字・数字・ . _ - だけ使えます（先頭は小文字か数字）'
  } else if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(n)) {
    return '半角英数字と . _ - だけ使えます（先頭は英数字）'
  }
  if (/^(node_modules|favicon\.ico|con|prn|aux|nul)$/i.test(n)) return 'この名前は使えません'
  return null
}

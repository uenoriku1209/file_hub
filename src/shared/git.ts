// Git 画面とメインプロセスで共有する型

export interface GitFile {
  path: string
  /** 名前変更の場合の元のパス */
  from?: string
  /** git status の2文字 (X: インデックス, Y: 作業ツリー) */
  x: string
  y: string
  label: '新規' | '追加' | '変更' | '削除' | '名前変更' | '競合'
}

export interface GitStatus {
  installed: boolean
  isRepo: boolean
  /** 調べたフォルダ */
  dir: string
  version?: string
  /** リポジトリのいちばん上のフォルダ */
  root?: string
  branch?: string
  detached?: boolean
  hasCommits?: boolean
  upstream?: string
  upstreamGone?: boolean
  ahead?: number
  behind?: number
  files?: GitFile[]
  remotes?: { name: string; url: string }[]
  log?: { hash: string; author: string; date: string; subject: string }[]
  user?: { name: string; email: string }
  /** GitHub CLI (gh) にログイン済みか (初期設定画面で使う) */
  gh?: boolean
}

export interface GitBranches {
  local: string[]
  remote: string[]
}

export interface GitSetupOptions {
  branch: string
  message: string
  gitignore: boolean
  name: string
  email: string
  /** url: URL を指定して結び付け / gh: GitHub CLI で新規作成 / none: 結び付けない */
  remoteMode: 'url' | 'gh' | 'none'
  remoteUrl: string
  ghName: string
  ghPrivate: boolean
}

export interface GitStepLog {
  label: string
  state: 'running' | 'done' | 'error'
  detail?: string
}

/** 登録したコマンド */
export interface SavedCommand {
  id: string
  command: string
  description: string
  createdAt: string
}

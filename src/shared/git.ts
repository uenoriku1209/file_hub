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
  /** false ならリモート登録後のプッシュを行わない (画面側でターミナルからプッシュする) */
  push?: boolean
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

/** git のエラー出力を、わかりやすい日本語の説明にする */
export function explainGitError(text: string): string {
  const t = text.trim()
  const rules: [RegExp, string][] = [
    [
      /NOT_INSTALLED/,
      'Git がインストールされていません。https://git-scm.com/ からインストールしてください'
    ],
    [
      /Please tell me who you are|empty ident|user\.email/i,
      'コミットする人の名前とメールアドレスが未設定です。上の「名前とメールアドレス」を登録してください'
    ],
    [
      /(Enter passphrase|Bad passphrase|incorrect passphrase)[\s\S]*(Permission denied|Could not read from remote)/i,
      '合言葉（パスフレーズ）が違うため、SSH の鍵を使えませんでした。もう一度プッシュして、正しい合言葉を入力してください'
    ],
    [
      /Permission denied \(publickey\)|Host key verification failed|no such identity|publickey/i,
      'SSH の鍵で本人確認できませんでした。リモート URL が SSH 形式（git@github.com:…）ですが、この PC の SSH 鍵が GitHub に登録されていません。\n上の「HTTPS に切り替え」を押してからプッシュすると、ブラウザでログインして送れます（おすすめ）。SSH のまま使う場合は、ssh-keygen で鍵を作り GitHub の Settings → SSH and GPG keys に登録してください'
    ],
    [
      /Authentication failed|could not read Username|terminal prompts disabled|Permission denied|403/i,
      'リモートへのログイン（認証）に失敗しました。ターミナルタブで一度 git push を実行し、表示されるブラウザのログイン画面でログインしてください。以降はここから送れます'
    ],
    [
      /non-fast-forward|fetch first|rejected/i,
      'リモートに、手元にない変更があります。先に「プル」で取り込んでからプッシュしてください'
    ],
    [
      /Not possible to fast-forward|diverged|divergent/i,
      '手元とリモートの両方に別々の変更があるため、自動では取り込めません。ターミナルで git pull を実行して統合してください'
    ],
    [
      /Repository not found|does not appear to be a git repository|not found/i,
      'リモートのリポジトリが見つかりません。URL とアクセス権を確認してください'
    ],
    [
      /Could not resolve host|unable to access|Connection timed out|Failed to connect/i,
      'リモートに接続できません。インターネット接続と URL を確認してください'
    ],
    [/nothing to commit|no changes added to commit/i, 'コミットする変更がありません'],
    [
      /would be overwritten by checkout|Please commit your changes or stash them/i,
      'コミットしていない変更があるため、ブランチを切り替えられません。先にコミットしてください'
    ],
    [/already exists/i, '同じ名前のものがすでにあります'],
    [/not a valid branch name|is not a valid/i, 'ブランチ名に使えない文字が含まれています'],
    [
      /src refspec .* does not match any/i,
      'まだコミットがないため、プッシュできません。先にコミットしてください'
    ],
    [
      /時間内に終わらなかった/,
      '時間内に終わらなかったため中止しました（ログイン画面が裏に隠れていないか確認してください）'
    ]
  ]
  for (const [re, msg] of rules) if (re.test(t)) return `${msg}\n\n詳細: ${t.slice(0, 400)}`
  return t.slice(0, 600) || 'Git の操作に失敗しました'
}

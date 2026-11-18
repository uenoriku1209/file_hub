// Git の操作 (git コマンドを引数の配列で実行するので、ファイル名などがシェルに解釈されることはない)
import { execFile } from 'child_process'
import { promises as fs, existsSync } from 'fs'
import { join } from 'path'
import type { GitBranches, GitFile, GitSetupOptions, GitStatus, GitStepLog } from '../shared/git'

const LOCAL_TIMEOUT = 30_000
const NETWORK_TIMEOUT = 5 * 60_000

interface RunResult {
  code: number
  stdout: string
  stderr: string
}

function run(
  cmd: string,
  args: string[],
  cwd: string,
  timeout = LOCAL_TIMEOUT
): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      {
        cwd,
        timeout,
        windowsHide: true,
        maxBuffer: 20 * 1024 * 1024,
        // ターミナルでのパスワード入力待ちで止まらないようにする
        // (Windows では Git Credential Manager のログイン画面が別に開く)
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'auto' }
      },
      (err, stdout, stderr) => {
        const e = err as
          (NodeJS.ErrnoException & { code?: number | string; killed?: boolean }) | null
        let code = 0
        if (e) code = typeof e.code === 'number' ? e.code : 1
        if (e?.killed) stderr = `${stderr}\n時間内に終わらなかったため中止しました`
        if (e && e.code === 'ENOENT') stderr = 'NOT_INSTALLED'
        resolve({ code, stdout: String(stdout), stderr: String(stderr) })
      }
    )
  })
}

const git = (args: string[], cwd: string, timeout?: number): Promise<RunResult> =>
  run('git', args, cwd, timeout)

/** git の英語のエラーを、わかりやすい日本語に */
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
      /Authentication failed|could not read Username|terminal prompts disabled|Permission denied|403/i,
      'リモートへのログイン（認証）に失敗しました。ブラウザでのログイン画面が出た場合はログインしてください。ターミナルで一度 git push を実行してログインを済ませると、以降はここから送れます'
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

async function must(args: string[], cwd: string, timeout?: number): Promise<string> {
  const r = await git(args, cwd, timeout)
  if (r.code !== 0) throw new Error(explainGitError(`${r.stderr}\n${r.stdout}`))
  return r.stdout
}

/* ---------------- 状態の取得 ---------------- */

function statusLabel(x: string, y: string): GitFile['label'] {
  if (x === '?' && y === '?') return '新規'
  if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) return '競合'
  const c = x !== ' ' ? x : y
  if (c === 'A') return '追加'
  if (c === 'D') return '削除'
  if (c === 'R') return '名前変更'
  return '変更'
}

export async function gitStatus(dir: string): Promise<GitStatus> {
  const ver = await git(['--version'], dir)
  if (ver.code !== 0) return { installed: false, isRepo: false, dir }
  const status: GitStatus = { installed: true, isRepo: false, dir, version: ver.stdout.trim() }

  const [name, email] = await Promise.all([
    git(['config', 'user.name'], dir),
    git(['config', 'user.email'], dir)
  ])
  status.user = { name: name.stdout.trim(), email: email.stdout.trim() }

  const top = await git(['rev-parse', '--show-toplevel'], dir)
  if (top.code !== 0) {
    status.gh = await ghAvailable(dir)
    return status
  }
  status.isRepo = true
  status.root = top.stdout.trim()
  const root = status.root

  // ブランチと変更ファイル (-z: 日本語やスペースを含むファイル名もそのまま扱う)
  const st = await git(['status', '--porcelain=v1', '-b', '-z', '--untracked-files=all'], root)
  const parts = st.stdout.split('\0')
  const files: GitFile[] = []
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]
    if (!entry) continue
    if (entry.startsWith('## ')) {
      const head = entry.slice(3)
      const noCommit =
        head.match(/^No commits yet on (.+)$/) ?? head.match(/^Initial commit on (.+)$/)
      if (noCommit) {
        status.branch = noCommit[1]
        status.hasCommits = false
        continue
      }
      status.hasCommits = true
      if (head.startsWith('HEAD (no branch)')) {
        status.detached = true
        continue
      }
      const m = head.match(/^(.+?)(?:\.\.\.(\S+))?(?: \[(.+)\])?$/)
      if (m) {
        status.branch = m[1]
        status.upstream = m[2]
        status.ahead = Number(m[3]?.match(/ahead (\d+)/)?.[1] ?? 0)
        status.behind = Number(m[3]?.match(/behind (\d+)/)?.[1] ?? 0)
        if (m[3]?.includes('gone')) status.upstreamGone = true
      }
      continue
    }
    const x = entry[0]
    const y = entry[1]
    const path = entry.slice(3)
    const file: GitFile = { path, x, y, label: statusLabel(x, y) }
    if (x === 'R' || x === 'C') file.from = parts[++i]
    files.push(file)
  }
  status.files = files

  const remotes = await git(['remote', '-v'], root)
  const seen = new Map<string, string>()
  for (const line of remotes.stdout.split('\n')) {
    const m = line.match(/^(\S+)\s+(\S+)\s+\(fetch\)/)
    if (m) seen.set(m[1], m[2])
  }
  status.remotes = [...seen].map(([name, url]) => ({ name, url }))

  if (status.hasCommits) {
    const log = await git(
      ['log', '-n', '12', '--date=format:%Y/%m/%d %H:%M', '--pretty=format:%h%x1f%an%x1f%ad%x1f%s'],
      root
    )
    status.log = log.stdout
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [hash, author, date, subject] = l.split('\x1f')
        return { hash, author, date, subject }
      })
  }
  return status
}

export async function gitBranches(dir: string): Promise<GitBranches> {
  const local = await git(['branch', '--format=%(refname:short)'], dir)
  const remote = await git(['branch', '-r', '--format=%(refname:short)'], dir)
  return {
    local: local.stdout
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    remote: remote.stdout
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s && !s.endsWith('/HEAD') && s.includes('/'))
  }
}

async function checkBranchName(name: string, dir: string): Promise<void> {
  const r = await git(['check-ref-format', '--branch', name], dir)
  if (r.code !== 0 || !name.trim())
    throw new Error(
      'ブランチ名に使えない文字が含まれています（空白や ~ ^ : ? * [ \\ などは使えません）'
    )
}

/* ---------------- 操作 ---------------- */

export async function gitSwitch(dir: string, name: string, create: boolean): Promise<string> {
  await checkBranchName(name.replace(/^[^/]+\//, ''), dir)
  // origin/xxx を選んだ場合は、ローカルの xxx を作って追跡する (git switch の自動推測)
  const target = !create && /^[^/]+\//.test(name) ? name.replace(/^[^/]+\//, '') : name
  return must(create ? ['switch', '-c', target] : ['switch', target], dir)
}

export async function gitCommit(
  dir: string,
  message: string,
  files: string[] | 'all'
): Promise<string> {
  if (!message.trim()) throw new Error('コミットメッセージを入力してください')
  if (files === 'all') {
    await must(['add', '-A'], dir)
    return must(['commit', '-m', message], dir)
  }
  if (files.length === 0) throw new Error('コミットするファイルを選んでください')
  // 選んだファイルだけをコミットする (削除されたファイルも含めて記録)
  await must(['add', '-A', '--', ...files], dir)
  return must(['commit', '-m', message, '--', ...files], dir)
}

export async function gitPush(dir: string): Promise<string> {
  const st = await gitStatus(dir)
  if (!st.isRepo || !st.branch) throw new Error('リポジトリではありません')
  if (!st.remotes?.length)
    throw new Error('リモートが設定されていません。先にリモートの URL を登録してください')
  if (st.upstream && !st.upstreamGone)
    return must(['push'], dir, NETWORK_TIMEOUT).then(() => 'プッシュしました')
  const remote = st.remotes.find((r) => r.name === 'origin')?.name ?? st.remotes[0].name
  await must(['push', '-u', remote, st.branch], dir, NETWORK_TIMEOUT)
  return `プッシュしました（${remote}/${st.branch} を追跡するよう設定しました）`
}

export async function gitPull(dir: string): Promise<string> {
  await must(['pull', '--ff-only'], dir, NETWORK_TIMEOUT)
  return 'プルしました'
}

export async function gitAddRemote(dir: string, url: string, name = 'origin'): Promise<void> {
  if (!url.trim()) throw new Error('リモートの URL を入力してください')
  const exists = await git(['remote', 'get-url', name], dir)
  await must(
    exists.code === 0
      ? ['remote', 'set-url', name, url.trim()]
      : ['remote', 'add', name, url.trim()],
    dir
  )
}

export async function gitSetIdentity(dir: string, name: string, email: string): Promise<void> {
  if (!name.trim() || !email.trim()) throw new Error('名前とメールアドレスを入力してください')
  await must(['config', '--global', 'user.name', name.trim()], dir)
  await must(['config', '--global', 'user.email', email.trim()], dir)
}

/* ---------------- 初期設定 (リポジトリ作成 → 初回コミット → プッシュ) ---------------- */

export const DEFAULT_GITIGNORE = `# 依存パッケージ・ビルド結果
node_modules/
dist/
out/
build/
.venv/
__pycache__/

# 秘密情報 (API キーなど) は登録しない
.env
.env.*

# ログ・OS や Office の一時ファイル
*.log
.DS_Store
Thumbs.db
desktop.ini
~$*
`

async function ghAvailable(dir: string): Promise<boolean> {
  const r = await run('gh', ['auth', 'status'], dir, 15_000)
  return r.code === 0
}

export async function gitSetup(
  dir: string,
  o: GitSetupOptions,
  onStep: (log: GitStepLog) => void
): Promise<void> {
  const step = async (label: string, fn: () => Promise<string | void>): Promise<void> => {
    onStep({ label, state: 'running' })
    try {
      const out = await fn()
      onStep({
        label,
        state: 'done',
        detail: typeof out === 'string' ? out.trim().slice(0, 300) : undefined
      })
    } catch (e) {
      onStep({ label, state: 'error', detail: e instanceof Error ? e.message : String(e) })
      throw e
    }
  }
  await checkBranchName(o.branch, dir)

  if (o.name.trim() || o.email.trim())
    await step('名前とメールアドレスを登録', () => gitSetIdentity(dir, o.name, o.email))

  await step(`リポジトリを作成（ブランチ ${o.branch}）`, async () => {
    const r = await git(['init', '-b', o.branch], dir)
    if (r.code !== 0) {
      // 古い Git (2.28 未満) は -b に未対応
      await must(['init'], dir)
      await must(['symbolic-ref', 'HEAD', `refs/heads/${o.branch}`], dir)
    }
  })

  if (o.gitignore && !existsSync(join(dir, '.gitignore'))) {
    await step('.gitignore を作成', () =>
      fs.writeFile(join(dir, '.gitignore'), DEFAULT_GITIGNORE, 'utf8')
    )
  }

  await step('初回コミット', async () => {
    await must(['add', '-A'], dir)
    const r = await git(['commit', '-m', o.message || '初回コミット'], dir)
    if (r.code !== 0) {
      // 空のフォルダでも先に進めるよう、空のコミットを作る
      if (/nothing to commit/i.test(r.stdout + r.stderr)) {
        return must(['commit', '--allow-empty', '-m', o.message || '初回コミット'], dir)
      }
      throw new Error(explainGitError(`${r.stderr}\n${r.stdout}`))
    }
    return r.stdout
  })

  if (o.remoteMode === 'gh') {
    await step(`GitHub にリポジトリを作成してプッシュ（${o.ghName}）`, async () => {
      const r = await run(
        'gh',
        [
          'repo',
          'create',
          o.ghName,
          o.ghPrivate ? '--private' : '--public',
          '--source',
          dir,
          '--remote',
          'origin',
          '--push'
        ],
        dir,
        NETWORK_TIMEOUT
      )
      if (r.code !== 0) throw new Error(explainGitError(r.stderr || r.stdout))
      return r.stdout
    })
  } else if (o.remoteMode === 'url' && o.remoteUrl.trim()) {
    await step('リモートを登録（origin）', () => gitAddRemote(dir, o.remoteUrl))
    await step(`プッシュ（origin/${o.branch} を追跡）`, () =>
      must(['push', '-u', 'origin', o.branch], dir, NETWORK_TIMEOUT)
    )
  }
}

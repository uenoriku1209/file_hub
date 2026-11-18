import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  RefreshCw,
  GitBranch,
  GitCommitHorizontal,
  Upload,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Circle,
  ExternalLink,
  FolderGit2,
  UserRound,
  Link2,
  PanelLeftClose,
  X,
  SquareTerminal,
  KeyRound,
  Square
} from 'lucide-react'
import type { GitBranches, GitSetupOptions, GitStatus, GitStepLog } from '../../../shared/git'
import { explainGitError, isStagedFile } from '../../../shared/git'
import { isShellNoise, stripAnsi, toLines } from '../lib/ansi'
import type { TerminalHandle } from './TerminalPanel'
import { basename, errorMessage } from '../lib/format'
import { useToast } from '../lib/toast'

interface Props {
  /** 表示中のフォルダ */
  dir: string
  /** Git 画面が表示されているか (表示されたら最新の状態を読み直す) */
  active: boolean
  backLabel: string
  onBack: () => void
  /** ファイル一覧の再読み込み (.gitignore を作った場合など) */
  onChanged: () => void
  /** プッシュ・プルを実行するターミナル */
  terminal: { ensure: () => Promise<TerminalHandle>; show: () => void }
  /** プレビュー欄をしまえるか (最後の 1 つならしまえない) */
  canCollapse: boolean
  onCollapse: () => void
}

const LABEL_CLASS: Record<string, string> = {
  新規: 'new',
  追加: 'new',
  変更: 'mod',
  削除: 'del',
  名前変更: 'mod',
  競合: 'del'
}

/** ターミナルで実行中の操作 */
interface TermRun {
  label: string
  lines: string[]
  /** 入力待ちの問い合わせ (合言葉など) */
  prompt: string | null
  running: boolean
  code?: number
}

/** 出力の最後の行が「入力待ち」かどうか */
const PROMPT_RE =
  /(passphrase|password|username|パスフレーズ|パスワード)[^\n]*[:：?]\s*$|\(yes\/no[^)]*\)\?\s*$/i

export function GitPanel(p: Props): React.JSX.Element {
  const toast = useToast()
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [branches, setBranches] = useState<GitBranches>({ local: [], remote: [] })
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [setupLog, setSetupLog] = useState<GitStepLog[]>([])
  const [termRun, setTermRun] = useState<TermRun | null>(null)
  const [secret, setSecret] = useState('')
  const job = useRef<{ handle: TerminalHandle; cancel: () => void } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const s = await window.api.git.status(p.dir)
      setStatus(s)
      if (s.isRepo && s.root) setBranches(await window.api.git.branches(s.root))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [p.dir])

  useEffect(() => {
    if (p.active) load()
  }, [p.active, load])

  /** 操作を実行して、結果を表示し、状態を読み直す */
  const act = async (
    label: string,
    fn: () => Promise<unknown>,
    done?: string
  ): Promise<boolean> => {
    setBusy(label)
    setError('')
    try {
      const r = await fn()
      toast(
        'success',
        done ?? (typeof r === 'string' && r.length < 80 ? r : `${label}が完了しました`)
      )
      await load()
      p.onChanged()
      return true
    } catch (e) {
      setError(errorMessage(e))
      await load()
      return false
    } finally {
      setBusy(null)
    }
  }

  /** ターミナルで git を実行し、出力をこの画面に表示する (合言葉などの入力欄つき) */
  const runInTerminal = async (label: string, root: string, args: string[]): Promise<void> => {
    setError('')
    setBusy(label)
    setSecret('')
    setTermRun({ label, lines: [], prompt: null, running: true })
    let handle: TerminalHandle
    try {
      handle = await p.terminal.ensure()
    } catch (e) {
      setError(errorMessage(e))
      setTermRun(null)
      setBusy(null)
      return
    }
    let buf = ''
    const off = handle.onOutput((data) => {
      buf = (buf + stripAnsi(data)).slice(-20000)
      const lines = toLines(buf).filter((l) => !isShellNoise(l))
      const last = toLines(buf).pop()?.trimEnd() ?? ''
      const prompt = PROMPT_RE.test(last) ? last.trim() : null
      setTermRun((r) => r && { ...r, lines: lines.slice(-14), prompt })
    })
    const run = handle.runGit(root, args)
    job.current = { handle, cancel: run.cancel }
    const code = await run.done
    off()
    job.current = null
    setSecret('')
    setTermRun((r) => r && { ...r, running: false, prompt: null, code })
    if (code === 0) toast('success', `${label}が完了しました`)
    else if (code === 130) toast('info', `${label}を中止しました`)
    else
      setError(
        explainGitError(
          toLines(buf)
            .filter((l) => !isShellNoise(l))
            .join('\n')
            .trim()
        )
      )
    setBusy(null)
    await load()
    p.onChanged()
  }

  const push = (root: string, branch: string | undefined, hasUpstream: boolean): void => {
    runInTerminal(
      'プッシュ',
      root,
      hasUpstream || !branch ? ['push'] : ['push', '-u', 'origin', branch]
    )
  }
  const pull = (root: string): void => {
    runInTerminal('プル', root, ['pull', '--ff-only'])
  }

  const sendSecret = (): void => {
    if (!job.current) return
    job.current.handle.write(secret + '\r')
    setSecret('')
    setTermRun((r) => r && { ...r, prompt: null })
  }

  const header = (
    <div className="git-head">
      <button className="btn small" onClick={p.onBack} title={`${p.backLabel}に戻る`}>
        <ArrowLeft size={14} /> 戻る
      </button>
      <div className="git-title">
        <GitBranch size={16} />
        <span>Git</span>
        {status?.root && (
          <span className="muted git-root" title={status.root}>
            {basename(status.root)}
          </span>
        )}
      </div>
      <div className="spacer" />
      <button
        className="btn-icon small"
        onClick={load}
        title="最新の状態を読み込む"
        disabled={!!busy}
      >
        <RefreshCw size={14} className={loading ? 'spin' : ''} />
      </button>
      <button
        className="btn-icon small"
        onClick={p.onCollapse}
        disabled={!p.canCollapse}
        title={
          p.canCollapse
            ? 'この欄をしまう（左の Office / Code タブの下から戻せます）'
            : '最後の欄はしまえません'
        }
      >
        <PanelLeftClose size={14} />
      </button>
    </div>
  )

  let body: React.ReactNode
  if (!status)
    body = (
      <div className="state">
        {loading ? <Loader2 className="spin" size={20} /> : null} 読み込み中…
      </div>
    )
  else if (!status.installed)
    body = (
      <div className="git-section">
        <h3>Git がインストールされていません</h3>
        <p className="muted small-text">
          https://git-scm.com/ から「Git for Windows」をインストールし、File Hub
          を再起動してください（設定は初期値のままで大丈夫です）。
        </p>
      </div>
    )
  else if (!status.isRepo)
    body = (
      <SetupView
        status={status}
        dir={p.dir}
        busy={busy}
        setBusy={setBusy}
        onDone={async (log, ok, pushBranch) => {
          setSetupLog(log)
          await load()
          p.onChanged()
          if (ok) toast('success', 'リポジトリの初期設定が完了しました')
          // URL を指定した場合のプッシュは、合言葉を入力できるようターミナルで行う
          if (ok && pushBranch) push(p.dir, pushBranch, false)
        }}
      />
    )
  else
    body = (
      <RepoView
        status={status}
        branches={branches}
        busy={busy}
        act={act}
        onPush={() => push(status.root!, status.branch, !!status.upstream && !status.upstreamGone)}
        onPull={() => pull(status.root!)}
      />
    )

  return (
    <div className="git-panel">
      {header}
      <div className="git-body">
        {termRun && (
          <div className={`git-section git-run ${termRun.prompt ? 'asking' : ''}`}>
            <div className="git-section-head">
              <h3>
                <SquareTerminal size={15} /> {termRun.label}
                <span className="muted small-text">
                  {termRun.running
                    ? '（ターミナルで実行中）'
                    : termRun.code === 0
                      ? '（完了）'
                      : termRun.code === 130
                        ? '（中止）'
                        : '（失敗）'}
                </span>
              </h3>
              <div className="key-row">
                <button className="btn small" onClick={p.terminal.show}>
                  <SquareTerminal size={13} /> ターミナルで見る
                </button>
                {termRun.running ? (
                  <button className="btn small" onClick={() => job.current?.cancel()}>
                    <Square size={12} /> 中止
                  </button>
                ) : (
                  <button
                    className="btn-icon small"
                    onClick={() => setTermRun(null)}
                    title="閉じる"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
            {termRun.prompt && (
              <form
                className="git-secret"
                onSubmit={(e) => {
                  e.preventDefault()
                  sendSecret()
                }}
              >
                <div className="git-secret-label">
                  <KeyRound size={15} /> {termRun.prompt}
                </div>
                <div className="key-row">
                  <input
                    className="input"
                    type={/yes\/no|username/i.test(termRun.prompt) ? 'text' : 'password'}
                    autoFocus
                    autoComplete="off"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder={
                      /yes\/no/i.test(termRun.prompt)
                        ? '初めて接続する相手です。続けるなら yes と入力'
                        : /username/i.test(termRun.prompt)
                          ? 'ユーザー名'
                          : '合言葉（パスフレーズ）を入力して Enter'
                    }
                  />
                  <button className="btn btn-primary small" type="submit">
                    送信
                  </button>
                </div>
                <p className="muted small-text">
                  入力した内容はターミナルにそのまま送られ、保存はされません。
                </p>
              </form>
            )}
            {termRun.lines.some((l) => l.trim()) && (
              <pre className="git-run-log">{termRun.lines.join('\n').trim()}</pre>
            )}
          </div>
        )}
        {busy && !termRun?.running && (
          <div className="git-busy">
            <Loader2 size={16} className="spin" /> {busy}…
          </div>
        )}
        {error && (
          <div className="git-error">
            <AlertCircle size={16} />
            <pre>{error}</pre>
            <button className="btn-icon small" onClick={() => setError('')} title="閉じる">
              <X size={13} />
            </button>
          </div>
        )}
        {setupLog.length > 0 && status?.isRepo && (
          <div className="git-section">
            <div className="git-section-head">
              <h3>初期設定の結果</h3>
              <button className="btn-icon small" onClick={() => setSetupLog([])} title="閉じる">
                <X size={13} />
              </button>
            </div>
            <StepList steps={setupLog} />
          </div>
        )}
        {body}
      </div>
    </div>
  )
}

function StepList({ steps }: { steps: GitStepLog[] }): React.JSX.Element {
  return (
    <ul className="git-steps">
      {steps.map((s, i) => (
        <li key={i} className={s.state}>
          {s.state === 'running' ? (
            <Loader2 size={14} className="spin" />
          ) : s.state === 'done' ? (
            <CheckCircle2 size={14} />
          ) : (
            <AlertCircle size={14} />
          )}
          <div>
            <div>{s.label}</div>
            {s.state === 'error' && s.detail && <pre>{s.detail}</pre>}
          </div>
        </li>
      ))}
    </ul>
  )
}

/* ---------------- 初期設定 (リポジトリでない場合) ---------------- */

function SetupView({
  status,
  dir,
  busy,
  setBusy,
  onDone
}: {
  status: GitStatus
  dir: string
  busy: string | null
  setBusy: (s: string | null) => void
  onDone: (log: GitStepLog[], ok: boolean, pushBranch?: string) => void
}): React.JSX.Element {
  const needIdentity = !status.user?.name || !status.user?.email
  const [o, setO] = useState<GitSetupOptions>({
    branch: 'main',
    message: '初回コミット',
    gitignore: true,
    name: status.user?.name ?? '',
    email: status.user?.email ?? '',
    remoteMode: 'url',
    remoteUrl: '',
    ghName:
      basename(dir)
        .replace(/[^A-Za-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'my-project',
    ghPrivate: true
  })
  const [steps, setSteps] = useState<GitStepLog[]>([])
  const [error, setError] = useState('')
  const set = <K extends keyof GitSetupOptions>(k: K, v: GitSetupOptions[K]): void =>
    setO((x) => ({ ...x, [k]: v }))

  const run = async (): Promise<void> => {
    setError('')
    if (!o.branch.trim()) return setError('ブランチ名を入力してください')
    if (needIdentity && (!o.name.trim() || !o.email.trim()))
      return setError('名前とメールアドレスを入力してください（コミットの記録に使われます）')
    if (o.remoteMode === 'url' && !o.remoteUrl.trim())
      return setError('リモートの URL を入力するか、「あとで設定」を選んでください')
    if (o.remoteMode === 'gh' && !o.ghName.trim())
      return setError('GitHub のリポジトリ名を入力してください')
    const log: GitStepLog[] = []
    setSteps([])
    const off = window.api.git.onSetupStep((s) => {
      const i = log.findIndex((x) => x.label === s.label)
      if (i >= 0) log[i] = s
      else log.push(s)
      setSteps([...log])
    })
    setBusy('初期設定を実行中')
    let ok = true
    try {
      await window.api.git.setup(dir, {
        ...o,
        name: needIdentity ? o.name : '',
        email: needIdentity ? o.email : '',
        push: o.remoteMode !== 'url'
      })
    } catch {
      ok = false
    } finally {
      off()
      setBusy(null)
    }
    onDone(log, ok, o.remoteMode === 'url' && o.remoteUrl.trim() ? o.branch.trim() : undefined)
  }

  return (
    <div className="git-setup">
      <div className="git-section intro">
        <FolderGit2 size={28} />
        <div>
          <h3>このフォルダはまだ Git で管理されていません</h3>
          <p className="muted small-text" title={dir}>
            「{basename(dir)}」をリポジトリにして、初回コミット → リモート（GitHub
            など）との結び付け → プッシュ までをまとめて行います。
          </p>
        </div>
      </div>

      {needIdentity && (
        <div className="git-section">
          <h3>
            <UserRound size={15} /> 名前とメールアドレス
          </h3>
          <p className="muted small-text">
            コミットの記録に使われます（この PC の Git 全体の設定として保存）。公開リポジトリでは
            GitHub の noreply アドレスもおすすめです。
          </p>
          <div className="field-row">
            <input
              className="input"
              value={o.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="名前（例: Taro Yamada）"
            />
            <input
              className="input"
              value={o.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="メールアドレス"
            />
          </div>
        </div>
      )}

      <div className="git-section">
        <h3>
          <GitCommitHorizontal size={15} /> リポジトリと初回コミット
        </h3>
        <div className="field-row">
          <div className="field">
            <label>ブランチ名</label>
            <input
              className="input"
              value={o.branch}
              onChange={(e) => set('branch', e.target.value)}
            />
          </div>
          <div className="field">
            <label>初回コミットのメッセージ</label>
            <input
              className="input"
              value={o.message}
              onChange={(e) => set('message', e.target.value)}
            />
          </div>
        </div>
        <label className="check compact">
          <input
            type="checkbox"
            checked={o.gitignore}
            onChange={(e) => set('gitignore', e.target.checked)}
          />
          .gitignore を作成する（node_modules・dist・.env・Office
          の一時ファイルなどを登録しない。すでにある場合はそのまま）
        </label>
      </div>

      <div className="git-section">
        <h3>
          <Link2 size={15} /> リモート（GitHub など）との結び付け
        </h3>
        <div className="segmented">
          <button
            className={o.remoteMode === 'url' ? 'active' : ''}
            onClick={() => set('remoteMode', 'url')}
          >
            URL を指定
          </button>
          <button
            className={o.remoteMode === 'gh' ? 'active' : ''}
            onClick={() => set('remoteMode', 'gh')}
            disabled={!status.gh}
            title={
              status.gh
                ? ''
                : 'GitHub CLI (gh) をインストールし、gh auth login でログインすると使えます'
            }
          >
            GitHub に新規作成
          </button>
          <button
            className={o.remoteMode === 'none' ? 'active' : ''}
            onClick={() => set('remoteMode', 'none')}
          >
            あとで設定
          </button>
        </div>
        {o.remoteMode === 'url' && (
          <>
            <input
              className="input"
              value={o.remoteUrl}
              onChange={(e) => set('remoteUrl', e.target.value)}
              placeholder="https://github.com/ユーザー名/リポジトリ名.git"
              spellCheck={false}
            />
            <p className="muted small-text">
              GitHub で空のリポジトリを作り（README などは追加しない）、表示される URL
              を貼り付けてください。{' '}
              <a href="https://github.com/new" target="_blank" rel="noreferrer">
                GitHub で作成 <ExternalLink size={11} />
              </a>
              。初回のプッシュ時にブラウザでログインを求められることがあります。
            </p>
          </>
        )}
        {o.remoteMode === 'gh' && (
          <div className="field-row">
            <input
              className="input"
              value={o.ghName}
              onChange={(e) => set('ghName', e.target.value)}
              placeholder="リポジトリ名（英数字）"
            />
            <label className="check">
              <input
                type="checkbox"
                checked={o.ghPrivate}
                onChange={(e) => set('ghPrivate', e.target.checked)}
              />{' '}
              非公開（Private）
            </label>
          </div>
        )}
        {o.remoteMode === 'none' && (
          <p className="muted small-text">
            リポジトリの作成と初回コミットだけを行います。リモートはあとで Git
            画面から登録できます。
          </p>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}
      {steps.length > 0 && <StepList steps={steps} />}

      <div className="key-row end">
        <button className="btn btn-primary" onClick={run} disabled={!!busy}>
          {busy ? <Loader2 size={15} className="spin" /> : <FolderGit2 size={15} />} 初期設定を実行
        </button>
      </div>
    </div>
  )
}

/* ---------------- リポジトリの画面 ---------------- */

function RepoView({
  status,
  branches,
  busy,
  act,
  onPush,
  onPull
}: {
  status: GitStatus
  branches: GitBranches
  busy: string | null
  act: (label: string, fn: () => Promise<unknown>, done?: string) => Promise<boolean>
  onPush: () => void
  onPull: () => void
}): React.JSX.Element {
  const root = status.root!
  const [target, setTarget] = useState('')
  const [newBranch, setNewBranch] = useState('')
  const [remoteUrl, setRemoteUrl] = useState('')
  const [name, setName] = useState(status.user?.name ?? '')
  const [email, setEmail] = useState(status.user?.email ?? '')

  const otherBranches = useMemo(
    () => [
      ...branches.local.filter((b) => b !== status.branch),
      ...branches.remote.filter((r) => !branches.local.includes(r.replace(/^[^/]+\//, '')))
    ],
    [branches, status.branch]
  )
  const needIdentity = !status.user?.name || !status.user?.email
  const hasRemote = (status.remotes?.length ?? 0) > 0

  const syncText = !hasRemote
    ? 'リモート未設定'
    : !status.hasCommits
      ? 'まだコミットがありません'
      : !status.upstream || status.upstreamGone
        ? '追跡先なし（プッシュすると設定されます）'
        : status.ahead || status.behind
          ? [
              status.ahead ? `未送信 ${status.ahead} 件` : '',
              status.behind ? `未取り込み ${status.behind} 件` : ''
            ]
              .filter(Boolean)
              .join('・')
          : `${status.upstream} と同じ`

  return (
    <div className="git-repo">
      {/* リポジトリの概要 */}
      <div className="git-section">
        <div className="git-summary">
          <span className="pill accent big">
            <GitBranch size={13} /> {status.detached ? '（ブランチ外）' : status.branch}
          </span>
          <span className={`git-sync ${status.ahead || status.behind ? 'warn' : ''}`}>
            {syncText}
          </span>
          <div className="spacer" />
          <button
            className={`btn small ${status.behind ? 'btn-primary' : ''}`}
            disabled={!!busy || !hasRemote || !status.upstream}
            onClick={onPull}
            title="リモート（GitHub など）にある新しい変更を取り込みます"
          >
            <Download size={14} /> プル{status.behind ? `（${status.behind}）` : ''}
          </button>
        </div>
        <div className="git-meta" title={root}>
          <FolderGit2 size={13} /> {root}
        </div>
        {status.remotes?.map((r) => (
          <RemoteRow key={r.name} root={root} name={r.name} url={r.url} busy={busy} act={act} />
        ))}
        {!hasRemote && (
          <div className="key-row">
            <input
              className="input"
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              placeholder="リモートの URL（https://github.com/…/….git）"
              spellCheck={false}
            />
            <button
              className="btn small btn-primary"
              disabled={!!busy || !remoteUrl.trim()}
              onClick={() =>
                act(
                  'リモートの登録',
                  () => window.api.git.addRemote(root, remoteUrl),
                  'リモート（origin）を登録しました'
                )
              }
            >
              登録
            </button>
          </div>
        )}
      </div>

      {needIdentity && (
        <div className="git-section warn">
          <h3>
            <UserRound size={15} /> 名前とメールアドレスが未設定です
          </h3>
          <p className="muted small-text">
            コミットするには登録が必要です（この PC の Git 全体の設定として保存）。
          </p>
          <div className="key-row">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="名前"
            />
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="メールアドレス"
            />
            <button
              className="btn small btn-primary"
              disabled={!!busy}
              onClick={() =>
                act(
                  '名前とメールアドレスの登録',
                  () => window.api.git.setIdentity(root, name, email),
                  '登録しました'
                )
              }
            >
              登録
            </button>
          </div>
        </div>
      )}

      {/* add → commit → push の流れ */}
      <GitFlow status={status} busy={busy} act={act} onPush={onPush} />

      {/* ブランチ */}
      <div className="git-section">
        <h3>
          <GitBranch size={15} /> ブランチ
        </h3>
        <div className="key-row">
          <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">切り替え先を選択（現在: {status.branch ?? '—'}）</option>
            {otherBranches.map((b) => (
              <option key={b} value={b}>
                {b}
                {b.includes('/') && branches.remote.includes(b) ? '（リモート）' : ''}
              </option>
            ))}
          </select>
          <button
            className="btn small"
            disabled={!!busy || !target}
            onClick={async () => {
              if (
                await act(
                  'ブランチの切り替え',
                  () => window.api.git.switchBranch(root, target, false),
                  `「${target.replace(/^[^/]+\//, '')}」に切り替えました`
                )
              )
                setTarget('')
            }}
          >
            切り替え
          </button>
        </div>
        <div className="key-row">
          <input
            className="input"
            value={newBranch}
            onChange={(e) => setNewBranch(e.target.value)}
            placeholder="新しいブランチ名（例: feature/pdf）"
            spellCheck={false}
          />
          <button
            className="btn small"
            disabled={!!busy || !newBranch.trim()}
            onClick={async () => {
              if (
                await act(
                  'ブランチの作成',
                  () => window.api.git.switchBranch(root, newBranch.trim(), true),
                  `「${newBranch.trim()}」を作成して切り替えました`
                )
              )
                setNewBranch('')
            }}
          >
            作成して切り替え
          </button>
        </div>
      </div>

      {/* 履歴 */}
      <div className="git-section">
        <h3>
          <Circle size={13} /> 最近のコミット
        </h3>
        {status.log?.length ? (
          <ul className="git-log">
            {status.log.map((l) => (
              <li key={l.hash}>
                <span className="mono-text muted">{l.hash}</span>
                <span className="git-log-subject">{l.subject}</span>
                <span className="muted small-text">
                  {l.author}・{l.date}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small-text">まだコミットがありません。</p>
        )}
      </div>
    </div>
  )
}

/* ---------------- リモート 1 件の表示・変更 ---------------- */

/** SSH 形式の URL (git@host:user/repo.git / ssh://git@host/user/repo.git) を HTTPS 形式に変換 */
function sshToHttps(url: string): string | null {
  const u = url.trim()
  let m = u.match(/^[\w.-]+@([\w.-]+):(?!\/)(.+)$/)
  if (!m) m = u.match(/^ssh:\/\/[\w.-]+@([\w.-]+)(?::\d+)?\/(.+)$/)
  if (!m) return null
  const path = m[2].replace(/^\/+/, '')
  return `https://${m[1]}/${path.endsWith('.git') ? path : path + '.git'}`
}

function RemoteRow({
  root,
  name,
  url,
  busy,
  act
}: {
  root: string
  name: string
  url: string
  busy: string | null
  act: (label: string, fn: () => Promise<unknown>, done?: string) => Promise<boolean>
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(url)
  const https = sshToHttps(url)

  useEffect(() => {
    setValue(url)
  }, [url])

  if (editing)
    return (
      <div className="key-row">
        <span className="git-remote-name">{name}</span>
        <input
          className="input"
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
          placeholder="https://github.com/ユーザー名/リポジトリ名.git"
          spellCheck={false}
        />
        <button
          className="btn small btn-primary"
          disabled={!!busy || !value.trim()}
          onClick={async () => {
            if (
              await act(
                'リモート URL の変更',
                () => window.api.git.addRemote(root, value, name),
                `${name} の URL を変更しました`
              )
            )
              setEditing(false)
          }}
        >
          保存
        </button>
        <button className="btn small" onClick={() => setEditing(false)}>
          キャンセル
        </button>
      </div>
    )

  return (
    <div className="git-remote">
      <div className="git-meta">
        <Link2 size={13} /> {name}: <span className="mono-text">{url}</span>
        {https && <span className="pill warn-pill">SSH</span>}
      </div>
      <div className="git-remote-actions">
        {https && (
          <button
            className="btn small btn-primary"
            disabled={!!busy}
            title={`${https} に変更します。プッシュ時にブラウザで GitHub にログインできます`}
            onClick={() =>
              act(
                'HTTPS への切り替え',
                () => window.api.git.addRemote(root, https, name),
                `${name} を HTTPS に切り替えました`
              )
            }
          >
            HTTPS に切り替え
          </button>
        )}
        <button className="btn small" disabled={!!busy} onClick={() => setEditing(true)}>
          URL を変更
        </button>
        <button
          className="btn small"
          disabled={!!busy}
          onClick={() => {
            if (
              confirm(
                `リモート「${name}」の登録を解除しますか？（GitHub 上のリポジトリは削除されません）`
              )
            )
              act(
                'リモートの解除',
                () => window.api.git.removeRemote(root, name),
                `${name} の登録を解除しました`
              )
          }}
        >
          解除
        </button>
      </div>
    </div>
  )
}

/* ---------------- add → commit → push の段階表示 ---------------- */

type Step = 1 | 2 | 3 | 4

function FlowStep({
  n,
  title,
  hint,
  state,
  children
}: {
  n: number
  title: string
  hint: string
  /** active: いまの操作 / done: 完了 / locked: まだ */
  state: 'active' | 'done' | 'locked'
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={`flow-step ${state}`} aria-disabled={state !== 'active'}>
      <div className="flow-step-head">
        <span className="flow-num">{state === 'done' ? <CheckCircle2 size={16} /> : n}</span>
        <div>
          <h3>{title}</h3>
          <p className="muted small-text">{hint}</p>
        </div>
        {state === 'active' && <span className="flow-now">いまここ</span>}
      </div>
      <div className="flow-step-body" inert={state !== 'active'}>
        {children}
      </div>
    </div>
  )
}

function FlowLink({ done }: { done: boolean }): React.JSX.Element {
  return (
    <div className={`flow-link ${done ? 'done' : ''}`}>
      <span />
    </div>
  )
}

function GitFlow({
  status,
  busy,
  act,
  onPush
}: {
  status: GitStatus
  busy: string | null
  act: (label: string, fn: () => Promise<unknown>, done?: string) => Promise<boolean>
  onPush: () => void
}): React.JSX.Element {
  const root = status.root!
  const files = status.files ?? []
  const staged = files.filter(isStagedFile)
  const hasRemote = (status.remotes?.length ?? 0) > 0
  const needsPush =
    hasRemote &&
    !!status.hasCommits &&
    (!!status.ahead || !status.upstream || !!status.upstreamGone)

  // いまの段階 (状態から自動で決める。「選び直す」で 1 に戻れる)
  const auto: Step = staged.length ? 2 : needsPush ? 3 : files.length ? 1 : 4
  const [manual, setManual] = useState<Step | null>(null)
  const stateKey = `${files.map((f) => f.x + f.y + f.path).join('|')}#${status.ahead}#${status.upstream}`
  useEffect(() => setManual(null), [stateKey])
  const step: Step = manual ?? auto

  // 1. 選択 (add 済みのものがあればそれを、なければ全部を選んだ状態から始める)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const fileKey = files.map((f) => f.path + (isStagedFile(f) ? '+' : '')).join('\n')
  useEffect(() => {
    const st = files.filter(isStagedFile)
    setSelected(new Set((st.length ? st : files).map((f) => f.path)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKey])
  const allSelected = files.length > 0 && selected.size === files.length

  const [message, setMessage] = useState('')

  const stateOf = (n: 1 | 2 | 3): 'active' | 'done' | 'locked' =>
    step === n ? 'active' : step > n ? 'done' : 'locked'

  return (
    <div className={`git-flow ${step === 4 ? 'all-done' : ''}`}>
      <FlowStep
        n={1}
        title="送るファイルを選ぶ（add）"
        hint="変更したファイルのうち、今回記録するものにチェックを入れて「追加」を押します"
        state={stateOf(1)}
      >
        {files.length === 0 ? (
          <p className="muted small-text">
            変更はありません。ファイルを編集・追加すると、ここに表示されます。
          </p>
        ) : (
          <>
            <div className="git-section-head">
              <span className="muted small-text">変更されたファイル（{files.length} 件）</span>
              <label className="check compact">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(files.map((f) => f.path)) : new Set())
                  }
                />{' '}
                すべて選択
              </label>
            </div>
            <ul className="git-files">
              {files.map((f) => (
                <li key={f.path}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.has(f.path)}
                      onChange={(e) =>
                        setSelected((s) => {
                          const n = new Set(s)
                          if (e.target.checked) n.add(f.path)
                          else n.delete(f.path)
                          return n
                        })
                      }
                    />
                    <span className={`git-badge ${LABEL_CLASS[f.label]}`}>{f.label}</span>
                    <span className="git-path" title={f.from ? `${f.from} → ${f.path}` : f.path}>
                      {f.from ? `${f.from} → ` : ''}
                      {f.path}
                    </span>
                    {isStagedFile(f) && <span className="pill flow-staged">追加済み</span>}
                  </label>
                </li>
              ))}
            </ul>
            <div className="key-row end">
              <button
                className="btn btn-primary small"
                disabled={!!busy || selected.size === 0}
                onClick={() =>
                  act(
                    '追加',
                    () => window.api.git.stage(root, [...selected]),
                    `${selected.size} 件を追加しました。次はコミットです`
                  )
                }
              >
                <CheckCircle2 size={14} /> 選んだ {selected.size} 件を追加して次へ
              </button>
            </div>
          </>
        )}
      </FlowStep>

      <FlowLink done={step > 1} />

      <FlowStep
        n={2}
        title="記録する（commit）"
        hint="追加したファイルを、メッセージ付きで手元に記録します（まだリモートには送られません）"
        state={stateOf(2)}
      >
        {staged.length > 0 && (
          <div className="flow-chips">
            {staged.slice(0, 12).map((f) => (
              <span key={f.path} className="pill" title={f.path}>
                {basename(f.path)}
              </span>
            ))}
            {staged.length > 12 && (
              <span className="muted small-text">ほか {staged.length - 12} 件</span>
            )}
          </div>
        )}
        <textarea
          className="input"
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="コミットメッセージ（何を変えたか。例: 図の作成機能を追加）"
        />
        <div className="key-row end">
          <button className="btn small" disabled={!!busy} onClick={() => setManual(1)}>
            <ArrowLeft size={14} /> ファイルを選び直す
          </button>
          <button
            className="btn btn-primary small"
            disabled={!!busy || !message.trim()}
            onClick={async () => {
              const ok = await act(
                'コミット',
                () => window.api.git.commit(root, message, 'staged'),
                hasRemote ? 'コミットしました。次はプッシュです' : 'コミットしました'
              )
              if (ok) setMessage('')
            }}
          >
            <GitCommitHorizontal size={14} /> コミット（{staged.length} 件）
          </button>
        </div>
      </FlowStep>

      <FlowLink done={step > 2} />

      <FlowStep
        n={3}
        title="送る（push）"
        hint="記録した内容をリモート（GitHub など）に送ります。ターミナルで実行し、合言葉を聞かれたらこの画面に入力欄が出ます"
        state={stateOf(3)}
      >
        {!hasRemote ? (
          <p className="muted small-text">
            リモートが未設定です。上の概要で URL を登録すると送れるようになります。
          </p>
        ) : (
          <div className="key-row">
            <button
              className="btn btn-primary small"
              disabled={!!busy || !status.hasCommits}
              onClick={onPush}
            >
              <Upload size={14} /> プッシュ{status.ahead ? `（未送信 ${status.ahead} 件）` : ''}
            </button>
            {files.length > 0 && (
              <button className="btn small" disabled={!!busy} onClick={() => setManual(1)}>
                先に別の変更も追加する
              </button>
            )}
          </div>
        )}
      </FlowStep>

      {step === 4 && (
        <div className="flow-finish">
          <CheckCircle2 size={18} />
          {hasRemote
            ? 'すべて完了しました。手元とリモートは同じ状態です'
            : 'コミットまで完了しました（リモートを登録すると送れます）'}
        </div>
      )}
    </div>
  )
}

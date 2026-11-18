import { useCallback, useEffect, useMemo, useState } from 'react'
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
  Maximize2,
  Minimize2,
  X
} from 'lucide-react'
import type { GitBranches, GitSetupOptions, GitStatus, GitStepLog } from '../../../shared/git'
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
  maximized: boolean
  onToggleMax: () => void
}

const LABEL_CLASS: Record<string, string> = {
  新規: 'new',
  追加: 'new',
  変更: 'mod',
  削除: 'del',
  名前変更: 'mod',
  競合: 'del'
}

export function GitPanel(p: Props): React.JSX.Element {
  const toast = useToast()
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [branches, setBranches] = useState<GitBranches>({ local: [], remote: [] })
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [setupLog, setSetupLog] = useState<GitStepLog[]>([])

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
        onClick={p.onToggleMax}
        title={p.maximized ? '元の大きさに戻す（Esc）' : '大画面で表示'}
      >
        {p.maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
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
        onDone={async (log, ok) => {
          setSetupLog(log)
          await load()
          p.onChanged()
          if (ok) toast('success', 'リポジトリの初期設定が完了しました')
        }}
      />
    )
  else body = <RepoView status={status} branches={branches} busy={busy} act={act} />

  return (
    <div className="git-panel">
      {header}
      <div className="git-body">
        {busy && (
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
  onDone: (log: GitStepLog[], ok: boolean) => void
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
        email: needIdentity ? o.email : ''
      })
    } catch {
      ok = false
    } finally {
      off()
      setBusy(null)
    }
    onDone(log, ok)
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
  act
}: {
  status: GitStatus
  branches: GitBranches
  busy: string | null
  act: (label: string, fn: () => Promise<unknown>, done?: string) => Promise<boolean>
}): React.JSX.Element {
  const root = status.root!
  const files = status.files ?? []
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('')
  const [target, setTarget] = useState('')
  const [newBranch, setNewBranch] = useState('')
  const [remoteUrl, setRemoteUrl] = useState('')
  const [name, setName] = useState(status.user?.name ?? '')
  const [email, setEmail] = useState(status.user?.email ?? '')

  // 変更ファイルが変わったら、全部選択し直す
  const fileKey = files.map((f) => f.path).join('\n')
  useEffect(() => {
    setSelected(new Set(fileKey ? fileKey.split('\n') : []))
  }, [fileKey])

  const allSelected = files.length > 0 && selected.size === files.length
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

  const commit = async (): Promise<void> => {
    const list = allSelected ? 'all' : [...selected]
    const ok = await act(
      'コミット',
      () => window.api.git.commit(root, message, list),
      `コミットしました（${allSelected ? files.length : selected.size} 件）`
    )
    if (ok) setMessage('')
  }

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
        </div>
        <div className="git-meta" title={root}>
          <FolderGit2 size={13} /> {root}
        </div>
        {status.remotes?.map((r) => (
          <div key={r.name} className="git-meta">
            <Link2 size={13} /> {r.name}: <span className="mono-text">{r.url}</span>
          </div>
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

      {/* 変更とコミット */}
      <div className="git-section">
        <div className="git-section-head">
          <h3>
            <GitCommitHorizontal size={15} /> 変更（{files.length} 件）
          </h3>
          {files.length > 0 && (
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
          )}
        </div>
        {files.length === 0 ? (
          <p className="muted small-text">変更はありません。</p>
        ) : (
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
                </label>
              </li>
            ))}
          </ul>
        )}
        <textarea
          className="input"
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="コミットメッセージ（何を変えたか。例: 図の作成機能を追加）"
        />
        <div className="key-row end">
          <button
            className="btn btn-primary small"
            disabled={!!busy || selected.size === 0 || !message.trim()}
            onClick={commit}
          >
            <GitCommitHorizontal size={14} /> コミット（{selected.size} 件）
          </button>
        </div>
      </div>

      {/* プッシュ・プル */}
      <div className="git-section">
        <h3>
          <Upload size={15} /> 同期
        </h3>
        <div className="key-row">
          <button
            className="btn btn-primary small"
            disabled={!!busy || !hasRemote || !status.hasCommits}
            onClick={() => act('プッシュ', () => window.api.git.push(root))}
          >
            <Upload size={14} /> プッシュ{status.ahead ? `（${status.ahead}）` : ''}
          </button>
          <button
            className="btn small"
            disabled={!!busy || !hasRemote || !status.upstream}
            onClick={() => act('プル', () => window.api.git.pull(root))}
          >
            <Download size={14} /> プル{status.behind ? `（${status.behind}）` : ''}
          </button>
          <span className="muted small-text">
            プッシュ: 手元のコミットをリモートへ送る ／ プル: リモートの変更を取り込む
          </span>
        </div>
      </div>

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

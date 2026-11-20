import { useCallback, useEffect, useState } from 'react'
import {
  ArrowUpCircle,
  Boxes,
  CheckCircle2,
  CircleAlert,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Wrench
} from 'lucide-react'
import {
  PACKAGE_SPEC,
  type DevEnv,
  type PackageAction,
  type ProjectInfo
} from '../../../shared/devenv'
import { detectEnv, newJob, useDevLog } from '../lib/devjob'
import { errorMessage } from '../lib/format'
import { useToast } from '../lib/toast'
import { DevLogView } from './DevLogView'
import { UvInstaller } from './UvInstaller'

interface Props {
  info: ProjectInfo
  /** 操作のあと (ファイル一覧の再読み込み用) */
  onChanged: () => void
}

/** uv / Node のプロジェクトフォルダで出る「パッケージ」タブ */
export function ProjectPanel({ info: initial, onChanged }: Props): React.JSX.Element {
  const toast = useToast()
  const [info, setInfo] = useState(initial)
  const [env, setEnv] = useState<DevEnv | null>(null)
  const [input, setInput] = useState('')
  const [dev, setDev] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [job, setJob] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const logs = useDevLog(job)

  useEffect(() => setInfo(initial), [initial])

  const isUv = info.kind === 'uv'
  const tool = isUv ? 'uv' : (info.manager ?? 'npm')

  const loadEnv = useCallback(
    (force = false) => {
      if (!isUv) return
      detectEnv(force)
        .then(setEnv)
        .catch(() => setEnv(null))
    },
    [isUv]
  )
  useEffect(() => loadEnv(), [loadEnv])

  const act = async (action: PackageAction, label: string): Promise<boolean> => {
    const j = newJob()
    setJob(j)
    setBusy(label)
    setFailed(false)
    try {
      const next = await window.api.devenv.packageAction(info.dir, action, j)
      if (next) setInfo(next)
      return true
    } catch (e) {
      setFailed(true)
      toast('error', errorMessage(e))
      return false
    } finally {
      setBusy(null)
      onChanged()
    }
  }

  const specs = input.split(/[\s,]+/).filter(Boolean)
  const badSpec = specs.find((s) => !PACKAGE_SPEC.test(s))

  const add = async (): Promise<void> => {
    if (!specs.length || badSpec || busy) return
    if (await act({ op: 'add', packages: specs, dev }, '追加')) {
      toast('success', `${specs.join(', ')} を追加しました`)
      setInput('')
    }
  }

  const remove = async (name: string, isDev: boolean): Promise<void> => {
    const bare = isUv ? name.replace(/\[.*$/, '') : name
    if (!confirm(`「${bare}」をこのプロジェクトから外しますか？`)) return
    if (await act({ op: 'remove', packages: [bare], dev: isDev }, '削除'))
      toast('success', `${bare} を外しました`)
  }

  if (isUv && env && !env.uv.version)
    return (
      <div className="project-panel">
        <UvInstaller env={env} onInstalled={() => loadEnv(true)} />
      </div>
    )

  const groups = [
    { title: isUv ? 'パッケージ' : 'dependencies', list: info.packages.filter((p) => !p.dev) },
    { title: isUv ? '開発用 (--dev)' : 'devDependencies', list: info.packages.filter((p) => p.dev) }
  ]
  const syncLabel = isUv ? 'uv sync' : `${tool} install`
  const syncHint = isUv
    ? 'uv.lock のとおりに .venv を作る・そろえる'
    : 'lock ファイルのとおりに node_modules を作る・そろえる'

  return (
    <div className="project-panel">
      <div className="project-head">
        <div className="project-title">
          <Boxes size={18} />
          <b>{info.name || 'プロジェクト'}</b>
          <span className="pill tool-pill">{tool}</span>
        </div>
        <div className="project-chips">
          <span className={`status-chip ${info.envReady ? 'ok' : 'warn'}`}>
            {info.envReady ? <CheckCircle2 size={13} /> : <CircleAlert size={13} />}
            {isUv ? '.venv' : 'node_modules'}
            {info.envReady ? ' あり' : ' なし'}
          </span>
          <span className={`status-chip ${info.locked ? 'ok' : 'warn'}`}>
            {info.locked ? <CheckCircle2 size={13} /> : <CircleAlert size={13} />}
            lock {info.locked ? 'あり' : 'なし'}
          </span>
          {isUv && info.pythonPin && <span className="status-chip">Python {info.pythonPin}</span>}
          {info.runtime && (
            <span className="status-chip">
              {isUv ? 'requires-python' : 'engines.node'} {info.runtime}
            </span>
          )}
        </div>
      </div>

      <div className="pkg-add">
        <input
          className="input"
          value={input}
          disabled={!!busy}
          placeholder={
            isUv
              ? 'パッケージ名（例: requests  numpy>=2）'
              : 'パッケージ名（例: zod  react-router）'
          }
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) add()
          }}
        />
        <label className="check compact" title={isUv ? 'uv add --dev' : '-D (devDependencies)'}>
          <input type="checkbox" checked={dev} onChange={(e) => setDev(e.target.checked)} />
          開発用
        </label>
        <button
          className="btn btn-primary"
          disabled={!specs.length || !!badSpec || !!busy}
          onClick={add}
        >
          {busy === '追加' ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} 追加
        </button>
      </div>
      <p className="muted small-text pkg-hint">
        {badSpec
          ? `「${badSpec}」に使えない文字が含まれています`
          : isUv
            ? `入力すると uv add${dev ? ' --dev' : ''} を実行し、pyproject.toml・uv.lock・.venv をまとめて更新します。`
            : `入力すると ${tool} ${tool === 'npm' ? 'install' : 'add'}${dev ? ' -D' : ''} を実行し、package.json と lock ファイルを更新します。`}
      </p>

      <div className="pkg-groups">
        {groups.map((g) => (
          <div key={g.title} className="pkg-group">
            <div className="pkg-group-title">
              {g.title} <span className="tag-count">{g.list.length}</span>
            </div>
            {g.list.length === 0 ? (
              <div className="pkg-empty muted small-text">まだありません</div>
            ) : (
              g.list.map((p) => (
                <div key={`${g.title}-${p.name}`} className="pkg-row">
                  <span className="pkg-name">{p.name}</span>
                  <span className="pkg-spec" title="設定ファイルに書かれた範囲">
                    {p.spec || '指定なし'}
                  </span>
                  <span
                    className={`pkg-installed ${p.installed ? '' : 'missing'}`}
                    title={
                      isUv ? 'uv.lock で確定したバージョン' : 'node_modules に入っているバージョン'
                    }
                  >
                    {p.installed ?? '未インストール'}
                  </span>
                  <button
                    className="btn-icon small"
                    title="外す"
                    disabled={!!busy}
                    onClick={() => remove(p.name, p.dev)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        ))}
      </div>

      <div className="pkg-actions">
        <button
          className="btn"
          disabled={!!busy}
          title={syncHint}
          onClick={() =>
            act({ op: 'sync' }, '同期').then((ok) => ok && toast('success', '環境をそろえました'))
          }
        >
          {busy === '同期' ? <Loader2 size={15} className="spin" /> : <Wrench size={15} />}{' '}
          {syncLabel}
        </button>
        <button
          className="btn"
          disabled={!!busy}
          title={
            isUv
              ? 'uv lock --upgrade → uv sync（範囲内で最新にする）'
              : `${tool} update（範囲内で最新にする）`
          }
          onClick={() => {
            if (confirm('書かれた範囲の中で、すべてのパッケージを最新にします。よろしいですか？'))
              act({ op: 'upgrade' }, '更新').then((ok) => ok && toast('success', '更新しました'))
          }}
        >
          {busy === '更新' ? <Loader2 size={15} className="spin" /> : <ArrowUpCircle size={15} />}{' '}
          すべて更新
        </button>
        <div className="spacer" />
        <button
          className="btn-icon"
          title="読み直す"
          disabled={!!busy}
          onClick={async () => {
            const next = await window.api.devenv.info(info.dir).catch(() => null)
            if (next) setInfo(next)
          }}
        >
          <RefreshCw size={15} />
        </button>
      </div>
      {!info.envReady && !busy && (
        <p className="notice small-text">
          {isUv ? '.venv' : 'node_modules'} がまだありません。「{syncLabel}」で作れます。
        </p>
      )}

      {job && (
        <div className={`pkg-log ${failed ? 'failed' : ''}`}>
          <DevLogView logs={logs} />
        </div>
      )}
    </div>
  )
}

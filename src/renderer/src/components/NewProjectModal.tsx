import { useEffect, useMemo, useState } from 'react'
import {
  AppWindow,
  CheckCircle2,
  Code2,
  FolderOpen,
  FolderPlus,
  Loader2,
  RefreshCw,
  X,
  XCircle
} from 'lucide-react'
import {
  APP_TEMPLATES,
  projectNameError,
  type AppTemplate,
  type DevEnv,
  type PackageManager,
  type ProjectOptions
} from '../../../shared/devenv'
import { detectEnv, newJob, useDevLog } from '../lib/devjob'
import { basename, errorMessage, sepOf } from '../lib/format'
import { DevLogView } from './DevLogView'
import { UvInstaller } from './UvInstaller'

type Kind = 'app' | 'python'
type Phase = 'form' | 'running' | 'done' | 'error'

const MANAGERS: PackageManager[] = ['npm', 'pnpm', 'yarn', 'bun']

interface Props {
  /** この中にプロジェクトのフォルダを作る */
  parentDir: string
  onClose: () => void
  /** 作成したあと (一覧の再読み込み用) */
  onCreated: () => void
  /** 作ったフォルダを開く */
  onOpen: (dir: string) => void
}

/** Code タブの「プロジェクトを作成」 */
export function NewProjectModal({
  parentDir,
  onClose,
  onCreated,
  onOpen
}: Props): React.JSX.Element {
  const [kind, setKind] = useState<Kind>('app')
  const [env, setEnv] = useState<DevEnv | null>(null)
  const [envError, setEnvError] = useState<string | null>(null)
  const [detecting, setDetecting] = useState(true)

  const [name, setName] = useState('')
  const [template, setTemplate] = useState<AppTemplate>('vite-react-ts')
  const [manager, setManager] = useState<PackageManager>('npm')
  const [nodeVersion, setNodeVersion] = useState<string>('')
  const [install, setInstall] = useState(true)
  const [python, setPython] = useState('')
  const [layout, setLayout] = useState<'app' | 'lib'>('app')
  const [packages, setPackages] = useState('')
  const [git, setGit] = useState(true)

  const [phase, setPhase] = useState<Phase>('form')
  const [job, setJob] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const logs = useDevLog(job)

  const load = async (force = false): Promise<void> => {
    setDetecting(true)
    setEnvError(null)
    try {
      const e = await detectEnv(force)
      setEnv(e)
      // 初期値: 入っているもののうち先頭 / 既定の Node / インストール済みの一番新しい Python
      setManager((cur) =>
        e.managers[cur].version ? cur : (MANAGERS.find((m) => e.managers[m].version) ?? 'npm')
      )
      setNodeVersion((cur) => cur || (e.node[0]?.version ?? ''))
      setPython((cur) =>
        cur && e.python.some((p) => p.minor === cur)
          ? cur
          : ((e.python.find((p) => p.installed) ?? e.python[0])?.minor ?? '')
      )
      setGit((g) => g && !!e.git.version)
    } catch (err) {
      setEnvError(errorMessage(err))
    } finally {
      setDetecting(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const running = phase === 'running'
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !running) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, running])

  const nameError = name ? projectNameError(name, kind) : null
  const target = `${parentDir.replace(/[\\/]+$/, '')}${sepOf(parentDir)}${name.trim() || '（名前）'}`
  const hasNode = !!env && env.node.length > 0
  const hasUv = !!env?.uv.version
  const tpl = APP_TEMPLATES.find((t) => t.id === template)

  const canCreate = useMemo(() => {
    if (!env || running || !name.trim() || projectNameError(name, kind)) return false
    if (kind === 'app') return hasNode && !!env.managers[manager].version
    return hasUv && !!python
  }, [env, running, name, kind, hasNode, hasUv, manager, python])

  const create = async (): Promise<void> => {
    if (!env || !canCreate) return
    const o: ProjectOptions =
      kind === 'app'
        ? {
            kind,
            parentDir,
            name: name.trim(),
            template,
            manager,
            nodeVersion: nodeVersion || null,
            install,
            git
          }
        : {
            kind,
            parentDir,
            name: name.trim(),
            python,
            layout,
            packages: packages.split(/[\s,]+/).filter(Boolean),
            git
          }
    const j = newJob()
    setJob(j)
    setPhase('running')
    setError(null)
    try {
      const dir = await window.api.devenv.create(o, j)
      setCreated(dir)
      setPhase('done')
      onCreated()
    } catch (e) {
      setError(errorMessage(e))
      setPhase('error')
      onCreated()
    }
  }

  const nextCommand =
    kind === 'app'
      ? `${install ? '' : `${manager} install\n`}${manager} run ${tpl?.devScript ?? 'dev'}`
      : layout === 'app'
        ? 'uv run main.py'
        : 'uv run python'

  return (
    <div className="modal-backdrop" onMouseDown={() => !running && onClose()}>
      <div className="modal project-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>
            <FolderPlus size={18} /> プロジェクトを作成
          </h2>
          <button className="btn-icon" onClick={onClose} disabled={running} title="閉じる">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {phase === 'form' && (
            <>
              <div className="segmented">
                <button className={kind === 'app' ? 'active' : ''} onClick={() => setKind('app')}>
                  <AppWindow size={14} /> アプリ開発（Node.js）
                </button>
                <button
                  className={kind === 'python' ? 'active' : ''}
                  onClick={() => setKind('python')}
                >
                  <Code2 size={14} /> Python の開発（uv）
                </button>
              </div>

              <div className="field">
                <label>プロジェクト名（このフォルダ名で作ります）</label>
                <input
                  className="input"
                  autoFocus
                  value={name}
                  placeholder={kind === 'app' ? 'my-app' : 'my_tool'}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) create()
                  }}
                />
                {nameError ? (
                  <span className="form-error">{nameError}</span>
                ) : (
                  <span className="muted small-text path-preview" title={target}>
                    作成先: {target}
                  </span>
                )}
              </div>

              {detecting && !env && (
                <div className="state">
                  <Loader2 size={18} className="spin" /> このパソコンの開発環境を調べています…
                </div>
              )}
              {envError && <p className="form-error">{envError}</p>}

              {env && kind === 'app' && (
                <>
                  {!hasNode ? (
                    <div className="notice">
                      Node.js が見つかりません。https://nodejs.org/ から LTS
                      版をインストールしてから、 右下の「再検出」を押してください。
                    </div>
                  ) : (
                    <>
                      <div className="field">
                        <label>ビルドツール・フレームワーク</label>
                        <div className="template-grid">
                          {APP_TEMPLATES.map((t) => (
                            <button
                              key={t.id}
                              className={`template ${template === t.id ? 'active' : ''}`}
                              onClick={() => setTemplate(t.id)}
                            >
                              <b>{t.label}</b>
                              <span>{t.description}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="field-row">
                        <div className="field">
                          <label>Node.js</label>
                          <select
                            className="input"
                            value={nodeVersion}
                            onChange={(e) => setNodeVersion(e.target.value)}
                          >
                            {env.node.map((n) => (
                              <option key={`${n.source}-${n.version}`} value={n.version}>
                                v{n.version}（{n.source}）
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label>パッケージマネージャー</label>
                          <select
                            className="input"
                            value={manager}
                            onChange={(e) => setManager(e.target.value as PackageManager)}
                          >
                            {MANAGERS.map((m) => (
                              <option key={m} value={m} disabled={!env.managers[m].version}>
                                {m}
                                {env.managers[m].version
                                  ? ` ${env.managers[m].version}`
                                  : '（未インストール）'}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="check-row">
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={install}
                            onChange={(e) => setInstall(e.target.checked)}
                          />
                          依存パッケージも入れる（node_modules を作る）
                        </label>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={git}
                            disabled={!env.git.version}
                            onChange={(e) => setGit(e.target.checked)}
                          />
                          Git リポジトリにする
                        </label>
                      </div>
                    </>
                  )}
                </>
              )}

              {env && kind === 'python' && (
                <>
                  {!hasUv ? (
                    <UvInstaller env={env} onInstalled={() => load(true)} />
                  ) : (
                    <>
                      <div className="field-row">
                        <div className="field">
                          <label>Python のバージョン</label>
                          <select
                            className="input"
                            value={python}
                            onChange={(e) => setPython(e.target.value)}
                          >
                            {env.python.map((p) => (
                              <option key={p.minor} value={p.minor}>
                                {p.minor}（{p.latest}・
                                {p.installed ? 'インストール済み' : '初回に自動ダウンロード'}）
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label>種類</label>
                          <select
                            className="input"
                            value={layout}
                            onChange={(e) => setLayout(e.target.value as 'app' | 'lib')}
                          >
                            <option value="app">アプリ・スクリプト（main.py）</option>
                            <option value="lib">ライブラリ（src/ に置く）</option>
                          </select>
                        </div>
                      </div>
                      <div className="field">
                        <label>最初に入れるパッケージ（任意・空白区切り）</label>
                        <input
                          className="input"
                          value={packages}
                          placeholder="例: requests numpy>=2"
                          onChange={(e) => setPackages(e.target.value)}
                        />
                      </div>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={git}
                          disabled={!env.git.version}
                          onChange={(e) => setGit(e.target.checked)}
                        />
                        Git リポジトリにする
                      </label>
                      <p className="muted small-text">
                        uv {env.uv.version} で pyproject.toml・.python-version・.venv・uv.lock
                        を作ります。
                      </p>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {phase !== 'form' && (
            <>
              <div className={`run-status ${phase}`}>
                {phase === 'running' && <Loader2 size={18} className="spin" />}
                {phase === 'done' && <CheckCircle2 size={18} />}
                {phase === 'error' && <XCircle size={18} />}
                <span>
                  {phase === 'running' &&
                    `「${name}」を作成しています…（数分かかることがあります）`}
                  {phase === 'done' && `「${basename(created ?? name)}」を作成しました`}
                  {phase === 'error' && (error ?? '作成できませんでした')}
                </span>
              </div>
              <DevLogView logs={logs} />
              {phase === 'done' && (
                <div className="next-steps">
                  <span className="muted small-text">次はターミナルでこう実行します</span>
                  <pre>{nextCommand}</pre>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-foot">
          {phase === 'form' && (
            <>
              <button className="btn" onClick={() => load(true)} disabled={detecting}>
                <RefreshCw size={15} className={detecting ? 'spin' : ''} /> 再検出
              </button>
              <div className="spacer" />
              <button className="btn" onClick={onClose}>
                キャンセル
              </button>
              <button className="btn btn-primary" disabled={!canCreate} onClick={create}>
                <FolderPlus size={15} /> 作成
              </button>
            </>
          )}
          {phase === 'running' && (
            <>
              <div className="spacer" />
              <button className="btn" onClick={() => job && window.api.devenv.cancel(job)}>
                中止
              </button>
            </>
          )}
          {phase === 'error' && (
            <>
              <div className="spacer" />
              <button className="btn" onClick={onClose}>
                閉じる
              </button>
              <button className="btn btn-primary" onClick={() => setPhase('form')}>
                設定に戻る
              </button>
            </>
          )}
          {phase === 'done' && created && (
            <>
              <button className="btn" onClick={() => window.api.openInVSCode(created, created)}>
                <Code2 size={15} /> VS Code で開く
              </button>
              <div className="spacer" />
              <button className="btn" onClick={onClose}>
                閉じる
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  onOpen(created)
                  onClose()
                }}
              >
                <FolderOpen size={15} /> 作ったフォルダを開く
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

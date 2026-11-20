import { useState } from 'react'
import { Download, Loader2, ShieldCheck } from 'lucide-react'
import type { DevEnv, UvInstallMethod } from '../../../shared/devenv'
import { newJob, useDevLog } from '../lib/devjob'
import { errorMessage } from '../lib/format'
import { isWin } from '../lib/platform'
import { DevLogView } from './DevLogView'

const METHOD_LABEL: Record<UvInstallMethod, string> = {
  winget: 'winget（Windows のパッケージマネージャー）',
  brew: 'Homebrew',
  official: 'Astral 公式のインストーラー'
}

function methodCommand(m: UvInstallMethod): string {
  if (m === 'winget') return 'winget install --id=astral-sh.uv -e'
  if (m === 'brew') return 'brew install uv'
  return isWin
    ? 'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'
    : 'curl -LsSf https://astral.sh/uv/install.sh | sh'
}

function methodNote(m: UvInstallMethod): string {
  if (m === 'winget')
    return 'Microsoft の winget で、登録済みのパッケージを入れます。更新も winget でできます。'
  if (m === 'brew') return 'Homebrew で入れます。更新は brew upgrade uv でできます。'
  return `uv の開発元 (astral.sh) が配布しているスクリプトを HTTPS で取得して実行します。管理者権限は使わず、${
    isWin ? '%USERPROFILE%\\.local\\bin' : '~/.local/bin'
  } にだけ入ります。`
}

/** uv が入っていないときに表示する、インストールの案内 */
export function UvInstaller({
  env,
  onInstalled
}: {
  env: DevEnv
  onInstalled: () => void
}): React.JSX.Element {
  const [method, setMethod] = useState<UvInstallMethod>(env.uvInstallMethods[0] ?? 'official')
  const [job, setJob] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const logs = useDevLog(job)

  const install = async (): Promise<void> => {
    if (
      !confirm(
        `次のコマンドで uv をインストールします。よろしいですか？\n\n${methodCommand(method)}\n\n${methodNote(method)}`
      )
    )
      return
    const j = newJob()
    setJob(j)
    setBusy(true)
    setError(null)
    try {
      await window.api.devenv.installUv(method, j)
      onInstalled()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="uv-install">
      <div className="uv-install-head">
        <ShieldCheck size={18} />
        <div>
          <b>uv がインストールされていません</b>
          <p className="muted small-text">
            uv は Python 本体・仮想環境・パッケージ・lock ファイルをまとめて扱うツールです。
            インストール方法を選んでください（上ほどおすすめです）。
          </p>
        </div>
      </div>
      <div className="uv-methods">
        {env.uvInstallMethods.map((m) => (
          <label key={m} className={`uv-method ${method === m ? 'active' : ''}`}>
            <input
              type="radio"
              name="uv-method"
              checked={method === m}
              disabled={busy}
              onChange={() => setMethod(m)}
            />
            <div>
              <b>{METHOD_LABEL[m]}</b>
              <code>{methodCommand(m)}</code>
              <span className="muted small-text">{methodNote(m)}</span>
            </div>
          </label>
        ))}
      </div>
      <div className="row-actions">
        <button className="btn btn-primary" disabled={busy} onClick={install}>
          {busy ? <Loader2 size={15} className="spin" /> : <Download size={15} />} uv をインストール
        </button>
        {busy && job && (
          <button className="btn" onClick={() => window.api.devenv.cancel(job)}>
            中止
          </button>
        )}
      </div>
      {error && <p className="form-error">{error}</p>}
      {job && <DevLogView logs={logs} />}
    </div>
  )
}

import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

/** VS Code の実行ファイルを探す (見つからなければ PATH 上の `code` コマンドを使う) */
function findCodeExe(): string | null {
  if (process.platform === 'win32') {
    const candidates = [
      join(process.env['LOCALAPPDATA'] ?? '', 'Programs', 'Microsoft VS Code', 'Code.exe'),
      join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'Microsoft VS Code', 'Code.exe'),
      join(
        process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
        'Microsoft VS Code',
        'Code.exe'
      )
    ]
    return candidates.find((c) => existsSync(c)) ?? null
  }
  if (process.platform === 'darwin') {
    const mac = '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'
    return existsSync(mac) ? mac : null
  }
  return null
}

/**
 * VS Code でファイル (またはフォルダ) を開く。
 * folder を渡すとそのフォルダをワークスペースとして開いた上でファイルを表示する。
 */
export function openInVSCode(target: string, folder?: string): Promise<void> {
  const args = folder ? [folder, '--goto', target] : [target]
  const exe = findCodeExe()
  const env = { ...process.env }
  delete env['ELECTRON_RUN_AS_NODE']

  return new Promise((resolve, reject) => {
    const child = exe
      ? spawn(exe, args, { detached: true, stdio: 'ignore', env })
      : spawn(
          'code',
          args.map((a) => `"${a}"`),
          { shell: true, detached: true, stdio: 'ignore', env }
        )

    let settled = false
    const done = (err?: Error): void => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve()
    }
    child.on('error', () =>
      done(
        new Error(
          'VS Code が見つかりません。VS Code をインストールし、「PATH への追加」を有効にしてください。'
        )
      )
    )
    child.on('exit', (code) => {
      if (code && code !== 0)
        done(new Error('VS Code を起動できませんでした (`code` コマンドが PATH にありません)'))
      else done()
    })
    // ランチャーが常駐する場合もあるので一定時間で成功扱い
    setTimeout(() => done(), 4000)
    child.unref()
  })
}

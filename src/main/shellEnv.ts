/**
 * コマンドを探すための PATH を整える。
 *
 * - macOS / Linux: Finder やランチャーから起動したアプリは、ターミナルで使える PATH
 *   (Homebrew の /opt/homebrew/bin や ~/.local/bin など) を受け取らない。
 *   ログインシェルを一度起動して、そこでの PATH を取り込む。
 * - Windows: 起動後にインストールしたツール (uv など) の PATH は、再起動するまで
 *   このプロセスに反映されない。レジストリの最新の値を読み直す。
 */
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { delimiter, join } from 'path'

function mergePath(...lists: (string | undefined)[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of lists) {
    for (const d of (list ?? '').split(delimiter)) {
      const key = process.platform === 'win32' ? d.toLowerCase() : d
      if (d && !seen.has(key)) {
        seen.add(key)
        out.push(d)
      }
    }
  }
  return out.join(delimiter)
}

/** ツールがよく入る場所 (存在するものだけ足す) */
function knownDirs(): string[] {
  const home = homedir()
  const dirs =
    process.platform === 'win32'
      ? [
          join(home, '.local', 'bin'),
          join(home, '.cargo', 'bin'),
          join(process.env['LOCALAPPDATA'] ?? '', 'Microsoft', 'WinGet', 'Links'),
          join(process.env['APPDATA'] ?? '', 'npm')
        ]
      : [
          join(home, '.local', 'bin'),
          join(home, '.cargo', 'bin'),
          join(home, '.bun', 'bin'),
          join(home, '.volta', 'bin'),
          '/opt/homebrew/bin',
          '/opt/homebrew/sbin',
          '/usr/local/bin'
        ]
  return dirs.filter((d) => d && existsSync(d))
}

function loginShellPath(): Promise<string | null> {
  const sh = process.env['SHELL'] || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
  return new Promise((resolve) => {
    execFile(
      sh,
      ['-ilc', 'printf "__FH_PATH__%s__FH_PATH__" "$PATH"'],
      { timeout: 6000, env: { ...process.env, DISABLE_AUTO_UPDATE: 'true' } },
      (_err, stdout) => {
        const m = /__FH_PATH__(.*?)__FH_PATH__/s.exec(String(stdout ?? ''))
        resolve(m ? m[1] : null)
      }
    )
  })
}

function windowsRegistryPath(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"
      ],
      { timeout: 8000, windowsHide: true },
      (err, stdout) => resolve(err ? null : String(stdout).trim() || null)
    )
  })
}

let fixed: Promise<void> | null = null

/** 起動時に一度だけ呼ぶ (以後は同じ Promise を返す) */
export function fixPath(): Promise<void> {
  if (!fixed)
    fixed =
      process.platform === 'win32'
        ? // Windows は起動時の PATH が最新なので、よく使う場所を足すだけ
          Promise.resolve().then(() => {
            process.env['PATH'] = mergePath(process.env['PATH'], knownDirs().join(delimiter))
          })
        : refreshPath()
  return fixed
}

/** PATH を読み直す (ツールをインストールした直後などに呼ぶ) */
export async function refreshPath(): Promise<void> {
  const extra = process.platform === 'win32' ? await windowsRegistryPath() : await loginShellPath()
  process.env['PATH'] = mergePath(
    extra ?? undefined,
    process.env['PATH'],
    knownDirs().join(delimiter)
  )
  // Windows では Path と PATH が別のキーとして見えることがあるので揃える
  if (process.platform === 'win32') process.env['Path'] = process.env['PATH']
}

/** PATH からコマンドを探す (Windows では .exe / .cmd も試す) */
export function which(name: string, path = process.env['PATH'] ?? ''): string | null {
  const exts =
    process.platform === 'win32'
      ? ['', ...(process.env['PATHEXT'] ?? '.EXE;.CMD;.BAT').split(';').map((e) => e.toLowerCase())]
      : ['']
  for (const dir of path.split(delimiter)) {
    if (!dir) continue
    for (const ext of exts) {
      const p = join(dir, name + ext)
      // Windows では拡張子なしのファイル (npm の sh 用スクリプトなど) は実行できないので飛ばす
      if (process.platform === 'win32' && !ext && !/\.[a-z0-9]+$/i.test(name)) continue
      if (existsSync(p)) return p
    }
  }
  return null
}

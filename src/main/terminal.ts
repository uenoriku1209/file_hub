import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { WebContents } from 'electron'
import type { IPty } from 'node-pty'
import type { ShellInfo } from '../shared/types'

type PtyModule = typeof import('node-pty')
let ptyModule: PtyModule | null = null
let ptyLoadError = ''

async function loadPty(): Promise<PtyModule | null> {
  if (ptyModule || ptyLoadError) return ptyModule
  try {
    const mod = await import('node-pty')
    // CommonJS モジュールを import() すると default に本体が入る場合がある
    ptyModule = ((mod as unknown as { default?: PtyModule }).default ?? mod) as PtyModule
  } catch (e) {
    ptyLoadError = e instanceof Error ? e.message : String(e)
  }
  return ptyModule
}

export function availableShells(): ShellInfo[] {
  if (process.platform === 'win32') {
    const list: ShellInfo[] = [
      { id: 'powershell', label: 'PowerShell', file: 'powershell.exe', args: ['-NoLogo'] },
      { id: 'cmd', label: 'コマンドプロンプト', file: 'cmd.exe', args: [] }
    ]
    const pf = process.env['ProgramFiles'] ?? 'C:\\Program Files'
    const pwsh = join(pf, 'PowerShell', '7', 'pwsh.exe')
    if (existsSync(pwsh))
      list.unshift({ id: 'pwsh', label: 'PowerShell 7', file: pwsh, args: ['-NoLogo'] })
    const gitBash = join(pf, 'Git', 'bin', 'bash.exe')
    if (existsSync(gitBash))
      list.push({ id: 'gitbash', label: 'Git Bash', file: gitBash, args: ['--login', '-i'] })
    return list
  }
  const sh = process.env['SHELL'] || '/bin/bash'
  return [{ id: 'default', label: sh.split('/').pop() ?? 'shell', file: sh, args: ['-l'] }]
}

const sessions = new Map<number, IPty>()
let nextId = 1

export async function createSession(
  wc: WebContents,
  opts: { shellId?: string; cwd?: string; cols: number; rows: number }
): Promise<{ id: number; label: string }> {
  const pty = await loadPty()
  if (!pty) throw new Error(`ターミナルを起動できません (node-pty): ${ptyLoadError}`)
  const shells = availableShells()
  const shell = shells.find((s) => s.id === opts.shellId) ?? shells[0]
  const cwd = opts.cwd && existsSync(opts.cwd) ? opts.cwd : homedir()

  const proc = pty.spawn(shell.file, shell.args, {
    name: 'xterm-256color',
    cols: Math.max(2, opts.cols),
    rows: Math.max(2, opts.rows),
    cwd,
    env: process.env as Record<string, string>
  })
  const id = nextId++
  sessions.set(id, proc)
  proc.onData((data) => {
    if (!wc.isDestroyed()) wc.send('pty:data', id, data)
  })
  proc.onExit(({ exitCode }) => {
    sessions.delete(id)
    if (!wc.isDestroyed()) wc.send('pty:exit', id, exitCode)
  })
  return { id, label: shell.label }
}

export function writeSession(id: number, data: string): void {
  sessions.get(id)?.write(data)
}

export function resizeSession(id: number, cols: number, rows: number): void {
  try {
    sessions.get(id)?.resize(Math.max(2, cols), Math.max(2, rows))
  } catch {
    /* 終了直後の resize は無視 */
  }
}

export function killSession(id: number): void {
  const s = sessions.get(id)
  if (s) {
    sessions.delete(id)
    try {
      s.kill()
    } catch {
      /* noop */
    }
  }
}

export function killAll(): void {
  for (const id of [...sessions.keys()]) killSession(id)
}

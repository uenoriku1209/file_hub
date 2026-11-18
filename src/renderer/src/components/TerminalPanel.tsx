import { useEffect, useRef, useState } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { RotateCcw, CornerDownRight, Link2, Link2Off, FolderOpen } from 'lucide-react'
import type { ShellInfo } from '../../../shared/types'
import { errorMessage } from '../lib/format'
import { stripAnsi } from '../lib/ansi'

const THEMES: Record<'light' | 'dark', ITheme> = {
  light: {
    background: '#ffffff',
    foreground: '#2f3d4a',
    cursor: '#14a3a0',
    cursorAccent: '#ffffff',
    selectionBackground: '#bfe9e4',
    black: '#2f3d4a',
    red: '#d14b55',
    green: '#1f9a5c',
    yellow: '#b07d0a',
    blue: '#2f6fd0',
    magenta: '#9a4fc7',
    cyan: '#138f8b',
    white: '#8796a5',
    brightBlack: '#6b7a89',
    brightRed: '#e5636b',
    brightGreen: '#25a865',
    brightYellow: '#c99412',
    brightBlue: '#3d7fe0',
    brightMagenta: '#a965d6',
    brightCyan: '#18a39d',
    brightWhite: '#c5ced8'
  },
  dark: {
    background: '#1e242c',
    foreground: '#d7e0e8',
    cursor: '#2cc4b8',
    cursorAccent: '#1e242c',
    selectionBackground: '#2b4e4c',
    black: '#1e242c',
    red: '#f0727a',
    green: '#48d597',
    yellow: '#e8c35a',
    blue: '#62a0f0',
    magenta: '#c08bea',
    cyan: '#2cc4b8',
    white: '#d7e0e8',
    brightBlack: '#5c6a78',
    brightRed: '#ff8a91',
    brightGreen: '#6ee4ae',
    brightYellow: '#f5d77e',
    brightBlue: '#86b8ff',
    brightMagenta: '#d3a7f5',
    brightCyan: '#5fe0d4',
    brightWhite: '#ffffff'
  }
}

/** <html data-theme> を監視して現在のテーマを返す */
function useTheme(): 'light' | 'dark' {
  const read = (): 'light' | 'dark' =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  const [theme, setTheme] = useState(read)
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(read()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  }, [])
  return theme
}

/** シェルごとの「フォルダ移動」コマンド (入力途中の文字は先に消す) */
function cdCommand(shellId: string, dir: string): string {
  if (shellId === 'cmd') return `\x1bcd /d "${dir}"\r`
  if (shellId === 'powershell' || shellId === 'pwsh') {
    return `\x1bSet-Location -LiteralPath '${dir.replace(/'/g, "''")}'\r`
  }
  // bash / Git Bash など
  return `\x15cd '${dir.replace(/'/g, `'\\''`)}'\r`
}

/** シェルに合わせて引数をクォートする */
function quoteArg(shellId: string, s: string): string {
  if (/^[\w./:@=+-]+$/.test(s)) return s
  if (shellId === 'cmd') return `"${s.replace(/"/g, '')}"`
  if (shellId === 'powershell' || shellId === 'pwsh') return `'${s.replace(/'/g, "''")}'`
  return `'${s.replace(/'/g, `'\\''`)}'`
}

/** 終了の目印を出力するコマンドを付けた 1 行を作る (入力の表示と出力を区別するため、目印は分割して書く) */
function withDoneMarker(shellId: string, command: string, n: number): string {
  if (shellId === 'cmd') return `${command} && echo __FH_^DONE_${n}_0__ || echo __FH_^DONE_${n}_1__`
  if (shellId === 'powershell' || shellId === 'pwsh')
    return `${command}; Write-Output ('__FH_'+'DONE_${n}_' + [int]$LASTEXITCODE + '__')`
  return `${command}; echo "__FH_""DONE_${n}_$?__"`
}

/** Git 画面などから、このターミナルでコマンドを実行するための窓口 */
export interface TerminalHandle {
  /** dir に移動して git コマンドを実行する。done は終了コード (中止したら 130) */
  runGit(dir: string, args: string[]): { done: Promise<number>; cancel: () => void }
  /** 実行中のコマンドへの入力 (合言葉など) */
  write(text: string): void
  /** 出力を受け取る (戻り値で解除) */
  onOutput(cb: (data: string) => void): () => void
}

interface Props {
  /** Git 画面などから操作するための窓口を受け取る */
  handleRef?: React.MutableRefObject<TerminalHandle | null>
  /** いま閲覧しているフォルダ */
  cwd: string
  /** ターミナルタブが表示されているか */
  visible: boolean
  /** コマンド画面から送られた文字列 (Enter は押さずに入力する) */
  inject?: { text: string; nonce: number } | null
}

export function TerminalPanel({ cwd, visible, inject, handleRef }: Props): React.JSX.Element {
  const theme = useTheme()
  const [shells, setShells] = useState<ShellInfo[]>([])
  const [shellId, setShellId] = useState('')
  const [follow, setFollow] = useState(true)
  const [generation, setGeneration] = useState(0) // 再起動用
  const [ready, setReady] = useState(false)
  /** シェルが最初のプロンプトを表示し終えたか (コマンド画面からの入力はこの後に送る) */
  const [prompted, setPrompted] = useState(false)
  const [exited, setExited] = useState(false)
  const [termDir, setTermDir] = useState('')

  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const idRef = useRef<number | null>(null)
  const cwdRef = useRef(cwd)
  const listeners = useRef(new Set<(data: string) => void>())
  /** Git 画面からのコマンド実行中 (この間はフォルダ追従の cd を送らない) */
  const busyRef = useRef(false)
  const runSeq = useRef(0)
  const afterRun = useRef<() => void>(() => {})
  // 再起動時に「いま閲覧中のフォルダ」で開けるよう最新値を保持 (起動処理より先に実行される)
  useEffect(() => {
    cwdRef.current = cwd
  }, [cwd])

  useEffect(() => {
    window.api.terminal.shells().then((s) => {
      setShells(s)
      setShellId((cur) => cur || s[0]?.id || '')
    })
  }, [])

  // xterm と シェルの起動 (シェル変更・再起動のたびに作り直す)
  useEffect(() => {
    if (!shellId) return
    const term = new Terminal({
      fontFamily: '"Cascadia Mono", Consolas, "BIZ UDGothic", "MS Gothic", monospace',
      fontSize: 13,
      lineHeight: 1.15,
      cursorBlink: true,
      scrollback: 5000,
      theme: THEMES[document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light']
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(hostRef.current!)
    termRef.current = term
    fitRef.current = fit
    try {
      fit.fit()
    } catch {
      /* 非表示中はサイズ0 */
    }

    let disposed = false
    setReady(false)
    setPrompted(false)
    setExited(false)
    const startDir = cwdRef.current
    let promptTimer: ReturnType<typeof setTimeout> | undefined
    // 最初の出力が落ち着いたら (または 3 秒たったら) プロンプト表示済みとみなす
    const markPrompted = (delay: number): void => {
      clearTimeout(promptTimer)
      promptTimer = setTimeout(() => !disposed && setPrompted(true), delay)
    }

    const offData = window.api.terminal.onData((id, data) => {
      if (id === idRef.current) {
        term.write(data)
        markPrompted(350)
        listeners.current.forEach((cb) => cb(data))
      }
    })
    const offExit = window.api.terminal.onExit((id) => {
      if (id === idRef.current) {
        term.write('\r\n\x1b[2m[プロセスが終了しました。右上の ↺ で再起動できます]\x1b[0m\r\n')
        idRef.current = null
        setExited(true)
      }
    })

    window.api.terminal
      .create({ shellId, cwd: startDir, cols: term.cols, rows: term.rows })
      .then(({ id }) => {
        if (disposed) return window.api.terminal.kill(id)
        idRef.current = id
        setTermDir(startDir)
        setReady(true)
        markPrompted(3000)
      })
      .catch((e) => term.write(`\x1b[31m${errorMessage(e)}\x1b[0m\r\n`))

    const input = term.onData((d) => {
      if (idRef.current !== null) window.api.terminal.write(idRef.current, d)
    })
    const resize = term.onResize(({ cols, rows }) => {
      if (idRef.current !== null) window.api.terminal.resize(idRef.current, cols, rows)
    })

    // Ctrl+C: 選択中ならコピー / Ctrl+V: 貼り付け
    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown' || !ev.ctrlKey) return true
      if (ev.key === 'c' && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection())
        term.clearSelection()
        return false
      }
      if (ev.key === 'v') {
        navigator.clipboard
          .readText()
          .then((t) => idRef.current !== null && window.api.terminal.write(idRef.current, t))
        ev.preventDefault()
        return false
      }
      return true
    })

    const ro = new ResizeObserver(() => {
      const el = hostRef.current
      if (el && el.clientWidth > 0 && el.clientHeight > 0) {
        try {
          fit.fit()
        } catch {
          /* noop */
        }
      }
    })
    ro.observe(hostRef.current!)

    return () => {
      disposed = true
      clearTimeout(promptTimer)
      ro.disconnect()
      input.dispose()
      resize.dispose()
      offData()
      offExit()
      if (idRef.current !== null) window.api.terminal.kill(idRef.current)
      idRef.current = null
      term.dispose()
      termRef.current = null
    }
  }, [shellId, generation])

  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = THEMES[theme]
  }, [theme])

  const moveTo = (dir: string): void => {
    if (idRef.current === null || !dir) return
    window.api.terminal.write(idRef.current, cdCommand(shellId, dir))
    setTermDir(dir)
  }

  // 「フォルダに追従」: ターミナル表示中に閲覧フォルダが変わったら移動する
  useEffect(() => {
    if (visible && follow && ready && !busyRef.current && cwd && cwd !== termDir) moveTo(cwd)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, follow, ready, cwd])

  useEffect(() => {
    if (!visible) return
    requestAnimationFrame(() => {
      try {
        fitRef.current?.fit()
      } catch {
        /* noop */
      }
      termRef.current?.focus()
    })
  }, [visible])

  // 実行が終わったら、表示中なら閲覧フォルダに戻す
  afterRun.current = () => {
    if (visible && follow && cwd) moveTo(cwd)
  }

  // Git 画面などに窓口を渡す
  useEffect(() => {
    if (!handleRef) return
    if (!prompted || exited) {
      handleRef.current = null
      return
    }
    const write = (text: string): void => {
      if (idRef.current !== null) window.api.terminal.write(idRef.current, text)
    }
    const onOutput = (cb: (data: string) => void): (() => void) => {
      listeners.current.add(cb)
      return () => listeners.current.delete(cb)
    }
    handleRef.current = {
      write,
      onOutput,
      runGit(dir, args) {
        const n = ++runSeq.current
        const marker = new RegExp(`__FH_DONE_${n}_(\\d+)__`)
        let buf = ''
        let finished = false
        let resolve: (code: number) => void = () => {}
        const done = new Promise<number>((r) => (resolve = r))
        const finish = (code: number): void => {
          if (finished) return
          finished = true
          off()
          busyRef.current = false
          resolve(code)
          setTimeout(() => afterRun.current(), 300)
        }
        const off = onOutput((data) => {
          buf = (buf + stripAnsi(data)).slice(-4000)
          const m = buf.match(marker)
          if (m) finish(Number(m[1]))
        })
        busyRef.current = true
        write(cdCommand(shellId, dir))
        setTermDir(dir)
        const command = ['git', ...args].map((a) => quoteArg(shellId, a)).join(' ')
        write(withDoneMarker(shellId, command, n) + '\r')
        return {
          done,
          cancel: () => {
            write('\x03')
            finish(130)
          }
        }
      }
    }
    return () => {
      handleRef.current = null
    }
  }, [handleRef, prompted, exited, shellId])

  // コマンド画面からの入力 (複数行はシェルに合わせた区切りで1行にまとめ、実行はしない)
  const injected = useRef(0)
  useEffect(() => {
    if (!inject || !prompted || idRef.current === null || inject.nonce === injected.current) return
    injected.current = inject.nonce
    const sep = shellId === 'cmd' ? ' & ' : '; '
    const line = inject.text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .join(sep)
    window.api.terminal.write(idRef.current, line)
    termRef.current?.focus()
  }, [inject, prompted, shellId])

  return (
    <div className="term-panel">
      <div className="term-toolbar">
        <span className="term-cwd" title={termDir}>
          <FolderOpen size={14} />
          <span>
            <bdi>{termDir || cwd}</bdi>
          </span>
        </span>
        <button
          className={`chip-toggle ${follow ? 'on' : ''}`}
          onClick={() => setFollow((f) => !f)}
          title="閲覧中のフォルダに合わせて自動で移動します（実行中のコマンドがある場合はオフ推奨）"
        >
          {follow ? <Link2 size={14} /> : <Link2Off size={14} />} 追従
        </button>
        {!follow && (
          <button
            className="btn-icon small"
            title="閲覧中のフォルダへ移動"
            onClick={() => moveTo(cwd)}
            disabled={!ready || exited}
          >
            <CornerDownRight size={14} />
          </button>
        )}
        <select
          className="select"
          value={shellId}
          onChange={(e) => setShellId(e.target.value)}
          title="シェルを切り替え（再起動されます）"
        >
          {shells.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          className="btn-icon small"
          title="再起動"
          onClick={() => setGeneration((g) => g + 1)}
        >
          <RotateCcw size={14} />
        </button>
      </div>
      <div className="term-area">
        <div className="term-host" ref={hostRef} />
      </div>
    </div>
  )
}

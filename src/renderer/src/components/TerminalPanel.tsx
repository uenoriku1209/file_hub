import { useEffect, useRef, useState } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { RotateCcw, CornerDownRight, Link2, Link2Off, FolderOpen } from 'lucide-react'
import type { ShellInfo } from '../../../shared/types'
import { errorMessage } from '../lib/format'

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

interface Props {
  /** いま閲覧しているフォルダ */
  cwd: string
  /** ターミナルタブが表示されているか */
  visible: boolean
}

export function TerminalPanel({ cwd, visible }: Props): React.JSX.Element {
  const theme = useTheme()
  const [shells, setShells] = useState<ShellInfo[]>([])
  const [shellId, setShellId] = useState('')
  const [follow, setFollow] = useState(true)
  const [generation, setGeneration] = useState(0) // 再起動用
  const [ready, setReady] = useState(false)
  const [exited, setExited] = useState(false)
  const [termDir, setTermDir] = useState('')

  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const idRef = useRef<number | null>(null)
  const cwdRef = useRef(cwd)
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
    setExited(false)
    const startDir = cwdRef.current

    const offData = window.api.terminal.onData((id, data) => {
      if (id === idRef.current) term.write(data)
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
    if (visible && follow && ready && cwd && cwd !== termDir) moveTo(cwd)
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

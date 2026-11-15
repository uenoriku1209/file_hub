import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { Plus, X, SquareTerminal, FolderOpen } from 'lucide-react'
import type { ShellInfo } from '../../../shared/types'
import { basename, errorMessage } from '../lib/format'
import { useToast } from '../lib/toast'

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

interface Session {
  key: number
  shellId: string
  cwd: string
  label: string
  exited: boolean
}

interface ViewProps {
  session: Session
  active: boolean
  theme: 'light' | 'dark'
  onStarted: (key: number, label: string) => void
  onExit: (key: number) => void
  onError: (msg: string) => void
}

function TerminalView({
  session,
  active,
  theme,
  onStarted,
  onExit,
  onError
}: ViewProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const idRef = useRef<number | null>(null)

  // xterm の生成と pty の起動 (1回だけ)
  useEffect(() => {
    const term = new Terminal({
      fontFamily: '"Cascadia Mono", Consolas, "BIZ UDGothic", "MS Gothic", monospace',
      fontSize: 13.5,
      lineHeight: 1.15,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
      theme: THEMES[theme]
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
    const offData = window.api.terminal.onData((id, data) => {
      if (id === idRef.current) term.write(data)
    })
    const offExit = window.api.terminal.onExit((id) => {
      if (id === idRef.current) {
        term.write('\r\n\x1b[2m[プロセスが終了しました]\x1b[0m\r\n')
        onExit(session.key)
      }
    })

    window.api.terminal
      .create({ shellId: session.shellId, cwd: session.cwd, cols: term.cols, rows: term.rows })
      .then(({ id, label }) => {
        if (disposed) {
          window.api.terminal.kill(id)
          return
        }
        idRef.current = id
        onStarted(session.key, label)
      })
      .catch((e) => {
        term.write(`\x1b[31m${errorMessage(e)}\x1b[0m\r\n`)
        onError(errorMessage(e))
      })

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
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = THEMES[theme]
  }, [theme])

  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => {
        try {
          fitRef.current?.fit()
        } catch {
          /* noop */
        }
        termRef.current?.focus()
      })
    }
  }, [active])

  return <div className={`term-host ${active ? '' : 'hidden'}`} ref={hostRef} />
}

interface Props {
  visible: boolean
  theme: 'light' | 'dark'
  defaultCwd: string | null
  /** 他ページからの「このフォルダで開く」要求 */
  request: { cwd: string; nonce: number } | null
}

export function TerminalPage({ visible, theme, defaultCwd, request }: Props): React.JSX.Element {
  const toast = useToast()
  const [shells, setShells] = useState<ShellInfo[]>([])
  const [shellId, setShellId] = useState('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [active, setActive] = useState<number | null>(null)
  const keyRef = useRef(1)
  const handledNonce = useRef(0)

  useEffect(() => {
    window.api.terminal.shells().then((s) => {
      setShells(s)
      setShellId((cur) => cur || s[0]?.id || '')
    })
  }, [])

  const open = useCallback(
    (cwd: string, sid?: string) => {
      const key = keyRef.current++
      const s = { key, shellId: sid ?? shellId, cwd, label: '起動中…', exited: false }
      setSessions((list) => [...list, s])
      setActive(key)
    },
    [shellId]
  )

  // 初めて表示されたとき、タブがなければ1つ開く
  useEffect(() => {
    if (visible && sessions.length === 0 && shells.length > 0 && !request) open(defaultCwd ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, shells.length])

  useEffect(() => {
    if (request && request.nonce !== handledNonce.current && shells.length > 0) {
      handledNonce.current = request.nonce
      open(request.cwd)
    }
  }, [request, shells.length, open])

  const close = (key: number): void => {
    const next = sessions.filter((s) => s.key !== key)
    setSessions(next)
    if (active === key) setActive(next.length ? next[next.length - 1].key : null)
  }

  const current = sessions.find((s) => s.key === active)

  return (
    <div className={`page ${visible ? '' : 'hidden'}`}>
      <header className="page-header">
        <div>
          <h1>Terminal</h1>
          <p className="subtitle">アプリ内でコマンドを実行</p>
        </div>
        <div className="header-actions">
          {current && (
            <span className="path-pill static" title={current.cwd}>
              <FolderOpen size={16} />
              <span>
                <bdi>{current.cwd || 'ホームフォルダ'}</bdi>
              </span>
            </span>
          )}
          <select className="select" value={shellId} onChange={(e) => setShellId(e.target.value)}>
            {shells.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            onClick={() => open(defaultCwd ?? '')}
            disabled={!shells.length}
          >
            <Plus size={17} /> 新しいターミナル
          </button>
        </div>
      </header>

      <div className="card term-card">
        <div className="term-tabs">
          {sessions.map((s) => (
            <div
              key={s.key}
              className={`term-tab ${s.key === active ? 'active' : ''} ${s.exited ? 'exited' : ''}`}
              onClick={() => setActive(s.key)}
              title={s.cwd}
            >
              <SquareTerminal size={14} />
              <span>
                {s.label}
                {s.cwd ? ` · ${basename(s.cwd)}` : ''}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  close(s.key)
                }}
              >
                <X size={13} />
              </button>
            </div>
          ))}
          {sessions.length === 0 && <span className="muted">「新しいターミナル」で開始します</span>}
        </div>
        <div className="term-area">
          {sessions.map((s) => (
            <TerminalView
              key={s.key}
              session={s}
              active={visible && s.key === active}
              theme={theme}
              onStarted={(key, label) =>
                setSessions((l) => l.map((x) => (x.key === key ? { ...x, label } : x)))
              }
              onExit={(key) =>
                setSessions((l) => l.map((x) => (x.key === key ? { ...x, exited: true } : x)))
              }
              onError={(msg) => toast('error', msg)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

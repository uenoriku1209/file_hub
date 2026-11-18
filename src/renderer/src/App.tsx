import { useCallback, useEffect, useState } from 'react'
import type { FsEntry } from '../../shared/types'
import { Sidebar, type PageId } from './components/Sidebar'
import {
  parseLayout,
  restorePane,
  type BrowserPage,
  type PaneId,
  type PaneLayout
} from './lib/layout'
import { OfficePage } from './pages/OfficePage'
import { CodePage } from './pages/CodePage'
import { CommandsPage } from './pages/CommandsPage'
import { ToastProvider, useToast } from './lib/toast'
import { errorMessage } from './lib/format'

type Theme = 'light' | 'dark'

/** localStorage の読み書き (失敗しても動くように) */
const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* noop */
    }
  }
}

export interface BrowserState {
  currentDir: string
  setCurrentDir: (d: string) => void
  selected: FsEntry | null
  setSelected: (e: FsEntry | null) => void
  refreshKey: number
  refresh: () => void
}

/** ページごとに独立したフォルダ位置・選択状態 */
function useBrowserState(rootDir: string | null): BrowserState {
  const [currentDir, setCurrentDir] = useState(rootDir ?? '')
  const [selected, setSelected] = useState<FsEntry | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    setCurrentDir(rootDir ?? '')
    setSelected(null)
  }, [rootDir])
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])
  return { currentDir, setCurrentDir, selected, setSelected, refreshKey, refresh }
}

function Shell(): React.JSX.Element {
  const toast = useToast()
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = store.get('theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [page, setPage] = useState<PageId>(() => {
    const saved = store.get('page')
    return saved === 'code' || saved === 'commands' ? saved : 'office'
  })
  // コマンドをターミナルへ送るときは、最後に使っていた Office / Code 画面のターミナルを使う
  const [lastBrowser, setLastBrowser] = useState<'office' | 'code'>(() =>
    store.get('page') === 'code' ? 'code' : 'office'
  )
  const [inject, setInject] = useState<{
    page: 'office' | 'code'
    text: string
    nonce: number
  } | null>(null)
  const [rootDir, setRootDir] = useState<string | null>(() => store.get('rootDir'))

  // 3 つの欄の表示・幅 (Office / Code ごとに保存)
  const [layouts, setLayouts] = useState<Record<BrowserPage, PaneLayout>>(() => ({
    office: parseLayout(store.get('layout.office')),
    code: parseLayout(store.get('layout.code'))
  }))
  const setLayout = (page: BrowserPage, l: PaneLayout): void => {
    setLayouts((cur) => ({ ...cur, [page]: l }))
    store.set(`layout.${page}`, JSON.stringify(l))
  }
  const restore = (page: BrowserPage, pane: PaneId): void => {
    setLayout(page, restorePane(layouts[page], pane))
    setPage(page)
  }

  const office = useBrowserState(rootDir)
  const code = useBrowserState(rootDir)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    store.set('theme', theme)
    window.api.setTheme(theme)
  }, [theme])

  useEffect(() => {
    store.set('page', page)
    if (page === 'office' || page === 'code') setLastBrowser(page)
  }, [page])

  const sendToTerminal = (text: string): void => {
    if (!rootDir) {
      toast('error', '先に Office / Code 画面でフォルダを選択してください')
      return
    }
    setInject({ page: lastBrowser, text, nonce: Date.now() })
    setPage(lastBrowser)
  }

  // 前回のフォルダが消えていたらリセット
  useEffect(() => {
    if (rootDir)
      window.api
        .exists(rootDir)
        .then((ok) => !ok && setRootDir(null))
        .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pickRoot = async (): Promise<void> => {
    try {
      const dir = await window.api.selectFolder()
      if (dir) {
        setRootDir(dir)
        store.set('rootDir', dir)
      }
    } catch (e) {
      toast('error', errorMessage(e))
    }
  }

  return (
    <div className="app">
      <Sidebar
        page={page}
        onPage={setPage}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        docked={{ office: layouts.office.hidden, code: layouts.code.hidden }}
        onRestore={restore}
      />
      <main className="main">
        {/* 両ページとも常に表示しておき、切替は非表示にするだけ (ターミナルを止めないため) */}
        <div className={`page-slot ${page === 'office' ? '' : 'hidden'}`}>
          <OfficePage
            rootDir={rootDir}
            onPickRoot={pickRoot}
            state={office}
            terminalInject={inject?.page === 'office' ? inject : null}
            layout={layouts.office}
            onLayout={(l) => setLayout('office', l)}
          />
        </div>
        <div className={`page-slot ${page === 'code' ? '' : 'hidden'}`}>
          <CodePage
            rootDir={rootDir}
            onPickRoot={pickRoot}
            state={code}
            terminalInject={inject?.page === 'code' ? inject : null}
            layout={layouts.code}
            onLayout={(l) => setLayout('code', l)}
          />
        </div>
        <div className={`page-slot ${page === 'commands' ? '' : 'hidden'}`}>
          <CommandsPage onSendToTerminal={sendToTerminal} />
        </div>
      </main>
    </div>
  )
}

export default function App(): React.JSX.Element {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  )
}

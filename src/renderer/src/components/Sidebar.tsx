import { FileText, Code2, Command, Sun, Moon, FolderTree, Files, Eye } from 'lucide-react'
import { PANE_LABEL, type BrowserPage, type PaneId } from '../lib/layout'

const PANE_ICON: Record<PaneId, typeof FileText> = { tree: FolderTree, list: Files, panel: Eye }

export type PageId = 'office' | 'code' | 'commands'

const NAV: { id: PageId; label: string; icon: typeof FileText }[] = [
  { id: 'office', label: 'Office', icon: FileText },
  { id: 'code', label: 'Code', icon: Code2 },
  { id: 'commands', label: 'コマンド', icon: Command }
]

interface Props {
  page: PageId
  onPage: (p: PageId) => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  /** しまった欄 (Office / Code ごと) */
  docked: Record<BrowserPage, PaneId[]>
  onRestore: (page: BrowserPage, pane: PaneId) => void
}

export function Sidebar({
  page,
  onPage,
  theme,
  onToggleTheme,
  docked,
  onRestore
}: Props): React.JSX.Element {
  return (
    <aside className="sidebar">
      <div className="logo" title="File Hub">
        <span>F</span>
      </div>

      <nav className="nav">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item ${page === id ? 'active' : ''}`}
            onClick={() => onPage(id)}
            title={label}
          >
            <span className="nav-icon">
              <Icon size={20} strokeWidth={1.8} />
            </span>
            <span className="nav-label">{label}</span>
          </button>
        ))}

        {/* しまった欄: 既定のタブの下に境界線を引き、その下に並べる */}
        {(docked.office.length > 0 || docked.code.length > 0) && (
          <>
            <div className="dock-sep" title="しまった欄（押すと元に戻ります）">
              <span>しまった欄</span>
            </div>
            {(['office', 'code'] as const).map(
              (pg) =>
                docked[pg].length > 0 && (
                  <div key={pg} className="nav-dock">
                    <span className="dock-page">{pg === 'office' ? 'Office' : 'Code'}</span>
                    {docked[pg].map((pane) => {
                      const PaneIcon = PANE_ICON[pane]
                      return (
                        <button
                          key={pane}
                          className="dock-item"
                          onClick={() => onRestore(pg, pane)}
                          title={`${pg === 'office' ? 'Office' : 'Code'} の「${PANE_LABEL[pane]}」欄を戻す`}
                        >
                          <PaneIcon size={15} />
                          <span>{PANE_LABEL[pane]}</span>
                        </button>
                      )
                    })}
                  </div>
                )
            )}
          </>
        )}
      </nav>

      <div className="sidebar-bottom">
        <button
          className={`theme-switch ${theme === 'dark' ? 'on' : ''}`}
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'ライトモードに切替' : 'ダークモードに切替'}
          aria-label="テーマ切替"
        >
          <span className="knob">{theme === 'dark' ? <Moon size={12} /> : <Sun size={12} />}</span>
        </button>
        <span className="nav-label">{theme === 'dark' ? 'Dark' : 'Light'}</span>
      </div>
    </aside>
  )
}

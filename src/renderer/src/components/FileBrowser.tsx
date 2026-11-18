import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Search,
  FolderOpen,
  RefreshCw,
  ChevronRight,
  ArrowUp,
  Folder,
  File,
  FileText,
  FileSpreadsheet,
  Presentation,
  FileImage,
  FileCode2,
  FileType2,
  Layers,
  Eye,
  SquareTerminal,
  X,
  PanelLeftClose,
  FolderPlus,
  GitBranch
} from 'lucide-react'
import type { FsEntry } from '../../../shared/types'
import { type Category, categoryOf } from '../lib/fileTypes'
import { formatDate, formatSize, basename, parentDir, sepOf, errorMessage } from '../lib/format'
import { FolderTree } from './FolderTree'
import { TerminalPanel, type TerminalHandle } from './TerminalPanel'
import { hidePane, visiblePanes, type PaneId, type PaneLayout } from '../lib/layout'
import { GitPanel } from './GitPanel'
import { useToast } from '../lib/toast'

type SortKey = 'name' | 'mtime' | 'size'

interface Props {
  title: string
  subtitle: string
  rootDir: string | null
  onPickRoot: () => void
  categories: Category[]
  /** 現在のフォルダ・選択ファイルを親に通知 */
  currentDir: string
  onCurrentDir: (dir: string) => void
  selected: FsEntry | null
  onSelect: (e: FsEntry | null) => void
  refreshKey: number
  onRefresh: () => void
  headerActions?: ReactNode
  renderPreview: (e: FsEntry) => ReactNode
  emptyIcon: ReactNode
  /** 絞り込み後に表示されているファイル一覧を親に通知 (一括処理用) */
  onVisibleFilesChange?: (files: FsEntry[]) => void
  /** コマンド画面から送られた、ターミナルに入力する文字列 */
  terminalInject?: { text: string; nonce: number } | null
  /** 3 つの欄の表示・幅 */
  layout: PaneLayout
  onLayout: (l: PaneLayout) => void
}

type Panel = 'preview' | 'terminal' | 'git'
/** 欄どうしの間の「つまみ」の幅 (px) */
const SPLIT = 16
/** これより細くすると、離したときに欄をしまう (px) */
const CLOSE_AT = 120
/** ドラッグ中の最小幅 (px) */
const FLOOR = 44

/** 欄をしまうボタン */
function CollapseButton({
  disabled,
  onClick
}: {
  disabled: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      className="btn-icon small max-btn"
      onClick={onClick}
      disabled={disabled}
      title={
        disabled
          ? '最後の欄はしまえません'
          : 'この欄をしまう（左の Office / Code タブの下から戻せます）'
      }
    >
      <PanelLeftClose size={14} />
    </button>
  )
}

export function fileIcon(cat?: Category): ReactNode {
  switch (cat?.id) {
    case 'pdf':
      return <FileType2 size={18} />
    case 'word':
    case 'text':
      return <FileText size={18} />
    case 'excel':
      return <FileSpreadsheet size={18} />
    case 'ppt':
      return <Presentation size={18} />
    case 'image':
      return <FileImage size={18} />
    case undefined:
      return <File size={18} />
    default:
      return <FileCode2 size={18} />
  }
}

export function FileBrowser(p: Props): React.JSX.Element {
  const toast = useToast()
  const [entries, setEntries] = useState<FsEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [recursive, setRecursive] = useState(false)
  const [query, setQuery] = useState('')
  const [tags, setTags] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<SortKey>('name')
  const [panel, setPanel] = useState<Panel>('preview')
  // Git 画面の「戻る」で戻る先 (プレビュー or ターミナル)
  const [backPanel, setBackPanel] = useState<'preview' | 'terminal'>('preview')
  const [termMounted, setTermMounted] = useState(false)
  const [gitMounted, setGitMounted] = useState(false)
  const browserRef = useRef<HTMLDivElement>(null)
  /** ドラッグ中の幅 (離すまでは保存しない) と、しまう予定の欄 */
  const [live, setLive] = useState<{
    sizes: Record<PaneId, number>
    closing: PaneId | null
  } | null>(null)
  const [newFolder, setNewFolder] = useState<string | null>(null)
  const termHandle = useRef<TerminalHandle | null>(null)

  /** ターミナルを (まだなら裏で) 起動し、使えるようになるまで待つ */
  const ensureTerminal = async (): Promise<TerminalHandle> => {
    setTermMounted(true)
    for (let i = 0; i < 200; i++) {
      if (termHandle.current) return termHandle.current
      await new Promise((r) => setTimeout(r, 100))
    }
    throw new Error('ターミナルを起動できませんでした。ターミナルタブを開いて確認してください')
  }

  const shownPanes = visiblePanes(p.layout)
  const sizes = live?.sizes ?? p.layout.sizes
  const collapse = (id: PaneId): void => p.onLayout(hidePane(p.layout, id))
  const canCollapse = shownPanes.length > 1

  /** 欄の間のつまみをドラッグして幅を変える (細くしきって離すと、その欄をしまう) */
  const startResize = (
    e: React.PointerEvent<HTMLDivElement>,
    left: PaneId,
    right: PaneId
  ): void => {
    const el = browserRef.current
    if (!el || e.button !== 0) return
    e.preventDefault()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    const avail = el.clientWidth - (shownPanes.length - 1) * SPLIT
    const total = shownPanes.reduce((n, id) => n + p.layout.sizes[id], 0) || 1
    const px = { tree: 0, list: 0, panel: 0 }
    for (const id of shownPanes) px[id] = (p.layout.sizes[id] / total) * avail
    const pair = px[left] + px[right]
    const startX = e.clientX
    const toWeights = (v: Record<PaneId, number>): Record<PaneId, number> => ({
      tree: v.tree / avail,
      list: v.list / avail,
      panel: v.panel / avail
    })
    let cur = px
    let closing: PaneId | null = null
    document.body.classList.add('resizing')
    handle.classList.add('dragging')

    const move = (ev: PointerEvent): void => {
      const l = Math.min(Math.max(px[left] + ev.clientX - startX, FLOOR), pair - FLOOR)
      const r = pair - l
      closing = l < CLOSE_AT ? left : r < CLOSE_AT ? right : null
      cur = { ...px, [left]: l, [right]: r }
      setLive({ sizes: toWeights(cur), closing })
    }
    const up = (): void => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      document.body.classList.remove('resizing')
      handle.classList.remove('dragging')
      const next = { hidden: p.layout.hidden, sizes: toWeights(cur) }
      p.onLayout(closing ? hidePane(next, closing) : next)
      setLive(null)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }

  /** id の右側に、次の表示中の欄との間のつまみを置く */
  const splitterAfter = (id: PaneId): React.ReactNode => {
    const i = shownPanes.indexOf(id)
    if (i < 0 || i === shownPanes.length - 1) return null
    const next = shownPanes[i + 1]
    return (
      <div
        className="splitter"
        onPointerDown={(e) => startResize(e, id, next)}
        title="ドラッグで幅を変更（端まで寄せて離すと欄をしまいます）"
      >
        <span />
      </div>
    )
  }

  const paneProps = (id: PaneId): { className: string; style: React.CSSProperties } => ({
    className: `pane ${p.layout.hidden.includes(id) ? 'pane-hidden' : ''} ${live?.closing === id ? 'pane-closing' : ''}`,
    style: { flex: `${sizes[id]} 1 0px` }
  })

  // コマンド画面から送られたらターミナルを開く
  const { terminalInject } = p
  useEffect(() => {
    if (!terminalInject) return
    setPanel('terminal')
    setTermMounted(true)
  }, [terminalInject])

  const openGit = (): void => {
    if (panel !== 'git') setBackPanel(panel)
    setPanel('git')
    setGitMounted(true)
  }

  const createFolder = async (): Promise<void> => {
    const name = newFolder?.trim()
    if (!name) return setNewFolder(null)
    try {
      const path = await window.api.createFolder(p.currentDir, name)
      setNewFolder(null)
      toast('success', `フォルダ「${name}」を作成しました`)
      p.onRefresh()
      p.onCurrentDir(path)
    } catch (e) {
      toast('error', errorMessage(e))
    }
  }

  // フォルダ内容の読み込み
  useEffect(() => {
    if (!p.currentDir) return
    let alive = true
    setLoading(true)
    const job = recursive
      ? window.api.scanDir(p.currentDir).then((r) => {
          if (alive) setTruncated(r.truncated)
          return r.entries
        })
      : window.api.listDir(p.currentDir).then((r) => {
          if (alive) setTruncated(false)
          return r
        })
    job
      .then((list) => alive && setEntries(list))
      .catch((e) => {
        if (alive) {
          setEntries([])
          toast('error', `フォルダを読み込めません: ${errorMessage(e)}`)
        }
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [p.currentDir, recursive, p.refreshKey, toast])

  // カテゴリに該当するファイルだけを対象にする
  const files = useMemo(
    () => entries.filter((e) => !e.isDir && categoryOf(e.ext, p.categories)),
    [entries, p.categories]
  )
  const folders = useMemo(
    () => (recursive ? [] : entries.filter((e) => e.isDir)),
    [entries, recursive]
  )

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of files) {
      const c = categoryOf(f.ext, p.categories)!
      m.set(c.id, (m.get(c.id) ?? 0) + 1)
    }
    return m
  }, [files, p.categories])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = files.filter((f) => {
      if (tags.size && !tags.has(categoryOf(f.ext, p.categories)!.id)) return false
      if (q && !f.name.toLowerCase().includes(q) && !(f.rel ?? '').toLowerCase().includes(q))
        return false
      return true
    })
    list.sort((a, b) => {
      if (sort === 'mtime') return b.mtime - a.mtime
      if (sort === 'size') return b.size - a.size
      return a.name.localeCompare(b.name, 'ja', { numeric: true })
    })
    return list
  }, [files, tags, query, sort, p.categories])

  const { onVisibleFilesChange } = p
  useEffect(() => {
    onVisibleFilesChange?.(visible)
  }, [visible, onVisibleFilesChange])

  const visibleFolders = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? folders.filter((f) => f.name.toLowerCase().includes(q)) : folders
  }, [folders, query])

  const toggleTag = (id: string): void =>
    setTags((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  // パンくずリスト (ルートからの相対)
  const crumbs = useMemo(() => {
    if (!p.rootDir || !p.currentDir) return []
    const sep = sepOf(p.rootDir)
    const rel = p.currentDir.slice(p.rootDir.length).split(/[\\/]/).filter(Boolean)
    const out = [{ name: basename(p.rootDir) || p.rootDir, path: p.rootDir }]
    let acc = p.rootDir.replace(/[\\/]+$/, '')
    for (const r of rel) {
      acc = acc + sep + r
      out.push({ name: r, path: acc })
    }
    return out
  }, [p.rootDir, p.currentDir])

  if (!p.rootDir) {
    return (
      <div className="page">
        <header className="page-header">
          <div>
            <h1>{p.title}</h1>
            <p className="subtitle">{p.subtitle}</p>
          </div>
        </header>
        <div className="welcome card">
          <div className="welcome-icon">{p.emptyIcon}</div>
          <h2>フォルダを選択してください</h2>
          <p>エクスプローラーからフォルダを選ぶと、中のファイルとサブフォルダが表示されます。</p>
          <button className="btn btn-primary" onClick={p.onPickRoot}>
            <FolderOpen size={18} /> フォルダを選択
          </button>
        </div>
      </div>
    )
  }

  const atRoot = p.currentDir.replace(/[\\/]+$/, '') === p.rootDir.replace(/[\\/]+$/, '')

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{p.title}</h1>
          <p className="subtitle">{p.subtitle}</p>
        </div>
        <div className="header-actions">
          <button className="path-pill" onClick={p.onPickRoot} title="フォルダを変更">
            <FolderOpen size={16} />
            <span>
              <bdi>{p.rootDir}</bdi>
            </span>
          </button>
          <button className="btn-icon" onClick={p.onRefresh} title="再読み込み">
            <RefreshCw size={17} className={loading ? 'spin' : ''} />
          </button>
          {p.headerActions}
          <button
            className={`btn-icon git-btn ${panel === 'git' ? 'on' : ''}`}
            onClick={() => (panel === 'git' ? setPanel(backPanel) : openGit())}
            title="Git（リポジトリの確認・コミット・プッシュ）"
          >
            <GitBranch size={18} />
          </button>
        </div>
      </header>

      <div className="toolbar">
        <div className="search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ファイル名で検索"
          />
          {query ? (
            <button className="search-clear" onClick={() => setQuery('')}>
              <X size={15} />
            </button>
          ) : (
            <Search size={16} />
          )}
        </div>
        <div className="tags">
          <button
            className={`tag ${tags.size === 0 ? 'active' : ''}`}
            onClick={() => setTags(new Set())}
          >
            すべて <span className="tag-count">{files.length}</span>
          </button>
          {p.categories.map((c) => {
            const n = counts.get(c.id) ?? 0
            if (n === 0 && !tags.has(c.id)) return null
            return (
              <button
                key={c.id}
                className={`tag ${tags.has(c.id) ? 'active' : ''}`}
                onClick={() => toggleTag(c.id)}
              >
                <span className="dot" style={{ background: c.color }} />
                {c.label} <span className="tag-count">{n}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className={`browser panes ${live ? 'is-resizing' : ''}`} ref={browserRef}>
        <section {...paneProps('tree')} data-pane="tree">
          <div className="card tree-card">
            <div className="card-title row">
              <span>フォルダ</span>
              <CollapseButton disabled={!canCollapse} onClick={() => collapse('tree')} />
            </div>
            <FolderTree
              root={p.rootDir}
              current={p.currentDir}
              onSelect={p.onCurrentDir}
              refreshKey={p.refreshKey}
            />
          </div>
        </section>
        {splitterAfter('tree')}

        <section {...paneProps('list')} data-pane="list">
          <div className="card list-card">
            <div className="list-head">
              <div className="crumbs">
                <button
                  className="btn-icon small"
                  disabled={atRoot}
                  onClick={() => p.onCurrentDir(parentDir(p.currentDir))}
                  title="上のフォルダへ"
                >
                  <ArrowUp size={15} />
                </button>
                {crumbs.map((c, i) => (
                  <span key={c.path} className="crumb-wrap">
                    {i > 0 && <ChevronRight size={13} className="crumb-sep" />}
                    <button className="crumb" onClick={() => p.onCurrentDir(c.path)}>
                      {c.name}
                    </button>
                  </span>
                ))}
              </div>
              <div className="list-options">
                <label
                  className={`chip-toggle ${recursive ? 'on' : ''}`}
                  title="サブフォルダ内のファイルもまとめて表示"
                >
                  <input
                    type="checkbox"
                    checked={recursive}
                    onChange={(e) => setRecursive(e.target.checked)}
                  />
                  <Layers size={14} /> サブフォルダも含む
                </label>
                <select
                  className="select"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                >
                  <option value="name">名前順</option>
                  <option value="mtime">更新日順</option>
                  <option value="size">サイズ順</option>
                </select>
                <button
                  className="btn-icon small"
                  onClick={() => setNewFolder('')}
                  title="このフォルダの中に新しいフォルダを作成"
                >
                  <FolderPlus size={15} />
                </button>
                <CollapseButton disabled={!canCollapse} onClick={() => collapse('list')} />
              </div>
            </div>

            {newFolder !== null && (
              <div className="inline-form">
                <FolderPlus size={16} />
                <input
                  className="input"
                  autoFocus
                  value={newFolder}
                  placeholder={`「${basename(p.currentDir)}」の中に作るフォルダ名`}
                  onChange={(e) => setNewFolder(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) createFolder()
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      setNewFolder(null)
                    }
                  }}
                />
                <button className="btn small btn-primary" onClick={createFolder}>
                  作成
                </button>
                <button className="btn small" onClick={() => setNewFolder(null)}>
                  キャンセル
                </button>
              </div>
            )}

            <div className="file-list">
              {visibleFolders.map((f) => (
                <button
                  key={f.path}
                  className="file-row folder"
                  onClick={() => p.onCurrentDir(f.path)}
                >
                  <span className="file-icon folder-icon">
                    <Folder size={18} />
                  </span>
                  <span className="file-main">
                    <span className="file-name">{f.name}</span>
                  </span>
                  <span className="file-meta">{formatDate(f.mtime)}</span>
                </button>
              ))}
              {visible.map((f) => {
                const c = categoryOf(f.ext, p.categories)
                return (
                  <button
                    key={f.path}
                    className={`file-row ${p.selected?.path === f.path ? 'selected' : ''}`}
                    onClick={() => {
                      p.onSelect(f)
                      setPanel('preview')
                    }}
                  >
                    <span className="file-icon" style={{ color: c?.color }}>
                      {fileIcon(c)}
                    </span>
                    <span className="file-main">
                      <span className="file-name">{f.name}</span>
                      {f.rel ? <span className="file-rel">{f.rel}</span> : null}
                    </span>
                    <span className="pill" style={{ color: c?.color, background: `${c?.color}1a` }}>
                      {c?.label}
                    </span>
                    <span className="file-meta">
                      {formatSize(f.size)}
                      <br />
                      {formatDate(f.mtime)}
                    </span>
                  </button>
                )
              })}
              {!loading && visible.length === 0 && visibleFolders.length === 0 && (
                <div className="empty">該当するファイルがありません</div>
              )}
              {truncated && (
                <div className="empty">ファイル数が多いため、先頭 5,000 件のみ表示しています</div>
              )}
            </div>
          </div>
        </section>
        {splitterAfter('list')}

        <section {...paneProps('panel')} data-pane="panel">
          <div className="card preview-card">
            <div className={`panel-tabs-row ${panel === 'git' ? 'hidden' : ''}`}>
              <div className="panel-tabs">
                <button
                  className={panel === 'preview' ? 'active' : ''}
                  onClick={() => setPanel('preview')}
                >
                  <Eye size={15} /> プレビュー
                </button>
                <button
                  className={panel === 'terminal' ? 'active' : ''}
                  onClick={() => {
                    setPanel('terminal')
                    setTermMounted(true)
                  }}
                >
                  <SquareTerminal size={15} /> ターミナル
                </button>
              </div>
              <CollapseButton disabled={!canCollapse} onClick={() => collapse('panel')} />
            </div>
            <div className={`panel-body ${panel === 'preview' ? '' : 'hidden'}`}>
              {p.selected ? (
                p.renderPreview(p.selected)
              ) : (
                <div className="preview-empty">
                  {p.emptyIcon}
                  <p>ファイルを選択するとここに内容が表示されます</p>
                </div>
              )}
            </div>
            {/* 一度開いたターミナルは、プレビューに戻っても動き続けるよう残しておく */}
            {termMounted && (
              <div className={`panel-body ${panel === 'terminal' ? '' : 'hidden'}`}>
                <TerminalPanel
                  cwd={p.currentDir}
                  visible={panel === 'terminal'}
                  inject={terminalInject}
                  handleRef={termHandle}
                />
              </div>
            )}
            {gitMounted && (
              <div className={`panel-body ${panel === 'git' ? '' : 'hidden'}`}>
                <GitPanel
                  dir={p.currentDir}
                  active={panel === 'git'}
                  backLabel={backPanel === 'terminal' ? 'ターミナル' : 'プレビュー'}
                  onBack={() => setPanel(backPanel)}
                  onChanged={p.onRefresh}
                  terminal={{
                    ensure: ensureTerminal,
                    show: () => {
                      setBackPanel('terminal')
                      setPanel('terminal')
                    }
                  }}
                  canCollapse={canCollapse}
                  onCollapse={() => collapse('panel')}
                />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { ChevronRight, Folder, FolderOpen } from 'lucide-react'
import type { FsEntry } from '../../../shared/types'
import { basename } from '../lib/format'

/** child が parent フォルダの中 (子孫) にあるか */
function isInside(child: string, parent: string): boolean {
  const p = parent.replace(/[\\/]+$/, '')
  return child.length > p.length + 1 && child.startsWith(p) && /[\\/]/.test(child.charAt(p.length))
}

interface NodeProps {
  path: string
  name: string
  depth: number
  current: string
  onSelect: (p: string) => void
  refreshKey: number
  defaultOpen?: boolean
  /** ドラッグで運ばれてきたファイルの落とし先 (移動) */
  dropTarget?: string | null
  dropProps?: (dir: string) => React.HTMLAttributes<HTMLDivElement>
}

function TreeNode({
  path,
  name,
  depth,
  current,
  onSelect,
  refreshKey,
  defaultOpen,
  dropTarget,
  dropProps
}: NodeProps): React.JSX.Element {
  const [open, setOpen] = useState(!!defaultOpen)
  const [children, setChildren] = useState<FsEntry[] | null>(null)

  // 選択中フォルダの祖先は自動で開く
  const isAncestor = isInside(current, path)
  useEffect(() => {
    if (isAncestor) setOpen(true)
  }, [isAncestor])

  useEffect(() => {
    if (!open) return
    let alive = true
    window.api
      .listDir(path)
      .then((list) => alive && setChildren(list.filter((e) => e.isDir)))
      .catch(() => alive && setChildren([]))
    return () => {
      alive = false
    }
  }, [open, path, refreshKey])

  const selected = current === path
  return (
    <div>
      <div
        className={`tree-row ${selected ? 'selected' : ''} ${dropTarget === path ? 'drop-target' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onSelect(path)}
        title={path}
        {...dropProps?.(path)}
      >
        <button
          className={`tree-chevron ${open ? 'open' : ''} ${children && children.length === 0 ? 'empty' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            setOpen((o) => !o)
          }}
        >
          <ChevronRight size={14} />
        </button>
        {open ? (
          <FolderOpen size={16} className="tree-icon" />
        ) : (
          <Folder size={16} className="tree-icon" />
        )}
        <span className="tree-name">{name}</span>
      </div>
      {open &&
        children?.map((c) => (
          <TreeNode
            key={c.path}
            path={c.path}
            name={c.name}
            depth={depth + 1}
            current={current}
            onSelect={onSelect}
            refreshKey={refreshKey}
            dropTarget={dropTarget}
            dropProps={dropProps}
          />
        ))}
    </div>
  )
}

interface Props {
  root: string
  current: string
  onSelect: (p: string) => void
  refreshKey: number
  dropTarget?: string | null
  dropProps?: (dir: string) => React.HTMLAttributes<HTMLDivElement>
}

export function FolderTree({
  root,
  current,
  onSelect,
  refreshKey,
  dropTarget,
  dropProps
}: Props): React.JSX.Element {
  return (
    <div className="tree">
      <TreeNode
        key={root}
        path={root}
        name={basename(root) || root}
        depth={0}
        current={current}
        onSelect={onSelect}
        refreshKey={refreshKey}
        dropTarget={dropTarget}
        dropProps={dropProps}
        defaultOpen
      />
    </div>
  )
}

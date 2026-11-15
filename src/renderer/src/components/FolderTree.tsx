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
}

function TreeNode({
  path,
  name,
  depth,
  current,
  onSelect,
  refreshKey,
  defaultOpen
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
        className={`tree-row ${selected ? 'selected' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onSelect(path)}
        title={path}
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
}

export function FolderTree({ root, current, onSelect, refreshKey }: Props): React.JSX.Element {
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
        defaultOpen
      />
    </div>
  )
}

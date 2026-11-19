import { useEffect, useState } from 'react'
import { FolderInput, FolderSearch, X } from 'lucide-react'
import type { FsEntry } from '../../../shared/types'
import { FolderTree } from './FolderTree'
import { basename } from '../lib/format'

interface Props {
  root: string
  targets: FsEntry[]
  /** 最初に選んでおくフォルダ */
  initial: string
  onMove: (dest: string) => void
  onClose: () => void
}

/** 移動先のフォルダを選ぶ画面 */
export function MoveDialog({ root, targets, initial, onMove, onClose }: Props): React.JSX.Element {
  const [dest, setDest] = useState(initial)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const name = targets.length === 1 ? `「${targets[0].name}」` : `${targets.length} 件`
  const sameDir = targets.every((t) => t.path.slice(0, t.path.length - t.name.length - 1) === dest)

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal move-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>
            <FolderInput size={18} /> {name}を移動
          </h2>
          <button className="btn-icon" onClick={onClose} title="閉じる">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <p className="muted small-text">
            移動先のフォルダを選んでください（同じ名前があるときは番号を付けます）。
          </p>
          <div className="move-tree">
            <FolderTree root={root} current={dest} onSelect={setDest} refreshKey={0} />
          </div>
          <div className="move-dest" title={dest}>
            移動先: <b>{basename(dest) || dest}</b>
            <span className="muted">{dest}</span>
          </div>
        </div>
        <div className="modal-foot">
          <button
            className="btn"
            onClick={async () => {
              const d = await window.api.selectFolder('移動先のフォルダを選択')
              if (d) setDest(d)
            }}
          >
            <FolderSearch size={15} /> 別の場所を選ぶ…
          </button>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn btn-primary" disabled={sameDir} onClick={() => onMove(dest)}>
            ここに移動
          </button>
        </div>
      </div>
    </div>
  )
}

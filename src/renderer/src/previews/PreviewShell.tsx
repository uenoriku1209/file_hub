import type { ReactNode } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import type { FsEntry } from '../../../shared/types'
import type { Category } from '../lib/fileTypes'
import { formatDate, formatSize } from '../lib/format'
import { fileIcon } from '../components/FileBrowser'

interface Props {
  entry: FsEntry
  category?: Category
  actions: ReactNode
  extraMeta?: ReactNode
  children: ReactNode
}

/** プレビュー欄の共通レイアウト (ヘッダー + 本文) */
export function PreviewShell({
  entry,
  category,
  actions,
  extraMeta,
  children
}: Props): React.JSX.Element {
  return (
    <div className="preview">
      <div className="preview-head">
        <span
          className="preview-icon"
          style={{ color: category?.color, background: `${category?.color}1a` }}
        >
          {fileIcon(category)}
        </span>
        <div className="preview-title">
          <div className="preview-name" title={entry.path}>
            {entry.name}
          </div>
          <div className="preview-meta">
            {category && (
              <span
                className="pill"
                style={{ color: category.color, background: `${category.color}1a` }}
              >
                {category.label}
              </span>
            )}
            <span>{formatSize(entry.size)}</span>
            <span>{formatDate(entry.mtime)}</span>
            {extraMeta}
          </div>
        </div>
        <div className="preview-actions">{actions}</div>
      </div>
      <div className="preview-body">{children}</div>
    </div>
  )
}

export function Loading({ text = '読み込み中…' }: { text?: string }): React.JSX.Element {
  return (
    <div className="state">
      <Loader2 size={22} className="spin" />
      <span>{text}</span>
    </div>
  )
}

export function ErrorState({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="state error">
      <AlertCircle size={22} />
      <span>{text}</span>
    </div>
  )
}

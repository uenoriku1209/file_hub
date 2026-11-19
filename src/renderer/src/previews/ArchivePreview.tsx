import { useEffect, useState } from 'react'
import { FileArchive, Folder, File, FolderOutput, Loader2 } from 'lucide-react'
import type { ArchiveListing } from '../../../shared/types'
import { Loading, ErrorState } from './PreviewShell'
import { basename, errorMessage, formatSize } from '../lib/format'
import { useToast } from '../lib/toast'

/** 圧縮ファイルの中身の一覧と「展開する」ボタン */
export function ArchivePreview({
  path,
  onExtracted
}: {
  path: string
  /** 展開したフォルダ (一覧の再読み込み・移動用) */
  onExtracted: (dir: string) => void
}): React.JSX.Element {
  const toast = useToast()
  const [data, setData] = useState<ArchiveListing | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    setData(null)
    setError('')
    window.api
      .listArchive(path)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(errorMessage(e)))
    return () => {
      alive = false
    }
  }, [path])

  const extract = async (): Promise<void> => {
    setBusy(true)
    try {
      const dir = await window.api.extract(path)
      toast('success', `「${basename(dir)}」に展開しました`)
      onExtracted(dir)
    } catch (e) {
      toast('error', `展開できませんでした: ${errorMessage(e)}`)
    } finally {
      setBusy(false)
    }
  }

  if (error) return <ErrorState text={`圧縮ファイルを読み込めません: ${error}`} />
  if (!data) return <Loading />

  const files = data.entries.filter((e) => !e.dir)
  const total = files.reduce((n, e) => n + e.size, 0)

  return (
    <div className="archive-view">
      <div className="archive-head">
        <FileArchive size={28} />
        <div>
          <b>{basename(path)}</b>
          <div className="muted small-text">
            {data.supported
              ? `ファイル ${files.length.toLocaleString()} 件・展開後 約 ${formatSize(total)}`
              : data.sevenZip
                ? '中身の一覧は zip のみ対応です。展開は 7-Zip で行います。'
                : '中身の一覧は zip のみ対応です。7z・rar の展開には 7-Zip（https://7-zip.org/）が必要です。'}
          </div>
        </div>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={extract} disabled={busy}>
          {busy ? <Loader2 size={15} className="spin" /> : <FolderOutput size={15} />} 展開する
        </button>
      </div>
      {data.supported && (
        <ul className="archive-list">
          {data.entries.map((e) => {
            const parts = e.path.replace(/\/$/, '').split('/')
            return (
              <li key={e.path} style={{ paddingLeft: 10 + (parts.length - 1) * 16 }}>
                {e.dir ? <Folder size={14} className="folder-c" /> : <File size={14} />}
                <span className="archive-name">{parts[parts.length - 1]}</span>
                {!e.dir && <span className="muted">{formatSize(e.size)}</span>}
              </li>
            )
          })}
          {data.total > data.entries.length && (
            <li className="muted">ほか {(data.total - data.entries.length).toLocaleString()} 件</li>
          )}
        </ul>
      )}
    </div>
  )
}

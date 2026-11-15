import { useEffect, useRef, useState } from 'react'
import {
  X,
  FileOutput,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  FolderSearch,
  ExternalLink,
  FolderOpen
} from 'lucide-react'
import type { FsEntry } from '../../../shared/types'
import { pdfKindOf, type PdfEngine, type PdfEngines, type PdfResult } from '../../../shared/pdf'
import { basename, decodeText, errorMessage, parentDir, sepOf } from '../lib/format'
import { buildPrintHtml } from '../lib/pdfHtml'

type Location = 'same' | 'sub' | 'custom'
type Status =
  | { state: 'waiting' }
  | { state: 'running' }
  | { state: 'done'; result: PdfResult }
  | { state: 'error'; message: string }

interface Props {
  files: FsEntry[]
  onClose: () => void
  /** 1件以上変換できたら呼ばれる (一覧の再読み込み用) */
  onFinished: () => void
}

/** PDF に変換できるファイルだけを返す (PDF 自身は除く) */
export function pdfConvertible(files: FsEntry[]): FsEntry[] {
  return files.filter((f) => !f.isDir && f.ext !== 'pdf' && pdfKindOf(f.ext))
}

function stem(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}

export function PdfConvertModal({ files, onClose, onFinished }: Props): React.JSX.Element {
  const [location, setLocation] = useState<Location>('same')
  const [customDir, setCustomDir] = useState('')
  const [overwrite, setOverwrite] = useState(false)
  const [engine, setEngine] = useState<PdfEngine>('auto')
  const [openAfter, setOpenAfter] = useState(files.length === 1)
  const [engines, setEngines] = useState<PdfEngines | null>(null)
  const [phase, setPhase] = useState<'setup' | 'running' | 'done'>('setup')
  const [statuses, setStatuses] = useState<Status[]>(() => files.map(() => ({ state: 'waiting' })))
  const cancelRef = useRef(false)

  const hasOfficeDocs = files.some((f) => ['word', 'excel', 'ppt'].includes(pdfKindOf(f.ext) ?? ''))

  useEffect(() => {
    window.api
      .pdfEngines()
      .then(setEngines)
      .catch(() => setEngines({ office: false, libreoffice: null }))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && phase !== 'running') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, phase])

  const outDirFor = (f: FsEntry): string => {
    const dir = parentDir(f.path)
    if (location === 'sub') return `${dir.replace(/[\\/]+$/, '')}${sepOf(dir)}PDF`
    if (location === 'custom') return customDir
    return dir
  }

  const setStatus = (i: number, s: Status): void =>
    setStatuses((list) => list.map((x, j) => (j === i ? s : x)))

  const start = async (): Promise<void> => {
    if (location === 'custom' && !customDir) return
    cancelRef.current = false
    setPhase('running')
    let okCount = 0
    let lastOutput = ''
    for (let i = 0; i < files.length; i++) {
      if (cancelRef.current) break
      const f = files[i]
      setStatus(i, { state: 'running' })
      try {
        let result: PdfResult
        const outDir = outDirFor(f)
        if (pdfKindOf(f.ext) === 'html') {
          const text = decodeText(await window.api.readBytes(f.path, 2 * 1024 * 1024))
          result = await window.api.htmlToPdf(buildPrintHtml(f, text), {
            outDir,
            baseName: stem(f.name),
            overwrite
          })
        } else {
          result = await window.api.convertToPdf(f.path, { outDir, overwrite, engine })
        }
        setStatus(i, { state: 'done', result })
        okCount++
        lastOutput = result.output
      } catch (e) {
        setStatus(i, { state: 'error', message: errorMessage(e) })
      }
    }
    setPhase('done')
    if (okCount > 0) {
      onFinished()
      if (openAfter && files.length === 1 && lastOutput)
        window.api.openPath(lastOutput).catch(() => {})
    }
  }

  const done = statuses.filter((s) => s.state === 'done').length
  const failed = statuses.filter((s) => s.state === 'error').length
  const progress = Math.round(((done + failed) / files.length) * 100)

  const engineNote = (() => {
    if (!engines || !hasOfficeDocs) return null
    if (!engines.office && !engines.libreoffice)
      return {
        warn: true,
        text: 'Word / Excel / PowerPoint の変換には Microsoft Office か LibreOffice のインストールが必要です。'
      }
    const list = [engines.office && 'Microsoft Office', engines.libreoffice && 'LibreOffice']
      .filter(Boolean)
      .join('・')
    return { warn: false, text: `利用できる変換方法: ${list}` }
  })()

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && phase !== 'running' && onClose()}
    >
      <div className="modal">
        <div className="modal-head">
          <h2>{files.length === 1 ? 'PDF に変換' : `${files.length} 件を PDF に一括変換`}</h2>
          <button className="btn-icon small" onClick={onClose} disabled={phase === 'running'}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {phase === 'setup' && (
            <>
              <div className="field">
                <label>保存先</label>
                <div className="segmented">
                  <button
                    className={location === 'same' ? 'active' : ''}
                    onClick={() => setLocation('same')}
                  >
                    元のファイルと同じ場所
                  </button>
                  <button
                    className={location === 'sub' ? 'active' : ''}
                    onClick={() => setLocation('sub')}
                  >
                    「PDF」フォルダ内
                  </button>
                  <button
                    className={location === 'custom' ? 'active' : ''}
                    onClick={async () => {
                      const dir = await window.api.selectFolder('PDF の保存先フォルダを選択')
                      if (dir) {
                        setCustomDir(dir)
                        setLocation('custom')
                      }
                    }}
                  >
                    フォルダを指定…
                  </button>
                </div>
                {location === 'custom' && customDir && (
                  <small className="muted path-line">
                    <FolderOpen size={13} /> {customDir}
                  </small>
                )}
                {location === 'sub' && (
                  <small className="muted">
                    各ファイルと同じ階層に「PDF」フォルダを作って保存します
                  </small>
                )}
              </div>

              <div className="field-row">
                <div className="field">
                  <label>同じ名前の PDF がある場合</label>
                  <select
                    className="input"
                    value={overwrite ? 'over' : 'rename'}
                    onChange={(e) => setOverwrite(e.target.value === 'over')}
                  >
                    <option value="rename">別名で保存（名前 (2).pdf）</option>
                    <option value="over">上書きする</option>
                  </select>
                </div>
                {hasOfficeDocs && (
                  <div className="field">
                    <label>Office 文書の変換方法</label>
                    <select
                      className="input"
                      value={engine}
                      onChange={(e) => setEngine(e.target.value as PdfEngine)}
                    >
                      <option value="auto">自動（Office → LibreOffice）</option>
                      <option value="office" disabled={engines !== null && !engines.office}>
                        Microsoft Office
                      </option>
                      <option
                        value="libreoffice"
                        disabled={engines !== null && !engines.libreoffice}
                      >
                        LibreOffice
                      </option>
                    </select>
                  </div>
                )}
              </div>
              {engineNote && (
                <small className={engineNote.warn ? 'warn' : 'muted'}>{engineNote.text}</small>
              )}
            </>
          )}

          <div className="convert-list">
            {files.map((f, i) => {
              const s = statuses[i]
              return (
                <div key={f.path} className={`convert-item ${s.state}`}>
                  <span className="convert-status">
                    {s.state === 'waiting' && <Clock size={16} />}
                    {s.state === 'running' && <Loader2 size={16} className="spin" />}
                    {s.state === 'done' && <CheckCircle2 size={16} />}
                    {s.state === 'error' && <AlertCircle size={16} />}
                  </span>
                  <span className="convert-main">
                    <span className="convert-name">{f.name}</span>
                    {s.state === 'done' && (
                      <span className="convert-sub">
                        → {basename(s.result.output)}・{s.result.engine}
                      </span>
                    )}
                    {s.state === 'error' && <span className="convert-sub error">{s.message}</span>}
                    {s.state === 'running' && <span className="convert-sub">変換中…</span>}
                  </span>
                  {s.state === 'done' && (
                    <span className="convert-actions">
                      <button
                        className="btn-icon small"
                        title="PDF を開く"
                        onClick={() => window.api.openPath(s.result.output)}
                      >
                        <ExternalLink size={14} />
                      </button>
                      <button
                        className="btn-icon small"
                        title="フォルダで表示"
                        onClick={() => window.api.revealInFolder(s.result.output)}
                      >
                        <FolderSearch size={14} />
                      </button>
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {phase !== 'setup' && (
            <div className="progress">
              <div className="progress-bar" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>

        <div className="modal-foot">
          {phase === 'setup' && (
            <>
              {files.length === 1 && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={openAfter}
                    onChange={(e) => setOpenAfter(e.target.checked)}
                  />
                  変換後に PDF を開く
                </label>
              )}
              <div className="spacer" />
              <button className="btn" onClick={onClose}>
                キャンセル
              </button>
              <button
                className="btn btn-primary"
                onClick={start}
                disabled={location === 'custom' && !customDir}
              >
                <FileOutput size={16} /> 変換する
              </button>
            </>
          )}
          {phase === 'running' && (
            <>
              <span className="muted">
                {done + failed} / {files.length} 件
              </span>
              <div className="spacer" />
              <button className="btn" onClick={() => (cancelRef.current = true)}>
                残りを中止
              </button>
            </>
          )}
          {phase === 'done' && (
            <>
              <span className={failed ? 'warn' : 'muted'}>
                完了 {done} 件{failed ? `・失敗 ${failed} 件` : ''}
              </span>
              <div className="spacer" />
              <button className="btn btn-primary" onClick={onClose}>
                閉じる
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

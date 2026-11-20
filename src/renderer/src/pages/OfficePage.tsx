import { useState } from 'react'
import { Pencil, FolderSearch, FilePlus2, FileText, FileOutput, Files } from 'lucide-react'
import type { FsEntry } from '../../../shared/types'
import { FileBrowser } from '../components/FileBrowser'
import { NewFileModal } from '../components/NewFileModal'
import { PdfConvertModal, pdfConvertible } from '../components/PdfConvertModal'
import { ARCHIVE_EXTS, OFFICE_CATEGORIES, categoryOf, editLabel } from '../lib/fileTypes'
import { ArchivePreview } from '../previews/ArchivePreview'
import { PreviewShell } from '../previews/PreviewShell'
import { PdfPreview } from '../previews/PdfPreview'
import {
  DocxPreview,
  XlsxPreview,
  CsvPreview,
  PptxPreview,
  ImagePreview,
  TextPreview,
  Unsupported
} from '../previews/OfficePreviews'
import { useToast } from '../lib/toast'
import { REVEAL_LABEL } from '../lib/platform'
import { basename, errorMessage, parentDir } from '../lib/format'
import type { BrowserState } from '../App'
import type { PaneLayout } from '../lib/layout'

interface Props {
  rootDir: string | null
  onPickRoot: () => void
  state: BrowserState
  /** コマンド画面から送られた、ターミナルに入力する文字列 */
  terminalInject: { text: string; nonce: number } | null
  layout: PaneLayout
  onLayout: (l: PaneLayout) => void
}

function body(e: FsEntry): React.JSX.Element {
  switch (e.ext) {
    case 'pdf':
      return <PdfPreview path={e.path} />
    case 'docx':
    case 'docm':
      return <DocxPreview path={e.path} />
    case 'xlsx':
    case 'xlsm':
      return <XlsxPreview path={e.path} />
    case 'csv':
      return <CsvPreview path={e.path} name={e.name} />
    case 'pptx':
    case 'pptm':
      return <PptxPreview path={e.path} />
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'bmp':
    case 'webp':
    case 'svg':
      return <ImagePreview path={e.path} ext={e.ext} />
    case 'txt':
    case 'log':
      return <TextPreview path={e.path} />
    default:
      return <Unsupported ext={e.ext} />
  }
}

export function OfficePage({
  rootDir,
  onPickRoot,
  state,
  terminalInject,
  layout,
  onLayout
}: Props): React.JSX.Element {
  const toast = useToast()
  const [showNew, setShowNew] = useState(false)
  const [visibleFiles, setVisibleFiles] = useState<FsEntry[]>([])
  const [pdfTargets, setPdfTargets] = useState<FsEntry[] | null>(null)
  const batchTargets = pdfConvertible(visibleFiles)

  const edit = async (e: FsEntry): Promise<void> => {
    try {
      await window.api.openPath(e.path)
      toast('info', `${basename(e.path)} を開いています…`)
    } catch (err) {
      toast('error', `開けませんでした: ${errorMessage(err)}`)
    }
  }

  return (
    <>
      <FileBrowser
        title="Office"
        subtitle="PDF・Word・Excel・PowerPoint などのドキュメント"
        rootDir={rootDir}
        onPickRoot={onPickRoot}
        categories={OFFICE_CATEGORIES}
        currentDir={state.currentDir}
        onCurrentDir={state.setCurrentDir}
        selected={state.selected}
        onSelect={state.setSelected}
        refreshKey={state.refreshKey}
        onRefresh={state.refresh}
        emptyIcon={<FileText size={40} strokeWidth={1.4} />}
        onVisibleFilesChange={setVisibleFiles}
        terminalInject={terminalInject}
        layout={layout}
        onLayout={onLayout}
        headerActions={
          <>
            <button
              className="btn"
              disabled={batchTargets.length === 0}
              onClick={() => setPdfTargets(batchTargets)}
              title="一覧に表示中のファイルをまとめて PDF に変換"
            >
              <Files size={17} /> 一括PDF化{batchTargets.length ? ` (${batchTargets.length})` : ''}
            </button>
            <button className="btn btn-primary" onClick={() => setShowNew(true)}>
              <FilePlus2 size={17} /> 新規作成
            </button>
          </>
        }
        renderPreview={(e) => (
          <PreviewShell
            key={e.path}
            entry={e}
            category={categoryOf(e.ext, OFFICE_CATEGORIES)}
            actions={
              <>
                <button
                  className="btn-icon"
                  title={REVEAL_LABEL}
                  onClick={() => window.api.revealInFolder(e.path)}
                >
                  <FolderSearch size={17} />
                </button>
                {pdfConvertible([e]).length > 0 && (
                  <button className="btn" onClick={() => setPdfTargets([e])} title="PDF に変換">
                    <FileOutput size={16} /> PDF化
                  </button>
                )}
                <button className="btn btn-primary" onClick={() => edit(e)}>
                  <Pencil size={16} /> {editLabel(e.ext)}
                </button>
              </>
            }
          >
            {ARCHIVE_EXTS.includes(e.ext) ? (
              <ArchivePreview path={e.path} onExtracted={() => state.refresh()} />
            ) : (
              body(e)
            )}
          </PreviewShell>
        )}
      />
      {pdfTargets && (
        <PdfConvertModal
          files={pdfTargets}
          onClose={() => setPdfTargets(null)}
          onFinished={state.refresh}
        />
      )}
      {showNew && rootDir && (
        <NewFileModal
          dir={state.currentDir || rootDir}
          onClose={() => setShowNew(false)}
          onCreated={async (path, openAfter) => {
            setShowNew(false)
            toast('success', `${basename(path)} を作成しました`)
            state.refresh()
            state.setCurrentDir(parentDir(path))
            try {
              const list = await window.api.listDir(parentDir(path))
              const created = list.find((x) => x.path === path)
              if (created) state.setSelected(created)
            } catch {
              /* noop */
            }
            if (openAfter) window.api.openPath(path).catch(() => {})
          }}
        />
      )}
    </>
  )
}

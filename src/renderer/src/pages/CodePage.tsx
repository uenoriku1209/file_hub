import { useState } from 'react'
import { FolderSearch, Code2, FileOutput, Files } from 'lucide-react'
import type { FsEntry } from '../../../shared/types'
import { PdfConvertModal, pdfConvertible } from '../components/PdfConvertModal'
import { FileBrowser } from '../components/FileBrowser'
import { CODE_CATEGORIES, categoryOf } from '../lib/fileTypes'
import { PreviewShell } from '../previews/PreviewShell'
import { CodePreview } from '../previews/CodePreview'
import { useToast } from '../lib/toast'
import { errorMessage } from '../lib/format'
import type { BrowserState } from '../App'

interface Props {
  rootDir: string | null
  onPickRoot: () => void
  state: BrowserState
  /** コマンド画面から送られた、ターミナルに入力する文字列 */
  terminalInject: { text: string; nonce: number } | null
}

export function CodePage({ rootDir, onPickRoot, state, terminalInject }: Props): React.JSX.Element {
  const toast = useToast()
  const [visibleFiles, setVisibleFiles] = useState<FsEntry[]>([])
  const [pdfTargets, setPdfTargets] = useState<FsEntry[] | null>(null)
  const batchTargets = pdfConvertible(visibleFiles)

  const openCode = async (path: string): Promise<void> => {
    try {
      await window.api.openInVSCode(path, rootDir ?? undefined)
      toast('info', 'VS Code を起動しています…')
    } catch (e) {
      toast('error', errorMessage(e))
    }
  }

  return (
    <>
      <FileBrowser
        title="Code"
        subtitle="ソースコードを Markdown 形式で表示"
        rootDir={rootDir}
        onPickRoot={onPickRoot}
        categories={CODE_CATEGORIES}
        currentDir={state.currentDir}
        onCurrentDir={state.setCurrentDir}
        selected={state.selected}
        onSelect={state.setSelected}
        refreshKey={state.refreshKey}
        onRefresh={state.refresh}
        emptyIcon={<Code2 size={40} strokeWidth={1.4} />}
        onVisibleFilesChange={setVisibleFiles}
        terminalInject={terminalInject}
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
          </>
        }
        renderPreview={(e) => (
          <PreviewShell
            key={e.path}
            entry={e}
            category={categoryOf(e.ext, CODE_CATEGORIES)}
            actions={
              <>
                <button
                  className="btn-icon"
                  title="エクスプローラーで表示"
                  onClick={() => window.api.revealInFolder(e.path)}
                >
                  <FolderSearch size={17} />
                </button>
                <button className="btn" onClick={() => setPdfTargets([e])} title="PDF に変換">
                  <FileOutput size={16} /> PDF化
                </button>
                <button className="btn btn-primary" onClick={() => openCode(e.path)}>
                  <Code2 size={16} /> Code Edit
                </button>
              </>
            }
          >
            <CodePreview path={e.path} ext={e.ext} size={e.size} />
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
    </>
  )
}

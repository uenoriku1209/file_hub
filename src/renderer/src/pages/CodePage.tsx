import { useEffect, useState } from 'react'
import { FolderSearch, Code2, FileOutput, Files, FolderPlus, Boxes } from 'lucide-react'
import type { FsEntry } from '../../../shared/types'
import type { ProjectInfo } from '../../../shared/devenv'
import { NewProjectModal } from '../components/NewProjectModal'
import { ProjectPanel } from '../components/ProjectPanel'
import { PdfConvertModal, pdfConvertible } from '../components/PdfConvertModal'
import { FileBrowser } from '../components/FileBrowser'
import { ARCHIVE_EXTS, CODE_CATEGORIES, categoryOf } from '../lib/fileTypes'
import { ArchivePreview } from '../previews/ArchivePreview'
import { PreviewShell } from '../previews/PreviewShell'
import { CodePreview } from '../previews/CodePreview'
import { useToast } from '../lib/toast'
import { REVEAL_LABEL } from '../lib/platform'
import { errorMessage } from '../lib/format'
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

export function CodePage({
  rootDir,
  onPickRoot,
  state,
  terminalInject,
  layout,
  onLayout
}: Props): React.JSX.Element {
  const toast = useToast()
  const [visibleFiles, setVisibleFiles] = useState<FsEntry[]>([])
  const [pdfTargets, setPdfTargets] = useState<FsEntry[] | null>(null)
  const batchTargets = pdfConvertible(visibleFiles)
  const [newProject, setNewProject] = useState(false)
  const [project, setProject] = useState<ProjectInfo | null>(null)

  // 開いているフォルダが uv / Node のプロジェクトなら、パッケージ管理のタブを出す
  const dir = state.currentDir
  useEffect(() => {
    let alive = true
    if (!dir) {
      setProject(null)
      return
    }
    window.api.devenv
      .info(dir)
      .then((info) => alive && setProject(info))
      .catch(() => alive && setProject(null))
    return () => {
      alive = false
    }
  }, [dir, state.refreshKey])

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
        layout={layout}
        onLayout={onLayout}
        extraPanel={
          project && project.dir === dir
            ? {
                key: project.dir,
                label:
                  project.kind === 'uv'
                    ? 'パッケージ (uv)'
                    : `パッケージ (${project.manager ?? 'npm'})`,
                icon: <Boxes size={15} />,
                node: <ProjectPanel info={project} onChanged={state.refresh} />
              }
            : null
        }
        headerActions={
          <>
            <button
              className="btn"
              disabled={!rootDir}
              onClick={() => setNewProject(true)}
              title="開いているフォルダの中に、環境構築済みのプロジェクトを作る"
            >
              <FolderPlus size={17} /> プロジェクトを作成
            </button>
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
                  title={REVEAL_LABEL}
                  onClick={() => window.api.revealInFolder(e.path)}
                >
                  <FolderSearch size={17} />
                </button>
                {!ARCHIVE_EXTS.includes(e.ext) && (
                  <button className="btn" onClick={() => setPdfTargets([e])} title="PDF に変換">
                    <FileOutput size={16} /> PDF化
                  </button>
                )}
                <button className="btn btn-primary" onClick={() => openCode(e.path)}>
                  <Code2 size={16} /> Code Edit
                </button>
              </>
            }
          >
            {ARCHIVE_EXTS.includes(e.ext) ? (
              <ArchivePreview path={e.path} onExtracted={() => state.refresh()} />
            ) : (
              <CodePreview path={e.path} ext={e.ext} size={e.size} />
            )}
          </PreviewShell>
        )}
      />
      {newProject && (
        <NewProjectModal
          parentDir={state.currentDir || rootDir || ''}
          onClose={() => setNewProject(false)}
          onCreated={state.refresh}
          onOpen={(d) => {
            state.setSelected(null)
            state.setCurrentDir(d)
          }}
        />
      )}
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

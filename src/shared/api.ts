import type {
  CreateOptions,
  DocxPreview,
  FsEntry,
  ScanResult,
  SheetPreview,
  ShellInfo,
  SlidePreview
} from './types'
import type { GitBranches, GitSetupOptions, GitStatus, GitStepLog, SavedCommand } from './git'
import type { PdfEngines, PdfHtmlOptions, PdfOptions, PdfResult } from './pdf'

/** プリロードからレンダラーに公開する API */
export interface Api {
  platform: string
  selectFolder(title?: string): Promise<string | null>
  pickImages(): Promise<string[]>
  listDir(dir: string): Promise<FsEntry[]>
  scanDir(dir: string): Promise<ScanResult>
  readBytes(p: string, limit?: number): Promise<Uint8Array>
  exists(p: string): Promise<boolean>
  previewDocx(p: string): Promise<DocxPreview>
  previewXlsx(p: string): Promise<SheetPreview[]>
  previewPptx(p: string): Promise<SlidePreview[]>
  pdfAsset(kind: string, filename: string): Promise<Uint8Array>
  openPath(p: string): Promise<void>
  revealInFolder(p: string): Promise<void>
  openInVSCode(p: string, folder?: string): Promise<void>
  createFile(o: CreateOptions): Promise<string>
  createFolder(parent: string, name: string): Promise<string>
  loadCommands(): Promise<SavedCommand[]>
  saveCommands(list: SavedCommand[]): Promise<SavedCommand[]>
  git: {
    status(dir: string): Promise<GitStatus>
    branches(dir: string): Promise<GitBranches>
    switchBranch(dir: string, name: string, create: boolean): Promise<string>
    /** 選んだファイルだけを add された状態にする */
    stage(dir: string, files: string[]): Promise<string>
    commit(dir: string, message: string, files: string[] | 'all' | 'staged'): Promise<string>
    push(dir: string): Promise<string>
    pull(dir: string): Promise<string>
    /** 登録 (同じ名前があれば URL を変更) */
    addRemote(dir: string, url: string, name?: string): Promise<void>
    removeRemote(dir: string, name: string): Promise<void>
    setIdentity(dir: string, name: string, email: string): Promise<void>
    setup(dir: string, o: GitSetupOptions): Promise<void>
    onSetupStep(cb: (log: GitStepLog) => void): () => void
  }
  pdfEngines(): Promise<PdfEngines>
  convertToPdf(p: string, o: PdfOptions): Promise<PdfResult>
  htmlToPdf(html: string, o: PdfHtmlOptions): Promise<PdfResult>
  setTheme(mode: 'light' | 'dark'): void
  terminal: {
    shells(): Promise<ShellInfo[]>
    create(opts: {
      shellId?: string
      cwd?: string
      cols: number
      rows: number
    }): Promise<{ id: number; label: string }>
    write(id: number, data: string): void
    resize(id: number, cols: number, rows: number): void
    kill(id: number): void
    onData(cb: (id: number, data: string) => void): () => void
    onExit(cb: (id: number, code: number) => void): () => void
  }
}

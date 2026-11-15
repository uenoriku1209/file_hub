import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/api'
import type { PdfEngines, PdfHtmlOptions, PdfOptions, PdfResult } from '../shared/pdf'
import type {
  CreateOptions,
  DocxPreview,
  FsEntry,
  Result,
  ScanResult,
  SheetPreview,
  ShellInfo,
  SlidePreview
} from '../shared/types'

/** Result 形式を解いて、失敗時は例外にする */
async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const r = (await ipcRenderer.invoke(channel, ...args)) as Result<T>
  if (!r.ok) throw new Error(r.error ?? '不明なエラー')
  return r.value as T
}

const api: Api = {
  platform: process.platform,

  selectFolder: (title?: string) => call<string | null>('dialog:selectFolder', title),
  pickImages: () => call<string[]>('dialog:pickImages'),

  listDir: (dir: string) => call<FsEntry[]>('fs:list', dir),
  scanDir: (dir: string) => call<ScanResult>('fs:scan', dir),
  readBytes: (p: string, limit?: number) => call<Uint8Array>('fs:readBytes', p, limit),
  exists: (p: string) => call<boolean>('fs:exists', p),

  previewDocx: (p: string) => call<DocxPreview>('preview:docx', p),
  previewXlsx: (p: string) => call<SheetPreview[]>('preview:xlsx', p),
  previewPptx: (p: string) => call<SlidePreview[]>('preview:pptx', p),
  pdfAsset: (kind: string, filename: string) => call<Uint8Array>('pdf:asset', kind, filename),

  openPath: (p: string) => call<void>('shell:openPath', p),
  revealInFolder: (p: string) => call<void>('shell:reveal', p),
  openInVSCode: (p: string, folder?: string) => call<void>('vscode:open', p, folder),

  createFile: (o: CreateOptions) => call<string>('file:create', o),

  pdfEngines: () => call<PdfEngines>('pdf:engines'),
  convertToPdf: (p: string, o: PdfOptions) => call<PdfResult>('pdf:convert', p, o),
  htmlToPdf: (html: string, o: PdfHtmlOptions) => call<PdfResult>('pdf:fromHtml', html, o),

  setTheme: (mode: 'light' | 'dark') => ipcRenderer.send('theme:set', mode),

  terminal: {
    shells: () => call<ShellInfo[]>('pty:shells'),
    create: (opts: { shellId?: string; cwd?: string; cols: number; rows: number }) =>
      call<{ id: number; label: string }>('pty:create', opts),
    write: (id: number, data: string) => ipcRenderer.send('pty:write', id, data),
    resize: (id: number, cols: number, rows: number) =>
      ipcRenderer.send('pty:resize', id, cols, rows),
    kill: (id: number) => ipcRenderer.send('pty:kill', id),
    onData: (cb: (id: number, data: string) => void) => {
      const l = (_: unknown, id: number, data: string): void => cb(id, data)
      ipcRenderer.on('pty:data', l)
      return () => ipcRenderer.removeListener('pty:data', l)
    },
    onExit: (cb: (id: number, code: number) => void) => {
      const l = (_: unknown, id: number, code: number): void => cb(id, code)
      ipcRenderer.on('pty:exit', l)
      return () => ipcRenderer.removeListener('pty:exit', l)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

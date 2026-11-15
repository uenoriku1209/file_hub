import { app, dialog, ipcMain, shell, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { join, normalize, sep } from 'path'
import { listDir, scanDir, readBytes } from './fileOps'
import { previewDocx, previewXlsx, previewPptx } from './previews'
import { createFile } from './creators'
import { openInVSCode } from './vscode'
import { convertToPdf, htmlToPdf, detectEngines } from './pdfConvert'
import {
  availableShells,
  createSession,
  writeSession,
  resizeSession,
  killSession
} from './terminal'
import type { CreateOptions, Result } from '../shared/types'
import type { PdfHtmlOptions, PdfOptions } from '../shared/pdf'

/** 例外を { ok, error } 形式に包んでレンダラーへ返す */
function handle<A extends unknown[], T>(
  channel: string,
  fn: (e: Electron.IpcMainInvokeEvent, ...args: A) => Promise<T> | T
): void {
  ipcMain.handle(channel, async (e, ...args): Promise<Result<T>> => {
    try {
      return { ok: true, value: await fn(e, ...(args as A)) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

/** pdf.js 用のフォント・CMap などの置き場所 */
function pdfAssetRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'pdfjs')
    : join(app.getAppPath(), 'resources', 'pdfjs')
}

export function registerIpc(): void {
  handle('dialog:selectFolder', async (e, title?: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, {
      title: title ?? '表示するフォルダを選択',
      properties: ['openDirectory', 'createDirectory']
    })
    return r.canceled ? null : r.filePaths[0]
  })

  handle('dialog:pickImages', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, {
      title: '挿入する画像を選択',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '画像', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp'] }]
    })
    return r.canceled ? [] : r.filePaths
  })

  handle('fs:list', (_e, dir: string) => listDir(dir))
  handle('fs:scan', (_e, dir: string) => scanDir(dir))
  handle('fs:readBytes', (_e, p: string, limit?: number) => readBytes(p, limit))
  handle('fs:exists', async (_e, p: string) => {
    try {
      await fs.access(p)
      return true
    } catch {
      return false
    }
  })

  handle('preview:docx', (_e, p: string) => previewDocx(p))
  handle('preview:xlsx', (_e, p: string) => previewXlsx(p))
  handle('preview:pptx', (_e, p: string) => previewPptx(p))

  handle('pdf:asset', async (_e, kind: string, filename: string) => {
    if (!['cmaps', 'standard_fonts', 'wasm'].includes(kind)) throw new Error('invalid kind')
    const base = join(pdfAssetRoot(), kind)
    const full = normalize(join(base, filename))
    if (!full.startsWith(base + sep)) throw new Error('invalid path')
    return fs.readFile(full)
  })

  handle('shell:openPath', async (_e, p: string) => {
    const err = await shell.openPath(p)
    if (err) throw new Error(err)
  })
  handle('shell:reveal', (_e, p: string) => shell.showItemInFolder(p))
  handle('vscode:open', (_e, p: string, folder?: string) => openInVSCode(p, folder))

  handle('file:create', (_e, o: CreateOptions) => createFile(o))

  handle('pdf:engines', () => detectEngines())
  handle('pdf:convert', (_e, p: string, o: PdfOptions) => convertToPdf(p, o))
  handle('pdf:fromHtml', (_e, html: string, o: PdfHtmlOptions) => htmlToPdf(html, o))

  handle('pty:shells', () => availableShells())
  handle('pty:create', (e, opts: { shellId?: string; cwd?: string; cols: number; rows: number }) =>
    createSession(e.sender, opts)
  )
  ipcMain.on('pty:write', (_e, id: number, data: string) => writeSession(id, data))
  ipcMain.on('pty:resize', (_e, id: number, cols: number, rows: number) =>
    resizeSession(id, cols, rows)
  )
  ipcMain.on('pty:kill', (_e, id: number) => killSession(id))
}

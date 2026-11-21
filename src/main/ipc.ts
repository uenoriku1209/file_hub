import { app, dialog, ipcMain, shell, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { join, normalize, sep } from 'path'
import { listDir, scanDir, readBytes, createFolder } from './fileOps'
import {
  gitStatus,
  gitBranches,
  gitSwitch,
  gitCommit,
  gitStage,
  gitPush,
  gitPull,
  gitAddRemote,
  gitRemoveRemote,
  gitSetIdentity,
  gitSetup
} from './git'
import { loadCommands, saveCommands } from './commands'
import type { GitSetupOptions, SavedCommand } from '../shared/git'
import { previewDocx, previewXlsx, previewPptx } from './previews'
import { createFile } from './creators'
import { openInVSCode } from './vscode'
import {
  compressPaths,
  extractArchive,
  listArchive,
  movePaths,
  renamePath,
  trashPaths
} from './fileManage'
import { convertToPdf, htmlToPdf, detectEngines, warmUpPdf, pdfForPreview } from './pdfConvert'
import {
  availableShells,
  createSession,
  writeSession,
  resizeSession,
  killSession
} from './terminal'
import { applyOrganize } from './organize'
import {
  cancelJob,
  createProject,
  detectEnv,
  installUv,
  packageAction,
  projectInfo
} from './devenv'
import type { CreateOptions, OrganizePlan, Result } from '../shared/types'
import type { DevLog, PackageAction, ProjectOptions, UvInstallMethod } from '../shared/devenv'
import type { PdfHtmlOptions, PdfKind, PdfOptions } from '../shared/pdf'

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
  handle('fs:organize', (_e, plan: OrganizePlan) => applyOrganize(plan))
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
  handle('pdf:warmup', (_e, kinds: PdfKind[]) => warmUpPdf(kinds))
  handle('pdf:forPreview', (_e, p: string) => pdfForPreview(p))
  handle('pdf:convert', (_e, p: string, o: PdfOptions) => convertToPdf(p, o))
  handle('pdf:fromHtml', (_e, html: string, o: PdfHtmlOptions) => htmlToPdf(html, o))

  handle('fs:mkdir', (_e, parent: string, name: string) => createFolder(parent, name))
  handle('fs:trash', (_e, paths: string[]) => trashPaths(paths))
  handle('fs:rename', (_e, p: string, name: string) => renamePath(p, name))
  handle('fs:move', (_e, paths: string[], dest: string) => movePaths(paths, dest))
  handle('fs:extract', (_e, p: string) => extractArchive(p))
  handle('fs:compress', (_e, paths: string[]) => compressPaths(paths))
  handle('fs:listArchive', (_e, p: string) => listArchive(p))

  /* ---------- コマンド一覧 ---------- */
  handle('commands:load', () => loadCommands())
  handle('commands:save', (_e, list: SavedCommand[]) => saveCommands(list))

  /* ---------- Git ---------- */
  handle('git:status', (_e, dir: string) => gitStatus(dir))
  handle('git:branches', (_e, dir: string) => gitBranches(dir))
  handle('git:switch', (_e, dir: string, name: string, create: boolean) =>
    gitSwitch(dir, name, create)
  )
  handle('git:stage', (_e, dir: string, files: string[]) => gitStage(dir, files))
  handle('git:commit', (_e, dir: string, message: string, files: string[] | 'all' | 'staged') =>
    gitCommit(dir, message, files)
  )
  handle('git:push', (_e, dir: string) => gitPush(dir))
  handle('git:pull', (_e, dir: string) => gitPull(dir))
  handle('git:addRemote', (_e, dir: string, url: string, name?: string) =>
    gitAddRemote(dir, url, name || 'origin')
  )
  handle('git:removeRemote', (_e, dir: string, name: string) => gitRemoveRemote(dir, name))
  handle('git:identity', (_e, dir: string, name: string, email: string) =>
    gitSetIdentity(dir, name, email)
  )
  handle('git:setup', (e, dir: string, o: GitSetupOptions) =>
    gitSetup(dir, o, (log) => {
      if (!e.sender.isDestroyed()) e.sender.send('git:setupStep', log)
    })
  )

  /* ---------- 開発環境 (プロジェクト作成・パッケージ) ---------- */
  const logTo =
    (sender: Electron.WebContents, job: string) =>
    (kind: DevLog['kind'], text: string): void => {
      if (!sender.isDestroyed()) sender.send('devenv:log', { job, kind, text } satisfies DevLog)
    }
  handle('devenv:detect', () => detectEnv())
  handle('devenv:installUv', (e, method: UvInstallMethod, job: string) =>
    installUv(method, job, logTo(e.sender, job))
  )
  handle('devenv:create', (e, o: ProjectOptions, job: string) =>
    createProject(o, job, logTo(e.sender, job))
  )
  handle('devenv:info', (_e, dir: string) => projectInfo(dir))
  handle('devenv:package', (e, dir: string, action: PackageAction, job: string) =>
    packageAction(dir, action, job, logTo(e.sender, job))
  )
  ipcMain.on('devenv:cancel', (_e, job: string) => cancelJob(job))

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

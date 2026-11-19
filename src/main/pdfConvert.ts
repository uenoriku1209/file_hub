import { app, BrowserWindow } from 'electron'
import { spawn, execFile } from 'child_process'
import { promises as fs, existsSync } from 'fs'
import { tmpdir } from 'os'
import { createHash } from 'crypto'
import { join, extname, basename, delimiter } from 'path'
import { pathToFileURL } from 'url'
import { readImageInfo } from './imageSize'
import { OfficeWorker, type OfficeKind } from './officeWorker'
import {
  pdfKindOf,
  type PdfEngines,
  type PdfHtmlOptions,
  type PdfKind,
  type PdfOptions,
  type PdfResult
} from '../shared/pdf'

const TIMEOUT_MS = 3 * 60 * 1000

/* ---------------- 出力先 ---------------- */

/** 出力先の PDF パスを決める (上書きしない場合は「名前 (2).pdf」のように連番) */
async function resolveTarget(
  outDir: string,
  baseName: string,
  overwrite: boolean
): Promise<string> {
  await fs.mkdir(outDir, { recursive: true })
  const base = baseName.replace(/[\\/:*?"<>|]/g, '_') || 'output'
  let target = join(outDir, `${base}.pdf`)
  if (overwrite) return target
  let n = 2
  while (existsSync(target)) {
    target = join(outDir, `${base} (${n}).pdf`)
    n++
  }
  return target
}

function stem(p: string): string {
  return basename(p, extname(p))
}

/* ---------------- 変換エンジンの検出 ---------------- */

function findInPath(names: string[]): string | null {
  for (const dir of (process.env['PATH'] ?? '').split(delimiter)) {
    for (const n of names) {
      const p = join(dir, n)
      if (dir && existsSync(p)) return p
    }
  }
  return null
}

function findLibreOffice(): string | null {
  if (process.platform === 'win32') {
    const roots = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)']].filter(
      Boolean
    ) as string[]
    for (const r of roots) {
      const p = join(r, 'LibreOffice', 'program', 'soffice.exe')
      if (existsSync(p)) return p
    }
    return findInPath(['soffice.exe'])
  }
  if (process.platform === 'darwin') {
    const p = '/Applications/LibreOffice.app/Contents/MacOS/soffice'
    if (existsSync(p)) return p
  }
  return findInPath(['soffice', 'libreoffice'])
}

/** Word が COM 経由で使えるか (レジストリに登録があるか) を確認 */
function hasOffice(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false)
  return new Promise((resolve) => {
    execFile('reg', ['query', 'HKCR\\Word.Application\\CLSID'], { windowsHide: true }, (err) =>
      resolve(!err)
    )
  })
}

let enginesCache: PdfEngines | null = null
export async function detectEngines(): Promise<PdfEngines> {
  if (!enginesCache) enginesCache = { office: await hasOffice(), libreoffice: findLibreOffice() }
  return enginesCache
}

/* ---------------- 子プロセス実行 ---------------- */

function run(
  file: string,
  args: string[],
  env?: NodeJS.ProcessEnv
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, env: env ?? process.env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d.toString('utf8')))
    child.stderr.on('data', (d) => (stderr += d.toString('utf8')))
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('変換がタイムアウトしました（3分）'))
    }, TIMEOUT_MS)
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

/* ---------------- Microsoft Office (COM) ---------------- */

const OFFICE_APP: Record<string, string> = {
  word: 'Microsoft Word',
  excel: 'Microsoft Excel',
  ppt: 'Microsoft PowerPoint'
}

/** Office を開いたまま次々に変換する常駐ワーカー (しばらく使わなければ自動で終了) */
const officeWorker = new OfficeWorker()

/** 変換画面を開いた時点で Office を起動しておく (1 件目を速くするため) */
export async function warmUpPdf(kinds: PdfKind[]): Promise<void> {
  const office = kinds.filter((k): k is OfficeKind => k === 'word' || k === 'excel' || k === 'ppt')
  if (office.length === 0) return
  const engines = await detectEngines()
  if (engines.office) officeWorker.warm(office)
}

/** アプリ終了時に、変換のために起動した Office を閉じる */
export function shutdownPdfWorkers(): Promise<void> {
  return officeWorker.stop()
}

async function convertWithOffice(input: string, output: string, kind: PdfKind): Promise<void> {
  try {
    await officeWorker.convert(kind as OfficeKind, input, output)
  } catch (e) {
    const msg = (e as Error).message.trim().split(/\r?\n/).filter(Boolean).pop()
    throw new Error(`${OFFICE_APP[kind]} での変換に失敗しました${msg ? `: ${msg}` : ''}`, {
      cause: e
    })
  }
  if (!existsSync(output)) throw new Error(`${OFFICE_APP[kind]} での変換に失敗しました`)
}

/* ---------------- LibreOffice ---------------- */

async function convertWithLibreOffice(
  soffice: string,
  input: string,
  output: string
): Promise<void> {
  // 同じプロファイルを同時に使うと失敗するため、1 件ずつ順番に変換する
  const job = loChain.then(() => libreOfficeOnce(soffice, input, output))
  loChain = job.catch(() => {})
  return job
}

let loChain: Promise<unknown> = Promise.resolve()

async function libreOfficeOnce(soffice: string, input: string, output: string): Promise<void> {
  // 起動中の LibreOffice と競合しないよう、File Hub 専用のプロファイルを使う。
  // 毎回作り直すと初期化に時間がかかるため、作ったものを使い回す。
  const profileDir = join(app.getPath('userData'), 'libreoffice-profile')
  try {
    await libreOfficeConvert(soffice, input, output, profileDir)
  } catch (e) {
    // プロファイルが壊れている (前回の強制終了など) 可能性があるので、作り直してもう一度
    await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {})
    try {
      await libreOfficeConvert(soffice, input, output, profileDir)
    } catch {
      throw e
    }
  }
}

async function libreOfficeConvert(
  soffice: string,
  input: string,
  output: string,
  profileDir: string
): Promise<void> {
  const work = await fs.mkdtemp(join(tmpdir(), 'filehub-lo-'))
  try {
    const r = await run(soffice, [
      `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
      '--headless',
      '--norestore',
      '--nologo',
      '--nodefault',
      '--nolockcheck',
      '--convert-to',
      'pdf',
      '--outdir',
      work,
      input
    ])
    const produced = join(work, `${stem(input)}.pdf`)
    if (!existsSync(produced)) {
      throw new Error(
        `LibreOffice での変換に失敗しました${r.stderr.trim() ? `: ${r.stderr.trim()}` : ''}`
      )
    }
    await fs.copyFile(produced, output)
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {})
  }
}

/* ---------------- Chromium (printToPDF) ---------------- */

async function printHtmlFile(htmlPath: string, output: string, landscape: boolean): Promise<void> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, javascript: false, offscreen: false }
  })
  try {
    await win.loadFile(htmlPath)
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      landscape,
      printBackground: true,
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
    })
    await fs.writeFile(output, pdf)
  } finally {
    win.destroy()
  }
}

/** HTML 文字列を PDF にする (テキスト・コード・Markdown 用) */
export async function htmlToPdf(html: string, o: PdfHtmlOptions): Promise<PdfResult> {
  const output = await resolveTarget(o.outDir, o.baseName, o.overwrite)
  const work = await fs.mkdtemp(join(tmpdir(), 'filehub-html-'))
  try {
    const page = join(work, 'page.html')
    await fs.writeFile(page, html, 'utf8')
    await printHtmlFile(page, output, !!o.landscape)
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {})
  }
  return { output, engine: '内蔵 (Chromium)' }
}

async function imageToPdf(input: string, output: string): Promise<void> {
  // 横長の画像は横向きのページにする
  let landscape = false
  try {
    const info = readImageInfo(await fs.readFile(input))
    if (info) landscape = info.width > info.height
  } catch {
    /* サイズ不明なら縦 */
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; height: 100%; }
    body { display: flex; align-items: center; justify-content: center; }
    img { width: 100%; height: 100vh; object-fit: contain; }
  </style></head><body><img src="${pathToFileURL(input).href}"></body></html>`
  const work = await fs.mkdtemp(join(tmpdir(), 'filehub-img-'))
  try {
    const page = join(work, 'page.html')
    await fs.writeFile(page, html, 'utf8')
    await printHtmlFile(page, output, landscape)
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {})
  }
}

/* ---------------- 入口 ---------------- */

/** Office 文書・画像を PDF に変換する (テキスト系は htmlToPdf を使う) */
export async function convertToPdf(input: string, o: PdfOptions): Promise<PdfResult> {
  const kind = pdfKindOf(extname(input).slice(1).toLowerCase())
  if (!kind) throw new Error('この形式は PDF に変換できません')
  if (kind === 'html') throw new Error('テキスト系ファイルは htmlToPdf で変換してください')

  const output = await resolveTarget(o.outDir, stem(input), o.overwrite)

  if (kind === 'image') {
    await imageToPdf(input, output)
    return { output, engine: '内蔵 (Chromium)' }
  }

  const engines = await detectEngines()
  const useOffice = o.engine !== 'libreoffice' && engines.office
  const useLibre = o.engine !== 'office' && !!engines.libreoffice

  if (!useOffice && !useLibre) {
    if (o.engine === 'office') throw new Error('Microsoft Office が見つかりません')
    if (o.engine === 'libreoffice') throw new Error('LibreOffice が見つかりません')
    throw new Error('Office 文書を変換するには Microsoft Office か LibreOffice が必要です')
  }

  if (useOffice) {
    try {
      await convertWithOffice(input, output, kind)
      return { output, engine: OFFICE_APP[kind] }
    } catch (e) {
      // 自動モードなら LibreOffice で再挑戦
      if (!useLibre || o.engine === 'office') throw e
    }
  }
  await convertWithLibreOffice(engines.libreoffice!, input, output)
  return { output, engine: 'LibreOffice' }
}

/* ---------------- プレビュー用の PDF (正確な見た目で表示するため) ---------------- */

const PREVIEW_CACHE_MAX = 60

/**
 * Office 文書を PDF にして、プレビュー用に保存しておく。
 * 同じファイル (更新日時・サイズが同じ) なら、前に作ったものを使い回す。
 */
export async function pdfForPreview(input: string): Promise<string> {
  const kind = pdfKindOf(extname(input).slice(1).toLowerCase())
  if (kind !== 'word' && kind !== 'excel' && kind !== 'ppt') throw new Error('この形式は対象外です')
  const st = await fs.stat(input)
  const key = createHash('sha1')
    .update(`${input}|${st.mtimeMs}|${st.size}`)
    .digest('hex')
    .slice(0, 20)
  const dir = join(app.getPath('userData'), 'preview-pdf')
  const out = join(dir, `${key}.pdf`)
  if (existsSync(out)) {
    // 使ったものは新しい扱いにする (古いものから消すため)
    const now = new Date()
    await fs.utimes(out, now, now).catch(() => {})
    return out
  }
  await fs.mkdir(dir, { recursive: true })
  const engines = await detectEngines()
  const tmp = join(dir, `${key}.tmp.pdf`)
  try {
    if (engines.office) {
      try {
        await convertWithOffice(input, tmp, kind)
      } catch (e) {
        if (!engines.libreoffice) throw e
        await convertWithLibreOffice(engines.libreoffice, input, tmp)
      }
    } else if (engines.libreoffice) await convertWithLibreOffice(engines.libreoffice, input, tmp)
    else throw new Error('Microsoft Office か LibreOffice が必要です')
    await fs.rename(tmp, out)
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => {})
  }
  void trimPreviewCache(dir)
  return out
}

/** 古いプレビュー用 PDF を消して、数を抑える */
async function trimPreviewCache(dir: string): Promise<void> {
  const names = (await fs.readdir(dir)).filter((n) => n.endsWith('.pdf') && !n.endsWith('.tmp.pdf'))
  if (names.length <= PREVIEW_CACHE_MAX) return
  const stats = await Promise.all(
    names.map(async (n) => ({ n, t: (await fs.stat(join(dir, n))).mtimeMs }))
  )
  stats.sort((a, b) => a.t - b.t)
  for (const s of stats.slice(0, stats.length - PREVIEW_CACHE_MAX))
    await fs.rm(join(dir, s.n), { force: true }).catch(() => {})
}

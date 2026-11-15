import { BrowserWindow } from 'electron'
import { spawn, execFile } from 'child_process'
import { promises as fs, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join, extname, basename, delimiter } from 'path'
import { pathToFileURL } from 'url'
import { readImageInfo } from './imageSize'
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

/**
 * PowerShell から Office を非表示で起動し、PDF に書き出す。
 * - パスは環境変数で渡す (日本語やスペースを含んでも安全)
 * - マクロは無効化して開く / 読み取り専用で開く
 * - 既にユーザーが開いている PowerPoint 等は終了させない
 */
const OFFICE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$in = $env:FH_IN; $out = $env:FH_OUT; $kind = $env:FH_KIND
$app = $null; $doc = $null; $quit = $true
try {
  switch ($kind) {
    'word' {
      $app = New-Object -ComObject Word.Application
      if ($app.Documents.Count -gt 0) { $quit = $false }
      $app.Visible = $false
      $app.DisplayAlerts = 0
      try { $app.AutomationSecurity = 3 } catch {}
      $doc = $app.Documents.Open($in, $false, $true, $false)
      $doc.ExportAsFixedFormat($out, 17)
      $doc.Close($false)
    }
    'excel' {
      $app = New-Object -ComObject Excel.Application
      if ($app.Workbooks.Count -gt 0) { $quit = $false }
      $app.Visible = $false
      $app.DisplayAlerts = $false
      try { $app.AutomationSecurity = 3 } catch {}
      $doc = $app.Workbooks.Open($in, 0, $true)
      $doc.ExportAsFixedFormat(0, $out)
      $doc.Close($false)
    }
    'ppt' {
      $app = New-Object -ComObject PowerPoint.Application
      if ($app.Presentations.Count -gt 0) { $quit = $false }
      try { $app.AutomationSecurity = 3 } catch {}
      $doc = $app.Presentations.Open($in, -1, 0, 0)
      $doc.SaveAs($out, 32)
      $doc.Close()
    }
  }
  Write-Output 'OK'
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
} finally {
  if ($app -ne $null) {
    if ($quit) { try { $app.Quit() } catch {} }
    try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) } catch {}
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
`

const OFFICE_APP: Record<string, string> = {
  word: 'Microsoft Word',
  excel: 'Microsoft Excel',
  ppt: 'Microsoft PowerPoint'
}

async function convertWithOffice(input: string, output: string, kind: PdfKind): Promise<void> {
  const encoded = Buffer.from(OFFICE_SCRIPT, 'utf16le').toString('base64')
  const r = await run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { ...process.env, FH_IN: input, FH_OUT: output, FH_KIND: kind }
  )
  if (r.code !== 0 || !existsSync(output)) {
    const msg = r.stderr.trim().split(/\r?\n/).filter(Boolean).pop()
    throw new Error(`${OFFICE_APP[kind]} での変換に失敗しました${msg ? `: ${msg}` : ''}`)
  }
}

/* ---------------- LibreOffice ---------------- */

async function convertWithLibreOffice(
  soffice: string,
  input: string,
  output: string
): Promise<void> {
  // 起動中の LibreOffice と競合しないよう、一時プロファイルと一時フォルダを使う
  const work = await fs.mkdtemp(join(tmpdir(), 'filehub-lo-'))
  try {
    const profile = pathToFileURL(join(work, 'profile')).href
    const r = await run(soffice, [
      `-env:UserInstallation=${profile}`,
      '--headless',
      '--norestore',
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

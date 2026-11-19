import { shell } from 'electron'
import { execFile } from 'child_process'
import { createWriteStream, existsSync, promises as fs } from 'fs'
import { basename, dirname, extname, join, relative, resolve, sep } from 'path'
import JSZip from 'jszip'
import type { ArchiveEntry, ArchiveListing } from '../shared/types'

/* ---------------- 共通 ---------------- */

const BAD_NAME = /[\\/:*?"<>|]/
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i

/** ファイル名・フォルダ名として使えるか (使えなければ理由を返す) */
export function checkName(name: string): string | null {
  const n = name.trim()
  if (!n) return '名前を入力してください'
  if (BAD_NAME.test(n)) return '\\ / : * ? " < > | は名前に使えません'
  if (n === '.' || n === '..') return 'この名前は使えません'
  if (RESERVED.test(n)) return 'Windows で予約されている名前のため使えません'
  if (/[. ]$/.test(n)) return '名前の最後にピリオドや空白は使えません'
  return null
}

/** 同じ名前があれば「名前 (2).ext」のように番号を付ける */
async function uniquePath(dir: string, name: string): Promise<string> {
  const ext = extname(name)
  const base = name.slice(0, name.length - ext.length)
  let target = join(dir, name)
  for (let i = 2; existsSync(target); i++) target = join(dir, `${base} (${i})${ext}`)
  return target
}

/** child が parent の中 (または同じ) か */
function isInsideOrSame(child: string, parent: string): boolean {
  const rel = relative(resolve(parent), resolve(child))
  return rel === '' || (!rel.startsWith('..') && !rel.includes(':') && !rel.startsWith(sep))
}

/* ---------------- 削除・名前の変更・移動 ---------------- */

/** ごみ箱に移す (完全には消さないので、Windows のごみ箱から元に戻せる) */
export async function trashPaths(paths: string[]): Promise<void> {
  for (const p of paths) await shell.trashItem(p)
}

export async function renamePath(p: string, newName: string): Promise<string> {
  const err = checkName(newName)
  if (err) throw new Error(err)
  const target = join(dirname(p), newName.trim())
  if (target === p) return p
  // 大文字・小文字だけの変更は、同じファイルなので許可する
  if (existsSync(target) && target.toLowerCase() !== p.toLowerCase())
    throw new Error('同じ名前のファイル・フォルダがあります')
  await fs.rename(p, target)
  return target
}

/** 移動 (移動先に同じ名前があれば番号を付ける)。移動後のパスを返す */
export async function movePaths(paths: string[], destDir: string): Promise<string[]> {
  const st = await fs.stat(destDir).catch(() => null)
  if (!st?.isDirectory()) throw new Error('移動先のフォルダが見つかりません')
  const out: string[] = []
  for (const p of paths) {
    if (resolve(dirname(p)) === resolve(destDir)) {
      out.push(p)
      continue
    }
    if (isInsideOrSame(destDir, p))
      throw new Error(`「${basename(p)}」を、その中のフォルダには移動できません`)
    const target = await uniquePath(destDir, basename(p))
    try {
      await fs.rename(p, target)
    } catch (e) {
      // 別のドライブへは rename できないので、コピーしてから元を消す
      if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e
      await fs.cp(p, target, { recursive: true, errorOnExist: true, force: false })
      await fs.rm(p, { recursive: true, force: true })
    }
    out.push(target)
  }
  return out
}

/* ---------------- 圧縮ファイル ---------------- */

export const ARCHIVE_EXTS = ['zip', '7z', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'xz']

/** Windows で作られた zip は、ファイル名が Shift_JIS のことが多い */
function decodeName(bytes: Uint8Array | string[] | string): string {
  if (typeof bytes === 'string') return bytes
  if (Array.isArray(bytes)) return bytes.join('')
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    try {
      return new TextDecoder('shift_jis').decode(bytes)
    } catch {
      return new TextDecoder('latin1').decode(bytes)
    }
  }
}

/** 1 GB を超える zip は、JSZip ではメモリに載せきれないため 7-Zip などに任せる */
const ZIP_IN_MEMORY_LIMIT = 1024 * 1024 * 1024

async function loadZip(p: string): Promise<JSZip> {
  return JSZip.loadAsync(await fs.readFile(p), { decodeFileName: decodeName })
}

/** zip の中身の一覧 (プレビュー用) */
export async function listArchive(p: string): Promise<ArchiveListing> {
  const ext = extname(p).slice(1).toLowerCase()
  const size = (await fs.stat(p)).size
  if (ext !== 'zip' || size > ZIP_IN_MEMORY_LIMIT)
    return { supported: false, entries: [], total: 0, sevenZip: !!find7z() }
  const zip = await loadZip(p)
  const map = new Map<string, ArchiveEntry>()
  zip.forEach((raw, f) => {
    const path = raw.replace(/\\/g, '/').replace(/^\/+/, '')
    if (!path) return
    // 内部のサイズ情報 (公開 API にはないため、ない場合は 0)
    const data = (f as unknown as { _data?: { uncompressedSize?: number } })._data
    map.set(path, { path, dir: f.dir, size: data?.uncompressedSize ?? 0, date: f.date.getTime() })
    // フォルダの項目がない zip もあるので、途中のフォルダを補う
    const parts = path.replace(/\/$/, '').split('/')
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/') + '/'
      if (!map.has(dir)) map.set(dir, { path: dir, dir: true, size: 0, date: f.date.getTime() })
    }
  })
  // フォルダの中身がフォルダの直後に来るよう、パスの順に並べる (同じ階層ではフォルダが先)
  const entries = [...map.values()].sort((a, b) => {
    const pa = a.path.replace(/\/$/, '').split('/')
    const pb = b.path.replace(/\/$/, '').split('/')
    for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
      if (pa[i] === pb[i]) continue
      const aDir = i < pa.length - 1 || a.dir
      const bDir = i < pb.length - 1 || b.dir
      if (aDir !== bDir) return aDir ? -1 : 1
      return pa[i].localeCompare(pb[i], 'ja', { numeric: true })
    }
    return pa.length - pb.length
  })
  return {
    supported: true,
    entries: entries.slice(0, 2000),
    total: entries.length,
    sevenZip: !!find7z()
  }
}

/** 7-Zip の場所 (なければ null) */
function find7z(): string | null {
  if (process.platform !== 'win32') return null
  for (const r of [process.env['ProgramFiles'], process.env['ProgramFiles(x86)']]) {
    if (!r) continue
    const p = join(r, '7-Zip', '7z.exe')
    if (existsSync(p)) return p
  }
  return null
}

function run(file: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((res, rej) =>
    execFile(
      file,
      args,
      { windowsHide: true, cwd, maxBuffer: 16 * 1024 * 1024, timeout: 30 * 60 * 1000 },
      (err, _o, stderr) =>
        err
          ? rej(
              new Error(
                String(stderr || err.message)
                  .trim()
                  .split(/\r?\n/)
                  .pop()
              )
            )
          : res()
    )
  )
}

/**
 * 圧縮ファイルを展開する。展開先は同じ場所の「圧縮ファイル名」フォルダ。
 * 中身が 1 つのフォルダだけなら、二重のフォルダにならないよう、そのフォルダを置く。
 * 展開したフォルダのパスを返す。
 */
export async function extractArchive(p: string): Promise<string> {
  const dir = dirname(p)
  const ext = extname(p).slice(1).toLowerCase()
  const stem = basename(p).replace(/\.(tar\.(gz|bz2|xz)|[^.]+)$/i, '')
  const size = (await fs.stat(p)).size

  // まず一時フォルダに展開してから、最後に名前を付けて移す
  const work = await fs.mkdtemp(join(dir, '.filehub-extract-'))
  try {
    if (ext === 'zip' && size <= ZIP_IN_MEMORY_LIMIT) await extractZip(p, work)
    else {
      const seven = find7z()
      if (seven) await run(seven, ['x', '-y', '-bd', `-o${work}`, p])
      else if (
        process.platform === 'win32' &&
        ['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar'].includes(ext)
      )
        // Windows 標準の tar (bsdtar)。7z・rar は Windows のバージョンによっては使えない
        await run('tar.exe', ['-xf', p, '-C', work]).catch((e) => {
          throw new Error(
            ext === '7z' || ext === 'rar'
              ? `${ext} の展開には 7-Zip（https://7-zip.org/）が必要です`
              : (e as Error).message,
            { cause: e }
          )
        })
      else throw new Error(`${ext} の展開には 7-Zip（https://7-zip.org/）が必要です`)
    }

    const items = await fs.readdir(work)
    if (items.length === 0) throw new Error('展開するファイルがありませんでした')
    // 中身が 1 つのフォルダだけなら、それをそのまま置く
    if (items.length === 1 && (await fs.stat(join(work, items[0]))).isDirectory()) {
      const target = await uniquePath(dir, items[0])
      await fs.rename(join(work, items[0]), target)
      return target
    }
    const target = await uniquePath(dir, stem || 'extracted')
    await fs.rename(work, target)
    return target
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {})
  }
}

async function extractZip(p: string, dest: string): Promise<void> {
  const zip = await loadZip(p)
  const root = resolve(dest)
  const files = Object.values(zip.files)
  for (const f of files) {
    // 「../」や絶対パスで展開先の外に書き出そうとするもの (zip slip) は無視する
    const name = f.name.replace(/\\/g, '/').replace(/^\/+/, '')
    const target = resolve(root, ...name.split('/').filter((s) => s && s !== '.'))
    if (!isInsideOrSame(target, root) || target === root) continue
    if (f.dir) {
      await fs.mkdir(target, { recursive: true })
      continue
    }
    await fs.mkdir(dirname(target), { recursive: true })
    await fs.writeFile(target, await f.async('nodebuffer'))
    await fs.utimes(target, f.date, f.date).catch(() => {})
  }
}

/** フォルダの中身を zip に追加する */
async function addToZip(zip: JSZip, p: string, name: string): Promise<void> {
  const st = await fs.stat(p)
  if (st.isDirectory()) {
    const folder = zip.folder(name)!
    for (const child of await fs.readdir(p)) await addToZip(folder, join(p, child), child)
  } else {
    zip.file(name, await fs.readFile(p), { date: st.mtime })
  }
}

/** zip に圧縮する。1 つならその名前、複数ならフォルダ名で作る。作った zip のパスを返す */
export async function compressPaths(paths: string[]): Promise<string> {
  if (paths.length === 0) throw new Error('圧縮するものを選んでください')
  const dir = dirname(paths[0])
  const zip = new JSZip()
  for (const p of paths) await addToZip(zip, p, basename(p))
  const name =
    paths.length === 1
      ? `${basename(paths[0]).replace(/\.[^.]+$/, '') || basename(paths[0])}.zip`
      : `${basename(dir) || 'まとめ'}.zip`
  const target = await uniquePath(dir, name)
  await new Promise<void>((res, rej) => {
    zip
      .generateNodeStream({
        type: 'nodebuffer',
        streamFiles: true,
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      })
      .pipe(createWriteStream(target))
      .on('finish', () => res())
      .on('error', rej)
  })
  return target
}

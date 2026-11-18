import { promises as fs } from 'fs'
import { join, extname, relative } from 'path'
import type { FsEntry, ScanResult } from '../shared/types'

const IGNORED_NAMES = new Set(['desktop.ini', 'thumbs.db', '.ds_store'])
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '$recycle.bin',
  'system volume information',
  '__pycache__',
  '.venv',
  'dist',
  'out',
  'build'
])

function isIgnoredFile(name: string): boolean {
  const lower = name.toLowerCase()
  // Office が作る一時ロックファイル (~$xxx.docx) は除外
  return IGNORED_NAMES.has(lower) || name.startsWith('~$')
}

function extOf(name: string): string {
  return extname(name).replace(/^\./, '').toLowerCase()
}

async function toEntry(dir: string, name: string, isDir: boolean): Promise<FsEntry | null> {
  const p = join(dir, name)
  try {
    const st = await fs.stat(p)
    return {
      name,
      path: p,
      isDir,
      ext: isDir ? '' : extOf(name),
      size: isDir ? 0 : st.size,
      mtime: st.mtimeMs
    }
  } catch {
    return null
  }
}

/** フォルダ直下の一覧 (フォルダ → ファイルの順) */
export async function listDir(dir: string): Promise<FsEntry[]> {
  const dirents = await fs.readdir(dir, { withFileTypes: true })
  const items = await Promise.all(
    dirents
      .filter((d) => (d.isDirectory() ? true : d.isFile() && !isIgnoredFile(d.name)))
      .map((d) => toEntry(dir, d.name, d.isDirectory()))
  )
  return (items.filter(Boolean) as FsEntry[]).sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name, 'ja', { numeric: true })
  })
}

/** サブフォルダを含めてファイルを再帰的に列挙 */
export async function scanDir(root: string, maxFiles = 5000, maxDepth = 10): Promise<ScanResult> {
  const entries: FsEntry[] = []
  let truncated = false
  const queue: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }]

  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!
    let dirents
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const d of dirents) {
      if (d.isDirectory()) {
        const lower = d.name.toLowerCase()
        if (depth < maxDepth && !IGNORED_DIRS.has(lower) && !d.name.startsWith('.')) {
          queue.push({ dir: join(dir, d.name), depth: depth + 1 })
        }
      } else if (d.isFile() && !isIgnoredFile(d.name)) {
        const e = await toEntry(dir, d.name, false)
        if (e) {
          e.rel = relative(root, dir)
          entries.push(e)
          if (entries.length >= maxFiles) {
            truncated = true
            return { entries, truncated }
          }
        }
      }
    }
  }
  return { entries, truncated }
}

const MAX_READ = 150 * 1024 * 1024

export async function readBytes(p: string, limit = MAX_READ): Promise<Buffer> {
  const st = await fs.stat(p)
  if (st.size > limit) {
    // 上限を超える場合は先頭だけ読む
    const fh = await fs.open(p, 'r')
    try {
      const buf = Buffer.alloc(limit)
      await fh.read(buf, 0, limit, 0)
      return buf
    } finally {
      await fh.close()
    }
  }
  return fs.readFile(p)
}

/** フォルダを作成する (同じ名前があればエラー) */
export async function createFolder(parent: string, name: string): Promise<string> {
  const clean = name.trim().replace(/[\\/:*?"<>|]/g, '_')
  if (!clean || clean === '.' || clean === '..') throw new Error('フォルダ名を入力してください')
  const target = join(parent, clean)
  try {
    await fs.mkdir(target)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST')
      throw new Error('同じ名前のフォルダ・ファイルがあります', { cause: e })
    throw e
  }
  return target
}

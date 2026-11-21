/**
 * ファイル一括整理の「計画」を扱う関数 (画面側)。
 *
 * 計画のパスはすべて「実行前の実際の場所 (元の場所)」で持つ。
 * 左側の「整理後」の画面は、元の場所の一覧に計画を重ねて作る仮想の一覧で、
 * 仮想のパス ⇔ 元の場所 を virt() / origOf() で行き来する。
 */
import type { FsEntry, OrganizePlan } from '../../../shared/types'

export interface PlanMove {
  /** 元の場所 */
  from: string
  /** 移動先フォルダ (元の場所で表す。新しく作るフォルダでもよい) */
  toDir: string
  /** 移動先での名前 (重なるときは番号付き) */
  name: string
  isDir: boolean
}

export interface Plan {
  /** 新しく作るフォルダ (元の場所で表す) */
  mkdirs: string[]
  moves: PlanMove[]
}

export const EMPTY_PLAN: Plan = { mkdirs: [], moves: [] }

export type VStatus = 'keep' | 'new' | 'moved'

export interface VEntry {
  name: string
  /** 元の場所 (新しいフォルダは作る予定の場所) */
  orig: string
  isDir: boolean
  status: VStatus
  entry?: FsEntry
}

/* ---------------- パス ---------------- */

const SEP_RE = /[\\/]/

function sepOf(p: string): string {
  return p.includes('\\') && !p.includes('/') ? '\\' : '/'
}

function trimEnd(p: string): string {
  // "C:\" や "/" はそのまま
  if (/^[A-Za-z]:[\\/]?$/.test(p) || p === '/') return p
  return p.replace(/[\\/]+$/, '')
}

export function pjoin(dir: string, name: string): string {
  const d = trimEnd(dir)
  return /[\\/]$/.test(d) ? d + name : d + sepOf(d) + name
}

export function pdirname(p: string): string {
  const t = trimEnd(p)
  const i = Math.max(t.lastIndexOf('/'), t.lastIndexOf('\\'))
  if (i < 0) return t
  if (i === 0) return t[0] // "/foo" → "/"
  if (/^[A-Za-z]:$/.test(t.slice(0, i))) return t.slice(0, i + 1) // "C:\foo" → "C:\"
  return t.slice(0, i)
}

export function pbasename(p: string): string {
  const t = trimEnd(p)
  const parts = t.split(SEP_RE)
  return parts[parts.length - 1] || t
}

function isRoot(p: string): boolean {
  return pdirname(p) === trimEnd(p)
}

/** Windows・Mac は大文字と小文字を区別しないので、比べるときは小文字にそろえる */
const fold = (s: string): string => s.toLowerCase()

/** child が parent の中か (同じは含まない) */
export function isInside(child: string, parent: string): boolean {
  const c = trimEnd(child)
  const pr = trimEnd(parent)
  if (c.length <= pr.length || !c.startsWith(pr)) return false
  return /[\\/]$/.test(pr) || SEP_RE.test(c[pr.length])
}

/* ---------------- 仮想パス ⇔ 元の場所 ---------------- */

/** 元の場所 → 整理後の場所 */
export function virt(plan: Plan, orig: string, depth = 0): string {
  if (depth > 64) return orig
  let best: PlanMove | null = null
  for (const m of plan.moves)
    if ((orig === m.from || isInside(orig, m.from)) && (!best || m.from.length > best.from.length))
      best = m
  // 自分も親も移動しないなら、場所は変わらない
  if (!best) return orig
  const rest = orig.slice(best.from.length)
  return pjoin(virt(plan, best.toDir, depth + 1), best.name) + rest
}

/** 整理後の場所 → 元の場所 */
export function origOf(plan: Plan, v: string, depth = 0): string {
  if (depth > 256 || isRoot(v) || (plan.moves.length === 0 && plan.mkdirs.length === 0)) return v
  const parent = origOf(plan, pdirname(v), depth + 1)
  const name = pbasename(v)
  const m = plan.moves.find((x) => x.toDir === parent && fold(x.name) === fold(name))
  return m ? m.from : pjoin(parent, name)
}

/** 新しく作るフォルダか (またはその中か) */
export function isPlannedDir(plan: Plan, orig: string): boolean {
  return plan.mkdirs.some((d) => d === orig || isInside(orig, d))
}

/* ---------------- 整理後の一覧 ---------------- */

/**
 * 整理後のフォルダ (元の場所 origDir) の中身。
 * real は origDir の実際の一覧 (新しいフォルダなら空)
 */
export function virtualChildren(plan: Plan, origDir: string, real: FsEntry[]): VEntry[] {
  const movedAway = new Set(plan.moves.map((m) => m.from))
  const out: VEntry[] = []
  for (const e of real)
    if (!movedAway.has(e.path))
      out.push({ name: e.name, orig: e.path, isDir: e.isDir, status: 'keep', entry: e })
  for (const d of plan.mkdirs)
    if (pdirname(d) === origDir)
      out.push({ name: pbasename(d), orig: d, isDir: true, status: 'new' })
  for (const m of plan.moves)
    if (m.toDir === origDir)
      out.push({ name: m.name, orig: m.from, isDir: m.isDir, status: 'moved' })
  return out.sort((a, b) =>
    a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name, 'ja', { numeric: true })
  )
}

/** 同じ名前があれば「名前 (2).ext」にする (大文字・小文字は区別しない) */
export function uniqueName(name: string, taken: Iterable<string>, isDir: boolean): string {
  const set = new Set([...taken].map(fold))
  if (!set.has(fold(name))) return name
  const dot = isDir ? -1 : name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let i = 2; ; i++) {
    const n = `${base} (${i})${ext}`
    if (!set.has(fold(n))) return n
  }
}

/* ---------------- 計画の変更 ---------------- */

const BAD_NAME = /[\\/:*?"<>|]/

export function checkFolderName(name: string): string | null {
  if (!name) return '名前が空です'
  if (BAD_NAME.test(name)) return `「${name}」: \\ / : * ? " < > | は使えません`
  if (name === '.' || name === '..') return `「${name}」は使えません`
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(name))
    return `「${name}」は Windows で予約されています`
  if (/[. ]$/.test(name)) return `「${name}」: 最後にピリオドや空白は使えません`
  return null
}

/** フォルダ名を区切る (改行・カンマ・読点) */
export function splitNames(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\n,、，]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  ]
}

/** 整理後のフォルダ origDir の中に、新しいフォルダを作る */
export function addDirs(
  plan: Plan,
  origDir: string,
  names: string[],
  existing: VEntry[]
): { plan: Plan; error: string | null; added: number } {
  const taken = new Set(existing.map((e) => fold(e.name)))
  const mkdirs = [...plan.mkdirs]
  const errors: string[] = []
  let added = 0
  for (const n of names) {
    const bad = checkFolderName(n)
    if (bad) errors.push(bad)
    else if (taken.has(fold(n))) errors.push(`「${n}」はすでにあります`)
    else {
      taken.add(fold(n))
      mkdirs.push(pjoin(origDir, n))
      added++
    }
  }
  return { plan: { ...plan, mkdirs }, error: errors.length ? errors.join(' / ') : null, added }
}

/**
 * item (元の場所) を、整理後のフォルダ toOrig の中へ移す。
 * siblings は移動先の今の中身 (名前の重なりを避けるため)
 */
export function addMove(
  plan: Plan,
  item: { path: string; name: string; isDir: boolean },
  toOrig: string,
  siblings: VEntry[]
): { plan: Plan; error: string | null } {
  const itemV = virt(plan, item.path)
  const toV = virt(plan, toOrig)
  if (item.isDir && (toV === itemV || isInside(toV, itemV)))
    return { plan, error: `「${item.name}」を、その中のフォルダには移動できません` }

  const moves = plan.moves.filter((m) => m.from !== item.path)
  // すでにその場所にある
  const current = plan.moves.find((m) => m.from === item.path)
  if (current ? current.toDir === toOrig : pdirname(item.path) === toOrig)
    return { plan, error: null }

  // 元のフォルダに戻すだけなら、移動の予定を消す
  if (pdirname(item.path) === toOrig) {
    const clash = plan.moves.some((m) => m.toDir === toOrig && fold(m.name) === fold(item.name))
    if (!clash) return { plan: { ...plan, moves }, error: null }
  }
  const taken = siblings.filter((s) => s.orig !== item.path).map((s) => s.name)
  const name = uniqueName(item.name, taken, item.isDir)
  return {
    plan: {
      ...plan,
      moves: [...moves, { from: item.path, toDir: toOrig, name, isDir: item.isDir }]
    },
    error: null
  }
}

/** 移動の予定を取り消す */
export function undoMove(plan: Plan, from: string): Plan {
  return { ...plan, moves: plan.moves.filter((m) => m.from !== from) }
}

/** 新しいフォルダの予定を取り消す (中に入れる予定だったものも元に戻す) */
export function removeDir(plan: Plan, dir: string): { plan: Plan; affected: number } {
  const inside = (p: string): boolean => p === dir || isInside(p, dir)
  const mkdirs = plan.mkdirs.filter((d) => !inside(d))
  const moves = plan.moves.filter((m) => !inside(m.toDir))
  return {
    plan: { mkdirs, moves },
    affected: plan.mkdirs.length - mkdirs.length - 1 + (plan.moves.length - moves.length)
  }
}

export function toOrganizePlan(plan: Plan): OrganizePlan {
  return {
    mkdirs: plan.mkdirs,
    moves: plan.moves.map(({ from, toDir, name }) => ({ from, toDir, name }))
  }
}

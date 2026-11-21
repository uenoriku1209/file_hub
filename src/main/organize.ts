/**
 * ファイル一括整理の実行。
 *
 * 計画は「実行前の場所」で書かれているので、移動を 1 つ行うたびに
 * 「元の場所 → 今の場所」の対応を記録し、後の操作のパスを読み替えていく。
 * (先にフォルダ A を移動しても、A の中のファイルの移動や A の中への移動が正しく行える)
 */
import { existsSync, promises as fs } from 'fs'
import { basename, dirname, join, resolve, sep } from 'path'
import { checkName, isInsideOrSame, moveOne, uniquePath } from './fileManage'
import type { OrganizePlan, OrganizeResult } from '../shared/types'

export async function applyOrganize(plan: OrganizePlan): Promise<OrganizeResult> {
  const result: OrganizeResult = { created: 0, moved: 0, renamed: [], errors: [] }
  /** 実行済みの移動 (実際のパス)。順番に当てはめると今の場所が分かる */
  const done: { src: string; dst: string }[] = []
  const now = (orig: string): string => {
    let p = resolve(orig)
    for (const d of done) {
      if (p === d.src) p = d.dst
      else if (p.startsWith(d.src + sep)) p = d.dst + p.slice(d.src.length)
    }
    return p
  }

  // 1. フォルダを作る (親から順に)。移動前の場所に作れば、親と一緒に移動される
  const dirs = [...new Set(plan.mkdirs.map((d) => resolve(d)))].sort(
    (a, b) => a.split(sep).length - b.split(sep).length
  )
  for (const d of dirs) {
    const bad = checkName(basename(d))
    if (bad) {
      result.errors.push({ path: d, message: bad })
      continue
    }
    try {
      if (existsSync(d)) {
        if (!(await fs.stat(d)).isDirectory()) throw new Error('同じ名前のファイルがあります')
      } else {
        await fs.mkdir(d, { recursive: true })
        result.created++
      }
    } catch (e) {
      result.errors.push({ path: d, message: (e as Error).message })
    }
  }

  // 2. 計画の順に移動する
  for (const m of plan.moves) {
    try {
      const bad = checkName(m.name)
      if (bad) throw new Error(bad)
      const src = now(m.from)
      const destDir = now(m.toDir)
      if (!existsSync(src))
        throw new Error('移動元が見つかりません（すでに移動・削除された可能性があります）')
      const st = await fs.stat(destDir).catch(() => null)
      if (!st?.isDirectory()) throw new Error('移動先のフォルダが見つかりません')
      if (isInsideOrSame(destDir, src))
        throw new Error('フォルダを、その中のフォルダには移動できません')
      if (resolve(dirname(src)) === resolve(destDir) && basename(src) === m.name) continue

      const wanted = join(destDir, m.name)
      const target = existsSync(wanted) ? await uniquePath(destDir, m.name) : wanted
      await moveOne(src, target)
      done.push({ src, dst: target })
      result.moved++
      if (target !== wanted) result.renamed.push({ from: m.from, to: target })
    } catch (e) {
      result.errors.push({ path: m.from, message: (e as Error).message })
    }
  }
  return result
}

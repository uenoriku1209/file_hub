/** Office / Code 画面の 3 つの欄 (フォルダ・ファイル・プレビュー) の並びと大きさ */

export type PaneId = 'tree' | 'list' | 'panel'
export type BrowserPage = 'office' | 'code'

export const PANES: PaneId[] = ['tree', 'list', 'panel']

export const PANE_LABEL: Record<PaneId, string> = {
  tree: 'フォルダ',
  list: 'ファイル',
  panel: 'プレビュー'
}

export interface PaneLayout {
  /** しまった (左のタブに入れた) 欄 */
  hidden: PaneId[]
  /** 表示中の欄どうしの幅の比率 */
  sizes: Record<PaneId, number>
}

/** 3 つそろったときの標準の比率 */
export const DEFAULT_SIZES: Record<PaneId, number> = { tree: 0.18, list: 0.35, panel: 0.47 }

export function defaultLayout(): PaneLayout {
  return { hidden: [], sizes: { ...DEFAULT_SIZES } }
}

export function visiblePanes(l: PaneLayout): PaneId[] {
  return PANES.filter((id) => !l.hidden.includes(id))
}

/** 表示中の欄の数に応じた比率 (1 つ: 全体 / 2 つ: 1:1 / 3 つ: 標準) */
function sizesFor(visible: PaneId[]): Record<PaneId, number> {
  if (visible.length >= 3) return { ...DEFAULT_SIZES }
  const sizes = { tree: 0, list: 0, panel: 0 }
  for (const id of visible) sizes[id] = 1 / visible.length
  return sizes
}

/** しまった欄を元に戻す */
export function restorePane(l: PaneLayout, id: PaneId): PaneLayout {
  const hidden = l.hidden.filter((x) => x !== id)
  return { hidden, sizes: sizesFor(PANES.filter((x) => !hidden.includes(x))) }
}

/** 欄をしまう (空いた幅は隣の欄が使う)。最後の 1 つはしまえない */
export function hidePane(l: PaneLayout, id: PaneId): PaneLayout {
  const visible = visiblePanes(l)
  if (!visible.includes(id) || visible.length <= 1) return l
  const i = visible.indexOf(id)
  const neighbor = visible[i + 1] ?? visible[i - 1]
  const sizes = { ...l.sizes }
  sizes[neighbor] += sizes[id]
  sizes[id] = 0
  return { hidden: [...l.hidden, id], sizes }
}

/** 保存されていた値を読み込む (壊れていたら標準に戻す) */
export function parseLayout(text: string | null): PaneLayout {
  try {
    const v = JSON.parse(text ?? '') as PaneLayout
    const hidden = (Array.isArray(v.hidden) ? v.hidden : []).filter((x) => PANES.includes(x))
    if (hidden.length >= PANES.length) return defaultLayout()
    const sizes = { ...DEFAULT_SIZES }
    for (const id of PANES) {
      const n = Number(v.sizes?.[id])
      if (Number.isFinite(n) && n >= 0) sizes[id] = n
    }
    const visible = PANES.filter((x) => !hidden.includes(x))
    if (visible.some((id) => sizes[id] <= 0)) return { hidden, sizes: sizesFor(visible) }
    return { hidden, sizes }
  } catch {
    return defaultLayout()
  }
}

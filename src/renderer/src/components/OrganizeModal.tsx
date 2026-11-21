import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Folder,
  File,
  FileArchive,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  Presentation,
  LayoutPanelLeft,
  Loader2,
  RotateCcw,
  Undo2,
  X
} from 'lucide-react'
import type { FsEntry, OrganizeResult } from '../../../shared/types'
import { CODE_CATEGORIES, OFFICE_CATEGORIES, categoryOf } from '../lib/fileTypes'
import { errorMessage } from '../lib/format'
import { useToast } from '../lib/toast'
import {
  EMPTY_PLAN,
  addDirs,
  addMove,
  isInside,
  isPlannedDir,
  origOf,
  pbasename,
  pdirname,
  removeDir,
  splitNames,
  toOrganizePlan,
  undoMove,
  virt,
  virtualChildren,
  type Plan,
  type VEntry
} from '../lib/organize'

const ALL_CATEGORIES = [...OFFICE_CATEGORIES, ...CODE_CATEGORIES]
const NO_ENTRIES: FsEntry[] = []

function FileIcon({ name, size }: { name: string; size: number }): React.JSX.Element {
  const dot = name.lastIndexOf('.')
  const cat = dot > 0 ? categoryOf(name.slice(dot + 1).toLowerCase(), ALL_CATEGORIES) : undefined
  const style = cat ? { color: cat.color } : undefined
  switch (cat?.id) {
    case 'pdf':
      return <FileType2 size={size} style={style} />
    case 'word':
    case 'text':
      return <FileText size={size} style={style} />
    case 'excel':
      return <FileSpreadsheet size={size} style={style} />
    case 'ppt':
      return <Presentation size={size} style={style} />
    case 'image':
      return <FileImage size={size} style={style} />
    case 'archive':
      return <FileArchive size={size} style={style} />
    case undefined:
      return <File size={size} />
    default:
      return <FileCode2 size={size} style={style} />
  }
}

interface Props {
  /** 最初に開くフォルダ (左右とも) */
  startDir: string
  /** 右側でこれより上には行かない (なければ制限なし) */
  rootDir: string | null
  onClose: () => void
  /** 実行したあと (一覧の再読み込み用) */
  onApplied: () => void
}

/** 実際のフォルダの一覧を読み、使い回す */
function useListings(): {
  get: (dir: string) => FsEntry[] | undefined
  load: (dir: string) => void
  errors: Map<string, string>
  clear: () => void
} {
  const [cache, setCache] = useState(() => new Map<string, FsEntry[]>())
  const [errors, setErrors] = useState(() => new Map<string, string>())
  const [loading] = useState(() => new Set<string>())
  const load = useCallback(
    (dir: string) => {
      if (cache.has(dir) || loading.has(dir)) return
      loading.add(dir)
      window.api
        .listDir(dir)
        .then((list) => setCache((c) => new Map(c).set(dir, list)))
        .catch((e) => {
          setCache((c) => new Map(c).set(dir, []))
          setErrors((m) => new Map(m).set(dir, errorMessage(e)))
        })
        .finally(() => loading.delete(dir))
    },
    [cache, loading]
  )
  return {
    get: (dir) => cache.get(dir),
    load,
    errors,
    clear: () => {
      setCache(new Map())
      setErrors(new Map())
    }
  }
}

/** パンくず (base から dir までの各フォルダ) */
function crumbs(base: string, dir: string): string[] {
  const out = [dir]
  let cur = dir
  while (cur !== base && isInside(cur, base)) {
    cur = pdirname(cur)
    out.unshift(cur)
  }
  return out
}

function Breadcrumb({
  base,
  dir,
  onGo
}: {
  base: string
  dir: string
  onGo: (d: string) => void
}): React.JSX.Element {
  const list = crumbs(base, dir)
  return (
    <div className="org-crumbs">
      <button
        className="btn-icon small"
        disabled={list.length < 2}
        title="ひとつ上へ"
        onClick={() => onGo(list[list.length - 2])}
      >
        <ArrowUp size={14} />
      </button>
      {list.map((d, i) => (
        <span key={d} className="org-crumb">
          {i > 0 && <ChevronRight size={13} />}
          <button
            className={i === list.length - 1 ? 'current' : ''}
            onClick={() => onGo(d)}
            title={d}
          >
            {pbasename(d) || d}
          </button>
        </span>
      ))}
    </div>
  )
}

export function OrganizeModal({ startDir, rootDir, onClose, onApplied }: Props): React.JSX.Element {
  const toast = useToast()
  const lists = useListings()
  const [plan, setPlan] = useState<Plan>(EMPTY_PLAN)

  // 左: 整理後 (仮想のパス) / 右: 今の状態 (実際のパス)
  const [leftBase, setLeftBase] = useState(startDir)
  const [leftDir, setLeftDir] = useState(startDir)
  const [rightDir, setRightDir] = useState(startDir)
  const rightBase =
    rootDir && (rootDir === startDir || isInside(startDir, rootDir)) ? rootDir : startDir

  const [names, setNames] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<OrganizeResult | null>(null)

  /* ---------- 左: 整理後 ---------- */
  const leftOrig = origOf(plan, leftDir)
  const leftIsNew = isPlannedDir(plan, leftOrig)
  const { load } = lists
  useEffect(() => {
    if (!leftIsNew) load(leftOrig)
  }, [leftOrig, leftIsNew, load])
  const leftReal = leftIsNew ? NO_ENTRIES : lists.get(leftOrig)
  const leftItems = useMemo(
    () => (leftReal ? virtualChildren(plan, leftOrig, leftReal) : null),
    [plan, leftOrig, leftReal]
  )

  /* ---------- 右: 今の状態 ---------- */
  useEffect(() => load(rightDir), [rightDir, load])
  const rightItems = lists.get(rightDir)
  const moveOf = useMemo(() => new Map(plan.moves.map((m) => [m.from, m])), [plan])

  /* ---------- 操作 ---------- */
  const addFolders = (): void => {
    const list = splitNames(names)
    if (!list.length || !leftItems) return
    const r = addDirs(plan, leftOrig, list, leftItems)
    setPlan(r.plan)
    if (r.error) toast('error', r.error)
    if (r.added) setNames('')
  }

  const moveItems = (items: FsEntry[]): void => {
    if (!leftItems || !items.length) return
    let p = plan
    let sib = leftItems
    const errors: string[] = []
    for (const it of items) {
      const r = addMove(p, it, leftOrig, sib)
      if (r.error) errors.push(r.error)
      p = r.plan
      sib = virtualChildren(p, leftOrig, leftReal ?? [])
    }
    setPlan(p)
    setSelected(new Set())
    if (errors.length) toast('error', errors.join(' / '))
  }

  /** 予定を変えたとき、左で開いているフォルダがその中なら外に出る */
  const leaveIfInside = (orig: string): void => {
    const v = virt(plan, orig)
    if (leftDir === v || isInside(leftDir, v)) setLeftDir(pdirname(v))
  }

  const undo = (v: VEntry): void => {
    if (v.status === 'moved') {
      leaveIfInside(v.orig)
      setPlan(undoMove(plan, v.orig))
    } else if (v.status === 'new') {
      const r = removeDir(plan, v.orig)
      if (
        r.affected > 0 &&
        !confirm(
          `「${v.name}」の中に入れる予定のもの（${r.affected} 件）も元に戻します。よろしいですか？`
        )
      )
        return
      leaveIfInside(v.orig)
      setPlan(r.plan)
    }
  }

  const reset = (): void => {
    if (!dirty || confirm('作ったフォルダと移動の予定をすべて取り消して、初期状態に戻しますか？')) {
      setPlan(EMPTY_PLAN)
      setSelected(new Set())
      setLeftDir(leftBase)
    }
  }

  const dirty = plan.mkdirs.length > 0 || plan.moves.length > 0
  const close = (): void => {
    if (applying) return
    if (dirty && !result && !confirm('整理の予定は保存されません。閉じますか？')) return
    onClose()
  }

  const apply = async (): Promise<void> => {
    if (!dirty) return
    const lines = [
      ...plan.mkdirs.slice(0, 8).map((d) => `＋ ${virt(plan, d)}`),
      ...plan.moves.slice(0, 8).map((m) => `→ ${pbasename(m.from)} を ${virt(plan, m.toDir)} へ`)
    ]
    const more = plan.mkdirs.length + plan.moves.length - lines.length
    if (
      !confirm(
        `次の内容で実行します。\n\n新しいフォルダ: ${plan.mkdirs.length} 件\n移動: ${plan.moves.length} 件\n\n${lines.join('\n')}${more > 0 ? `\n…ほか ${more} 件` : ''}`
      )
    )
      return
    setApplying(true)
    try {
      const r = await window.api.organize(toOrganizePlan(plan))
      setResult(r)
      onApplied()
      if (r.errors.length === 0) {
        toast('success', `フォルダを ${r.created} 件作成し、${r.moved} 件を移動しました`)
        onClose()
      }
    } catch (e) {
      toast('error', errorMessage(e))
    } finally {
      setApplying(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const pickLeftBase = async (): Promise<void> => {
    const d = await window.api.selectFolder('整理先のフォルダを選ぶ')
    if (!d) return
    if (dirty && !confirm('整理先を変えると、今の予定はすべて取り消されます。よろしいですか？'))
      return
    setPlan(EMPTY_PLAN)
    setLeftBase(d)
    setLeftDir(d)
  }

  const selectable = (rightItems ?? []).filter((e) => {
    const target = virt(plan, e.path)
    return pdirname(target) !== leftDir // すでに左で開いているフォルダにあるものは除く
  })
  const allChecked = selectable.length > 0 && selectable.every((e) => selected.has(e.path))
  const chosen = (rightItems ?? []).filter((e) => selected.has(e.path))

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal organize-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>
            <LayoutPanelLeft size={18} /> ファイル一括整理
          </h2>
          <button className="btn-icon" onClick={close} disabled={applying} title="閉じる">
            <X size={16} />
          </button>
        </div>

        <div className="organize-body">
          {/* ---------------- 左: 整理後 ---------------- */}
          <section className="org-pane left">
            <div className="org-pane-head">
              <div className="org-pane-title">
                <FolderInput size={16} /> 整理後
                <span className="muted small-text">（← で入れる先）</span>
              </div>
              <button className="btn small" onClick={pickLeftBase} title={leftBase}>
                <FolderOpen size={14} /> 場所を変更
              </button>
            </div>
            <Breadcrumb base={leftBase} dir={leftDir} onGo={setLeftDir} />
            <div className="org-newdirs">
              <textarea
                className="input"
                rows={2}
                value={names}
                placeholder={`「${pbasename(leftDir)}」の中に作るフォルダ名（複数は改行・カンマで区切る）`}
                onChange={(e) => setNames(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    addFolders()
                  }
                }}
              />
              <button
                className="btn btn-primary"
                disabled={!splitNames(names).length}
                onClick={addFolders}
              >
                <FolderPlus size={15} /> 作成
              </button>
            </div>
            <div className="org-list">
              {!leftItems && (
                <div className="state small">
                  <Loader2 size={16} className="spin" /> 読み込み中…
                </div>
              )}
              {leftItems?.length === 0 && (
                <div className="org-empty">
                  空のフォルダです。右の ← で、ここにファイルやフォルダを入れられます。
                </div>
              )}
              {leftItems?.map((v) => (
                <div
                  key={`${v.status}-${v.orig}`}
                  className={`org-row ${v.status} ${v.isDir ? 'dir' : ''}`}
                  onDoubleClick={() => v.isDir && setLeftDir(virt(plan, v.orig))}
                >
                  <span className="org-icon">
                    {v.isDir ? <Folder size={16} /> : <FileIcon name={v.name} size={16} />}
                  </span>
                  {v.isDir ? (
                    <button
                      className="org-name link"
                      onClick={() => setLeftDir(virt(plan, v.orig))}
                    >
                      {v.name}
                    </button>
                  ) : (
                    <span className="org-name">{v.name}</span>
                  )}
                  {v.status === 'new' && <span className="org-badge new">新規</span>}
                  {v.status === 'moved' && (
                    <span className="org-badge moved" title={`元の場所: ${v.orig}`}>
                      移動予定
                    </span>
                  )}
                  {v.status !== 'keep' && (
                    <button className="btn-icon small" title="取り消す" onClick={() => undo(v)}>
                      <Undo2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ---------------- 右: 今の状態 ---------------- */}
          <section className="org-pane right">
            <div className="org-pane-head">
              <div className="org-pane-title">
                <Folder size={16} /> 今のフォルダとファイル
              </div>
              <button
                className="btn small btn-primary"
                disabled={chosen.length === 0}
                onClick={() => moveItems(chosen)}
                title={`選んだものを「${pbasename(leftDir)}」へ`}
              >
                <ArrowLeft size={14} /> 選んだ {chosen.length} 件を移動
              </button>
            </div>
            <Breadcrumb
              base={rightBase}
              dir={rightDir}
              onGo={(d) => (setRightDir(d), setSelected(new Set()))}
            />
            <label className="check compact org-all">
              <input
                type="checkbox"
                checked={allChecked}
                disabled={selectable.length === 0}
                onChange={(e) =>
                  setSelected(e.target.checked ? new Set(selectable.map((x) => x.path)) : new Set())
                }
              />
              すべて選ぶ
            </label>
            <div className="org-list">
              {!rightItems && (
                <div className="state small">
                  <Loader2 size={16} className="spin" /> 読み込み中…
                </div>
              )}
              {lists.errors.get(rightDir) && (
                <p className="form-error">{lists.errors.get(rightDir)}</p>
              )}
              {rightItems?.length === 0 && <div className="org-empty">このフォルダは空です</div>}
              {!!rightItems?.length && selectable.length === 0 && (
                <div className="org-hint">
                  ここにあるものは、すべて左で開いているフォルダの中です。左でフォルダを作って開くと、←
                  でそこへ移動できます。
                </div>
              )}
              {rightItems?.map((e) => {
                const m = moveOf.get(e.path)
                const here = pdirname(virt(plan, e.path)) === leftDir
                return (
                  <div
                    key={e.path}
                    className={`org-row ${m ? 'planned' : ''} ${selected.has(e.path) ? 'selected' : ''}`}
                  >
                    <button
                      className="btn-icon small org-move"
                      title={
                        here
                          ? '左で開いているフォルダにあります'
                          : `「${pbasename(leftDir)}」へ移動`
                      }
                      disabled={here}
                      onClick={() => moveItems([e])}
                    >
                      <ArrowLeft size={15} />
                    </button>
                    <input
                      type="checkbox"
                      checked={selected.has(e.path)}
                      disabled={here}
                      onChange={(ev) => {
                        const next = new Set(selected)
                        if (ev.target.checked) next.add(e.path)
                        else next.delete(e.path)
                        setSelected(next)
                      }}
                    />
                    <span className="org-icon">
                      {e.isDir ? <Folder size={16} /> : <FileIcon name={e.name} size={16} />}
                    </span>
                    {e.isDir ? (
                      <button
                        className="org-name link"
                        onClick={() => (setRightDir(e.path), setSelected(new Set()))}
                      >
                        {e.name}
                      </button>
                    ) : (
                      <span className="org-name">{e.name}</span>
                    )}
                    {m && (
                      <>
                        <span className="org-dest" title={virt(plan, e.path)}>
                          → {pbasename(virt(plan, m.toDir)) || virt(plan, m.toDir)}
                          {m.name !== e.name ? `（${m.name}）` : ''}
                        </span>
                        <button
                          className="btn-icon small"
                          title="移動を取り消す"
                          onClick={() => {
                            leaveIfInside(e.path)
                            setPlan(undoMove(plan, e.path))
                          }}
                        >
                          <Undo2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        {result && result.errors.length > 0 && (
          <div className="org-result">
            <b>
              {result.created} 件のフォルダを作成し、{result.moved} 件を移動しました。次の{' '}
              {result.errors.length} 件はできませんでした。
            </b>
            <ul>
              {result.errors.map((er) => (
                <li key={er.path}>
                  {er.path}: {er.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="modal-foot">
          <button className="btn" onClick={reset} disabled={!dirty || applying}>
            <RotateCcw size={15} /> 初期状態に戻す
          </button>
          <span className="org-summary muted small-text">
            新しいフォルダ {plan.mkdirs.length} 件・移動 {plan.moves.length} 件
          </span>
          <div className="spacer" />
          <button className="btn" onClick={close} disabled={applying}>
            {result ? '閉じる' : 'キャンセル'}
          </button>
          {!result && (
            <button className="btn btn-primary" disabled={!dirty || applying} onClick={apply}>
              {applying ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />} 完了
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

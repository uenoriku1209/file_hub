import { useEffect, useState } from 'react'
import {
  X,
  FileText,
  FileSpreadsheet,
  Presentation,
  ImagePlus,
  Trash2,
  Plus,
  Loader2
} from 'lucide-react'
import type { CreateOptions } from '../../../shared/types'
import { basename, errorMessage } from '../lib/format'

type Kind = CreateOptions['kind']

interface Props {
  dir: string
  onClose: () => void
  onCreated: (path: string, openAfter: boolean) => void
}

const KINDS: { id: Kind; label: string; ext: string; icon: typeof FileText; color: string }[] = [
  { id: 'word', label: 'Word', ext: 'docx', icon: FileText, color: '#3d7fe0' },
  { id: 'excel', label: 'Excel', ext: 'xlsx', icon: FileSpreadsheet, color: '#25a865' },
  { id: 'ppt', label: 'PowerPoint', ext: 'pptx', icon: Presentation, color: '#e8823a' }
]

const INVALID_SHEET = /[\\/?*[\]:]/

/** 件数に合わせて名前リストを伸縮する */
function resize<T>(list: T[], n: number, make: (i: number) => T): T[] {
  const c = Math.max(1, Math.min(100, n || 1))
  if (list.length >= c) return list.slice(0, c)
  return [...list, ...Array.from({ length: c - list.length }, (_, i) => make(list.length + i))]
}

export function NewFileModal({ dir, onClose, onCreated }: Props): React.JSX.Element {
  const [kind, setKind] = useState<Kind>('word')
  const [fileName, setFileName] = useState('新規ドキュメント')
  const [images, setImages] = useState<string[]>([])
  const [openAfter, setOpenAfter] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Word
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pageCount, setPageCount] = useState(1)
  const [wordPlacement, setWordPlacement] = useState<'first' | 'perPage'>('first')
  const [imageMaxWidth, setImageMaxWidth] = useState(500)

  // Excel
  const [sheets, setSheets] = useState<string[]>(['Sheet1'])
  const [headers, setHeaders] = useState('')
  const [freezeHeader, setFreezeHeader] = useState(true)
  const [imageSheet, setImageSheet] = useState(0)

  // PowerPoint
  const [layout, setLayout] = useState<'16x9' | '4x3'>('16x9')
  const [slides, setSlides] = useState<string[]>(['タイトル', ''])
  const [pptPlacement, setPptPlacement] = useState<'perSlide' | 'newSlides'>('perSlide')

  useEffect(() => {
    const defaults: Record<Kind, string> = {
      word: '新規ドキュメント',
      excel: '新規ブック',
      ppt: '新規プレゼンテーション'
    }
    setFileName((n) => (Object.values(defaults).includes(n) ? defaults[kind] : n))
  }, [kind])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const sheetProblems = (() => {
    const seen = new Set<string>()
    const out: string[] = []
    sheets.forEach((s, i) => {
      if (!s.trim()) out.push(`シート${i + 1}: 名前が空です`)
      else if (INVALID_SHEET.test(s)) out.push(`「${s}」: \\ / ? * [ ] : は使えません`)
      else if (s.length > 31) out.push(`「${s}」: 31文字以内にしてください`)
      else if (seen.has(s.toLowerCase())) out.push(`「${s}」: 名前が重複しています`)
      seen.add(s.toLowerCase())
    })
    return out
  })()

  const addImages = async (): Promise<void> => {
    const picked = await window.api.pickImages()
    if (picked.length) setImages((list) => [...list, ...picked])
  }

  const submit = async (): Promise<void> => {
    setError('')
    if (!fileName.trim()) return setError('ファイル名を入力してください')
    if (kind === 'excel' && sheetProblems.length) return setError(sheetProblems[0])
    let opts: CreateOptions
    if (kind === 'word') {
      opts = {
        kind,
        dir,
        fileName,
        title,
        body,
        pageCount,
        images,
        imagePlacement: wordPlacement,
        imageMaxWidth
      }
    } else if (kind === 'excel') {
      opts = {
        kind,
        dir,
        fileName,
        sheets: sheets.map((name) => ({ name })),
        headers,
        freezeHeader,
        images,
        imageSheet
      }
    } else {
      opts = {
        kind,
        dir,
        fileName,
        layout,
        slides: slides.map((t) => ({ title: t })),
        images,
        imagePlacement: pptPlacement
      }
    }
    setBusy(true)
    try {
      const path = await window.api.createFile(opts)
      onCreated(path, openAfter)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const ext = KINDS.find((k) => k.id === kind)!.ext

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h2>新規ファイルを作成</h2>
          <button className="btn-icon small" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="kind-select">
            {KINDS.map(({ id, label, icon: Icon, color }) => (
              <button
                key={id}
                className={`kind ${kind === id ? 'active' : ''}`}
                onClick={() => setKind(id)}
              >
                <span className="kind-icon" style={{ color, background: `${color}1a` }}>
                  <Icon size={20} />
                </span>
                {label}
              </button>
            ))}
          </div>

          <div className="field">
            <label>ファイル名</label>
            <div className="input-suffix">
              <input
                className="input"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
              />
              <span>.{ext}</span>
            </div>
            <small className="muted">保存先: {dir}</small>
          </div>

          {kind === 'word' && (
            <>
              <div className="field">
                <label>タイトル（任意）</label>
                <input
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例: 月次報告書"
                />
              </div>
              <div className="field">
                <label>本文（任意）</label>
                <textarea
                  className="input"
                  rows={3}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>ページ数</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={200}
                    value={pageCount}
                    onChange={(e) => setPageCount(Number(e.target.value))}
                  />
                </div>
                <div className="field">
                  <label>画像の配置</label>
                  <select
                    className="input"
                    value={wordPlacement}
                    onChange={(e) => setWordPlacement(e.target.value as 'first' | 'perPage')}
                  >
                    <option value="first">1ページ目にまとめる</option>
                    <option value="perPage">1ページに1枚ずつ</option>
                  </select>
                </div>
                <div className="field">
                  <label>画像の最大幅 (px)</label>
                  <input
                    className="input"
                    type="number"
                    min={50}
                    max={600}
                    value={imageMaxWidth}
                    onChange={(e) => setImageMaxWidth(Number(e.target.value))}
                  />
                </div>
              </div>
            </>
          )}

          {kind === 'excel' && (
            <>
              <div className="field-row">
                <div className="field narrow">
                  <label>シート数</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={100}
                    value={sheets.length}
                    onChange={(e) =>
                      setSheets((s) => resize(s, Number(e.target.value), (i) => `Sheet${i + 1}`))
                    }
                  />
                </div>
                <div className="field">
                  <label>見出し行（カンマ区切り・任意）</label>
                  <input
                    className="input"
                    value={headers}
                    onChange={(e) => setHeaders(e.target.value)}
                    placeholder="例: 日付, 項目, 金額"
                  />
                </div>
              </div>
              <div className="field">
                <label>シート名</label>
                <div className="name-list">
                  {sheets.map((s, i) => (
                    <div key={i} className="name-item">
                      <span className="name-no">{i + 1}</span>
                      <input
                        className="input"
                        value={s}
                        onChange={(e) =>
                          setSheets((l) => l.map((x, j) => (j === i ? e.target.value : x)))
                        }
                      />
                      <button
                        className="btn-icon small"
                        disabled={sheets.length === 1}
                        onClick={() => setSheets((l) => l.filter((_, j) => j !== i))}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="btn small"
                    onClick={() => setSheets((l) => [...l, `Sheet${l.length + 1}`])}
                  >
                    <Plus size={14} /> シートを追加
                  </button>
                </div>
                {sheetProblems.length > 0 && <small className="warn">{sheetProblems[0]}</small>}
              </div>
              <div className="field-row">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={freezeHeader}
                    onChange={(e) => setFreezeHeader(e.target.checked)}
                  />
                  見出し行を固定する
                </label>
                {images.length > 0 && (
                  <div className="field">
                    <label>画像を挿入するシート</label>
                    <select
                      className="input"
                      value={imageSheet}
                      onChange={(e) => setImageSheet(Number(e.target.value))}
                    >
                      {sheets.map((s, i) => (
                        <option key={i} value={i}>
                          {s || `シート${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </>
          )}

          {kind === 'ppt' && (
            <>
              <div className="field-row">
                <div className="field narrow">
                  <label>スライド数</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={100}
                    value={slides.length}
                    onChange={(e) => setSlides((s) => resize(s, Number(e.target.value), () => ''))}
                  />
                </div>
                <div className="field">
                  <label>サイズ</label>
                  <select
                    className="input"
                    value={layout}
                    onChange={(e) => setLayout(e.target.value as '16x9' | '4x3')}
                  >
                    <option value="16x9">ワイド (16:9)</option>
                    <option value="4x3">標準 (4:3)</option>
                  </select>
                </div>
                <div className="field">
                  <label>画像の配置</label>
                  <select
                    className="input"
                    value={pptPlacement}
                    onChange={(e) => setPptPlacement(e.target.value as 'perSlide' | 'newSlides')}
                  >
                    <option value="perSlide">2枚目以降に1枚ずつ</option>
                    <option value="newSlides">画像ごとに新しいスライド</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label>スライドのタイトル（1枚目は表紙）</label>
                <div className="name-list">
                  {slides.map((s, i) => (
                    <div key={i} className="name-item">
                      <span className="name-no">{i + 1}</span>
                      <input
                        className="input"
                        value={s}
                        placeholder={i === 0 ? '表紙タイトル' : `スライド ${i + 1}`}
                        onChange={(e) =>
                          setSlides((l) => l.map((x, j) => (j === i ? e.target.value : x)))
                        }
                      />
                      <button
                        className="btn-icon small"
                        disabled={slides.length === 1}
                        onClick={() => setSlides((l) => l.filter((_, j) => j !== i))}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button className="btn small" onClick={() => setSlides((l) => [...l, ''])}>
                    <Plus size={14} /> スライドを追加
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="field">
            <label>
              最初から挿入する画像（PNG / JPEG / GIF{kind === 'excel' ? '' : ' / BMP'}）
            </label>
            <div className="image-list">
              {images.map((img, i) => (
                <div key={`${img}-${i}`} className="image-chip" title={img}>
                  <ImagePlus size={14} />
                  <span>{basename(img)}</span>
                  <button onClick={() => setImages((l) => l.filter((_, j) => j !== i))}>
                    <X size={13} />
                  </button>
                </div>
              ))}
              <button className="btn small" onClick={addImages}>
                <ImagePlus size={14} /> 画像を追加
              </button>
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}
        </div>

        <div className="modal-foot">
          <label className="check">
            <input
              type="checkbox"
              checked={openAfter}
              onChange={(e) => setOpenAfter(e.target.checked)}
            />
            作成後にアプリで開く
          </label>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : <Plus size={16} />} 作成
          </button>
        </div>
      </div>
    </div>
  )
}

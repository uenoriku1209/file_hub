import { promises as fs, existsSync } from 'fs'
import { join, extname } from 'path'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  ImageRun,
  PageBreak,
  AlignmentType
} from 'docx'
import ExcelJS from 'exceljs'
import PptxGenJS from 'pptxgenjs'
import { readImageInfo, fit } from './imageSize'
import type {
  CreateOptions,
  WordCreateOptions,
  ExcelCreateOptions,
  PptCreateOptions
} from '../shared/types'

const EXT: Record<CreateOptions['kind'], string> = { word: 'docx', excel: 'xlsx', ppt: 'pptx' }

/** ファイル名を整えて、上書きを避けたフルパスを返す */
function resolveTarget(dir: string, fileName: string, ext: string): string {
  let base = fileName.trim().replace(/[\\/:*?"<>|]/g, '_') || '新規ファイル'
  if (extname(base).toLowerCase() === `.${ext}`) base = base.slice(0, -(ext.length + 1))
  let target = join(dir, `${base}.${ext}`)
  let n = 2
  while (existsSync(target)) {
    target = join(dir, `${base} (${n}).${ext}`)
    n++
  }
  return target
}

interface LoadedImage {
  path: string
  data: Buffer
  width: number
  height: number
  type: 'png' | 'jpg' | 'gif' | 'bmp'
}

async function loadImages(paths: string[]): Promise<LoadedImage[]> {
  const out: LoadedImage[] = []
  for (const p of paths) {
    const data = await fs.readFile(p)
    const info = readImageInfo(data)
    if (!info) throw new Error(`対応していない画像形式です: ${p}（PNG / JPEG / GIF / BMP のみ）`)
    out.push({ path: p, data, ...info })
  }
  return out
}

/* ---------------- Word ---------------- */

async function createWord(o: WordCreateOptions): Promise<string> {
  const target = resolveTarget(o.dir, o.fileName, 'docx')
  const images = await loadImages(o.images)
  const pageCount = Math.max(1, Math.min(200, Math.floor(o.pageCount || 1)))
  const maxW = Math.max(50, Math.min(600, o.imageMaxWidth || 500))

  const pages: Paragraph[][] = Array.from({ length: pageCount }, () => [])

  if (o.title.trim()) {
    pages[0].push(new Paragraph({ text: o.title.trim(), heading: HeadingLevel.TITLE }))
  }
  if (o.body.trim()) {
    for (const line of o.body.split(/\r?\n/)) {
      pages[0].push(new Paragraph({ children: [new TextRun(line)] }))
    }
  }

  images.forEach((img, i) => {
    const page = o.imagePlacement === 'perPage' ? Math.min(i, pageCount - 1) : 0
    const size = fit(img.width, img.height, maxW, 800)
    pages[page].push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type: img.type,
            data: img.data,
            transformation: { width: size.w, height: size.h }
          })
        ]
      })
    )
  })

  const children: Paragraph[] = []
  pages.forEach((p, i) => {
    if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }))
    children.push(...(p.length ? p : [new Paragraph('')]))
  })

  const doc = new Document({ sections: [{ children }] })
  await fs.writeFile(target, await Packer.toBuffer(doc))
  return target
}

/* ---------------- Excel ---------------- */

function sanitizeSheetName(name: string, used: Set<string>, index: number): string {
  let s =
    name
      .replace(/[\\/?*[\]:]/g, '_')
      .trim()
      .slice(0, 31) || `Sheet${index + 1}`
  let n = 2
  const base = s
  while (used.has(s.toLowerCase())) {
    s = `${base.slice(0, 27)} (${n})`
    n++
  }
  used.add(s.toLowerCase())
  return s
}

async function createExcel(o: ExcelCreateOptions): Promise<string> {
  const target = resolveTarget(o.dir, o.fileName, 'xlsx')
  const wb = new ExcelJS.Workbook()
  wb.created = new Date()

  const used = new Set<string>()
  const sheetDefs = o.sheets.length ? o.sheets : [{ name: 'Sheet1' }]
  const headers = o.headers
    .split(/[,、\t]/)
    .map((h) => h.trim())
    .filter(Boolean)

  const sheets = sheetDefs.map((s, i) => {
    const ws = wb.addWorksheet(sanitizeSheetName(s.name, used, i))
    if (headers.length) {
      const row = ws.addRow(headers)
      row.font = { bold: true, color: { argb: 'FF1F4E4E' } }
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDF3F1' } }
        cell.border = { bottom: { style: 'thin', color: { argb: 'FF7FCAC3' } } }
      })
      headers.forEach((h, c) => {
        ws.getColumn(c + 1).width = Math.max(10, Math.min(40, h.length * 2 + 4))
      })
      if (o.freezeHeader) ws.views = [{ state: 'frozen', ySplit: 1 }]
    }
    return ws
  })

  const images = await loadImages(o.images)
  if (images.length) {
    const ws = sheets[Math.max(0, Math.min(sheets.length - 1, o.imageSheet))]
    let row = headers.length ? 2 : 0
    for (const img of images) {
      if (img.type === 'bmp') throw new Error('Excel への BMP 画像の挿入には対応していません')
      const id = wb.addImage({
        buffer: img.data as unknown as ExcelJS.Buffer,
        extension: img.type === 'jpg' ? 'jpeg' : img.type
      })
      const size = fit(img.width, img.height, 480, 360)
      ws.addImage(id, {
        tl: { col: headers.length ? headers.length + 1 : 1, row },
        ext: { width: size.w, height: size.h }
      })
      row += Math.ceil(size.h / 20) + 1
    }
  }

  await wb.xlsx.writeFile(target)
  return target
}

/* ---------------- PowerPoint ---------------- */

async function createPpt(o: PptCreateOptions): Promise<string> {
  const target = resolveTarget(o.dir, o.fileName, 'pptx')
  const pres = new PptxGenJS()
  pres.layout = o.layout === '4x3' ? 'LAYOUT_4x3' : 'LAYOUT_16x9'
  const W = 10
  const H = o.layout === '4x3' ? 7.5 : 5.625
  const accent = '1AA5A0'

  const defs = o.slides.length ? o.slides : [{ title: '' }]
  const slides = defs.map((d, i) => {
    const slide = pres.addSlide()
    if (i === 0) {
      slide.addShape(pres.ShapeType.rect, {
        x: 0,
        y: H - 0.25,
        w: W,
        h: 0.25,
        fill: { color: accent }
      })
      slide.addText(d.title || 'タイトル', {
        x: 0.6,
        y: H / 2 - 0.8,
        w: W - 1.2,
        h: 1.2,
        fontSize: 36,
        bold: true,
        color: '2B3A44',
        align: 'center',
        valign: 'middle'
      })
    } else {
      slide.addShape(pres.ShapeType.rect, {
        x: 0.5,
        y: 0.45,
        w: 0.08,
        h: 0.6,
        fill: { color: accent }
      })
      slide.addText(d.title || `スライド ${i + 1}`, {
        x: 0.7,
        y: 0.35,
        w: W - 1.2,
        h: 0.8,
        fontSize: 26,
        bold: true,
        color: '2B3A44'
      })
    }
    return slide
  })

  const images = await loadImages(o.images)
  const mime = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp' }
  // 表紙 (1枚目) にはタイトルがあるので、画像は2枚目以降に配置する
  const contentSlides = slides.slice(1)
  images.forEach((img, i) => {
    let slide
    if (o.imagePlacement === 'perSlide' && i < contentSlides.length) {
      slide = contentSlides[i]
    } else {
      slide = pres.addSlide()
    }
    // タイトル領域の下に収める (インチ単位)
    const top = 1.35
    const box = { w: W - 1.2, h: H - top - 0.45 }
    const ratio = Math.min(box.w / img.width, box.h / img.height)
    const w = img.width * ratio
    const h = img.height * ratio
    slide.addImage({
      data: `${mime[img.type]};base64,${img.data.toString('base64')}`,
      x: (W - w) / 2,
      y: top + (box.h - h) / 2,
      w,
      h
    })
  })

  const buf = (await pres.write({ outputType: 'nodebuffer' })) as Buffer
  await fs.writeFile(target, buf)
  return target
}

export async function createFile(o: CreateOptions): Promise<string> {
  if (!existsSync(o.dir)) throw new Error('保存先フォルダが見つかりません')
  switch (o.kind) {
    case 'word':
      return createWord(o)
    case 'excel':
      return createExcel(o)
    case 'ppt':
      return createPpt(o)
    default:
      throw new Error(`未対応の種類: ${EXT[(o as CreateOptions).kind]}`)
  }
}

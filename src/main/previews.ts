import { promises as fs } from 'fs'
import { posix } from 'path'
import mammoth from 'mammoth'
import JSZip from 'jszip'
import type { DocxPreview, SlidePreview } from '../shared/types'

export async function previewDocx(p: string): Promise<DocxPreview> {
  const result = await mammoth.convertToHtml(
    { path: p },
    {
      styleMap: [
        "p[style-name='Title'] => h1.doc-title:fresh",
        "p[style-name='タイトル'] => h1.doc-title:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
        "p[style-name='副題'] => h2:fresh"
      ]
    }
  )
  return { html: result.value, messages: result.messages.map((m) => m.message) }
}

// Excel は書式も読む詳しい版 (xlsxPreview.ts)
export { previewXlsx } from './xlsxPreview'

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
}

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  webp: 'image/webp'
}

export async function previewPptx(p: string): Promise<SlidePreview[]> {
  const zip = await JSZip.loadAsync(await fs.readFile(p))
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]))

  const slides: SlidePreview[] = []
  for (let i = 0; i < slideNames.length; i++) {
    const name = slideNames[i]
    const xml = await zip.file(name)!.async('string')
    const paragraphs = xml
      .split(/<\/a:p>/)
      .map((seg) =>
        [...seg.matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1])).join('')
      )
      .map((t) => t.trim())
      .filter((t) => t.length > 0)

    // スライドに含まれる画像 (最大4枚)
    const images: string[] = []
    const relsName = name.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels')
    const rels = zip.file(relsName)
    if (rels) {
      const relXml = await rels.async('string')
      const targets = [...relXml.matchAll(/<Relationship\b[^>]*>/g)]
        .map((m) => m[0])
        .filter((tag) => /Type="[^"]*\/image"/.test(tag))
        .map((tag) => tag.match(/Target="([^"]+)"/)?.[1])
        .filter((t): t is string => !!t)
      for (const t of targets.slice(0, 4)) {
        const full = posix.normalize(posix.join('ppt/slides', t))
        const f = zip.file(full)
        const ext = posix.extname(full).slice(1).toLowerCase()
        const mime = IMAGE_MIME[ext]
        if (!f || !mime) continue
        const data = await f.async('nodebuffer')
        if (data.length > 4 * 1024 * 1024) continue
        images.push(`data:${mime};base64,${data.toString('base64')}`)
      }
    }

    slides.push({
      index: i + 1,
      title: paragraphs[0] ?? '',
      paragraphs: paragraphs.slice(1),
      images
    })
  }
  return slides
}

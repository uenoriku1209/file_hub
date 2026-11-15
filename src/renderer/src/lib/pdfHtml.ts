import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { languageOf } from './fileTypes'
import { formatDate } from './format'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 印刷用スタイル (常にライト配色) */
const STYLE = `
* { box-sizing: border-box; }
body { font-family: 'Segoe UI', 'Yu Gothic UI', 'Meiryo', 'Hiragino Sans', sans-serif; color: #2f3d4a; font-size: 11pt; line-height: 1.7; margin: 0; }
header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #16a39e; padding-bottom: 6px; margin-bottom: 14px; }
header .name { font-weight: 700; font-size: 13pt; }
header .meta { color: #8b99a8; font-size: 9pt; }
pre { background: #f6f8fb; border: 1px solid #e4e9ef; border-radius: 8px; padding: 12px 14px; white-space: pre-wrap; word-break: break-all; overflow-wrap: anywhere; }
pre code, code { font-family: 'Cascadia Mono', Consolas, 'BIZ UDGothic', 'MS Gothic', monospace; font-size: 9pt; line-height: 1.55; }
:not(pre) > code { background: #e9f6f5; padding: 1px 5px; border-radius: 4px; }
pre.plain { background: none; border: none; padding: 0; font-family: 'BIZ UDGothic', 'MS Gothic', Consolas, monospace; font-size: 10pt; }
table { border-collapse: collapse; margin: 8px 0; }
th, td { border: 1px solid #d5dde5; padding: 4px 10px; }
th { background: #f0f4f7; }
blockquote { margin: 0; padding-left: 12px; border-left: 3px solid #16a39e; color: #55657a; }
img { max-width: 100%; }
h1, h2, h3 { line-height: 1.35; page-break-after: avoid; }
a { color: #128e89; }
.hljs-comment, .hljs-quote { color: #8a9aa8; font-style: italic; }
.hljs-keyword, .hljs-selector-tag, .hljs-literal, .hljs-doctag { color: #c2457a; }
.hljs-string, .hljs-regexp, .hljs-addition, .hljs-attribute { color: #1f8d5a; }
.hljs-number, .hljs-symbol, .hljs-bullet { color: #c4651c; }
.hljs-title, .hljs-section { color: #2f6fd0; }
.hljs-title.class_, .hljs-type, .hljs-built_in { color: #138f8b; }
.hljs-attr, .hljs-variable, .hljs-template-variable, .hljs-params { color: #7a52b8; }
.hljs-meta, .hljs-tag, .hljs-name { color: #4a6a8a; }
`

function renderMarkdown(md: string): string {
  return renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [[rehypeHighlight, { detect: false, ignoreMissing: true }]]
      },
      md
    )
  )
}

/**
 * テキスト / ソースコード / Markdown を印刷用 HTML にする。
 * - Markdown は整形して表示
 * - コードは Markdown のコードブロックとして色付け (長い行は折り返し)
 * - テキストはそのまま
 */
export function buildPrintHtml(
  file: { name: string; ext: string; mtime: number },
  text: string
): string {
  let body: string
  if (['md', 'mdx', 'markdown'].includes(file.ext)) {
    body = renderMarkdown(text)
  } else if (['txt', 'log'].includes(file.ext)) {
    body = `<pre class="plain">${escapeHtml(text)}</pre>`
  } else {
    const lang = text.length > 300 * 1024 ? 'plaintext' : languageOf(file.ext)
    const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((m) => m.length))
    const fence = '`'.repeat(Math.max(3, longest + 1))
    body = renderMarkdown(`${fence}${lang}\n${text}\n${fence}`)
  }
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${escapeHtml(file.name)}</title><style>${STYLE}</style></head>
<body><header><span class="name">${escapeHtml(file.name)}</span><span class="meta">${formatDate(file.mtime)}</span></header>${body}</body></html>`
}

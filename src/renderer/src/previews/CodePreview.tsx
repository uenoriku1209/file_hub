import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Copy, Check, Eye, FileCode2 } from 'lucide-react'
import { Loading, ErrorState } from './PreviewShell'
import { decodeText, errorMessage } from '../lib/format'
import { languageOf } from '../lib/fileTypes'

const MAX_BYTES = 1024 * 1024
const HIGHLIGHT_LIMIT = 300 * 1024

/** ソースコードを Markdown のコードブロックとして組み立てる */
function toMarkdown(code: string, lang: string): string {
  const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((m) => m.length))
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}${lang}\n${code}\n${fence}`
}

export function CodePreview({
  path,
  ext,
  size
}: {
  path: string
  ext: string
  size: number
}): React.JSX.Element {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const isMarkdown = ['md', 'mdx', 'markdown'].includes(ext)
  const [rendered, setRendered] = useState(true)

  useEffect(() => {
    let alive = true
    setText(null)
    setError('')
    window.api
      .readBytes(path, MAX_BYTES)
      .then((b) => alive && setText(decodeText(b)))
      .catch((e) => alive && setError(errorMessage(e)))
    return () => {
      alive = false
    }
  }, [path])

  const lang = languageOf(ext)
  const markdown = useMemo(() => {
    if (text === null) return ''
    if (isMarkdown && rendered) return text
    return toMarkdown(text, text.length > HIGHLIGHT_LIMIT ? 'plaintext' : lang)
  }, [text, lang, isMarkdown, rendered])

  if (error) return <ErrorState text={error} />
  if (text === null) return <Loading />

  const lines = text.split('\n').length

  return (
    <div className="code-view">
      <div className="floating-tools">
        <span className="zoom-label">{lang}</span>
        <span className="zoom-label">{lines.toLocaleString()} 行</span>
        {isMarkdown && (
          <button
            className="btn-icon small"
            onClick={() => setRendered((r) => !r)}
            title={rendered ? 'ソースを表示' : 'プレビューを表示'}
          >
            {rendered ? <FileCode2 size={15} /> : <Eye size={15} />}
          </button>
        )}
        <button
          className="btn-icon small"
          title="コードをコピー"
          onClick={() => {
            navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
      </div>
      <div className={`markdown ${isMarkdown && rendered ? 'doc' : 'source'}`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        >
          {markdown}
        </ReactMarkdown>
      </div>
      {size > MAX_BYTES && (
        <div className="note">ファイルが大きいため、先頭 1MB のみ表示しています</div>
      )}
    </div>
  )
}

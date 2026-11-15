export function formatSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function formatDate(ms: number): string {
  const d = new Date(ms)
  const p = (x: number): string => String(x).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** UTF-8 として読めなければ Shift_JIS として読む */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')
  } catch {
    try {
      return new TextDecoder('shift_jis').decode(bytes)
    } catch {
      return new TextDecoder('utf-8').decode(bytes)
    }
  }
}

/** 簡易 CSV パーサ (ダブルクォート対応) */
export function parseCsv(text: string, maxRows = 500): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else q = false
      } else cell += ch
    } else if (ch === '"') q = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      if (rows.length >= maxRows) return rows
    } else cell += ch
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

export function basename(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p
}

export function sepOf(p: string): string {
  return p.includes('\\') ? '\\' : '/'
}

export function parentDir(p: string): string {
  const s = sepOf(p)
  const parts = p.split(/[\\/]/)
  parts.pop()
  const r = parts.join(s)
  return r.endsWith(':') ? r + s : r || s
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

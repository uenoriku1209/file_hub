// pdf.js の CMap (日本語PDF用) / 標準フォント / wasm を resources/pdfjs にコピーする
import { cpSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', 'pdfjs-dist')
const dest = join(root, 'resources', 'pdfjs')

if (!existsSync(src)) {
  console.warn(
    '[copy-pdfjs-assets] pdfjs-dist が見つかりません。npm install を先に実行してください。'
  )
  process.exit(0)
}
mkdirSync(dest, { recursive: true })
for (const dir of ['cmaps', 'standard_fonts', 'wasm']) {
  if (existsSync(join(src, dir))) cpSync(join(src, dir), join(dest, dir), { recursive: true })
}
console.log('[copy-pdfjs-assets] copied to resources/pdfjs')

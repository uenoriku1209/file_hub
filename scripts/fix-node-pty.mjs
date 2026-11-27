// node-pty 1.1.0 の macOS 用ビルド済みファイル (spawn-helper) には実行の許可が付いておらず、
// ターミナルを開くと "posix_spawnp failed" になる。npm install のあとに許可を付ける。
import { chmodSync, existsSync, readdirSync, statSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pty = join(root, 'node_modules', 'node-pty')
const dirs = [join(pty, 'build', 'Release')]
const prebuilds = join(pty, 'prebuilds')
if (existsSync(prebuilds)) for (const d of readdirSync(prebuilds)) dirs.push(join(prebuilds, d))

let fixed = 0
for (const d of dirs) {
  const helper = join(d, 'spawn-helper')
  if (!existsSync(helper)) continue
  const mode = statSync(helper).mode
  if ((mode & 0o111) !== 0o111) {
    chmodSync(helper, mode | 0o755)
    fixed++
  }
}
if (fixed) console.log(`[fix-node-pty] spawn-helper に実行の許可を付けました (${fixed} 件)`)

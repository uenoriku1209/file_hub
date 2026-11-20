/**
 * 開発環境まわり:
 *   - このパソコンで使える Node / パッケージマネージャー / uv / Python の検出
 *   - uv のインストール
 *   - プロジェクトの作成 (Vite・Next.js・Electron・Node+TS / uv)
 *   - 既存プロジェクトのパッケージ一覧と追加・削除 (uv / npm 系)
 *
 * 実行するコマンドはすべて決まった形で組み立て、名前やパッケージ指定は
 * 使える文字を絞ってから渡す (シェルの特殊文字は通さない)。
 */
import { spawn, type ChildProcess } from 'child_process'
import { existsSync, promises as fs, readdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { delimiter, join, resolve } from 'path'
import { parse as parseToml } from 'smol-toml'
import { refreshPath, which } from './shellEnv'
import {
  PACKAGE_SPEC,
  projectNameError,
  type AppProjectOptions,
  type DevEnv,
  type DevLog,
  type NodeVersion,
  type PackageAction,
  type PackageEntry,
  type PackageManager,
  type ProjectInfo,
  type ProjectOptions,
  type PythonProjectOptions,
  type PythonVersion,
  type ToolInfo,
  type UvInstallMethod
} from '../shared/devenv'

type Logger = (kind: DevLog['kind'], text: string) => void

/* ------------------------------------------------------------------ */
/* コマンドの実行                                                        */
/* ------------------------------------------------------------------ */

const ANSI =
  // eslint-disable-next-line no-control-regex
  /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][A-Za-z0-9]|\r(?!\n)/g

/** Windows の cmd に渡すときの引用 (引数は事前に検査済みの文字だけ) */
function cmdQuote(a: string): string {
  return /^[A-Za-z0-9._\-/:@=\\]+$/.test(a) ? a : `"${a}"`
}

const running = new Map<string, ChildProcess>()

interface RunOptions {
  cwd: string
  env?: NodeJS.ProcessEnv
  log?: Logger
  job?: string
  timeoutMs?: number
}

/** コマンドを実行して、出力を 1 行ずつ log に流す。失敗したら例外 */
function run(cmd: string, args: string[], o: RunOptions): Promise<string> {
  const env = {
    ...process.env,
    ...o.env,
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    npm_config_yes: 'true',
    npm_config_fund: 'false',
    npm_config_update_notifier: 'false'
  }
  const resolved = which(cmd, env['PATH'] ?? env['Path'] ?? '') ?? cmd
  // Windows の .cmd / .bat (npm, pnpm, yarn など) は cmd 経由でしか起動できない
  const viaShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(resolved)
  o.log?.('cmd', [cmd, ...args].join(' '))

  return new Promise((res, rej) => {
    const child = viaShell
      ? spawn([cmdQuote(resolved), ...args.map(cmdQuote)].join(' '), {
          cwd: o.cwd,
          env,
          shell: true,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe']
        })
      : spawn(resolved, args, {
          cwd: o.cwd,
          env,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe']
        })
    if (o.job) running.set(o.job, child)

    let out = ''
    let lastErr = ''
    const pump = (kind: 'out' | 'err') => {
      let buf = ''
      return (chunk: Buffer): void => {
        const s = chunk.toString('utf8')
        if (kind === 'out') out += s
        buf += s
        const lines = buf.split(/\r?\n/)
        buf = lines.pop() ?? ''
        for (const raw of lines) {
          const line = raw.replace(ANSI, '').trimEnd()
          if (!line.trim()) continue
          if (kind === 'err') lastErr = line
          o.log?.(kind, line)
        }
      }
    }
    child.stdout?.on('data', pump('out'))
    child.stderr?.on('data', pump('err'))

    const timer = setTimeout(() => child.kill(), o.timeoutMs ?? 20 * 60 * 1000)
    child.on('error', (e) => {
      clearTimeout(timer)
      if (o.job) running.delete(o.job)
      rej(
        new Error(
          (e as NodeJS.ErrnoException).code === 'ENOENT' ? `${cmd} が見つかりません` : e.message
        )
      )
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (o.job) running.delete(o.job)
      if (code === 0) res(out)
      else if (signal) rej(new Error('中止しました'))
      else rej(new Error(lastErr || `${cmd} が終了コード ${code} で失敗しました`))
    })
  })
}

/** 静かに実行して標準出力を返す (検出用。失敗したら null) */
async function quiet(cmd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string | null> {
  try {
    return (await run(cmd, args, { cwd: homedir(), env, timeoutMs: 15000 })).trim()
  } catch {
    return null
  }
}

export function cancelJob(job: string): void {
  const c = running.get(job)
  if (!c) return
  if (process.platform === 'win32' && c.pid)
    // cmd 経由だと子プロセスが残るので、木ごと止める
    spawn('taskkill', ['/pid', String(c.pid), '/T', '/F'], { windowsHide: true })
  else c.kill()
}

/* ------------------------------------------------------------------ */
/* 検出                                                                 */
/* ------------------------------------------------------------------ */

const VERSION = /(\d+\.\d+\.\d+)/

async function tool(cmd: string, args = ['--version']): Promise<ToolInfo> {
  const path = which(cmd)
  if (!path) return { version: null, path: null }
  const out = await quiet(cmd, args)
  return { version: out ? (VERSION.exec(out)?.[1] ?? out.split('\n')[0]) : null, path }
}

function cmpVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  return 0
}

function subdirs(dir: string): string[] {
  try {
    return readdirSync(dir).filter((n) => {
      try {
        return statSync(join(dir, n)).isDirectory()
      } catch {
        return false
      }
    })
  } catch {
    return []
  }
}

/** バージョン管理ツール (fnm / nvm / Volta) が入れた Node を探す */
function managedNodes(): NodeVersion[] {
  const home = homedir()
  const win = process.platform === 'win32'
  const exe = win ? 'node.exe' : 'node'
  const out: NodeVersion[] = []
  const add = (source: string, version: string, binDir: string): void => {
    const v = version.replace(/^v/, '')
    if (VERSION.test(v) && existsSync(join(binDir, exe)))
      out.push({ version: v, binDir, source, isDefault: false })
  }

  // fnm
  const fnmDirs = [
    process.env['FNM_DIR'],
    win ? join(process.env['APPDATA'] ?? '', 'fnm') : undefined,
    process.platform === 'darwin' ? join(home, 'Library', 'Application Support', 'fnm') : undefined,
    join(home, '.local', 'share', 'fnm'),
    join(home, '.fnm')
  ].filter(Boolean) as string[]
  for (const d of fnmDirs) {
    const vers = join(d, 'node-versions')
    for (const v of subdirs(vers)) {
      const inst = join(vers, v, 'installation')
      add('fnm', v, win ? inst : join(inst, 'bin'))
    }
  }

  // nvm (macOS / Linux) と nvm-windows
  if (win) {
    const nvmHome = process.env['NVM_HOME'] || join(process.env['APPDATA'] ?? '', 'nvm')
    for (const v of subdirs(nvmHome)) if (/^v?\d/.test(v)) add('nvm', v, join(nvmHome, v))
  } else {
    const nvmDir = join(process.env['NVM_DIR'] || join(home, '.nvm'), 'versions', 'node')
    for (const v of subdirs(nvmDir)) add('nvm', v, join(nvmDir, v, 'bin'))
  }

  // Volta
  const voltaHome =
    process.env['VOLTA_HOME'] ||
    (win ? join(process.env['LOCALAPPDATA'] ?? '', 'Volta') : join(home, '.volta'))
  const voltaNode = join(voltaHome, 'tools', 'image', 'node')
  for (const v of subdirs(voltaNode))
    add('Volta', v, win ? join(voltaNode, v) : join(voltaNode, v, 'bin'))

  return out
}

async function nodeVersions(): Promise<NodeVersion[]> {
  const def = await tool('node', ['-v'])
  const list: NodeVersion[] = []
  if (def.version)
    list.push({ version: def.version, binDir: null, source: '既定', isDefault: true })
  const seen = new Set(list.map((n) => n.version))
  for (const n of managedNodes().sort((a, b) => cmpVersion(b.version, a.version))) {
    if (seen.has(n.version)) continue
    seen.add(n.version)
    list.push(n)
  }
  return list
}

interface UvPythonJson {
  version: string
  path: string | null
  implementation?: string
  variant?: string
  key?: string
}

async function pythonVersions(): Promise<PythonVersion[]> {
  let entries: { version: string; installed: boolean }[] = []
  const json = await quiet('uv', ['python', 'list', '--output-format', 'json'])
  if (json?.startsWith('[')) {
    try {
      entries = (JSON.parse(json) as UvPythonJson[])
        .filter(
          (e) =>
            (e.implementation ?? 'cpython') === 'cpython' &&
            (e.variant ?? 'default') === 'default' &&
            !String(e.key ?? '').includes('freethreaded')
        )
        .map((e) => ({ version: e.version, installed: !!e.path }))
    } catch {
      entries = []
    }
  }
  if (entries.length === 0) {
    // 古い uv: テキスト表示から読む
    const text = (await quiet('uv', ['python', 'list'])) ?? ''
    for (const line of text.split('\n')) {
      const m = /^cpython-(\d+\.\d+\.\d+)-\S+\s+(.*)$/.exec(line.trim())
      if (m && !line.includes('freethreaded'))
        entries.push({ version: m[1], installed: !m[2].includes('download') })
    }
  }

  const byMinor = new Map<string, PythonVersion>()
  for (const e of entries) {
    if (!/^\d+\.\d+\.\d+$/.test(e.version)) continue // 3.15.0b1 などのプレリリースは除く
    const [maj, min] = e.version.split('.').map(Number)
    if (maj !== 3 || min < 9) continue
    const minor = `${maj}.${min}`
    const cur = byMinor.get(minor)
    if (!cur) byMinor.set(minor, { minor, latest: e.version, installed: e.installed })
    else {
      if (cmpVersion(e.version, cur.latest) > 0) cur.latest = e.version
      cur.installed ||= e.installed
    }
  }
  return [...byMinor.values()].sort((a, b) => cmpVersion(b.latest, a.latest))
}

export async function detectEnv(): Promise<DevEnv> {
  await refreshPath()
  const [node, npm, pnpm, yarn, bun, uv, git] = await Promise.all([
    nodeVersions(),
    tool('npm', ['-v']),
    tool('pnpm', ['-v']),
    tool('yarn', ['-v']),
    tool('bun', ['-v']),
    tool('uv'),
    tool('git')
  ])
  const methods: UvInstallMethod[] = []
  if (process.platform === 'win32' && which('winget')) methods.push('winget')
  if (process.platform === 'darwin' && which('brew')) methods.push('brew')
  methods.push('official')
  return {
    platform: process.platform,
    node,
    managers: { npm, pnpm, yarn, bun },
    uv,
    python: uv.version ? await pythonVersions() : [],
    uvInstallMethods: methods,
    git
  }
}

/* ------------------------------------------------------------------ */
/* uv のインストール                                                     */
/* ------------------------------------------------------------------ */

export async function installUv(
  method: UvInstallMethod,
  job: string,
  log: Logger
): Promise<string> {
  const cwd = homedir()
  if (method === 'winget') {
    await run(
      'winget',
      [
        'install',
        '--id=astral-sh.uv',
        '-e',
        '--accept-source-agreements',
        '--accept-package-agreements',
        '--disable-interactivity'
      ],
      { cwd, log, job }
    )
  } else if (method === 'brew') {
    await run('brew', ['install', 'uv'], { cwd, log, job })
  } else if (process.platform === 'win32') {
    // Astral 公式のインストーラー (管理者権限は不要。%USERPROFILE%\.local\bin に入る)
    await run(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'ByPass',
        '-Command',
        'irm https://astral.sh/uv/install.ps1 | iex'
      ],
      { cwd, log, job }
    )
  } else {
    // Astral 公式のインストーラー (sudo は不要。~/.local/bin に入る)
    const fetcher = which('curl')
      ? 'curl --proto =https --tlsv1.2 -LsSf https://astral.sh/uv/install.sh'
      : 'wget -qO- https://astral.sh/uv/install.sh'
    await run('/bin/sh', ['-c', `${fetcher} | sh`], { cwd, log, job })
  }
  await refreshPath()
  const v = await tool('uv')
  if (!v.version)
    throw new Error(
      'インストールは終わりましたが uv が見つかりません。File Hub を再起動してください'
    )
  log('done', `uv ${v.version} を使えるようになりました`)
  return v.version
}

/* ------------------------------------------------------------------ */
/* プロジェクトの作成                                                     */
/* ------------------------------------------------------------------ */

function checkSpecs(specs: string[]): string[] {
  const list = specs.map((s) => s.trim()).filter(Boolean)
  for (const s of list)
    if (!PACKAGE_SPEC.test(s))
      throw new Error(`パッケージの指定「${s}」に使えない文字が含まれています`)
  return list
}

function installArgs(): string[] {
  return ['install']
}

function addArgs(pm: PackageManager, pkgs: string[], dev: boolean): string[] {
  if (pm === 'npm') return ['install', ...(dev ? ['--save-dev'] : []), ...pkgs]
  return ['add', ...(dev ? ['-D'] : []), ...pkgs]
}

function removeArgs(pm: PackageManager, pkgs: string[]): string[] {
  return [pm === 'npm' ? 'uninstall' : 'remove', ...pkgs]
}

async function createPython(o: PythonProjectOptions, job: string, log: Logger): Promise<string> {
  const target = join(o.parentDir, o.name)
  if (!/^\d+\.\d+$/.test(o.python)) throw new Error('Python のバージョンを選んでください')
  const pkgs = checkSpecs(o.packages)
  await run(
    'uv',
    [
      'init',
      o.name,
      '--python',
      o.python,
      o.layout === 'lib' ? '--lib' : '--app',
      ...(o.git ? [] : ['--vcs', 'none'])
    ],
    { cwd: o.parentDir, log, job }
  )
  // .venv と uv.lock を作る (パッケージがあれば一緒に入れる)
  if (pkgs.length) await run('uv', ['add', ...pkgs], { cwd: target, log, job })
  else await run('uv', ['sync'], { cwd: target, log, job })
  return target
}

const NODE_TS_INDEX = `const name = process.argv[2] ?? 'world'
console.log(\`Hello, \${name}!\`)
`

async function writeNodeTs(target: string, name: string, install: boolean): Promise<void> {
  await fs.mkdir(join(target, 'src'), { recursive: true })
  const pkg = {
    name,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'tsx watch src/index.ts',
      start: 'tsx src/index.ts',
      build: 'tsc',
      typecheck: 'tsc --noEmit'
    },
    ...(install
      ? {}
      : { devDependencies: { '@types/node': 'latest', tsx: 'latest', typescript: 'latest' } })
  }
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      outDir: 'dist',
      rootDir: 'src',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true
    },
    include: ['src']
  }
  await fs.writeFile(join(target, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
  await fs.writeFile(join(target, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2) + '\n')
  await fs.writeFile(join(target, 'src', 'index.ts'), NODE_TS_INDEX)
  await fs.writeFile(join(target, '.gitignore'), 'node_modules/\ndist/\n.env\n')
}

async function createApp(
  o: AppProjectOptions,
  env: DevEnv | null,
  job: string,
  log: Logger
): Promise<string> {
  const target = join(o.parentDir, o.name)
  const pm = o.manager
  if (!which(pm)) throw new Error(`${pm} が見つかりません`)

  // 選んだ Node を PATH の先頭に置いて実行する
  let runEnv: NodeJS.ProcessEnv | undefined
  const chosen = o.nodeVersion ? env?.node.find((n) => n.version === o.nodeVersion) : undefined
  if (chosen?.binDir) {
    runEnv = { PATH: chosen.binDir + delimiter + (process.env['PATH'] ?? '') }
    log('info', `Node ${chosen.version}（${chosen.source}）を使います`)
  }
  const opt = (cwd: string): RunOptions => ({ cwd, log, job, env: runEnv })

  // 雛形を作る。どのパッケージマネージャーでも npx で作り、インストールは後で行う
  switch (o.template) {
    case 'vite-react-ts':
    case 'vite-vue-ts':
    case 'vite-svelte-ts':
    case 'vite-vanilla-ts':
      await run(
        'npx',
        ['--yes', 'create-vite@latest', o.name, '--template', o.template.replace(/^vite-/, '')],
        opt(o.parentDir)
      )
      break
    case 'next-turbopack':
      await run(
        'npx',
        [
          '--yes',
          'create-next-app@latest',
          o.name,
          '--ts',
          '--eslint',
          '--app',
          '--src-dir',
          '--tailwind',
          '--import-alias',
          '@/*',
          '--turbopack',
          `--use-${pm}`,
          '--skip-install',
          '--disable-git',
          '--yes'
        ],
        opt(o.parentDir)
      )
      break
    case 'electron-vite-react-ts':
      await run(
        'npx',
        [
          '--yes',
          '@quick-start/create-electron@latest',
          o.name,
          '--template',
          'react-ts',
          '--skip'
        ],
        opt(o.parentDir)
      )
      break
    case 'node-ts':
      log('info', `${target} に package.json・tsconfig.json・src/index.ts を作成します`)
      await writeNodeTs(target, o.name, o.install)
      break
  }
  if (!existsSync(join(target, 'package.json')))
    throw new Error('プロジェクトの雛形を作れませんでした（package.json がありません）')

  if (chosen && !chosen.isDefault) {
    await fs.writeFile(join(target, '.node-version'), chosen.version + '\n')
    log('info', `.node-version に ${chosen.version} を書きました（fnm などが自動で切り替えます）`)
  }

  if (o.install) {
    if (o.template === 'node-ts')
      await run(pm, addArgs(pm, ['typescript', 'tsx', '@types/node'], true), opt(target))
    else await run(pm, installArgs(), opt(target))
  }

  if (o.git && which('git') && !existsSync(join(target, '.git')))
    await run('git', ['-c', 'init.defaultBranch=main', 'init'], opt(target))
  return target
}

export async function createProject(o: ProjectOptions, job: string, log: Logger): Promise<string> {
  const err = projectNameError(o.name, o.kind)
  if (err) throw new Error(err)
  const parent = resolve(o.parentDir)
  if (!existsSync(parent)) throw new Error('作成先のフォルダが見つかりません')
  const target = join(parent, o.name.trim())
  if (existsSync(target)) throw new Error(`「${o.name}」はすでにあります。別の名前にしてください`)
  const opts = { ...o, parentDir: parent, name: o.name.trim() }

  await refreshPath()
  try {
    const dir =
      opts.kind === 'python'
        ? await createPython(opts, job, log)
        : await createApp(opts, await detectEnvCached(), job, log)
    log('done', `作成しました: ${dir}`)
    return dir
  } catch (e) {
    log('fail', e instanceof Error ? e.message : String(e))
    throw e
  }
}

let envCache: { at: number; env: DevEnv } | null = null
async function detectEnvCached(): Promise<DevEnv> {
  if (envCache && Date.now() - envCache.at < 60_000) return envCache.env
  const env = await detectEnv()
  envCache = { at: Date.now(), env }
  return env
}

/* ------------------------------------------------------------------ */
/* 既存プロジェクトの情報とパッケージ操作                                   */
/* ------------------------------------------------------------------ */

/** PEP 503 の正規化 (Requests / requests_oauthlib → requests-oauthlib) */
function normName(n: string): string {
  return n.toLowerCase().replace(/[-_.]+/g, '-')
}

function parsePep508(req: string): { name: string; spec: string } | null {
  const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*(\[[^\]]*\])?\s*([^;]*)/.exec(req)
  if (!m) return null
  return { name: m[1] + (m[2] ?? ''), spec: m[3].trim() }
}

type Toml = Record<string, unknown>

async function readToml(p: string): Promise<Toml | null> {
  try {
    return parseToml(await fs.readFile(p, 'utf8')) as Toml
  } catch {
    return null
  }
}

async function uvInfo(dir: string): Promise<ProjectInfo | null> {
  const py = await readToml(join(dir, 'pyproject.toml'))
  const project = py?.['project'] as Toml | undefined
  if (!py || !project) return null

  const locked = new Map<string, string>()
  const lock = existsSync(join(dir, 'uv.lock')) ? await readToml(join(dir, 'uv.lock')) : null
  for (const p of (lock?.['package'] as Toml[] | undefined) ?? [])
    if (typeof p['name'] === 'string' && typeof p['version'] === 'string')
      locked.set(normName(p['name']), p['version'])

  const packages: PackageEntry[] = []
  const push = (reqs: unknown, dev: boolean): void => {
    if (!Array.isArray(reqs)) return
    for (const r of reqs) {
      if (typeof r !== 'string') continue
      const d = parsePep508(r)
      if (!d) continue
      const base = normName(d.name.replace(/\[.*$/, ''))
      packages.push({ name: d.name, spec: d.spec, installed: locked.get(base) ?? null, dev })
    }
  }
  push(project['dependencies'], false)
  const groups = py['dependency-groups'] as Toml | undefined
  push(groups?.['dev'], true)
  const toolUv = (py['tool'] as Toml | undefined)?.['uv'] as Toml | undefined
  push(toolUv?.['dev-dependencies'], true)

  const pin = await fs
    .readFile(join(dir, '.python-version'), 'utf8')
    .then((t) => t.trim() || null)
    .catch(() => null)

  return {
    kind: 'uv',
    dir,
    name: typeof project['name'] === 'string' ? project['name'] : '',
    packages,
    locked: !!lock,
    envReady: existsSync(join(dir, '.venv')),
    runtime: typeof project['requires-python'] === 'string' ? project['requires-python'] : null,
    pythonPin: pin
  }
}

function managerOf(dir: string, pkg: Toml): PackageManager {
  const field = typeof pkg['packageManager'] === 'string' ? pkg['packageManager'] : ''
  for (const pm of ['pnpm', 'yarn', 'bun', 'npm'] as PackageManager[])
    if (field.startsWith(pm + '@')) return pm
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(dir, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(dir, 'bun.lockb')) || existsSync(join(dir, 'bun.lock'))) return 'bun'
  return 'npm'
}

const NODE_LOCKS = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock']

async function nodeInfo(dir: string): Promise<ProjectInfo | null> {
  let pkg: Toml
  try {
    pkg = JSON.parse(await fs.readFile(join(dir, 'package.json'), 'utf8')) as Toml
  } catch {
    return null
  }
  const packages: PackageEntry[] = []
  const installed = async (name: string): Promise<string | null> => {
    try {
      const j = JSON.parse(
        await fs.readFile(join(dir, 'node_modules', name, 'package.json'), 'utf8')
      ) as { version?: string }
      return j.version ?? null
    } catch {
      return null
    }
  }
  for (const [field, dev] of [
    ['dependencies', false],
    ['devDependencies', true]
  ] as const) {
    const deps = pkg[field]
    if (!deps || typeof deps !== 'object') continue
    for (const [name, spec] of Object.entries(deps as Record<string, unknown>))
      packages.push({ name, spec: String(spec), installed: await installed(name), dev })
  }
  const engines = pkg['engines'] as Toml | undefined
  return {
    kind: 'node',
    dir,
    name: typeof pkg['name'] === 'string' ? pkg['name'] : '',
    packages,
    locked: NODE_LOCKS.some((f) => existsSync(join(dir, f))),
    envReady: existsSync(join(dir, 'node_modules')),
    runtime: typeof engines?.['node'] === 'string' ? (engines['node'] as string) : null,
    manager: managerOf(dir, pkg),
    scripts: Object.keys((pkg['scripts'] as Toml | undefined) ?? {})
  }
}

/** フォルダが uv / Node のプロジェクトなら、その情報を返す */
export async function projectInfo(dir: string): Promise<ProjectInfo | null> {
  if (existsSync(join(dir, 'pyproject.toml'))) {
    const uv = await uvInfo(dir)
    if (uv) return uv
  }
  if (existsSync(join(dir, 'package.json'))) return nodeInfo(dir)
  return null
}

export async function packageAction(
  dir: string,
  action: PackageAction,
  job: string,
  log: Logger
): Promise<ProjectInfo | null> {
  const info = await projectInfo(dir)
  if (!info) throw new Error('このフォルダは uv / Node のプロジェクトではありません')
  await refreshPath()
  const o: RunOptions = { cwd: dir, log, job }
  try {
    if (info.kind === 'uv') {
      if (!which('uv')) throw new Error('uv がインストールされていません')
      if (action.op === 'add')
        await run(
          'uv',
          ['add', ...(action.dev ? ['--dev'] : []), ...checkSpecs(action.packages)],
          o
        )
      else if (action.op === 'remove')
        await run(
          'uv',
          ['remove', ...(action.dev ? ['--dev'] : []), ...checkSpecs(action.packages)],
          o
        )
      else if (action.op === 'sync') await run('uv', ['sync'], o)
      else {
        await run('uv', ['lock', '--upgrade'], o)
        await run('uv', ['sync'], o)
      }
    } else {
      const pm = info.manager ?? 'npm'
      if (!which(pm)) throw new Error(`${pm} が見つかりません`)
      if (action.op === 'add')
        await run(pm, addArgs(pm, checkSpecs(action.packages), action.dev), o)
      else if (action.op === 'remove') await run(pm, removeArgs(pm, checkSpecs(action.packages)), o)
      else if (action.op === 'sync') await run(pm, installArgs(), o)
      else {
        const yarnBerry = pm === 'yarn' && !(await quiet('yarn', ['-v']))?.startsWith('1.')
        await run(pm, pm === 'yarn' ? (yarnBerry ? ['up', '*'] : ['upgrade']) : ['update'], o)
      }
    }
    log('done', '完了しました')
  } catch (e) {
    log('fail', e instanceof Error ? e.message : String(e))
    throw e
  }
  return projectInfo(dir)
}

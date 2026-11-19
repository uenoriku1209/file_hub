import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'

/**
 * Microsoft Office (Word / Excel / PowerPoint) で PDF に変換する常駐ワーカー。
 *
 * 以前は 1 ファイルごとに「PowerShell を起動 → Office を起動 → 変換 → Office を終了」していたため、
 * 時間の大半が起動・終了に使われていた。ここでは PowerShell と Office を一度だけ起動し、
 * 開いたまま次々に変換する。しばらく使わなければ (IDLE_MS) 自動で終了する。
 *
 * やりとりは 1 行 1 件の JSON:
 *   → {"id":1,"op":"convert","kind":"word","in":"C:\\a.docx","out":"C:\\a.pdf"}
 *   ← OK 1            / ERR 1 <base64 のエラーメッセージ>
 *   → {"op":"warm","kind":"word"}   (先に Office を起動しておく。返事なし)
 *   → {"op":"quit"}                  (起動した Office を終了して PowerShell も終わる)
 */

export type OfficeKind = 'word' | 'excel' | 'ppt'

const WORKER_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$apps = @{}
# ユーザーが元から Office を開いていた場合は、終了させない
$keep = @{}

function Get-App($kind) {
  if ($apps.ContainsKey($kind)) {
    # 途中で Office が閉じられていたら作り直す
    try { [void]$apps[$kind].Name; return $apps[$kind] } catch { $apps.Remove($kind) }
  }
  switch ($kind) {
    'word' {
      $a = New-Object -ComObject Word.Application
      $keep[$kind] = ($a.Documents.Count -gt 0)
      $a.Visible = $false
      $a.DisplayAlerts = 0
      try { $a.AutomationSecurity = 3 } catch {}
      try { $a.Options.SaveNormalPrompt = $false } catch {}
    }
    'excel' {
      $a = New-Object -ComObject Excel.Application
      $keep[$kind] = ($a.Workbooks.Count -gt 0)
      $a.Visible = $false
      $a.DisplayAlerts = $false
      $a.ScreenUpdating = $false
      try { $a.AutomationSecurity = 3 } catch {}
    }
    'ppt' {
      $a = New-Object -ComObject PowerPoint.Application
      $keep[$kind] = ($a.Presentations.Count -gt 0)
      try { $a.AutomationSecurity = 3 } catch {}
    }
  }
  $apps[$kind] = $a
  return $a
}

function Convert-One($kind, $in, $out) {
  $app = Get-App $kind
  $doc = $null
  try {
    switch ($kind) {
      'word' {
        # ConfirmConversions=false, ReadOnly=true, AddToRecentFiles=false
        $doc = $app.Documents.Open($in, $false, $true, $false)
        # 17 = PDF, OptimizeFor 0 = 印刷用
        $doc.ExportAsFixedFormat($out, 17, $false, 0)
      }
      'excel' {
        $doc = $app.Workbooks.Open($in, 0, $true)
        $doc.ExportAsFixedFormat(0, $out)
      }
      'ppt' {
        # ReadOnly, Untitled=false, WithWindow=false
        $doc = $app.Presentations.Open($in, -1, 0, 0)
        $doc.SaveAs($out, 32)
      }
    }
  } finally {
    if ($doc -ne $null) {
      try { if ($kind -eq 'ppt') { $doc.Close() } else { $doc.Close($false) } } catch {}
      try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) } catch {}
    }
  }
}

function Quit-All {
  foreach ($k in @($apps.Keys)) {
    $a = $apps[$k]
    try {
      $open = switch ($k) { 'word' { $a.Documents.Count } 'excel' { $a.Workbooks.Count } 'ppt' { $a.Presentations.Count } }
      if (-not $keep[$k] -and $open -eq 0) { $a.Quit() }
    } catch {}
    try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($a) } catch {}
  }
  $apps.Clear()
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

[Console]::Out.WriteLine('READY')
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  if ($line.Trim() -eq '') { continue }
  try { $req = $line | ConvertFrom-Json } catch { continue }
  if ($req.op -eq 'quit') { break }
  if ($req.op -eq 'warm') { try { [void](Get-App $req.kind) } catch {}; continue }
  try {
    Convert-One $req.kind $req.in $req.out
    [Console]::Out.WriteLine("OK $($req.id)")
  } catch {
    $msg = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($_.Exception.Message))
    [Console]::Out.WriteLine("ERR $($req.id) $msg")
  }
}
Quit-All
`

interface Pending {
  resolve: () => void
  reject: (e: Error) => void
  timer: NodeJS.Timeout
}

export interface WorkerCommand {
  file: string
  args: string[]
}

/** 本番では PowerShell。テストでは別のコマンドに差し替えられる */
export function powershellCommand(): WorkerCommand {
  const encoded = Buffer.from(WORKER_SCRIPT, 'utf16le').toString('base64')
  return {
    file: 'powershell.exe',
    args: [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encoded
    ]
  }
}

export class OfficeWorker {
  private child: ChildProcessWithoutNullStreams | null = null
  private ready: Promise<void> | null = null
  private pending = new Map<number, Pending>()
  private seq = 0
  private buf = ''
  private idleTimer: NodeJS.Timeout | undefined
  /** 1 件ずつ順番に変換する (Office は同時に複数の変換をさせると不安定なため) */
  private chain: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly command: () => WorkerCommand = powershellCommand,
    private readonly idleMs = 90_000,
    private readonly jobTimeoutMs = 180_000
  ) {}

  /** 先に Office を起動しておく (変換画面を開いた時点で呼ぶと、1 件目が速くなる) */
  warm(kinds: OfficeKind[]): void {
    this.start()
      .then(() => {
        for (const k of new Set(kinds)) this.send({ op: 'warm', kind: k })
        this.touch()
      })
      .catch(() => {})
  }

  convert(kind: OfficeKind, input: string, output: string): Promise<void> {
    const job = this.chain.then(() => this.run(kind, input, output))
    this.chain = job.catch(() => {})
    return job
  }

  /** 起動した Office を終了する (アプリ終了時・しばらく使わなかったとき) */
  stop(): Promise<void> {
    clearTimeout(this.idleTimer)
    const child = this.child
    if (!child) return Promise.resolve()
    return new Promise((resolve) => {
      const kill = setTimeout(() => {
        child.kill()
        resolve()
      }, 15_000)
      child.once('exit', () => {
        clearTimeout(kill)
        resolve()
      })
      this.send({ op: 'quit' })
      child.stdin.end()
    })
  }

  private async run(kind: OfficeKind, input: string, output: string): Promise<void> {
    await this.start()
    clearTimeout(this.idleTimer)
    const id = ++this.seq
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id)
          // 固まった場合は作り直す
          this.reset(new Error('変換がタイムアウトしました（3分）'))
          reject(new Error('変換がタイムアウトしました（3分）'))
        }, this.jobTimeoutMs)
        this.pending.set(id, { resolve, reject, timer })
        this.send({ id, op: 'convert', kind, in: input, out: output })
      })
    } finally {
      this.touch()
    }
  }

  private start(): Promise<void> {
    if (this.ready) return this.ready
    this.ready = new Promise<void>((resolve, reject) => {
      const { file, args } = this.command()
      let child: ChildProcessWithoutNullStreams
      try {
        child = spawn(file, args, { windowsHide: true })
      } catch (e) {
        this.ready = null
        reject(e as Error)
        return
      }
      this.child = child
      this.buf = ''
      let started = false
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (d: string) => {
        this.buf += d
        let nl: number
        while ((nl = this.buf.indexOf('\n')) >= 0) {
          const line = this.buf.slice(0, nl).trim()
          this.buf = this.buf.slice(nl + 1)
          if (line === 'READY') {
            started = true
            resolve()
          } else this.onLine(line)
        }
      })
      child.stderr.on('data', () => {})
      // 作り直したあとに古いプロセスの終了が届いても、新しいほうは触らない
      child.on('error', (e) => {
        if (!started) reject(e)
        if (this.child === child) this.reset(e)
      })
      child.on('exit', () => {
        if (!started) reject(new Error('Office の変換ワーカーを起動できませんでした'))
        if (this.child === child) this.reset(new Error('Office の変換ワーカーが終了しました'))
      })
    })
    return this.ready
  }

  private onLine(line: string): void {
    const m = line.match(/^(OK|ERR) (\d+)(?: (.*))?$/)
    if (!m) return
    const p = this.pending.get(Number(m[2]))
    if (!p) return
    this.pending.delete(Number(m[2]))
    clearTimeout(p.timer)
    if (m[1] === 'OK') p.resolve()
    else
      p.reject(
        new Error(Buffer.from(m[3] ?? '', 'base64').toString('utf8') || '変換に失敗しました')
      )
  }

  private send(obj: unknown): void {
    if (this.child && !this.child.stdin.destroyed)
      this.child.stdin.write(JSON.stringify(obj) + '\n')
  }

  private touch(): void {
    clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => {
      if (this.pending.size === 0) void this.stop()
    }, this.idleMs)
  }

  private reset(err: Error): void {
    const child = this.child
    this.child = null
    this.ready = null
    clearTimeout(this.idleTimer)
    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(err)
    }
    this.pending.clear()
    if (child && child.exitCode === null) child.kill()
  }
}

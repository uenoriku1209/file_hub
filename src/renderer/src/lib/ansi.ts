const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)
/** ターミナル出力から色・カーソル移動などの制御コードを取り除く */
const ANSI = new RegExp(
  `${ESC}\\[[0-9;?]*[ -/]*[@-~]|${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)|${ESC}[()][A-Za-z0-9]|${ESC}[=>78]`,
  'g'
)

/** 改行・復帰・タブ以外の制御文字 */
const CONTROL = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(8)}${String.fromCharCode(11)}${String.fromCharCode(12)}${String.fromCharCode(14)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`,
  'g'
)

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '').replace(CONTROL, '')
}

/** シェルのプロンプトだけの行や、フォルダ移動の行 (Git 画面の表示では省く) */
export function isShellNoise(line: string): boolean {
  const l = line.trim()
  return (
    /__FH_/.test(l) ||
    /^(cd |cd\/d |Set-Location )/.test(l) ||
    /^PS .*>$/.test(l) ||
    /^[A-Za-z]:\\.*>$/.test(l) ||
    /^\S+@\S+:.*[#$]$/.test(l) ||
    /^\S+@\S+ (MINGW|MSYS)\S* .*$/.test(l) ||
    /^[#$]$/.test(l)
  )
}

/** 出力を行に分ける (\r で上書きされる進捗表示は最後の状態だけ残す) */
export function toLines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => {
    const parts = l.split('\r')
    return parts.filter((x) => x.length > 0).pop() ?? ''
  })
}

/** OS ごとに変わる表示 */

export const isMac = window.api.platform === 'darwin'
export const isWin = window.api.platform === 'win32'

/** ファイルの場所を開くアプリの名前 */
export const FILE_MANAGER = isMac ? 'Finder' : isWin ? 'エクスプローラー' : 'ファイルマネージャー'
export const REVEAL_LABEL = `${FILE_MANAGER}で表示`

/** ごみ箱の名前 */
export const TRASH_NAME = isMac ? 'ゴミ箱' : 'ごみ箱'

/** ショートカットの表記 (Ctrl / ⌘) */
export const MOD_KEY = isMac ? '⌘' : 'Ctrl+'

/** 削除キーの表記 */
export const DELETE_KEY = isMac ? '⌘⌫' : 'Delete'

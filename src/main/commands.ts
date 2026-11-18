// 登録したコマンドの保存 (ユーザーデータフォルダの commands.json)
import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import type { SavedCommand } from '../shared/git'

const file = (): string => join(app.getPath('userData'), 'commands.json')

export async function loadCommands(): Promise<SavedCommand[]> {
  try {
    const list = JSON.parse(await fs.readFile(file(), 'utf8'))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export async function saveCommands(list: SavedCommand[]): Promise<SavedCommand[]> {
  const clean = list
    .filter((c) => c && typeof c.command === 'string' && c.command.trim())
    .map((c) => ({
      id: String(c.id),
      command: c.command,
      description: String(c.description ?? ''),
      createdAt: String(c.createdAt ?? new Date().toISOString())
    }))
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(file(), JSON.stringify(clean, null, 2), 'utf8')
  return clean
}

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus,
  Search,
  X,
  Copy,
  Check,
  Pencil,
  Trash2,
  SquareTerminal,
  Save,
  Command as CommandIcon,
  Sparkles
} from 'lucide-react'
import type { SavedCommand } from '../../../shared/git'
import { errorMessage } from '../lib/format'
import { useToast } from '../lib/toast'

interface Props {
  /** ターミナルに入力する (Enter は押さない) */
  onSendToTerminal: (command: string) => void
}

/** 最初に追加できる、よく使うコマンドの例 */
const SAMPLES: [string, string][] = [
  ['git status', '変更されたファイルを確認する'],
  ['git add .\ngit commit -m "メッセージ"', '変更をすべてコミットする'],
  ['git push', 'リモートに送る'],
  ['git pull', 'リモートの変更を取り込む'],
  ['git switch -c ブランチ名', '新しいブランチを作って切り替える'],
  ['npm install', '依存パッケージをインストールする'],
  ['npm run dev', '開発モードで起動する'],
  ['npm run build:win', 'Windows 用の .exe を作る']
]

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function CopyButton({ text }: { text: string }): React.JSX.Element {
  const [done, setDone] = useState(false)
  return (
    <button
      className="btn-icon small"
      title="コマンドをコピー"
      onClick={() => {
        navigator.clipboard.writeText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1400)
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}

export function CommandsPage({ onSendToTerminal }: Props): React.JSX.Element {
  const toast = useToast()
  const [list, setList] = useState<SavedCommand[]>([])
  const [loaded, setLoaded] = useState(false)
  const [query, setQuery] = useState('')
  // 編集中: null = なし / 'new' = 新規 / id = その項目
  const [editing, setEditing] = useState<string | null>(null)
  const [command, setCommand] = useState('')
  const [description, setDescription] = useState('')
  const commandRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    window.api
      .loadCommands()
      .then(setList)
      .catch((e) => toast('error', errorMessage(e)))
      .finally(() => setLoaded(true))
  }, [toast])

  const persist = async (next: SavedCommand[]): Promise<void> => {
    try {
      setList(await window.api.saveCommands(next))
    } catch (e) {
      toast('error', `保存できませんでした: ${errorMessage(e)}`)
    }
  }

  const startNew = (): void => {
    setEditing('new')
    setCommand('')
    setDescription('')
    setTimeout(() => commandRef.current?.focus(), 0)
  }

  const startEdit = (c: SavedCommand): void => {
    setEditing(c.id)
    setCommand(c.command)
    setDescription(c.description)
    setTimeout(() => commandRef.current?.focus(), 0)
  }

  const save = async (): Promise<void> => {
    if (!command.trim()) return toast('error', 'コマンドを入力してください')
    if (editing === 'new') {
      await persist([
        {
          id: newId(),
          command: command.trim(),
          description: description.trim(),
          createdAt: new Date().toISOString()
        },
        ...list
      ])
      toast('success', 'コマンドを登録しました')
    } else {
      await persist(
        list.map((c) =>
          c.id === editing ? { ...c, command: command.trim(), description: description.trim() } : c
        )
      )
      toast('success', '更新しました')
    }
    setEditing(null)
  }

  const remove = async (c: SavedCommand): Promise<void> => {
    if (!confirm(`「${c.command.split('\n')[0]}」を削除しますか？`)) return
    await persist(list.filter((x) => x.id !== c.id))
  }

  const addSamples = async (): Promise<void> => {
    const now = new Date().toISOString()
    await persist([
      ...SAMPLES.map(([cmd, desc]) => ({
        id: newId(),
        command: cmd,
        description: desc,
        createdAt: now
      })),
      ...list
    ])
    toast('success', 'よく使うコマンドを追加しました')
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (c) => c.command.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    )
  }, [list, query])

  const form = (
    <div className="cmd-form card">
      <div className="field">
        <label>コマンド</label>
        <textarea
          ref={commandRef}
          className="input mono"
          rows={Math.min(8, Math.max(2, command.split('\n').length))}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="例: git log --oneline -n 10"
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save()
            if (e.key === 'Escape') setEditing(null)
          }}
        />
      </div>
      <div className="field">
        <label>内容（説明）</label>
        <input
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="例: 最近のコミットを10件表示する"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) save()
            if (e.key === 'Escape') setEditing(null)
          }}
        />
      </div>
      <div className="key-row end">
        <span className="muted small-text">
          Ctrl+Enter で保存 ／ 複数行のコマンドも登録できます
        </span>
        <div className="spacer" />
        <button className="btn small" onClick={() => setEditing(null)}>
          キャンセル
        </button>
        <button className="btn btn-primary small" onClick={save}>
          <Save size={14} /> {editing === 'new' ? '登録' : '更新'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>コマンド</h1>
          <p className="subtitle">
            よく使うコマンドを登録して一覧できます（コピー・ターミナルへの入力）
          </p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={startNew}>
            <Plus size={17} /> コマンドを登録
          </button>
        </div>
      </header>

      <div className="toolbar">
        <div className="search wide">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="コマンド・内容で検索"
          />
          {query ? (
            <button className="search-clear" onClick={() => setQuery('')}>
              <X size={15} />
            </button>
          ) : (
            <Search size={16} />
          )}
        </div>
        <span className="muted small-text">{list.length} 件</span>
      </div>

      <div className="card cmd-card">
        {editing === 'new' && form}
        <div className="cmd-table">
          <div className="cmd-row head">
            <span>コマンド</span>
            <span>内容</span>
            <span />
          </div>
          {visible.map((c) =>
            editing === c.id ? (
              <div key={c.id}>{form}</div>
            ) : (
              <div key={c.id} className="cmd-row">
                <pre className="cmd-command">{c.command}</pre>
                <span className="cmd-desc">
                  {c.description || <span className="muted">（説明なし）</span>}
                </span>
                <span className="cmd-actions">
                  <CopyButton text={c.command} />
                  <button
                    className="btn-icon small"
                    title="ターミナルに入力する（Enter は押しません）"
                    onClick={() => onSendToTerminal(c.command)}
                  >
                    <SquareTerminal size={14} />
                  </button>
                  <button className="btn-icon small" title="編集" onClick={() => startEdit(c)}>
                    <Pencil size={14} />
                  </button>
                  <button className="btn-icon small danger" title="削除" onClick={() => remove(c)}>
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
            )
          )}
          {loaded && list.length === 0 && editing !== 'new' && (
            <div className="cmd-empty">
              <CommandIcon size={36} strokeWidth={1.4} />
              <p>まだコマンドが登録されていません</p>
              <div className="key-row">
                <button className="btn btn-primary" onClick={startNew}>
                  <Plus size={16} /> コマンドを登録
                </button>
                <button className="btn" onClick={addSamples}>
                  <Sparkles size={16} /> よく使うコマンドの例を追加
                </button>
              </div>
            </div>
          )}
          {list.length > 0 && visible.length === 0 && (
            <div className="empty">該当するコマンドがありません</div>
          )}
        </div>
      </div>
    </div>
  )
}

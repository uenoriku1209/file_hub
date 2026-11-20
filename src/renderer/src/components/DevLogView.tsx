import { useEffect, useRef } from 'react'
import type { DevLog } from '../../../shared/devenv'

/** 実行中のコマンドの出力 (自動で下までスクロール) */
export function DevLogView({
  logs,
  placeholder
}: {
  logs: DevLog[]
  placeholder?: string
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs])
  return (
    <div className="dev-log" ref={ref}>
      {logs.length === 0 && (
        <div className="dev-log-empty">{placeholder ?? '出力はここに表示されます'}</div>
      )}
      {logs.map((l, i) => (
        <div key={i} className={`dev-log-line ${l.kind}`}>
          {l.kind === 'cmd' ? `$ ${l.text}` : l.text}
        </div>
      ))}
    </div>
  )
}

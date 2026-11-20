import { useEffect, useState } from 'react'
import type { DevEnv, DevLog } from '../../../shared/devenv'

let seq = 0
/** ログを見分けるための作業番号 */
export function newJob(): string {
  seq += 1
  return `job-${Date.now().toString(36)}-${seq}`
}

/** job のログだけを集める */
export function useDevLog(job: string | null): DevLog[] {
  const [logs, setLogs] = useState<DevLog[]>([])
  useEffect(() => {
    setLogs([])
    if (!job) return
    return window.api.devenv.onLog((l) => {
      if (l.job === job)
        setLogs((prev) => (prev.length > 2000 ? [...prev.slice(-1500), l] : [...prev, l]))
    })
  }, [job])
  return logs
}

/** 環境の検出結果は少しのあいだ使い回す (Python の一覧取得に時間がかかるため) */
let cache: { at: number; env: DevEnv } | null = null
let pending: Promise<DevEnv> | null = null

export async function detectEnv(force = false): Promise<DevEnv> {
  if (!force && cache && Date.now() - cache.at < 5 * 60_000) return cache.env
  if (!force && pending) return pending
  pending = window.api.devenv
    .detect()
    .then((env) => {
      cache = { at: Date.now(), env }
      return env
    })
    .finally(() => {
      pending = null
    })
  return pending
}

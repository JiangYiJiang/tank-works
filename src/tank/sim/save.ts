/**
 * 存档。
 *
 * 格式刻意扁：{ v, seed, day, cash, over, log }。
 * 时代下标和快讯游标**不入档** —— 它们完全由 day 决定，存进去只会有两份真相。
 * 读档时重算，所以哪怕手改存档把 era 写错，读回来也是对的。
 */

import { NEWS, TOTAL_DAYS, eraIndexAt } from './calendar'
import { LOG_CAP, STATE_VERSION, type GameState, type LogEntry, type LogKind } from './state'

const LOG_KINDS: readonly LogKind[] = ['era', 'news', 'build', 'order', 'money', 'tech', 'note']

export interface SaveFile {
  v: number
  seed: number
  day: number
  cash: number
  over: boolean
  log: LogEntry[]
}

export function toSaveFile(s: GameState): SaveFile {
  return {
    v: STATE_VERSION,
    seed: s.seed,
    day: s.day,
    cash: Math.round(s.cash),
    over: s.over,
    log: s.log.slice(-LOG_CAP),
  }
}

export function encodeSave(s: GameState): string {
  return JSON.stringify(toSaveFile(s))
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function coerceEntry(raw: unknown): LogEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const d = num(o.d, NaN)
  const t = typeof o.t === 'string' ? o.t : ''
  const k = LOG_KINDS.includes(o.k as LogKind) ? (o.k as LogKind) : 'note'
  if (!Number.isFinite(d) || t.length === 0) return null
  return { d: Math.max(0, Math.min(TOTAL_DAYS - 1, Math.round(d))), k, t }
}

/**
 * 读档。看不懂就返回 null —— 宁可开新局，也不要把半个存档喂给引擎。
 */
export function decodeSave(raw: string | null | undefined): GameState | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const o = parsed as Record<string, unknown>
  const v = num(o.v, 0)
  if (v < 1 || v > STATE_VERSION) return null

  const day = Math.max(0, Math.min(TOTAL_DAYS - 1, Math.round(num(o.day, 0))))
  const log: LogEntry[] = []
  if (Array.isArray(o.log)) {
    for (const e of o.log) {
      const entry = coerceEntry(e)
      if (entry) log.push(entry)
    }
  }

  return {
    version: STATE_VERSION,
    seed: Math.round(num(o.seed, 1)),
    day,
    cash: num(o.cash, 0),
    // 这两个是算出来的，不是读出来的
    era: eraIndexAt(day),
    newsCursor: NEWS.filter((n) => n.day <= day).length,
    log: log.slice(-LOG_CAP),
    over: o.over === true || day >= TOTAL_DAYS - 1,
  }
}

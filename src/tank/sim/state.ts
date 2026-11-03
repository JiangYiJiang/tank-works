/**
 * 存档状态。
 *
 * 一条铁律：**存档里只放「不能被重新算出来的东西」。**
 *
 * 所以这里没有事件队列，只有两个游标（era / news）。
 * 历史快讯是静态表，时代是静态表，威胁水位是静态曲线 ——
 * 玩家推进到第 20,000 天时，存档大小和第 10 天一模一样。
 */

import { ERAS, NEWS, TOTAL_DAYS, eraIndexAt } from './calendar'

export const STATE_VERSION = 2

/** 日志最多留这么多条。够看，又不会让存档随游戏时间一起涨。 */
export const LOG_CAP = 160

export type LogKind = 'era' | 'news' | 'build' | 'order' | 'money' | 'tech' | 'note'

export interface LogEntry {
  /** 天序号 */
  d: number
  k: LogKind
  t: string
}

export interface GameState {
  version: number
  seed: number
  /** 天序号，0 = 1915-01-01 */
  day: number
  cash: number
  /** 当前时期在 ERAS 里的下标（游标，不是队列） */
  era: number
  /** 下一条还没播的历史快讯（游标，不是队列） */
  newsCursor: number
  /** 环形日志，最新的在最后 */
  log: LogEntry[]
  /** 一局是否已经结束 */
  over: boolean
}

export function createGame(seed: number): GameState {
  const state: GameState = {
    version: STATE_VERSION,
    seed,
    day: 0,
    cash: 500_000,
    era: eraIndexAt(0),
    newsCursor: 0,
    log: [],
    over: false,
  }
  pushLog(state, { d: 0, k: 'note', t: `开工。${ERAS[state.era]!.blurb}` })
  return state
}

/** 追加一条日志。超出上限就从最旧的开始丢 —— 存档大小因此有界。 */
export function pushLog(state: GameState, entry: LogEntry): void {
  state.log.push(entry)
  if (state.log.length > LOG_CAP) {
    state.log.splice(0, state.log.length - LOG_CAP)
  }
}

/** 还有多少天结束。0 = 今天就是最后一天。 */
export function daysLeft(state: GameState): number {
  return Math.max(0, TOTAL_DAYS - 1 - state.day)
}

/** 进度 0–1，给进度条用。 */
export function progress(state: GameState): number {
  return Math.min(1, state.day / (TOTAL_DAYS - 1))
}

/** 下一条历史快讯在哪天。没有就返回 -1。 */
export function nextNewsDay(state: GameState): number {
  const item = NEWS[state.newsCursor]
  return item ? item.day : -1
}

/** 下一个时代边界在哪天。没有就返回 -1。 */
export function nextEraDay(state: GameState): number {
  const next = ERAS[state.era + 1]
  return next ? next.from : -1
}

/**
 * 「跳到下一个事件」要跳多少天。
 * 只看静态表里的下两个边界，外加结尾 —— 所以是 O(1)，不需要队列。
 */
export function daysToNextEvent(state: GameState): number {
  let best = TOTAL_DAYS - 1
  const n = nextNewsDay(state)
  if (n > state.day && n < best) best = n
  const e = nextEraDay(state)
  if (e > state.day && e < best) best = e
  return Math.max(0, best - state.day)
}

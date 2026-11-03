/**
 * 存档状态。
 *
 * 一条铁律：**存档里只放「不能被重新算出来的东西」。**
 *
 * 所以这里没有事件队列，只有两个游标（era / news）——历史快讯和时代都是静态表，
 * 推进到第 20,000 天时，这部分和第一天一样大。
 *
 * v3 起，存档开始装「玩家真正做出来的东西」：当前产品、产线、订单、在手合同。
 * v4 再加研发：已掌握的技术世代、在研项目、买过的槽位/速度升级。
 * 这些都是玩家动作的结果，重算不出来，必须存。
 */

import { ERAS, NEWS, TOTAL_DAYS, eraIndexAt } from './calendar'
import { HISTORICAL } from '../data/historical'
import { STARTING_TECH } from '../data/tech'
import type { RawDims, TankDesign } from '../types'
import type { FactoryState } from './factory'

export const STATE_VERSION = 4

/** 日志最多留这么多条。够看，又不会让存档随游戏时间一起涨。 */
export const LOG_CAP = 160

/**
 * 开局现金。
 *
 * 临时尺度：一台 1915 年水平的车约 ¥21 万，一笔小单（4 台）的料 + 工资约 ¥80 万。
 * ¥200 万够走两个来回，但不够直接上大单 —— 等 P0-3 经济尺度重定后再改。
 */
export const START_CASH = 2_000_000

export type LogKind = 'era' | 'news' | 'build' | 'order' | 'money' | 'tech' | 'note'

export interface LogEntry {
  /** 天序号 */
  d: number
  k: LogKind
  t: string
}

/** 一份招标：客户、数量、交期、单价、四维门槛。 */
export interface Offer {
  id: string
  /** 客户国 */
  nation: string
  /** 客户参照的现役车（也是门槛与价的来源） */
  ref: string
  qty: number
  /** 交期（绝对天序号） */
  deadline: number
  /** 单台采购价 */
  unitPrice: number
  /** 四维最低要求（原始物理量，不是分） */
  need: RawDims
  /** 总分门槛 */
  totalMin: number
}

/** 已经接下的订单。 */
export interface ActiveContract extends Offer {
  /** 已交付台数 */
  delivered: number
  /** 接单那天 */
  acceptedDay: number
  /** 逾期过一次就记日志，避免每天刷 */
  late: boolean
  /** 已经收到的回款（含逾期折扣） */
  paid: number
}

/** 一条在研技术。 */
export interface ResearchProject {
  ladder: string
  tier: number
  /** 需要的槽月（已乘超前 / 追赶系数） */
  months: number
  /** 已经投入的槽月 */
  progress: number
  /** 开工时付掉的钱（报表用） */
  cost: number
}

export interface ResearchState {
  /** ladder → 已掌握的最高 tier；0 / 缺省表示还没开始 */
  mastered: Record<string, number>
  projects: ResearchProject[]
  /** 已买的升级，id 形如 `slot-1934` / `speed-1958` */
  upgrades: string[]
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
  /** 当前产品：设计局里那一套六槽位 */
  design: TankDesign
  /** 第一条产线；没接单之前是 null（空档期不烧钱） */
  factory: FactoryState | null
  /** 手上的订单 */
  contract: ActiveContract | null
  /** 桌上有哪几份标 */
  offers: Offer[]
  /** 研发：已掌握的技术、在研项目、升级 */
  research: ResearchState
}

/** 开局掌握的技术：每条梯子取开局里最高的那一代。 */
export function startingMastered(): Record<string, number> {
  const mastered: Record<string, number> = {}
  for (const t of STARTING_TECH) {
    mastered[t.ladder] = Math.max(mastered[t.ladder] ?? 0, t.tier)
  }
  return mastered
}

export function createResearch(): ResearchState {
  return { mastered: startingMastered(), projects: [], upgrades: [] }
}

/** 开局车：FT-17。返回一份深拷贝，避免玩家改设计时污染历史 fixture。 */
export function starterDesign(): TankDesign {
  const h = HISTORICAL.find((x) => x.name.includes('FT-17')) ?? HISTORICAL[0]!
  return JSON.parse(JSON.stringify(h.design)) as TankDesign
}

export function createGame(seed: number): GameState {
  const state: GameState = {
    version: STATE_VERSION,
    seed,
    day: 0,
    cash: START_CASH,
    era: eraIndexAt(0),
    newsCursor: 0,
    log: [],
    over: false,
    design: starterDesign(),
    factory: null,
    contract: null,
    offers: [],
    research: createResearch(),
  }
  pushLog(state, { d: 0, k: 'note', t: `开工。${ERAS[state.era]!.blurb}` })
  pushLog(state, { d: 0, k: 'note', t: '厂里只有一条产线、一份刚开张的名声 —— 先看订单。' })
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

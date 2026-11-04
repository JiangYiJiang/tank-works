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
 * v5 再加信誉与贿赂账，招标自带竞品报价。
 * v6 再加玩家国家，作为厂旗与身份；客户按进入市场年份筛选（阵营暂关）。
 * v7 再加贷款余额与累计账（关厂报告）。
 * 这些都是玩家动作的结果，重算不出来，必须存。
 */

import { ERAS, NEWS, TOTAL_DAYS, eraIndexAt } from './calendar'
import { HISTORICAL } from '../data/historical'
import { STARTING_TECH } from '../data/tech'
import type { RawDims, TankDesign } from '../types'
import type { FactoryState } from './factory'

export const STATE_VERSION = 7

/** 日志最多留这么多条。够看，又不会让存档随游戏时间一起涨。 */
export const LOG_CAP = 160

/**
 * 开局现金。
 *
 * v1 标定：一台 1915 年水平的车约 ¥21 万，一笔小单（4 台）的料 + 工资约 ¥80 万。
 * ¥200 万够走两个来回，但不够直接上大单 —— 这一版刻意保留这个紧张感。
 */
export const START_CASH = 2_000_000

export type LogKind = 'era' | 'news' | 'build' | 'order' | 'money' | 'tech' | 'note'

export interface LogEntry {
  /** 天序号 */
  d: number
  k: LogKind
  t: string
}

/** 竞品报价：同一份标，还有谁在抢。 */
export interface RivalBid {
  name: string
  /** 竞品方案的总分 */
  score: number
  /** 竞品报的单价 */
  price: number
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
  /** 单台采购价（基础价，信誉与压价在接单时算） */
  unitPrice: number
  /** 四维最低要求（原始物理量，不是分） */
  need: RawDims
  /** 总分门槛 */
  totalMin: number
  /** 竞品 */
  rival: RivalBid
  /** 贿赂要花多少（一份标一次） */
  bribeCost: number
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
  /** 占用的科研槽下标；旧存档可缺省 */
  slot?: number
  /** 需要的槽月（已乘超前 / 追赶系数） */
  months: number
  /** 已经投入的槽月 */
  progress: number
  /** 开工时付掉的钱（报表用） */
  cost: number
}

/** 科研槽正在做的升级。 */
export interface SlotUpgradeJob {
  kind: 'upgrade'
  targetLevel: number
  /** 需要几个月 */
  months: number
  progress: number
  cost: number
}

export interface ResearchSlotState {
  level: number
  job: SlotUpgradeJob | null
}

/** 正在建造的下一座科研槽。 */
export interface SlotBuildJob {
  target: number
  months: number
  progress: number
  cost: number
}

export interface ResearchState {
  /** ladder → 已掌握的最高 tier；0 / 缺省表示还没开始 */
  mastered: Record<string, number>
  projects: ResearchProject[]
  /** 已打开的科研槽；第 1 个开局就有 */
  slots: ResearchSlotState[]
  /** 正在解锁下一槽 */
  build: SlotBuildJob | null
  /** 旧的即时升级（1934/1955…），保留兼容旧存档 */
  upgrades: string[]
}

/** 一局累计账，关厂报告用。日志会截断，这些数不能截。 */
export interface Stats {
  /** 累计回款 */
  revenue: number
  /** 累计材料 */
  material: number
  /** 累计工资 + 维持 */
  wages: number
  /** 累计研发（项目 + 槽位维持） */
  research: number
  /** 累计贿赂 */
  bribes: number
  /** 累计罚款 */
  fines: number
  /** 累计利息 */
  interest: number
  /** 完成订单数 */
  contracts: number
  /** 累计出车 */
  produced: number
}

export function createStats(): Stats {
  return { revenue: 0, material: 0, wages: 0, research: 0, bribes: 0, fines: 0, interest: 0, contracts: 0, produced: 0 }
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
  /** 信誉 0–100：影响报价，逾期与贿赂被抓会掉 */
  rep: number
  /** 还没被查的贿赂次数 */
  bribes: number
  /** 玩家工厂所在国（厂旗与身份；不再决定客户阵营） */
  home: string
  /** 银行贷款余额（正数） */
  debt: number
  /** 累计账 */
  stats: Stats
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
  return {
    mastered: startingMastered(),
    projects: [],
    slots: [{ level: 1, job: null }],
    build: null,
    upgrades: [],
  }
}

/** 开局车：FT-17。返回一份深拷贝，避免玩家改设计时污染历史 fixture。 */
export function starterDesign(): TankDesign {
  const h = HISTORICAL.find((x) => x.name.includes('FT-17')) ?? HISTORICAL[0]!
  return JSON.parse(JSON.stringify(h.design)) as TankDesign
}

export function createGame(seed: number, home = 'fra'): GameState {
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
    rep: 50,
    bribes: 0,
    home,
    debt: 0,
    stats: createStats(),
  }
  pushLog(state, { d: 0, k: 'era', t: `${ERAS[state.era]!.name} · ${ERAS[state.era]!.blurb}` })
  pushLog(state, { d: 0, k: 'note', t: '开工。机器是二手的，账本是新的。' })
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

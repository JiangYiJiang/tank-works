/**
 * 经济闭环 · M1：订单 → 排产 → 交付 → 回款。
 *
 * 设计原则和制造局一致：**钱只有一本账**。
 * 这里不发明第二套成本，全部来自设计局的 `buildTank()` 和制造局的 `advanceFactory()`。
 *
 * M1 的简化（写下来是为了以后能一条条替换掉）：
 *   1. 空档期不计维持费 —— 没有订单时厂子冻结，否则挂机必破产；
 *   2. 换型不占 30 天、不收换型费，只把熟练度打到 35%；
 *   3. 首批备料是现货（否则开局要干等 14 天），后续补货仍走 14 天提前期；
 *   4. 逾期只打 7 折，没有信誉、罚款、违约终止；
 *   5. 现金 < 0 立即破产，没有贷款。
 */

import { buildTank } from '../model/build'
import { designYear } from '../model/era'
import { designCheck, techMods } from './research'
import { HISTORICAL } from '../data/historical'
import { customersFor } from '../data/nations'
import { specForGame } from './lines'
import { TOTAL_DAYS, dateOf, formatDate } from './calendar'
import {
  RETOOL_KEEP,
  addLine,
  advanceFactory,
  createFactory,
  inTransitKg,
  orderMaterial,
  stockOf,
  type LineSpec,
  type ProductionLine,
} from './factory'
import { pushLog, type GameState, type Offer } from './state'
import type { RawDims, Tank } from '../types'

/** 第一版的产线规模：200 人 × 一班 = 1,600 工时/天。 */
export const START_WORKERS = 200
export const START_SHIFTS = 1

/** 玩家能选的车：年份不超过「今天 + 2 年」（给一点提前量）。 */
export const PRODUCT_LEAD_YEARS = 2

/** 库存低于「3 台用量」就开始补货，一次补 5 台。 */
export const LOW_WATER_UNITS = 3
export const TOPUP_UNITS = 5

/** 逾期交付的单价折扣。 */
export const LATE_PENALTY = 0.7

/** 竞品设计商。按标轮换，不建 6 套 AI，先用「名字 + 成长系数」把竞争关系立起来。 */
const RIVALS = [
  { name: '莱茵金属', skill: 0.94 },
  { name: '维克斯', skill: 0.92 },
  { name: '施耐德', skill: 0.9 },
  { name: '克虏伯', skill: 0.96 },
  { name: '布尔什维克设计局', skill: 0.93 },
  { name: '岩崎重工', skill: 0.91 },
  { name: '斯柯达', skill: 0.89 },
  { name: '通用动力', skill: 0.95 },
] as const

/** 接单方式：原价 / 压价 5% / 贿赂。 */
export type BidMode = 'normal' | 'undercut' | 'bribe'

/** 稳定哈希：同一局、同一个时代、同一份标，竞品永远一样。 */
function hash(...nums: number[]): number {
  let h = 2166136261
  for (const n of nums) {
    h ^= n
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 信誉对报价的乘数：0 → ×0.90，50 → ×1.00，100 → ×1.10。 */
export function repMult(rep: number): number {
  return 0.9 + Math.max(0, Math.min(100, rep)) / 500
}

/** 这份标按某种方式接，单价是多少。 */
export function bidPrice(offer: Offer, rep: number, mode: BidMode): number {
  const discount = mode === 'undercut' ? 0.95 : 1
  return Math.round(offer.unitPrice * discount * repMult(rep))
}

function clampRep(rep: number): number {
  return Math.max(0, Math.min(100, Math.round(rep)))
}

/** 每个时代客户参照的现役车。门槛与价都从这台车推出来，不手填。 */
const ERA_REFS = [
  '雷诺 FT-17',
  '维克斯中型 Mk.II',
  '三号 F 型',
  'T-34/76',
  '百夫长 Mk.3',
  '豹 1',
  'T-72A',
  '豹 2A4',
] as const

/** 三档标：小单快、大单慢且单价略高。 */
const VARIANTS = [
  { key: 'small', qty: 4, days: 150, factor: 1.3 },
  { key: 'mid', qty: 8, days: 300, factor: 1.35 },
  { key: 'big', qty: 16, days: 540, factor: 1.4 },
] as const

export interface AcceptResult {
  ok: boolean
  msg: string
}

export interface EconomyTick {
  /** 这一天花掉的工资 + 维持费 */
  spent: number
  /** 这一天产出的台数 */
  produced: number
  /** 这一天交付的台数 */
  delivered: number
  /** 这一天收到的钱 */
  income: number
  /** 这一跳之后，订单是不是完成了 */
  contractDone: boolean
  /** 这一跳之后，是不是破产了 */
  bankrupt: boolean
}

/** 当前时代客户参照的现役车。 */
export function referenceFor(era: number): (typeof HISTORICAL)[number] {
  const name = ERA_REFS[Math.max(0, Math.min(ERA_REFS.length - 1, era))]
  return HISTORICAL.find((h) => h.name === name) ?? HISTORICAL[0]!
}

/** 玩家现在能选哪些车。传了研发状态就只列「现在造得出来」的。 */
export function productCandidates(day: number, research?: GameState['research']): (typeof HISTORICAL)[number][] {
  const year = dateOf(day).year + PRODUCT_LEAD_YEARS
  return HISTORICAL.filter(
    (h) => h.year <= year && (!research || designCheck(h.design, research).ok),
  ).sort((a, b) => a.year - b.year)
}

/** 一份标要求的四维 + 总分，是不是被这台车满足了。 */
export function productMeets(tank: Tank, offer: Offer): boolean {
  const r = tank.raw
  return (
    r.armor >= offer.need.armor &&
    r.pen >= offer.need.pen &&
    r.offroad >= offer.need.offroad &&
    r.adapt >= offer.need.adapt &&
    tank.score.total >= offer.totalMin
  )
}

/** 给界面看的一句话门槛。 */
export function needText(offer: Offer): string {
  return `装 ${offer.need.armor} · 火 ${offer.need.pen} · 动 ${offer.need.offroad} · 适 ${offer.need.adapt} · 总分 ${offer.totalMin}`
}

/**
 * 生成 / 刷新桌上的标。
 * 门槛 = 同期现役车四维的 70%，总分 = 同期现役车总分的 55%。
 * 单价 = 同期现役车单台成本 × 1.30 / 1.35 / 1.40。
 */
export function refreshOffers(state: GameState, force = false, day = state.day): void {
  if (state.contract) return
  const era = Math.max(0, Math.min(ERA_REFS.length - 1, state.era))
  const fresh = state.offers.some((o) => o.deadline > day)
  if (!force && fresh && state.offers.length > 0 && state.offers[0]!.id.split('-')[0] === String(era)) return

  const ref = referenceFor(era)
  const tank = buildTank(ref.design)
  const year = dateOf(day).year
  const customers = customersFor(state.home, year)
  const need: RawDims = {
    armor: Math.round(tank.raw.armor * 0.7),
    pen: Math.round(tank.raw.pen * 0.7),
    offroad: Math.round(tank.raw.offroad * 0.7),
    adapt: Math.round(tank.raw.adapt * 0.7),
  }
  const totalMin = Math.round(tank.score.total * 0.55)

  state.offers = VARIANTS.map((v, i) => {
    const h = hash(state.seed, era, day, i)
    const firm = RIVALS[h % RIVALS.length]!
    // 竞品逐年变强：同样的参照车，1991 年的竞品比 1915 年更难打
    const growth = Math.max(0, year - 1915) * 0.001
    const skill = Math.min(1.02, firm.skill + growth + (((h >>> 16) % 7) - 3) / 100)
    const rivalScore = Math.round(tank.score.total * skill)
    const rivalPrice = Math.round(tank.cost.total * v.factor * (0.9 + ((h >>> 8) % 21) / 100))
    const customer = customers[i % Math.max(1, customers.length)]
    return {
      id: `${era}-${v.key}-${day}`,
      nation: customer?.name ?? ref.nation,
      ref: ref.name,
      qty: v.qty,
      deadline: Math.min(TOTAL_DAYS - 1, day + v.days),
      unitPrice: Math.round(tank.cost.total * v.factor),
      need: { ...need },
      totalMin,
      rival: { name: firm.name, score: rivalScore, price: rivalPrice },
      bribeCost: Math.round(tank.cost.total * v.factor * v.qty * 0.08),
    }
  })
}

/** 两份制造参数是不是同一辆车（名字不算，参数才算）。 */
function sameSpec(a: LineSpec, b: LineSpec): boolean {
  return (
    a.baseHours === b.baseHours &&
    a.unitKg === b.unitKg &&
    a.material === b.material &&
    Math.abs(a.yuanPerKg - b.yuanPerKg) < 1e-6
  )
}

/**
 * 接单。
 * 只有四维与总分都达标才能接 —— 这是「偏科的代价」唯一的入口，评分本身不扣分。
 */
export function acceptOffer(state: GameState, offerId: string, mode: BidMode = 'normal'): AcceptResult {
  if (state.over) return { ok: false, msg: '这一局已经结束' }
  if (state.contract) return { ok: false, msg: '手上还有一张订单没交完' }
  const offer = state.offers.find((o) => o.id === offerId)
  if (!offer) return { ok: false, msg: '这份标已经不在桌上了' }
  if (offer.deadline <= state.day) return { ok: false, msg: '这份标已经过期了' }

  const tank = buildTank(state.design, techMods(state.research))
  const gate = designCheck(state.design, state.research)
  if (!gate.ok) return { ok: false, msg: gate.reason }
  const limitYear = dateOf(state.day).year + PRODUCT_LEAD_YEARS
  if (designYear(state.design) > limitYear) {
    return { ok: false, msg: `这辆车的零件 ${designYear(state.design)} 年才成熟，${limitYear} 年前客户不会要` }
  }
  if (!productMeets(tank, offer)) return { ok: false, msg: '四维或总分不达标，客户不会签' }

  if (mode === 'bribe') {
    if (state.cash < offer.bribeCost) {
      return { ok: false, msg: `现金不够贿赂（需要 ¥${offer.bribeCost.toLocaleString('en-US')}）` }
    }
  } else {
    const needScore = mode === 'undercut' ? offer.rival.score * 0.95 : offer.rival.score
    if (tank.score.total < needScore) {
      return {
        ok: false,
        msg: `竞品「${offer.rival.name}」总分 ${offer.rival.score}，你的 ${tank.score.total}：压价 5% 或走贿赂`,
      }
    }
  }

  const spec = specForGame(state)
  const oneUnitMaterial = spec.unitKg * spec.yuanPerKg
  if (state.cash < oneUnitMaterial + (mode === 'bribe' ? offer.bribeCost : 0)) {
    return { ok: false, msg: '现金不够买一台车的料' }
  }

  if (mode === 'bribe') {
    state.cash -= offer.bribeCost
    state.bribes++
    state.stats.bribes += offer.bribeCost
    pushLog(state, {
      d: state.day,
      k: 'order',
      t: `贿赂 ¥${offer.bribeCost.toLocaleString('en-US')}：标是拿下了，账上多了一笔不能见光的支出。`,
    })
  }

  const unitPrice = bidPrice(offer, state.rep, mode)

  if (!state.factory) state.factory = createFactory()
  if (state.factory.lines.length === 0) {
    addLine(state.factory, spec, START_WORKERS, START_SHIFTS)
  } else {
    // 所有产线都换到当前产品；参数没变就只更新标签。
    let changed = false
    for (const line of state.factory.lines) {
      if (!sameSpec(line.spec, spec)) {
        line.spec = spec
        line.built = Math.floor(line.built * RETOOL_KEEP)
        line.progress = 0
        changed = true
      } else if (line.spec.tank !== spec.tank) {
        line.spec.tank = spec.tank
      }
      line.state = 'running'
    }
    if (changed) {
      state.factory.finished = 0
      pushLog(state, {
        d: state.day,
        k: 'build',
        t: `换型到 ${spec.tank}：全部产线熟练度按 ${Math.round(RETOOL_KEEP * 100)}% 保留（不收换型费、不占停机）。`,
      })
    }
  }
  for (const l of state.factory.lines) l.state = 'running'
  state.contract = { ...offer, unitPrice, delivered: 0, acceptedDay: state.day, late: false, paid: 0 }
  state.offers = []

  // 首批备料：最多花掉 60% 现金，至少一台。
  const affordable = Math.floor((state.cash * 0.6) / oneUnitMaterial)
  const units = Math.max(1, Math.min(offer.qty, affordable))
  buyImmediate(state, state.factory.lines[0]!, units)

  pushLog(state, {
    d: state.day,
    k: 'order',
    t: `接单：${offer.nation} ${offer.qty} 台 ${offer.ref} 级，单价 ¥${unitPrice.toLocaleString('en-US')}${
      mode === 'undercut' ? '（压价 5%）' : ''
    }，交期 ${formatDate(offer.deadline)}。`,
  })
  return { ok: true, msg: `接单：${offer.qty} 台` }
}

/**
 * 年度审计：贿赂不是免费的。
 * 每笔未消账的贿赂让被抓概率 +10%，查到了罚款 + 信誉 −15；没查到也会把旧账抹掉。
 * 确定性哈希，同一局同一年结果固定，方便回放和测试。
 */
export function auditBribes(state: GameState, day: number): boolean {
  if (state.bribes <= 0) return false
  const dt = dateOf(day)
  if (dt.month !== 1 || dt.day !== 1) return false
  const chance = Math.min(60, 15 + state.bribes * 10)
  const caught = hash(state.seed, dt.year, 811) % 100 < chance
  state.bribes = 0
  if (!caught) {
    pushLog(state, { d: day, k: 'money', t: '年度审计：旧账没被翻出来。' })
    return false
  }
  const fine = Math.min(500_000, Math.max(0, Math.round(state.cash * 0.1)))
  state.cash -= fine
  state.stats.fines += fine
  state.rep = clampRep(state.rep - 15)
  pushLog(state, {
    d: day,
    k: 'money',
    t: `年度审计出事：罚款 ¥${fine.toLocaleString('en-US')}，信誉 −15。`,
  })
  return true
}
function buyImmediate(state: GameState, line: ProductionLine, units: number): number {
  const f = state.factory
  if (!f) return 0
  const kg = Math.round(line.spec.unitKg * units)
  const cost = Math.round(kg * line.spec.yuanPerKg)
  if (kg <= 0 || cost <= 0 || cost > state.cash) return 0
  f.stock[line.spec.material] = stockOf(f, line.spec.material) + kg
  f.materialSpend += cost
  state.cash -= cost
  state.stats.material += cost
  return cost
}

/** 日常补料：只在「剩余订单还没被库存覆盖」且库存低于 3 台用量时补，14 天后到。 */
function ensureStock(state: GameState, line: ProductionLine, day: number): void {
  const f = state.factory
  const c = state.contract
  if (!f || !c) return
  const have = stockOf(f, line.spec.material) + inTransitKg(f)
  const covered = have / Math.max(1, line.spec.unitKg)
  const uncovered = c.qty - c.delivered - f.finished - covered
  // 首批备料已经够交完这一单：不要再买，免得把现金压在仓库里。
  if (uncovered <= 0) return
  const lines = Math.max(1, f.lines.length)
  if (have >= line.spec.unitKg * LOW_WATER_UNITS * lines) return
  const units = Math.min(TOPUP_UNITS * lines, Math.ceil(uncovered))
  const kg = Math.round(line.spec.unitKg * units)
  const price = Math.round(kg * line.spec.yuanPerKg)
  // 留一半现金发工资
  if (price > state.cash * 0.5) return
  const r = orderMaterial(f, line.spec.material, kg, line.spec.yuanPerKg, day)
  if (r.ok) {
    state.cash -= r.cost
    state.stats.material += r.cost
  }
}

/**
 * 推进一天。由 `advanceDays()` 每圈调用一次。
 * 只在有订单时调用 —— 空档期不烧钱（M1 简化）。
 */
export function economyDay(state: GameState, day: number): EconomyTick {
  const out: EconomyTick = {
    spent: 0,
    produced: 0,
    delivered: 0,
    income: 0,
    contractDone: false,
    bankrupt: false,
  }
  const c = state.contract
  const f = state.factory
  if (!c || !f || state.over) return out
  const line = f.lines[0]
  if (!line) return out

  ensureStock(state, line, day)
  const tick = advanceFactory(f, day, 1)
  state.cash -= tick.spent
  out.spent = tick.spent
  out.produced = tick.produced
  state.stats.wages += tick.spent
  state.stats.produced += tick.produced

  const remaining = c.qty - c.delivered
  const n = Math.min(f.finished, remaining)
  if (n > 0) {
    f.finished -= n
    const late = day > c.deadline
    const unit = late ? c.unitPrice * LATE_PENALTY : c.unitPrice
    const income = Math.round(n * unit)
    state.cash += income
    c.delivered += n
    c.paid += income
    out.delivered = n
    out.income = income
    state.stats.revenue += income
    if (late && !c.late) {
      c.late = true
      pushLog(state, {
        d: day,
        k: 'money',
        t: `逾期交付：单价按 ${Math.round(LATE_PENALTY * 100)}% 结算。`,
      })
    }
  }

  if (c.delivered >= c.qty) {
    pushLog(state, {
      d: day,
      k: 'money',
      t: `订单完成：${c.nation} ${c.qty} 台，${c.late ? '逾期结算' : '按期交付'}。`,
    })
    state.rep = clampRep(state.rep + (c.late ? -5 : 2))
    state.stats.contracts++
    state.contract = null
    for (const l of f.lines) if (l.state === 'running') l.state = 'idle'
    out.contractDone = true
    refreshOffers(state, true, day)
  }

  return out
}

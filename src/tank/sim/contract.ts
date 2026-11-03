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
import { HISTORICAL } from '../data/historical'
import { TOTAL_DAYS, dateOf, formatDate } from './calendar'
import {
  RETOOL_KEEP,
  addLine,
  advanceFactory,
  createFactory,
  inTransitKg,
  orderMaterial,
  specOf,
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

/** 玩家现在能选哪些车。 */
export function productCandidates(day: number): (typeof HISTORICAL)[number][] {
  const year = dateOf(day).year + PRODUCT_LEAD_YEARS
  return HISTORICAL.filter((h) => h.year <= year).sort((a, b) => a.year - b.year)
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
  const need: RawDims = {
    armor: Math.round(tank.raw.armor * 0.7),
    pen: Math.round(tank.raw.pen * 0.7),
    offroad: Math.round(tank.raw.offroad * 0.7),
    adapt: Math.round(tank.raw.adapt * 0.7),
  }
  const totalMin = Math.round(tank.score.total * 0.55)

  state.offers = VARIANTS.map((v) => ({
    id: `${era}-${v.key}-${day}`,
    nation: ref.nation,
    ref: ref.name,
    qty: v.qty,
    deadline: Math.min(TOTAL_DAYS - 1, day + v.days),
    unitPrice: Math.round(tank.cost.total * v.factor),
    need: { ...need },
    totalMin,
  }))
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
export function acceptOffer(state: GameState, offerId: string): AcceptResult {
  if (state.over) return { ok: false, msg: '这一局已经结束' }
  if (state.contract) return { ok: false, msg: '手上还有一张订单没交完' }
  const offer = state.offers.find((o) => o.id === offerId)
  if (!offer) return { ok: false, msg: '这份标已经不在桌上了' }
  if (offer.deadline <= state.day) return { ok: false, msg: '这份标已经过期了' }

  const tank = buildTank(state.design)
  const limitYear = dateOf(state.day).year + PRODUCT_LEAD_YEARS
  if (designYear(state.design) > limitYear) {
    return { ok: false, msg: `这辆车的零件 ${designYear(state.design)} 年才成熟，${limitYear} 年前客户不会要` }
  }
  if (!productMeets(tank, offer)) return { ok: false, msg: '四维或总分不达标，客户不会签' }

  const spec = specOf(tank)
  const oneUnitMaterial = spec.unitKg * spec.yuanPerKg
  if (state.cash < oneUnitMaterial) return { ok: false, msg: '现金不够买一台车的料' }

  if (!state.factory) state.factory = createFactory()
  let line = state.factory.lines[0]
  if (!line) {
    line = addLine(state.factory, spec, START_WORKERS, START_SHIFTS)
  } else if (!sameSpec(line.spec, spec)) {
    line.spec = spec
    line.built = Math.floor(line.built * RETOOL_KEEP)
    line.progress = 0
    // 旧型号的成品不能算到新客户头上，直接清掉（M1 简化）。
    state.factory.finished = 0
    pushLog(state, {
      d: state.day,
      k: 'build',
      t: `换型到 ${spec.tank}：熟练度按 ${Math.round(RETOOL_KEEP * 100)}% 保留（M1 不收换型费、不占停机）。`,
    })
  } else if (line.spec.tank !== spec.tank) {
    // 只改了名字、参数没动：不算换型，只更新标签。
    line.spec.tank = spec.tank
  }
  line.state = 'running'
  state.contract = { ...offer, delivered: 0, acceptedDay: state.day, late: false, paid: 0 }
  state.offers = []

  // 首批备料：最多花掉 60% 现金，至少一台。
  const affordable = Math.floor((state.cash * 0.6) / oneUnitMaterial)
  const units = Math.max(1, Math.min(offer.qty, affordable))
  buyImmediate(state, line, units)

  pushLog(state, {
    d: state.day,
    k: 'order',
    t: `接单：${offer.nation} ${offer.qty} 台 ${offer.ref} 级，单价 ¥${offer.unitPrice.toLocaleString('en-US')}，交期 ${formatDate(offer.deadline)}。`,
  })
  return { ok: true, msg: `接单：${offer.qty} 台` }
}

/** 现货备料（M1 首批用）。 */
function buyImmediate(state: GameState, line: ProductionLine, units: number): number {
  const f = state.factory
  if (!f) return 0
  const kg = Math.round(line.spec.unitKg * units)
  const cost = Math.round(kg * line.spec.yuanPerKg)
  if (kg <= 0 || cost <= 0 || cost > state.cash) return 0
  f.stock[line.spec.material] = stockOf(f, line.spec.material) + kg
  f.materialSpend += cost
  state.cash -= cost
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
  if (have >= line.spec.unitKg * LOW_WATER_UNITS) return
  const units = Math.min(TOPUP_UNITS, Math.ceil(uncovered))
  const kg = Math.round(line.spec.unitKg * units)
  const price = Math.round(kg * line.spec.yuanPerKg)
  // 留一半现金发工资
  if (price > state.cash * 0.5) return
  const r = orderMaterial(f, line.spec.material, kg, line.spec.yuanPerKg, day)
  if (r.ok) state.cash -= r.cost
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
    state.contract = null
    if (line.state === 'running') line.state = 'idle'
    out.contractDone = true
    refreshOffers(state, true, day)
  }

  if (state.cash < 0) {
    state.over = true
    out.bankrupt = true
    if (line.state === 'running') line.state = 'idle'
    pushLog(state, { d: day, k: 'note', t: '现金见底：工资发不出来，厂子破产了。' })
  }

  return out
}

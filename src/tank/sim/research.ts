/**
 * 研发局：已掌握的技术、在研项目、槽位与速度。
 *
 * 三件事分开算：
 *   1. **时间**：项目以「槽月」推进，时代强度（战争）让同样的月份产出更多；
 *   2. **钱**：开工时付研发费，项目在跑的时候付槽位维持费；
 *   3. **解锁**：每掌握一代，本板块的「可造年份」往前推，零件表才跟着放开。
 *
 * 这里不碰 DOM，也不碰订单；主循环只问它三件事：
 * `startResearch()` / `advanceResearch()` / `designCheck()`。
 */

import {
  SLOT_UPKEEP_BASE,
  SLOT_UPGRADES,
  SPEED_UPGRADES,
  TECH,
  TECH_BY_ID,
  effortMult,
  intensityAt,
  upkeepIndex,
  type ResearchUpgrade,
  type TechBoard,
  type TechTier,
} from '../data/tech'
import { AUX_BY_ID, ARMOR_MATERIALS, AUXES, ENGINES, ENGINE_BY_ID, GUNS, GUN_BY_ID, HULLS, HULL_BY_ID, MATERIAL_BY_ID, SUSPENSION_BY_ID, SUSPENSIONS } from '../data/parts'
import { dateOf } from './calendar'
import { pushLog, type GameState, type ResearchState } from './state'
import type { TankDesign } from '../types'

/** 一个月的平均天数。用它把「天」换成「槽月」。 */
export const DAYS_PER_MONTH = 30.4375

/** 开局能造的零件年份：1915 + 2。 */
const BASE_YEAR = 1915
const PART_LEAD_YEARS = 2

export interface TechLimits {
  /** 首上 / 炮塔倾角上限（度） */
  slopeMax: number
  /** 尖头首上收益；1 = 还没解锁 */
  pike: number
  /** 口径上限 mm */
  caliberMax: number
  /** 身管上限（倍径） */
  barrelMax: number
  /** 装药上限 */
  chargeMax: number
  /** 工时倍率（焊接 0.85 / 铸造 0.9） */
  labor: number
}

export const DEFAULT_LIMITS: TechLimits = {
  slopeMax: 20,
  pike: 1,
  caliberMax: 57,
  barrelMax: 30,
  chargeMax: 0.6,
  labor: 1,
}

export interface DesignCheck {
  ok: boolean
  reason: string
}

interface UpgradeEntry {
  id: string
  kind: 'slot' | 'speed'
  u: ResearchUpgrade
}

function allUpgrades(): UpgradeEntry[] {
  return [
    ...SLOT_UPGRADES.map((u) => ({ id: `slot-${u.year}`, kind: 'slot' as const, u })),
    ...SPEED_UPGRADES.map((u) => ({ id: `speed-${u.year}`, kind: 'speed' as const, u })),
  ]
}

export function upgradeById(id: string): UpgradeEntry | null {
  return allUpgrades().find((x) => x.id === id) ?? null
}

export function masteredOf(r: ResearchState, ladder: string): number {
  return r.mastered[ladder] ?? 0
}

export function isMastered(state: GameState, tierId: string): boolean {
  const t = TECH_BY_ID.get(tierId)
  return t ? masteredOf(state.research, t.ladder) >= t.tier : false
}

export function slotsOf(r: ResearchState): number {
  return 1 + allUpgrades().filter((x) => x.kind === 'slot' && r.upgrades.includes(x.id)).length
}

export function speedOf(r: ResearchState): number {
  return allUpgrades()
    .filter((x) => x.kind === 'speed' && r.upgrades.includes(x.id))
    .reduce((m, x) => m * (x.u.mult ?? 1), 1)
}

/** 每月维持费（只在有在研项目时扣）。 */
export function monthlyUpkeep(r: ResearchState, year: number): number {
  const base = SLOT_UPKEEP_BASE * upkeepIndex(year) * slotsOf(r)
  const extra = allUpgrades()
    .filter((x) => r.upgrades.includes(x.id))
    .reduce((s, x) => s + x.u.upkeep, 0)
  return Math.round(base + extra)
}

/** 这个板块「今天能造到哪一年」的零件。 */
export function boardYear(r: ResearchState, board: TechBoard): number {
  let year = 0
  for (const [ladder, tier] of Object.entries(r.mastered)) {
    if (tier <= 0) continue
    const t = TECH_BY_ID.get(`${ladder}.${tier}`)
    if (t && t.board === board && t.year > year) year = t.year
  }
  return Math.max(BASE_YEAR, year)
}

export function partAvailable(era: number, board: TechBoard, r: ResearchState): boolean {
  return era <= boardYear(r, board) + PART_LEAD_YEARS
}

/** 当前科技能改出来的上限。 */
export function techLimits(r: ResearchState): TechLimits {
  const limits: TechLimits = { ...DEFAULT_LIMITS }
  let laborYear = -1
  for (const [ladder, tier] of Object.entries(r.mastered)) {
    if (tier <= 0) continue
    const t = TECH_BY_ID.get(`${ladder}.${tier}`)
    if (!t?.fn) continue
    if (t.fn.slopeMax !== undefined) limits.slopeMax = Math.max(limits.slopeMax, t.fn.slopeMax)
    if (t.fn.pike !== undefined) limits.pike = Math.max(limits.pike, t.fn.pike)
    if (t.fn.caliberMax !== undefined) limits.caliberMax = Math.max(limits.caliberMax, t.fn.caliberMax)
    if (t.fn.barrelMax !== undefined) limits.barrelMax = Math.max(limits.barrelMax, t.fn.barrelMax)
    if (t.fn.chargeMax !== undefined) limits.chargeMax = Math.max(limits.chargeMax, t.fn.chargeMax)
    if (t.fn.labor !== undefined && t.year > laborYear) {
      limits.labor = t.fn.labor
      laborYear = t.year
    }
  }
  return limits
}

const BOARD_OF_SLOT = {
  hull: 'armor',
  material: 'armor',
  gun: 'gun',
  engine: 'power',
  suspension: 'run',
  aux: 'aux',
} as const satisfies Record<string, TechBoard>

/**
 * 这辆车现在能不能造。
 * 这是「研发 → 设计局」唯一的硬闸门：零件年份、倾角、口径、倍径、装药都要在已掌握范围内。
 */
export function designCheck(design: TankDesign, r: ResearchState): DesignCheck {
  const hull = HULL_BY_ID.get(design.hull)
  const gun = GUN_BY_ID.get(design.gun)
  const engine = ENGINE_BY_ID.get(design.engine)
  const susp = SUSPENSION_BY_ID.get(design.suspension)
  const aux = AUX_BY_ID.get(design.aux)
  const mat = MATERIAL_BY_ID.get(design.armor.material)
  const turretMat = MATERIAL_BY_ID.get(design.armor.turretMaterial ?? design.armor.material)
  if (!hull || !gun || !engine || !susp || !aux || !mat || !turretMat) {
    return { ok: false, reason: '设计里有一个零件不认识' }
  }

  const checks: Array<[boolean, string]> = [
    [partAvailable(hull.era, BOARD_OF_SLOT.hull, r), `车体「${hull.name}」要到 ${hull.era} 年`],
    [partAvailable(mat.era, BOARD_OF_SLOT.material, r), `车体装甲「${mat.name}」要到 ${mat.era} 年`],
    [partAvailable(turretMat.era, BOARD_OF_SLOT.material, r), `炮塔装甲「${turretMat.name}」要到 ${turretMat.era} 年`],
    [partAvailable(gun.era, BOARD_OF_SLOT.gun, r), `火炮「${gun.name}」要到 ${gun.era} 年`],
    [partAvailable(engine.era, BOARD_OF_SLOT.engine, r), `发动机「${engine.name}」要到 ${engine.era} 年`],
    [partAvailable(susp.era, BOARD_OF_SLOT.suspension, r), `悬挂「${susp.name}」要到 ${susp.era} 年`],
    [partAvailable(aux.era, BOARD_OF_SLOT.aux, r), `辅助设备「${aux.name}」要到 ${aux.era} 年`],
  ]
  for (const [ok, reason] of checks) if (!ok) return { ok: false, reason }

  const limits = techLimits(r)
  if (design.armor.frontSlope > limits.slopeMax) {
    return { ok: false, reason: `倾角 ${design.armor.frontSlope}° 超过当前上限 ${limits.slopeMax}°（先研发大倾角设计）` }
  }
  if (design.armor.turretSlope > limits.slopeMax) {
    return { ok: false, reason: `炮塔倾角 ${design.armor.turretSlope}° 超过当前上限 ${limits.slopeMax}°` }
  }
  if (design.armor.pike && limits.pike <= 1) {
    return { ok: false, reason: '尖头首上（pike）还没研发' }
  }
  if (gun.caliber > limits.caliberMax) {
    return { ok: false, reason: `口径 ${gun.caliber}mm 超过当前上限 ${limits.caliberMax}mm（先研发大口径炮）` }
  }
  if (gun.barrelCalibers > limits.barrelMax) {
    return { ok: false, reason: `身管 ${gun.barrelCalibers} 倍径超过当前上限 ${limits.barrelMax}（先研发长身管）` }
  }
  if (gun.charge > limits.chargeMax) {
    return { ok: false, reason: `装药 ${gun.charge} 超过当前上限 ${limits.chargeMax}（先研发高膛压炮尾）` }
  }
  return { ok: true, reason: '' }
}

/** 每条梯子下一个能开工的世代。 */
export function availableTechs(state: GameState): TechTier[] {
  const out: TechTier[] = []
  for (const t of TECH) {
    if (t.months <= 0) continue
    const next = masteredOf(state.research, t.ladder) + 1
    if (t.tier !== next) continue
    if (!t.needs.every((id) => isMastered(state, id))) continue
    if (state.research.projects.some((p) => p.ladder === t.ladder)) continue
    out.push(t)
  }
  return out.sort((a, b) => a.year - b.year || a.id.localeCompare(b.id))
}

export interface Effort {
  months: number
  cost: number
  mult: number
}

/** 今天开工要付多少：基础工期/费用 × 超前或追赶系数。 */
export function effortForTier(state: GameState, tier: TechTier): Effort {
  const year = dateOf(state.day).year
  const mult = effortMult(tier.year, year)
  return {
    months: Math.max(0.05, tier.months * mult),
    cost: Math.round(tier.cost * mult),
    mult,
  }
}

export interface ActionResult {
  ok: boolean
  msg: string
}

export function startResearch(state: GameState, tierId: string): ActionResult {
  if (state.over) return { ok: false, msg: '这一局已经结束' }
  const tier = TECH_BY_ID.get(tierId)
  if (!tier) return { ok: false, msg: '没有这条技术' }
  if (state.research.projects.length >= slotsOf(state.research)) {
    return { ok: false, msg: `科研槽满了（${slotsOf(state.research)} 个）` }
  }
  if (masteredOf(state.research, tier.ladder) + 1 !== tier.tier) {
    return { ok: false, msg: '只能沿着梯子往上研发' }
  }
  if (!tier.needs.every((id) => isMastered(state, id))) {
    return { ok: false, msg: '前置技术还没掌握' }
  }
  if (state.research.projects.some((p) => p.ladder === tier.ladder)) {
    return { ok: false, msg: '这条梯子已经在研了' }
  }
  if (tier.months <= 0) return { ok: false, msg: '这条技术没有工期数据' }

  const effort = effortForTier(state, tier)
  if (state.cash < effort.cost) return { ok: false, msg: `现金不够（需要 ¥${effort.cost.toLocaleString('en-US')}）` }

  state.cash -= effort.cost
  state.research.projects.push({
    ladder: tier.ladder,
    tier: tier.tier,
    months: effort.months,
    progress: 0,
    cost: effort.cost,
  })
  pushLog(state, {
    d: state.day,
    k: 'tech',
    t: `开工：${tier.name}（${effort.months.toFixed(1)} 槽月 / ¥${effort.cost.toLocaleString('en-US')}${effort.mult === 1 ? '' : `，×${effort.mult.toFixed(2)}`}）。`,
  })
  return { ok: true, msg: `开工：${tier.name}` }
}

export interface ResearchTick {
  completed: number
  /** 这一跳的槽位维持费 */
  spent: number
}

/**
 * 推进研发。按天调用。
 * 项目以「槽月」推进：进度 += 天数 / 30.44 × 速度 × 时代强度。
 */
export function advanceResearch(state: GameState, day: number, days: number): ResearchTick {
  const out: ResearchTick = { completed: 0, spent: 0 }
  const r = state.research
  if (state.over || r.projects.length === 0) return out

  const year = dateOf(day).year
  const perMonth = speedOf(r) * intensityAt(year)
  const done: typeof r.projects = []
  for (const p of r.projects) {
    p.progress += (days / DAYS_PER_MONTH) * perMonth
    if (p.progress >= p.months) done.push(p)
  }
  for (const p of done) {
    r.mastered[p.ladder] = Math.max(masteredOf(r, p.ladder), p.tier)
    const t = TECH_BY_ID.get(`${p.ladder}.${p.tier}`)
    pushLog(state, { d: day, k: 'tech', t: `研发完成：${t?.name ?? p.ladder}（第 ${p.tier} 代）。` })
    out.completed++
  }
  if (done.length > 0) {
    r.projects = r.projects.filter((p) => !done.includes(p))
  }

  out.spent = Math.round((monthlyUpkeep(r, year) * days) / DAYS_PER_MONTH)
  return out
}

/**
 * 给设计局的科技快照：哪些零件能选、上限是多少。
 * 设计局是独立页面，只能通过 localStorage 拿到这份快照。
 */
export interface TechSnapshot {
  at: number
  /** 快照对应的游戏年份（给界面看） */
  year: number
  mastered: Record<string, number>
  limits: TechLimits
  parts: {
    hull: string[]
    material: string[]
    gun: string[]
    engine: string[]
    suspension: string[]
    aux: string[]
  }
}

export function techSnapshot(state: GameState): TechSnapshot {
  const r = state.research
  const limits = techLimits(r)
  return {
    at: Date.now(),
    year: dateOf(state.day).year,
    mastered: { ...r.mastered },
    limits,
    parts: {
      hull: HULLS.filter((h) => partAvailable(h.era, 'armor', r)).map((h) => h.id),
      material: ARMOR_MATERIALS.filter((m) => partAvailable(m.era, 'armor', r)).map((m) => m.id),
      gun: GUNS.filter(
        (g) =>
          partAvailable(g.era, 'gun', r) &&
          g.caliber <= limits.caliberMax &&
          g.barrelCalibers <= limits.barrelMax &&
          g.charge <= limits.chargeMax,
      ).map((g) => g.id),
      engine: ENGINES.filter((e) => partAvailable(e.era, 'power', r)).map((e) => e.id),
      suspension: SUSPENSIONS.filter((s) => partAvailable(s.era, 'run', r)).map((s) => s.id),
      aux: AUXES.filter((a) => partAvailable(a.era, 'aux', r)).map((a) => a.id),
    },
  }
}

/** 买槽位 / 速度升级。id 是 `slot-1934` 这种。 */export function buyResearchUpgrade(state: GameState, id: string): ActionResult {
  if (state.over) return { ok: false, msg: '这一局已经结束' }
  const entry = upgradeById(id)
  if (!entry) return { ok: false, msg: '没有这个升级' }
  if (state.research.upgrades.includes(id)) return { ok: false, msg: '已经买过了' }
  if (dateOf(state.day).year < entry.u.year) return { ok: false, msg: `${entry.u.year} 年才开放` }
  if (state.cash < entry.u.cost) return { ok: false, msg: `现金不够（需要 ¥${entry.u.cost.toLocaleString('en-US')}）` }
  state.cash -= entry.u.cost
  state.research.upgrades.push(id)
  pushLog(state, {
    d: state.day,
    k: 'tech',
    t: `研发局升级：${entry.u.name}（${entry.u.effect}），一次性 ¥${entry.u.cost.toLocaleString('en-US')}。`,
  })
  return { ok: true, msg: `买下：${entry.u.name}` }
}

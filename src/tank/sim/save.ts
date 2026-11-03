/**
 * 存档。
 *
 * v3 起存档分两半：
 *   - 可重算的部分（时代、快讯游标）**不入档**，读档时由 day 重算；
 *   - 不可重算的部分（产品、产线、订单、在手合同、研发进度）必须存。
 *
 * 读档策略仍然是「宽进严出」：字段坏了就退回默认值，整体不像样才返回 null。
 * v1 / v2 / v3 的老存档可以直接读：产品默认 FT-17、没有产线/订单、研发回到开局水平。
 */

import { NEWS, TOTAL_DAYS, eraIndexAt } from './calendar'
import { buildTank } from '../model/build'
import { TECH_BY_ID } from '../data/tech'
import { NATION_BY_ID } from '../data/nations'
import { upgradeById } from './research'
import {
  LOG_CAP,
  STATE_VERSION,
  createResearch,
  starterDesign,
  type ActiveContract,
  type GameState,
  type LogEntry,
  type LogKind,
  type Offer,
  type ResearchProject,
  type ResearchState,
} from './state'
import type { FactoryState, LineState, ProductionLine, PurchaseOrder } from './factory'
import type { ArmorMaterialId, TankDesign } from '../types'

const LOG_KINDS: readonly LogKind[] = ['era', 'news', 'build', 'order', 'money', 'tech', 'note']
const LINE_STATES: readonly LineState[] = ['running', 'idle', 'retooling']

export interface SaveFile {
  v: number
  seed: number
  day: number
  cash: number
  over: boolean
  log: LogEntry[]
  design: TankDesign
  factory: FactoryState | null
  contract: ActiveContract | null
  offers: Offer[]
  research: ResearchState
  rep: number
  bribes: number
  home: string
}

export function toSaveFile(s: GameState): SaveFile {
  return {
    v: STATE_VERSION,
    seed: s.seed,
    day: s.day,
    cash: Math.round(s.cash),
    over: s.over,
    log: s.log.slice(-LOG_CAP),
    design: s.design,
    factory: s.factory,
    contract: s.contract,
    offers: s.offers,
    research: s.research,
    rep: s.rep,
    bribes: s.bribes,
    home: s.home,
  }
}

export function encodeSave(s: GameState): string {
  return JSON.stringify(toSaveFile(s))
}

// ────────────────────────────────────────────────────────────
// 读档时的清洗
// ────────────────────────────────────────────────────────────

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function clamp(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = num(v, fallback)
  return Math.max(lo, Math.min(hi, n))
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
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

/** 产品：字段坏就补默认值，最后让 buildTank 做一次「能不能算」的终审。 */
function coerceDesign(raw: unknown): TankDesign {
  const fallback = starterDesign()
  const d = obj(raw)
  const a = obj(d?.armor)
  if (!d || !a) return fallback

  const armor: TankDesign['armor'] = {
    material: (typeof a.material === 'string' ? a.material : fallback.armor.material) as ArmorMaterialId,
    front: clamp(a.front, 0, 400, fallback.armor.front),
    frontSlope: clamp(a.frontSlope, 0, 84, fallback.armor.frontSlope),
    side: clamp(a.side, 0, 300, fallback.armor.side),
    turretFront: clamp(a.turretFront, 0, 400, fallback.armor.turretFront),
    turretSlope: clamp(a.turretSlope, 0, 84, fallback.armor.turretSlope),
  }
  if (typeof a.turretMaterial === 'string') armor.turretMaterial = a.turretMaterial as ArmorMaterialId
  if (a.pike === true) armor.pike = true

  const design: TankDesign = {
    name: typeof d.name === 'string' && d.name.length > 0 ? d.name.slice(0, 40) : fallback.name,
    hull: typeof d.hull === 'string' ? d.hull : fallback.hull,
    armor,
    gun: typeof d.gun === 'string' ? d.gun : fallback.gun,
    engine: typeof d.engine === 'string' ? d.engine : fallback.engine,
    suspension: typeof d.suspension === 'string' ? d.suspension : fallback.suspension,
    aux: typeof d.aux === 'string' ? d.aux : fallback.aux,
  }
  try {
    buildTank(design)
    return design
  } catch {
    return fallback
  }
}

function coerceLine(raw: unknown): ProductionLine | null {
  const l = obj(raw)
  const s = obj(l?.spec)
  if (!l || !s) return null
  if (
    typeof s.tank !== 'string' ||
    typeof s.material !== 'string' ||
    !Number.isFinite(num(s.baseHours, NaN)) ||
    !Number.isFinite(num(s.unitKg, NaN)) ||
    !Number.isFinite(num(s.yuanPerKg, NaN))
  ) {
    return null
  }
  const state = LINE_STATES.includes(l.state as LineState) ? (l.state as LineState) : 'idle'
  return {
    id: Math.round(clamp(l.id, 1, 1e9, 1)),
    spec: {
      tank: s.tank.slice(0, 40),
      baseHours: clamp(s.baseHours, 1, 1e7, 1),
      unitKg: clamp(s.unitKg, 1, 1e6, 1),
      material: s.material as ArmorMaterialId,
      yuanPerKg: clamp(s.yuanPerKg, 0, 1e6, 0),
    },
    built: Math.round(clamp(l.built, 0, 1e6, 0)),
    progress: clamp(l.progress, 0, 1e9, 0),
    workers: Math.round(clamp(l.workers, 50, 20_000, 200)),
    shifts: Math.round(clamp(l.shifts, 1, 3, 1)),
    state,
    retoolDays: Math.round(clamp(l.retoolDays, 0, 365, 0)),
    retoolTo: null,
    starved: Math.round(clamp(l.starved, 0, 1e6, 0)),
  }
}

function coerceFactory(raw: unknown): FactoryState | null {
  const f = obj(raw)
  if (!f || !Array.isArray(f.lines) || !obj(f.stock)) return null
  const lines = f.lines.map(coerceLine).filter((x): x is ProductionLine => x !== null)
  if (lines.length === 0 && f.lines.length > 0) return null

  const stock: Partial<Record<ArmorMaterialId, number>> = {}
  for (const [k, v] of Object.entries(f.stock as Record<string, unknown>)) {
    const kg = num(v, NaN)
    if (Number.isFinite(kg) && kg >= 0) stock[k as ArmorMaterialId] = Math.min(kg, 1e9)
  }

  const orders: PurchaseOrder[] = []
  if (Array.isArray(f.orders)) {
    for (const rawOrder of f.orders) {
      const o = obj(rawOrder)
      if (!o) continue
      const kg = num(o.kg, NaN)
      if (!Number.isFinite(kg) || kg <= 0) continue
      orders.push({
        id: Math.round(clamp(o.id, 1, 1e9, 1)),
        material: (typeof o.material === 'string' ? o.material : 'rha') as ArmorMaterialId,
        kg,
        price: clamp(o.price, 0, 1e12, 0),
        arriveDay: Math.round(clamp(o.arriveDay, 0, TOTAL_DAYS - 1, 0)),
      })
    }
  }

  return {
    lines,
    stock,
    warehouseKg: clamp(f.warehouseKg, 100_000, 1e9, 2_500_000),
    orders,
    finished: Math.round(clamp(f.finished, 0, 1e6, 0)),
    produced: Math.round(clamp(f.produced, 0, 1e6, 0)),
    materialSpend: clamp(f.materialSpend, 0, 1e12, 0),
    wageSpend: clamp(f.wageSpend, 0, 1e12, 0),
    nextId: Math.round(clamp(f.nextId, 1, 1e9, 1)),
  }
}

function coerceOffer(raw: unknown): Offer | null {
  const o = obj(raw)
  const need = obj(o?.need)
  if (!o || !need) return null
  if (typeof o.id !== 'string' || typeof o.ref !== 'string' || typeof o.nation !== 'string') return null
  const qty = Math.round(clamp(o.qty, 1, 10_000, NaN))
  const deadline = Math.round(clamp(o.deadline, 0, TOTAL_DAYS - 1, NaN))
  if (!Number.isFinite(qty) || !Number.isFinite(deadline)) return null
  const unitPrice = clamp(o.unitPrice, 0, 1e12, 0)
  const rawRival = obj(o.rival)
  const rival =
    rawRival && typeof rawRival.name === 'string'
      ? {
          name: rawRival.name.slice(0, 40),
          score: clamp(rawRival.score, 0, 1e5, 0),
          price: clamp(rawRival.price, 0, 1e12, unitPrice),
        }
      : { name: '旧标', score: 0, price: unitPrice }
  return {
    id: o.id.slice(0, 60),
    nation: o.nation.slice(0, 40),
    ref: o.ref.slice(0, 40),
    qty,
    deadline,
    unitPrice,
    need: {
      armor: clamp(need.armor, 0, 1e5, 0),
      pen: clamp(need.pen, 0, 1e5, 0),
      offroad: clamp(need.offroad, 0, 1e5, 0),
      adapt: clamp(need.adapt, 0, 1e5, 0),
    },
    totalMin: clamp(o.totalMin, 0, 1e5, 0),
    rival,
    bribeCost: clamp(o.bribeCost, 0, 1e12, Math.round(unitPrice * qty * 0.08)),
  }
}

function coerceContract(raw: unknown): ActiveContract | null {
  const base = coerceOffer(raw)
  const o = obj(raw)
  if (!base || !o) return null
  return {
    ...base,
    delivered: Math.round(clamp(o.delivered, 0, base.qty, 0)),
    acceptedDay: Math.round(clamp(o.acceptedDay, 0, TOTAL_DAYS - 1, 0)),
    late: o.late === true,
    paid: clamp(o.paid, 0, 1e12, 0),
  }
}

function coerceResearch(raw: unknown): ResearchState {
  const base = createResearch()
  const o = obj(raw)
  if (!o) return base

  const mastered: Record<string, number> = { ...base.mastered }
  const rawMastered = obj(o.mastered)
  if (rawMastered) {
    for (const [ladder, tier] of Object.entries(rawMastered)) {
      const n = Math.round(num(tier, 0))
      if (n <= 0) continue
      if (!TECH_BY_ID.has(`${ladder}.${n}`)) continue
      mastered[ladder] = Math.max(mastered[ladder] ?? 0, n)
    }
  }

  const projects: ResearchProject[] = []
  if (Array.isArray(o.projects)) {
    for (const rawProject of o.projects) {
      const p = obj(rawProject)
      if (!p || typeof p.ladder !== 'string') continue
      const tier = Math.round(clamp(p.tier, 1, 99, 0))
      if (!TECH_BY_ID.has(`${p.ladder}.${tier}`)) continue
      projects.push({
        ladder: p.ladder.slice(0, 40),
        tier,
        months: clamp(p.months, 0.05, 10_000, 0.05),
        progress: clamp(p.progress, 0, 10_000, 0),
        cost: clamp(p.cost, 0, 1e12, 0),
      })
    }
  }

  const upgrades: string[] = []
  if (Array.isArray(o.upgrades)) {
    for (const rawId of o.upgrades) {
      if (typeof rawId !== 'string') continue
      if (upgradeById(rawId) && !upgrades.includes(rawId)) upgrades.push(rawId)
    }
  }

  return { mastered, projects, upgrades }
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
  const o = obj(parsed)
  if (!o) return null
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

  let factory = coerceFactory(o.factory)
  let contract = coerceContract(o.contract)
  // 没有产线却有一张订单：这张订单没法执行，直接丢掉，避免读档后卡死。
  if (!factory && contract) contract = null
  if (factory && factory.lines.length === 0) factory = null

  const offers: Offer[] = []
  if (Array.isArray(o.offers)) {
    for (const rawOffer of o.offers) {
      const offer = coerceOffer(rawOffer)
      if (offer) offers.push(offer)
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
    // v1 / v2 没有下面这些字段：退回默认产品、没有产线和订单，由界面重新招标。
    design: coerceDesign(o.design),
    factory,
    contract,
    offers: contract ? [] : offers,
    research: coerceResearch(o.research),
    rep: Math.round(clamp(o.rep, 0, 100, 50)),
    bribes: Math.round(clamp(o.bribes, 0, 999, 0)),
    home: typeof o.home === 'string' && NATION_BY_ID.has(o.home as never) ? o.home : 'fra',
  }
}

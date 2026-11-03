/**
 * 制造局：产线、仓库、学习曲线。
 *
 * 这一层只看三样东西：**工时**、**材料吨数**、**钱**。
 * 设计局算出来的单台成本（¥ 材料 / 小时 工时）就是这里的输入，
 * 中间不再有第二套数字 —— 否则设计局说一台 31,388 小时、
 * 制造局说一台 25,000 小时，玩家永远不知道该信哪个。
 *
 * 一条产线 = 每班多少人 × 每天几班 × 8 小时。
 * 单台工时除以每日工时就是「几天出一台」，学习曲线让这个数逐台变小。
 *
 * 钱不归这里管：所有函数只返回「花了多少 / 赚了多少」，
 * 由上层（存档里的 cash）去加减。一处真相。
 */

import type { ArmorMaterialId, Tank } from '../types'

// ────────────────────────────────────────────────────────────
// 常量：全部可调，且都有历史锚点
// ────────────────────────────────────────────────────────────

/** 一班 8 小时。 */
export const HOURS_PER_SHIFT = 8

/** 工时费。必须和设计局 build.ts 的 laborRate 一致，否则单台成本对不上。 */
export const WAGE_PER_HOUR = 18

/**
 * Wright 学习曲线：第 n 台的工时 = 首台 × n^log2(0.85)。
 * 85% 是航空工业的经典斜率，第 100 台降到 34%。
 */
export const LEARN_SLOPE = 0.85

/** 学习曲线地板：再熟练也不会低于首台的这个比例。 */
export const LEARN_FLOOR = 0.28

/** 换型要多少天。 */
export const RETOOL_DAYS = 30

/** 换型后保留多少熟练度（工人还在，但工装、流程、供应商全换了）。 */
export const RETOOL_KEEP = 0.35

/** 停产重启的代价 = 这么多天的工资（招工、培训、重新调试）。 */
export const RESTART_WAGE_DAYS = 25

/** 开工时的日常维持费，占当天工资的比例（电、刀具、管理）。 */
export const UPKEEP_RATIO = 0.12

/** 停工后仍要付的看厂费，占「满负荷维持费」的比例。 */
export const IDLE_UPKEEP_RATIO = 0.06

/** 采购提前期。钱在下单当天扣，货 14 天后到 —— 这就是现金流压力。 */
export const LEAD_DAYS = 14

/** 初始仓库容量（公斤）。够 1940 年代一条线跑一个月。 */
export const WAREHOUSE_BASE_KG = 2_500_000

/** 扩建一次加多少容量。 */
export const WAREHOUSE_STEP_KG = 2_500_000

// ────────────────────────────────────────────────────────────
// 类型
// ────────────────────────────────────────────────────────────

/** 从设计局的一台车抽出来的「制造参数」。制造局不再需要整个 Tank。 */
export interface LineSpec {
  tank: string
  /** 首台工时（未打折） */
  baseHours: number
  /** 单台用料（公斤，= 战斗全重） */
  unitKg: number
  /** 主装甲材质，决定去哪个仓取料 */
  material: ArmorMaterialId
  /** 混成料价（元/公斤）= 单台材料费 / 单台重量 */
  yuanPerKg: number
  /** 维护费倍率：炮管寿命科技让它低于 1 */
  upkeepMult?: number
}

export type LineState = 'running' | 'idle' | 'retooling'

export interface ProductionLine {
  id: number
  /** 正在生产的型号 */
  spec: LineSpec
  /** 这条线累计造出多少台（学习曲线用） */
  built: number
  /** 当前这一台已经完成的工时 */
  progress: number
  /** 每班人数 */
  workers: number
  /** 每天几班（1–3） */
  shifts: number
  state: LineState
  /** 换型剩余天数 */
  retoolDays: number
  /** 换型目标；null 表示不是换型 */
  retoolTo: LineSpec | null
  /** 连续缺料天数，给界面报警用 */
  starved: number
}

export interface PurchaseOrder {
  id: number
  material: ArmorMaterialId
  kg: number
  /** 下单时已付的钱 */
  price: number
  arriveDay: number
}

export interface FactoryState {
  lines: ProductionLine[]
  /** 分材质库存：材质 id → 公斤 */
  stock: Partial<Record<ArmorMaterialId, number>>
  /** 仓库总容量（公斤，所有材质共用） */
  warehouseKg: number
  /** 在途采购 */
  orders: PurchaseOrder[]
  /** 成品库存（辆） */
  finished: number
  /** 累计产出（辆） */
  produced: number
  /** 累计材料成本 */
  materialSpend: number
  /** 累计工资 */
  wageSpend: number
  nextId: number
}

export interface FactoryTick {
  days: number
  /** 这期间花掉的钱（工资 + 维持费） */
  spent: number
  /** 这期间产出的台数 */
  produced: number
  /** 到货的采购单数 */
  arrivals: number
  /** 到货但因仓库满而丢掉的公斤数 */
  overflowKg: number
  /** 缺料停工的产线 id */
  starved: number[]
}

// ────────────────────────────────────────────────────────────
// 构造
// ────────────────────────────────────────────────────────────

/** 从设计局的车抽出制造参数。 */
export function specOf(tank: Tank): LineSpec {
  return {
    tank: tank.design.name,
    baseHours: tank.cost.hours,
    unitKg: Math.round(tank.physical.mass),
    material: tank.design.armor.material,
    yuanPerKg: tank.physical.mass > 0 ? tank.cost.material / tank.physical.mass : 0,
    upkeepMult: 1,
  }
}

export function createFactory(): FactoryState {
  return {
    lines: [],
    stock: {},
    warehouseKg: WAREHOUSE_BASE_KG,
    orders: [],
    finished: 0,
    produced: 0,
    materialSpend: 0,
    wageSpend: 0,
    nextId: 1,
  }
}

export function addLine(f: FactoryState, spec: LineSpec, workers = 1200, shifts = 2): ProductionLine {
  const line: ProductionLine = {
    id: f.nextId++,
    spec,
    built: 0,
    progress: 0,
    workers,
    shifts,
    state: 'idle',
    retoolDays: 0,
    retoolTo: null,
    starved: 0,
  }
  f.lines.push(line)
  return line
}

// ────────────────────────────────────────────────────────────
// 关键曲线
// ────────────────────────────────────────────────────────────

/** 第 n 台（从 1 数起）的单台工时。 */
export function unitHoursAt(baseHours: number, n: number): number {
  const k = Math.max(1, n)
  const factor = Math.max(LEARN_FLOOR, Math.pow(k, Math.log2(LEARN_SLOPE)))
  return baseHours * factor
}

/** 这条线下一台的工时。 */
export function lineUnitHours(line: ProductionLine): number {
  return unitHoursAt(line.spec.baseHours, line.built + 1)
}

/** 一条线的每日工时。 */
export function lineDailyHours(line: ProductionLine): number {
  return line.workers * HOURS_PER_SHIFT * line.shifts
}

/** 一天工资。 */
export function lineDailyWage(line: ProductionLine): number {
  return lineDailyHours(line) * WAGE_PER_HOUR
}

/** 一天维持费（含停工时的看厂费）。 */
export function lineDailyUpkeep(line: ProductionLine): number {
  const full = lineDailyWage(line) * UPKEEP_RATIO * (line.spec.upkeepMult ?? 1)
  return line.state === 'running' ? full : full * (IDLE_UPKEEP_RATIO / UPKEEP_RATIO)
}

/** 按当前配置，这台车还要几天。用于界面预估，不参与结算。 */
export function daysPerUnit(line: ProductionLine): number {
  const perDay = lineDailyHours(line)
  if (perDay <= 0) return Infinity
  return lineUnitHours(line) / perDay
}

/** 库存里这种材料还有多少公斤。 */
export function stockOf(f: FactoryState, material: ArmorMaterialId): number {
  return f.stock[material] ?? 0
}

/** 全仓库存合计。 */
export function totalStockKg(f: FactoryState): number {
  let sum = 0
  for (const kg of Object.values(f.stock)) sum += kg ?? 0
  return sum
}

/** 在途采购合计。 */
export function inTransitKg(f: FactoryState): number {
  return f.orders.reduce((s, o) => s + o.kg, 0)
}

// ────────────────────────────────────────────────────────────
// 动作（都返回花了多少钱，由上层扣）
// ────────────────────────────────────────────────────────────

export interface ActionResult {
  ok: boolean
  msg: string
  cost: number
}

const fail = (msg: string): ActionResult => ({ ok: false, msg, cost: 0 })

/** 买材料：钱现在扣，货 LEAD_DAYS 天后到。 */
export function orderMaterial(
  f: FactoryState,
  material: ArmorMaterialId,
  kg: number,
  yuanPerKg: number,
  day: number,
): ActionResult {
  if (kg <= 0) return fail('数量必须大于 0')
  const price = Math.round(kg * yuanPerKg)
  const order: PurchaseOrder = { id: f.nextId++, material, kg, price, arriveDay: day + LEAD_DAYS }
  f.orders.push(order)
  f.materialSpend += price
  return { ok: true, msg: `下单 ${(kg / 1000).toFixed(0)} 吨，${LEAD_DAYS} 天后到`, cost: price }
}

/** 开工。停工的线要先付重启费。 */
export function startLine(line: ProductionLine): ActionResult {
  if (line.state === 'running') return fail('已经在生产了')
  if (line.state === 'retooling') return fail('正在换型')
  const cost = Math.round(lineDailyWage(line) * RESTART_WAGE_DAYS)
  line.state = 'running'
  line.starved = 0
  return { ok: true, msg: `开工，重启费 ¥${cost.toLocaleString('en-US')}`, cost }
}

/** 停工。省工资，但机器会凉。 */
export function stopLine(line: ProductionLine): ActionResult {
  if (line.state !== 'running') return fail('本来就没在跑')
  line.state = 'idle'
  return { ok: true, msg: '停工。工资停了，看厂费还在', cost: 0 }
}

/** 换型：换一个型号，30 天，付 15 天工资，熟练度打三折。 */
export function retoolLine(line: ProductionLine, spec: LineSpec): ActionResult {
  if (line.state === 'retooling') return fail('已经在换型了')
  if (line.spec.tank === spec.tank) return fail('同型号不用换')
  const cost = Math.round(lineDailyWage(line) * 15)
  line.retoolTo = spec
  line.state = 'retooling'
  line.retoolDays = RETOOL_DAYS
  line.progress = 0
  return { ok: true, msg: `换型到 ${spec.tank}，${RETOOL_DAYS} 天`, cost }
}

/** 调整人员/班次。只能在停工或换型时改，开工中改要付培训费。 */
export function setStaff(line: ProductionLine, workers: number, shifts: number): ActionResult {
  const w = Math.max(50, Math.min(20_000, Math.round(workers)))
  const s = Math.max(1, Math.min(3, Math.round(shifts)))
  if (w === line.workers && s === line.shifts) return fail('没有变化')
  const cost = line.state === 'running' ? Math.round(Math.abs(w - line.workers) * 8 * WAGE_PER_HOUR * 5) : 0
  line.workers = w
  line.shifts = s
  return { ok: true, msg: `改为 ${w} 人 × ${s} 班`, cost }
}

/** 扩建仓库。 */
export function expandWarehouse(f: FactoryState): ActionResult {
  const cost = 150_000
  f.warehouseKg += WAREHOUSE_STEP_KG
  return { ok: true, msg: `仓库扩到 ${(f.warehouseKg / 1000).toFixed(0)} 吨`, cost }
}

// ────────────────────────────────────────────────────────────
// 推进
// ────────────────────────────────────────────────────────────

/**
 * 推进 n 天。就地改状态（和 sim/advance.ts 同一个理由：
 * 一次快进要改几千次，复制等于复制几千遍）。
 */
export function advanceFactory(f: FactoryState, day: number, days: number): FactoryTick {
  const tick: FactoryTick = {
    days,
    spent: 0,
    produced: 0,
    arrivals: 0,
    overflowKg: 0,
    starved: [],
  }
  const starvedSet = new Set<number>()

  for (let i = 0; i < days; i++) {
    const today = day + i

    // ── 到货 ──
    for (let j = f.orders.length - 1; j >= 0; j--) {
      const o = f.orders[j]!
      if (o.arriveDay > today) continue
      f.orders.splice(j, 1)
      tick.arrivals++
      const room = Math.max(0, f.warehouseKg - totalStockKg(f))
      const take = Math.min(room, o.kg)
      tick.overflowKg += o.kg - take
      if (take > 0) f.stock[o.material] = stockOf(f, o.material) + take
    }

    // ── 换型倒计时 ──
    for (const line of f.lines) {
      if (line.state !== 'retooling') continue
      line.retoolDays--
      if (line.retoolDays > 0) continue
      if (line.retoolTo) {
        line.spec = line.retoolTo
        line.retoolTo = null
        line.built = Math.floor(line.built * RETOOL_KEEP)
      }
      line.state = 'idle'
      line.retoolDays = 0
    }

    // ── 生产 ──
    for (const line of f.lines) {
      if (line.state !== 'running') continue
      tick.spent += lineDailyUpkeep(line) + lineDailyWage(line)
      if (stockOf(f, line.spec.material) < line.spec.unitKg) {
        line.starved++
        starvedSet.add(line.id)
        continue
      }
      line.starved = 0
      line.progress += lineDailyHours(line)
      // 可能一天出好几台（小辆坦克 + 大产线）
      let guard = 0
      while (line.progress >= lineUnitHours(line) && guard++ < 50) {
        const need = lineUnitHours(line)
        if (stockOf(f, line.spec.material) < line.spec.unitKg) break
        f.stock[line.spec.material] = stockOf(f, line.spec.material) - line.spec.unitKg
        line.progress -= need
        line.built++
        f.finished++
        f.produced++
        tick.produced++
      }
    }

    // ── 停工线的看厂费 ──
    for (const line of f.lines) {
      if (line.state === 'idle') tick.spent += lineDailyUpkeep(line)
    }
  }

  tick.starved = [...starvedSet]
  tick.spent = Math.round(tick.spent)
  return tick
}

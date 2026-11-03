/**
 * 制造局标定台：把产线跑起来看数字对不对。
 *
 * 要回答的问题：
 *   1. 一条线三个月能出几台？三年呢？（学习曲线真的在起作用吗）
 *   2. 单台成本在靠后的批次降到多少？（工时占比）
 *   3. 现金流：开工第一天就先掏材料和工资，钱烧得快不快？
 */

import { HISTORICAL } from '../src/tank/data/historical'
import { buildTank } from '../src/tank/model/build'
import type { Tank } from '../src/tank/types'
import {
  LEAD_DAYS,
  addLine,
  advanceFactory,
  createFactory,
  lineDailyHours,
  lineDailyWage,
  lineUnitHours,
  orderMaterial,
  specOf,
  startLine,
  stockOf,
  totalStockKg,
  unitHoursAt,
} from '../src/tank/sim/factory'

const NAMES = ['FT-17', '三号 F', 'T-34/76', 'M4A1', '虎王', 'T-72A', 'M1A1HA']

function width(s: string): number {
  let w = 0
  for (const ch of s) w += ch.charCodeAt(0) > 0x2e80 ? 2 : 1
  return w
}
function pad(s: string, n: number): string {
  return s + ' '.repeat(Math.max(0, n - width(s)))
}
function rpad(s: string, n: number): string {
  return ' '.repeat(Math.max(0, n - width(s))) + s
}
const money = (n: number): string => '¥' + Math.round(n).toLocaleString('en-US')

interface Row {
  name: string
  tank: Tank
  hours: number
  kg: number
  perDay: number
  firstDays: number
  learn100: number
  units: number[]
  spend: number[]
  avg: number[]
}

function run(tank: Tank, months: number[]): Row {
  const spec = specOf(tank)
  // 产线规模固定：400 人 × 两班 = 6,400 工时/天 —— 一座中型厂
  const workers = 400
  const perDay = workers * 8 * 2
  const f = createFactory()
  const line = addLine(f, spec, workers, 2)
  startLine(line)

  const units: number[] = []
  const spend: number[] = []
  let day = 0
  let spent = 0

  // 每 30 天补一次料：够 45 天用
  const replenish = (): void => {
    const need = spec.unitKg * (lineDailyHours(line) / lineUnitHours(line)) * 45 - stockOf(f, spec.material)
    if (need > 0) {
      const r = orderMaterial(f, spec.material, Math.ceil(need), spec.yuanPerKg, day)
      spent += r.cost
    }
  }

  for (const m of months) {
    const target = m * 30
    while (day < target) {
      const step = Math.min(30, target - day)
      if (day % 30 === 0) replenish()
      const t = advanceFactory(f, day, step)
      spent += t.spent
      day += step
    }
    units.push(f.produced)
    spend.push(spent)
  }

  return {
    name: spec.tank,
    tank,
    hours: spec.baseHours,
    kg: spec.unitKg,
    perDay,
    firstDays: spec.baseHours / perDay,
    learn100: unitHoursAt(spec.baseHours, 100),
    units,
    spend,
    avg: spend.map((s, i) => (units[i]! > 0 ? s / units[i]! : 0)),
  }
}

function main(): void {
  const tanks = NAMES.map((n) => {
    const h = HISTORICAL.find((x) => x.name.includes(n) || x.design.name.includes(n))
    if (!h) throw new Error(`找不到 ${n}`)
    return buildTank(h.design)
  })

  const months = [3, 6, 12, 24, 36]
  console.log('\n制造局 · 一条 400 人两班产线的三年\n')
  console.log('所有车摆在同一条线上，差别全部来自车本身')
  console.log(
    pad('型号', 16) +
      rpad('首台工时', 12) +
      rpad('单台重', 10) +
      rpad('首台天数', 12) +
      rpad('熟练后', 12) +
      rpad('要 6 天出厂', 16),
  )
  console.log('─'.repeat(84))
  const rows = tanks.map((t) => run(t, months))
  for (const r of rows) {
    const matureDays = unitHoursAt(r.hours, 100) / r.perDay
    const needWorkers = Math.round(r.hours / 6 / 16)
    console.log(
      pad(r.name, 16) +
        rpad(r.hours.toLocaleString('en-US') + 'h', 12) +
        rpad((r.kg / 1000).toFixed(1) + 't', 10) +
        rpad(r.firstDays.toFixed(1) + ' 天', 12) +
        rpad(matureDays.toFixed(1) + ' 天', 12) +
        rpad(needWorkers.toLocaleString('en-US') + ' 人/班', 16),
    )
  }

  console.log('\n累计产量（台）')
  console.log(pad('型号', 16) + months.map((m) => rpad(m + ' 月', 10)).join(''))
  console.log('─'.repeat(80))
  for (const r of rows) {
    console.log(pad(r.name, 16) + r.units.map((u) => rpad(String(u), 10)).join(''))
  }

  console.log('\n累计支出')
  for (const r of rows) {
    console.log(pad(r.name, 16) + r.spend.map((s) => rpad(money(s), 16)).join(''))
  }

  console.log('\n单台摊下来花了多少（含工资、材料、维持费；不含研发与设备）')
  for (const r of rows) {
    console.log(pad(r.name, 16) + r.avg.map((s) => rpad(money(s), 16)).join(''))
  }

  console.log('\n学习曲线（单台工时）')
  const n = [1, 5, 10, 25, 50, 100, 250]
  console.log(pad('型号', 16) + n.map((k) => rpad('第' + k + '台', 12)).join(''))
  console.log('─'.repeat(100))
  for (const r of rows) {
    console.log(
      pad(r.name, 16) + n.map((k) => rpad(Math.round(unitHoursAt(r.hours, k)).toLocaleString('en-US'), 12)).join(''),
    )
  }

  // ── 自检 ──
  console.log('\n自检')
  const bad: string[] = []
  for (const r of rows) {
    if (r.learn100 > r.hours * 0.4) bad.push(`${r.name}: 第 100 台仍要 ${(r.learn100 / r.hours * 100).toFixed(0)}% 工时`)
    if (r.units[r.units.length - 1]! <= r.units[0]!) bad.push(`${r.name}: 三年没有增产`)
  }
  // 学习曲线的经典校验：第 100 台应约为首台的 34%
  const check = unitHoursAt(100_000, 100) / 100_000
  console.log(`  第 100 台 / 第 1 台 = ${(check * 100).toFixed(1)}%（Wright 85% 理论值 34%）`)
  if (Math.abs(check - 0.34) > 0.03) bad.push('学习曲线偏离理论值')
  if (bad.length) {
    console.log('  ✗ ' + bad.join('\n  ✗ '))
    process.exitCode = 1
  } else {
    console.log('  ✓ 学习曲线、产量增长都正常')
  }
  console.log()
}

main()

void LEAD_DAYS
void lineDailyWage
void totalStockKg

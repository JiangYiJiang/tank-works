/**
 * 经济尺度 · 标定台。
 *
 * 这个检查台不追真实历史单价，只回答一个问题：
 * **按当前成本结构，每个时代的单台毛利是否落在可玩的区间？**
 *
 * 它锁四条线：
 *   1. 1.30 倍单价的毛利率 ≥ 10% —— 否则接单越多亏越多；
 *   2. 毛利率 ≤ 40% —— 否则钱来得太容易，研发/贷款没有压力；
 *   3. 单台工期 2–20 天 —— 否则订单节奏不对；
 *   4. 4 台小单的利润 ≥ 同期第一项技术的费用 —— 否则「接一单才能研一项」不成立。
 */

import { ERAS } from '../src/tank/sim/calendar'
import { referenceFor } from '../src/tank/sim/contract'
import { buildTank } from '../src/tank/model/build'
import { specOf, unitHoursAt } from '../src/tank/sim/factory'
import { materialFactor } from '../src/tank/sim/market'

const WAGE_PER_HOUR = 18
const WORKERS = 200
const HOURS_PER_DAY = WORKERS * 8
const START_CASH = 2_000_000
const FIRST_TECH_COST = 30_000

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? `  ${detail}` : ''}`)
  }
}

console.log('\n经济尺度 · 标定\n')
console.log('时代            参照车             成本        料        工     天/台   毛利@1.30   毛利@1.40')
console.log('─'.repeat(105))

for (let era = 0; era < ERAS.length; era++) {
  const ref = referenceFor(era)
  const tank = buildTank(ref.design)
  const spec = specOf(tank)
  const factor = materialFactor(spec.material, ERAS[era]!.from)
  const material = spec.unitKg * spec.yuanPerKg * factor
  const hours = unitHoursAt(spec.baseHours, 1)
  const labor = hours * WAGE_PER_HOUR
  const days = hours / HOURS_PER_DAY
  const cost = tank.cost.total
  const price13 = cost * 1.3
  const price14 = cost * 1.4
  const margin13 = (price13 - material - labor) / price13
  const margin14 = (price14 - material - labor) / price14

  console.log(
    `${ERAS[era]!.name.padEnd(14)} ${ref.name.padEnd(18)} ¥${Math.round(cost).toLocaleString().padStart(9)} ` +
      `¥${Math.round(material).toLocaleString().padStart(8)} ¥${Math.round(labor).toLocaleString().padStart(8)} ` +
      `${days.toFixed(1).padStart(6)} ${(margin13 * 100).toFixed(0).padStart(7)}% ${(margin14 * 100).toFixed(0).padStart(8)}%`,
  )

  check(`${ERAS[era]!.name}：1.30 倍毛利 ≥ 10%`, margin13 >= 0.1, `${(margin13 * 100).toFixed(1)}%`)
  check(`${ERAS[era]!.name}：1.30 倍毛利 ≤ 40%`, margin13 <= 0.4, `${(margin13 * 100).toFixed(1)}%`)
  check(`${ERAS[era]!.name}：单台工期 2–20 天`, days >= 2 && days <= 20, `${days.toFixed(1)} 天`)
  check(
    `${ERAS[era]!.name}：4 台小单能付得起首项技术`,
    (price13 - material - labor) * 4 >= FIRST_TECH_COST,
    String(Math.round((price13 - material - labor) * 4)),
  )
}

// 开局现金要能覆盖「4 台料 + 30 天工资」
const ft = referenceFor(0)
const ftTank = buildTank(ft.design)
const ftSpec = specOf(ftTank)
const ftMaterial = ftSpec.unitKg * ftSpec.yuanPerKg * materialFactor(ftSpec.material, 0)
check('开局现金够 4 台料 + 30 天工资', START_CASH >= ftMaterial * 4 + HOURS_PER_DAY * WAGE_PER_HOUR * 30, String(Math.round(ftMaterial * 4 + HOURS_PER_DAY * WAGE_PER_HOUR * 30)))

console.log(`\n${pass} 通过 / ${fail} 失败\n`)
if (fail > 0) process.exitCode = 1

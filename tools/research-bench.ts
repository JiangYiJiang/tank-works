/**
 * 研发局 · 验收。
 *
 * 验四件事：
 *   1. 开局掌握的技术 = STARTING_TECH 的每条梯子最高代；
 *   2. 开工要花时间与钱，槽位会占满；
 *   3. 研发完成后，零件/倾角/口径的闸门真的会松开；
 *   4. 存档往返、v3 迁移、超前与追赶系数。
 */

import { dayOf } from '../src/tank/sim/calendar'
import { advanceResearch, availableTechs, buyResearchUpgrade, designCheck, effortForTier, monthlyUpkeep, slotsOf, speedOf, startResearch, techSnapshot } from '../src/tank/sim/research'
import { STARTING_TECH, TECH_BY_ID } from '../src/tank/data/tech'
import { HISTORICAL } from '../src/tank/data/historical'
import { createGame } from '../src/tank/sim/state'
import { decodeSave, encodeSave } from '../src/tank/sim/save'

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

console.log('\n研发局 · 验收\n')

const g = createGame(1)
const startingLadders = new Set(STARTING_TECH.map((t) => t.ladder)).size
check(
  '开局掌握每条梯子的最高开局代',
  Object.values(g.research.mastered).filter((v) => v > 0).length === startingLadders,
  `${Object.values(g.research.mastered).filter((v) => v > 0).length} vs ${startingLadders}`,
)
check('开局 1 个科研槽', slotsOf(g.research) === 1)
check('开局研发速度 ×1.00', speedOf(g.research) === 1)
check('开局月维持 3,500', monthlyUpkeep(g.research, 1915) === 3_500, String(monthlyUpkeep(g.research, 1915)))

// ── 1. 可开工 / 超前系数 ──────────────────────────────────
const steel2 = TECH_BY_ID.get('armor.steel.2')!
check('开局能研发轧制均质钢', availableTechs(g).some((t) => t.id === steel2.id))
const early = effortForTier(g, steel2)
check('超前 1 年更贵', early.mult > 1 && early.months > steel2.months && early.cost > steel2.cost, `${early.mult.toFixed(2)}`)

// ── 2. 开工 / 占槽 ────────────────────────────────────────
const cash0 = g.cash
const started = startResearch(g, steel2.id)
check('开工成功', started.ok, started.msg)
check('开工扣了研发费', g.cash === cash0 - early.cost, `${cash0} → ${g.cash}`)
check('在研项目 1 个', g.research.projects.length === 1)
check('同一时间只能开一项（1 槽）', !startResearch(g, 'gun.caliber.2').ok)

// ── 3. 推进 / 完成 ────────────────────────────────────────
const tick = advanceResearch(g, 0, 400)
check('400 天后完成', tick.completed === 1, String(tick.completed))
check('轧制均质钢已掌握', g.research.mastered['armor.steel'] === 2)
check('在研项目清空', g.research.projects.length === 0)
check('日志里有完成记录', g.log.some((l) => l.t.includes('研发完成')))

// ── 4. 闸门松开 ──────────────────────────────────────────
const ft = HISTORICAL.find((h) => h.name.includes('FT-17'))!
const tiger = HISTORICAL.find((h) => h.name.includes('虎王'))!
const a7v = HISTORICAL.find((h) => h.name.includes('A7V'))!
check('FT-17 现在能造', designCheck(ft.design, g.research).ok)
const tigerCheck = designCheck(tiger.design, g.research)
check('虎王被零件年代挡住', !tigerCheck.ok && tigerCheck.reason.includes('1944'), tigerCheck.reason)
const a7vCheck = designCheck(a7v.design, g.research)
check('A7V 的电台还没解锁', !a7vCheck.ok, a7vCheck.reason)

const steep = JSON.parse(JSON.stringify(ft.design)) as typeof ft.design
steep.armor.frontSlope = 60
const steepCheck = designCheck(steep, g.research)
check('60° 倾角被上限挡住', !steepCheck.ok && steepCheck.reason.includes('上限'), steepCheck.reason)

// ── 4b. 给设计局的科技快照 ────────────────────────────────
const snap0 = techSnapshot(createGame(4))
check('快照只放已解锁车体', snap0.parts.hull.includes('ft') && !snap0.parts.hull.includes('tiger2'))
check('快照限制倾角 20°', snap0.limits.slopeMax === 20)
check('快照不放大口径炮', !snap0.parts.gun.includes('kwk43'))
check('快照不放复合装甲', !snap0.parts.material.includes('nera'))
check('研发后 A7V 车体进快照', techSnapshot(g).parts.hull.includes('a7v'))

// ── 5. 升级：槽位 / 速度 ──────────────────────────────────
g.day = dayOf(1934, 1, 1)
g.cash = 2_000_000
const slotBuy = buyResearchUpgrade(g, 'slot-1934')
check('1934 年能买第二设计室', slotBuy.ok, slotBuy.msg)
check('槽位变 2', slotsOf(g.research) === 2)
check('不能买第二次', !buyResearchUpgrade(g, 'slot-1934').ok)
const speedBuy = buyResearchUpgrade(g, 'speed-1934')
check('1934 年能买绘图室扩建', speedBuy.ok, speedBuy.msg)
check('速度 ×1.15', Math.abs(speedOf(g.research) - 1.15) < 1e-9, String(speedOf(g.research)))
check('月维持随升级上涨', monthlyUpkeep(g.research, 1934) > 3_500 * 2, String(monthlyUpkeep(g.research, 1934)))

// ── 6. 追赶系数 ──────────────────────────────────────────
const late = createGame(2)
late.day = dayOf(1990, 1, 1)
const lateEff = effortForTier(late, steel2)
check('落后 74 年打五折', Math.abs(lateEff.mult - 0.5) < 1e-9, String(lateEff.mult))
check('追赶后费用减半', lateEff.cost < steel2.cost)

// ── 7. 存档往返 ──────────────────────────────────────────
const s = createGame(3)
startResearch(s, 'armor.steel.2')
advanceResearch(s, 0, 120)
const json = encodeSave(s)
const loaded = decodeSave(json)
check('读档成功', loaded !== null)
check('已掌握技术保留', loaded?.research.mastered['armor.steel'] === 1)
check('在研项目保留', loaded?.research.projects.length === 1 && loaded.research.projects[0]!.ladder === 'armor.steel')
check('存档往返稳定', loaded ? encodeSave(loaded) === json : false)

// ── 8. v3 迁移 ───────────────────────────────────────────
const v3 = decodeSave('{"v":3,"seed":1,"day":100,"cash":500000,"over":false,"log":[]}')
check('v3 存档能读', v3 !== null)
check('v3 补齐开局研发', v3?.research.mastered['armor.steel'] === 1 && v3.research.projects.length === 0)

console.log(`\n${pass} 通过 / ${fail} 失败\n`)
if (fail > 0) process.exitCode = 1

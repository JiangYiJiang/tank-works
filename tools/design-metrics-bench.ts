/**
 * 设计局缺失指标 · 验收。
 *
 * 抗破、装填、倒车、俯仰这四项以前只算不显示，或者根本没算。
 * 这里锁住它们的**方向**（不是精确值），避免以后调参把它们调反。
 */

import { HISTORICAL } from '../src/tank/data/historical'
import { buildTank } from '../src/tank/model/build'
import { techMods } from '../src/tank/sim/research'
import { createResearch } from '../src/tank/sim/state'

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

console.log('\n设计局缺失指标 · 验收\n')

const ft = HISTORICAL.find((h) => h.name.includes('FT-17'))!
const t34 = HISTORICAL.find((h) => h.name.includes('T-34'))!
const tiger = HISTORICAL.find((h) => h.name.includes('虎王'))!
const m1 = HISTORICAL.find((h) => h.name.includes('M1A1'))!
const pFt = buildTank(ft.design).physical
const pT34 = buildTank(t34.design).physical
const pTiger = buildTank(tiger.design).physical

// ── 装填 ──────────────────────────────────────────────────
check('装填时间是正数', pFt.reloadSec > 0, String(pFt.reloadSec))
check('大口径装填更慢', pTiger.reloadSec > pT34.reloadSec, `${pTiger.reloadSec} vs ${pT34.reloadSec}`)
check('装填时间落在 4–12 秒', pFt.reloadSec >= 4 && pTiger.reloadSec <= 12, `${pFt.reloadSec}–${pTiger.reloadSec}`)

// ── 倒车 ──────────────────────────────────────────────────
check('倒车速度低于前进', pTiger.vReverse < pTiger.vMax, `${pTiger.vReverse} vs ${pTiger.vMax}`)
check('倒车速度有下限', pFt.vReverse >= 2, String(pFt.vReverse))

// ── 俯仰 ──────────────────────────────────────────────────
check('俯仰角在 3–10°', pFt.depression >= 3 && pFt.depression <= 10, String(pFt.depression))
check('大座圈重车俯仰更差', pTiger.depression < pFt.depression, `${pTiger.depression} vs ${pFt.depression}`)

// ── 抗破 ──────────────────────────────────────────────────
check('抗破与抗穿是两个数', pFt.armorFrontCe !== pFt.armorFront, `${pFt.armorFrontCe} vs ${pFt.armorFront}`)
check('炮塔抗破也是正数', pT34.armorTurretCe > 0, String(pT34.armorTurretCe))

// ── 破甲弹按抗破判定 ──────────────────────────────────────
const heatDesign = { ...JSON.parse(JSON.stringify(ft.design)), mods: { ammo: 'heat' as const } }
const heatBase = buildTank(heatDesign).physical
const mr = createResearch()
mr.mastered['ammo.heat'] = 2
const heatTuned = buildTank(heatDesign, techMods(mr)).physical
check('早期破甲弹 ≈ 1 倍口径', Math.abs(heatBase.pen - 37) < 3, String(heatBase.pen))
check('精密装药把破甲弹推到 1.8 倍口径', heatTuned.pen > heatBase.pen * 1.6, `${heatTuned.pen} vs ${heatBase.pen}`)

// ── 主动防御 ──────────────────────────────────────────────
const m1Base = buildTank(m1.design).physical
const apsDesign = { ...JSON.parse(JSON.stringify(m1.design)), aux: 'aps_drozd' }
const m1Aps = buildTank(apsDesign).physical
check('主动防御装上了', m1Aps.aps === true && m1Base.aps === false)
check('主动防御加 400mm 抗破', m1Aps.armorFrontCe > m1Base.armorFrontCe + 350, `${m1Aps.armorFrontCe} vs ${m1Base.armorFrontCe}`)

console.log(`\n${pass} 通过 / ${fail} 失败\n`)
if (fail > 0) process.exitCode = 1

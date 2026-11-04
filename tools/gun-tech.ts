/**
 * 口径 / 倍径分流 · 验收
 *
 * 大口径低速榴弹炮（KV-2 的 152mm M-10T）必须在 1940 年可选，
 * 同时不能把 1940 年的高初速 152mm 一起放出来。
 */

import { designCheck, techLimits, techSnapshot } from '../src/tank/sim/research'
import { createGame } from '../src/tank/sim/state'
import { GUN_BY_ID, HULL_BY_ID } from '../src/tank/data/parts'
import { TECH_BY_ID } from '../src/tank/data/tech'
import { designYear } from '../src/tank/model/era'
import type { TankDesign } from '../src/tank/types'

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

console.log('\n口径 / 倍径分流 · 验收\n')

const g = createGame(1)
g.research.mastered = {
  'gun.howitzer': 2,
  'gun.caliber': 2,
  'gun.breech': 1,
  'armor.form': 3,
  'armor.slope': 2,
  'power.trans': 2,
  'run.susp': 3,
  'aux.optics': 2,
}

const limits = techLimits(g.research)
check('短管榴弹炮把口径上限抬到 152mm', limits.howitzerCaliberMax === 152, String(limits.howitzerCaliberMax))
check('加农炮口径上限仍是 76mm', limits.caliberMax === 76, String(limits.caliberMax))
check('倍径上限仍是短身管 30', limits.barrelMax === 30, String(limits.barrelMax))
check('装药上限仍是低膛压 0.60', limits.chargeMax === 0.6, String(limits.chargeMax))

const gun = GUN_BY_ID.get('m10t')
check('152mm M-10T 已在零件表', Boolean(gun), gun?.name ?? '')
check('M-10T 是 152mm / 23 倍径', gun?.caliber === 152 && gun?.barrelCalibers === 23, gun ? `${gun.caliber} / ${gun.barrelCalibers}` : '')
check('M-10T 是低膛压炮', (gun?.charge ?? 1) <= 0.6, String(gun?.charge))
check('M-10T 标记为短管榴弹炮', gun?.lowVelocity === true, String(gun?.lowVelocity))
check('M-10T 在 1940 年可用', gun?.era === 1940, String(gun?.era))

const hull = HULL_BY_ID.get('kv1')
check('KV-1 重型车体已在零件表', Boolean(hull), hull?.name ?? '')
check('KV-1 座圈装得下 152mm', (hull?.ring ?? 0) >= 1.5, String(hull?.ring))

const kv2: TankDesign = {
  name: 'KV-2',
  hull: 'kv1',
  armor: { material: 'rha', front: 75, frontSlope: 30, side: 75, turretFront: 75, turretSlope: 0 },
  gun: 'm10t',
  engine: 'v2_kv',
  suspension: 'kv1_susp',
  aux: 'interwar',
}

const ok = designCheck(kv2, g.research)
check('1940 年设计 KV-2 通过科技闸门', ok.ok, ok.reason)
check('KV-2 的设计年代是 1940', designYear(kv2) === 1940, String(designYear(kv2)))
check('快照里能选到 M-10T', techSnapshot(g).parts.gun.includes('m10t'))

const withoutHowitzer = { ...g.research.mastered }
delete withoutHowitzer['gun.howitzer']
g.research.mastered = withoutHowitzer
const blocked = designCheck(kv2, g.research)
check('没研发榴弹炮时不能造 152mm', !blocked.ok && blocked.reason.includes('152'), blocked.reason)
check('没研发榴弹炮时快照不放 M-10T', !techSnapshot(g).parts.gun.includes('m10t'))

const howitzer = TECH_BY_ID.get('gun.howitzer.2')
check('重型榴弹炮科技在 1939 年（1940 年前可用）', howitzer?.year === 1939, String(howitzer?.year))
check('重型榴弹炮只放开短管 152mm 上限', howitzer?.fn?.howitzerCaliberMax === 152, String(howitzer?.fn?.howitzerCaliberMax))

console.log(`\n${pass} 通过 / ${fail} 失败\n`)
if (fail > 0) process.exitCode = 1

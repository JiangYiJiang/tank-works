/**
 * 研发槽 · 验收
 *
 * 槽位解锁、槽位升级、项目占槽、存档迁移。
 */

import {
  advanceResearch,
  availableTechs,
  MAX_RESEARCH_SLOTS,
  MAX_SLOT_LEVEL,
  slotSpeedOf,
  slotUnlockOffer,
  slotUpgradeOffer,
  slotsOf,
  speedOf,
  startResearch,
  startSlotUnlock,
  startSlotUpgrade,
} from '../src/tank/sim/research'
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

console.log('\n研发槽 · 验收\n')

const g = createGame(1)
check('开局 1 个科研槽', slotsOf(g.research) === 1, String(slotsOf(g.research)))
check('开局槽速 ×1.00', slotSpeedOf(g.research, 0) === 1)
check('开局最快速度 ×1.00', speedOf(g.research) === 1)
check('开局没有建造任务', g.research.build === null)
check('开局槽没有升级任务', g.research.slots[0]?.job === null)

const up = slotUpgradeOffer(g.research, 0)
check('1 级槽有升级报价', Boolean(up), up ? `Lv.${up.level + 1}` : '')
check('升级报价是 Lv.2', up?.level === 1)
check('升级要花时间和钱', Boolean(up && up.cost > 0 && up.months > 0))

const cashBefore = g.cash
const upgrade = startSlotUpgrade(g, 0)
check('开始升级槽位', upgrade.ok, upgrade.msg)
check('升级扣钱', g.cash === cashBefore - (up?.cost ?? 0), `${cashBefore} → ${g.cash}`)
check('升级期间槽被占用', Boolean(g.research.slots[0]?.job))
check('升级期间不能开工', !startResearch(g, 'armor.steel.2').ok)

advanceResearch(g, 0, Math.ceil((up?.months ?? 0) * 30.4375) + 2)
check('升级完成', g.research.slots[0]?.job === null)
check('槽位升到 Lv.2', g.research.slots[0]?.level === 2, String(g.research.slots[0]?.level))
check('升级提高槽速', slotSpeedOf(g.research, 0) > 1, String(slotSpeedOf(g.research, 0)))
check('升级提高最快速度', speedOf(g.research) > 1)

const cashTech = g.cash
const tech = startResearch(g, 'armor.steel.2')
check('升级后可开工', tech.ok, tech.msg)
check('项目记住槽位', g.research.projects[0]?.slot === 0, String(g.research.projects[0]?.slot))
check('开工扣研发费', g.cash < cashTech, `${cashTech} → ${g.cash}`)
check('槽内出现项目', Boolean(g.research.slots[0]?.job === null && g.research.projects[0]))

const progressBefore = g.research.projects[0]?.progress ?? 0
advanceResearch(g, 30, 30)
check('项目按槽速推进', (g.research.projects[0]?.progress ?? 0) > progressBefore)

const buildOffer = slotUnlockOffer(g.research)
check('2 槽前有解锁报价', buildOffer?.target === 2, String(buildOffer?.target))
const cashBuild = g.cash
const build = startSlotUnlock(g)
check('开始解锁第 2 槽', build.ok, build.msg)
check('解锁扣钱', g.cash === cashBuild - (buildOffer?.cost ?? 0), `${cashBuild} → ${g.cash}`)
check('建造任务在跑', Boolean(g.research.build))
advanceResearch(g, 60, Math.ceil((buildOffer?.months ?? 0) * 30.4375) + 2)
check('第 2 槽建成', slotsOf(g.research) === 2, String(slotsOf(g.research)))
check('建造任务清空', g.research.build === null)

if (g.research.projects.length === 0) {
  const candidate = availableTechs(g)[0]
  const again = candidate ? startResearch(g, candidate.id) : { ok: false, msg: '没有可开工技术' }
  check('补一个项目用于存档', again.ok, again.msg)
}
const savedSlot = g.research.projects[0]?.slot ?? -1
check('存档前有在研项目', savedSlot >= 0, String(savedSlot))

const raw = encodeSave(g)
const restored = decodeSave(raw)
check('存档能读回', Boolean(restored))
check('存档保留 2 个槽', restored ? slotsOf(restored.research) === 2 : false, restored ? String(slotsOf(restored.research)) : '')
check('存档保留槽等级', restored?.research.slots[0]?.level === 2)
check('存档保留项目槽位', restored?.research.projects[0]?.slot === savedSlot, `${savedSlot} → ${restored?.research.projects[0]?.slot}`)

const legacy = JSON.parse(raw) as Record<string, unknown>
if (legacy.research && typeof legacy.research === 'object') {
  const r = legacy.research as Record<string, unknown>
  delete r.slots
  delete r.build
  r.upgrades = ['slot-1934']
  if (Array.isArray(r.projects)) {
    for (const p of r.projects as Array<Record<string, unknown>>) delete p.slot
  }
}
const migrated = decodeSave(JSON.stringify(legacy))
check('旧存档补出槽位', migrated ? slotsOf(migrated.research) === 2 : false, migrated ? String(slotsOf(migrated.research)) : '')
check('旧存档项目槽位归 0', migrated?.research.projects[0]?.slot === 0)

check('槽位上限是 6', MAX_RESEARCH_SLOTS === 6)
check('槽等级上限是 4', MAX_SLOT_LEVEL === 4)

console.log(`\n${pass} 通过 / ${fail} 失败\n`)
if (fail > 0) process.exitCode = 1

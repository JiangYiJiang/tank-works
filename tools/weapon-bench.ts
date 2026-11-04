/**
 * 自定义武器 · 验收
 *
 * 只看纯模型：弹种唯一、备弹约束、单发体积、炮全长、弹重平均、
 * 旧设计仍走历史炮，以及「自定义 152mm 榴弹炮能过 1940 闸门」。
 */

import { createGame } from '../src/tank/sim/state'
import { decodeSave, encodeSave } from '../src/tank/sim/save'
import { designCheck } from '../src/tank/sim/research'
import { buildTank } from '../src/tank/model/build'
import { ammoCoverage, gunFromWeapon, gunOfDesign, minTurretRounds, roundVolumeL, validateWeapon, weaponFromLegacyGun, weaponMetrics } from '../src/tank/model/weapon'
import type { AmmoSpec, TankDesign, WeaponFit } from '../src/tank/types'

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

console.log('\n自定义武器 · 验收\n')

const legacy = weaponFromLegacyGun('sa18')
check('历史炮能生成合法初始武器', validateWeapon(legacy).ok, validateWeapon(legacy).reason)
check('历史炮初始武器标记为非自定义', legacy.custom === false)
check('历史炮保留原炮 id', gunOfDesign({ name: 'x', hull: 'ft', armor: { material: 'rha', front: 16, frontSlope: 0, side: 16, turretFront: 16, turretSlope: 0 }, gun: 'sa18', engine: 'ft_eng', suspension: 'ft_susp', aux: 'bare', weapon: legacy }).id === 'sa18')

const noAmmo: WeaponFit = { ...legacy, ammo: [], custom: true }
check('没有弹时拒绝', !validateWeapon(noAmmo).ok, validateWeapon(noAmmo).reason)

const duplicate: WeaponFit = {
  ...legacy,
  ammo: [
    { ...legacy.ammo[0]!, count: 10 },
    { ...legacy.ammo[0]!, count: 10 },
  ],
  custom: true,
}
check('同类型两套参数拒绝', !validateWeapon(duplicate).ok, validateWeapon(duplicate).reason)

const five: WeaponFit = {
  ...legacy,
  ammo: (['ap', 'aphe', 'apcbc', 'apcr', 'apds'] as const).map((family) => ({ family, cartridge: 'fixed', projectileLength: 3.2, charge: 0.6, count: 2 })),
  custom: true,
}
check('超过 4 种弹拒绝', !validateWeapon(five).ok, validateWeapon(five).reason)

function racked(total: number, loading: WeaponFit['gun']['loading']): WeaponFit {
  const ammo: AmmoSpec[] = [{ family: 'ap', cartridge: 'fixed', projectileLength: 3.2, charge: 0.6, count: total }]
  return {
    ...legacy,
    gun: { ...legacy.gun, loading, pressure: 0.6 },
    ammo,
    rack: { turret: 0 },
    custom: true,
  }
}

check('人工装填下限为总数 1/3', minTurretRounds(racked(30, 'manual')) === 10, String(minTurretRounds(racked(30, 'manual'))))
check('尾舱装填下限为总数 1/2', minTurretRounds(racked(30, 'bustle')) === 15, String(minTurretRounds(racked(30, 'bustle'))))
check('转盘装填炮塔可为零', minTurretRounds(racked(30, 'carousel')) === 0)
check('无炮塔炮塔可为零', minTurretRounds(racked(30, 'none')) === 0)
check('人工装填炮塔只能放 5 发时拒绝', !validateWeapon({ ...racked(30, 'manual'), rack: { turret: 5 } }).ok)
check('人工装填炮塔放 10 发时通过', validateWeapon({ ...racked(30, 'manual'), rack: { turret: 10 } }).ok)

const over: WeaponFit = { ...legacy, ammo: [{ family: 'ap', cartridge: 'fixed', projectileLength: 3.2, charge: 0.6, count: 121 }], rack: { turret: 41 }, custom: true }
check('总备弹超过 120 拒绝', !validateWeapon(over).ok, validateWeapon(over).reason)

const mixed: WeaponFit = {
  ...legacy,
  gun: { ...legacy.gun, caliber: 88, barrelCalibers: 48, pressure: 1.0 },
  ammo: [
    { family: 'ap', cartridge: 'fixed', projectileLength: 3.2, charge: 0.55, count: 10 },
    { family: 'heat', cartridge: 'fixed', projectileLength: 3.6, charge: 0.9, count: 10 },
  ],
  rack: { turret: 7 },
  custom: true,
}
check('装药超过膛压上限拒绝', !validateWeapon({ ...mixed, gun: { ...mixed.gun, pressure: 0.7 } }).ok)
const metrics = weaponMetrics(mixed)
check('弹架体积按四种弹逐发累加', metrics.rackVolumeL > 0 && metrics.perRound.length === 2, String(metrics.rackVolumeL))
check('炮全长包含炮闩', metrics.gunLengthM > (88 / 1000) * 48, String(metrics.gunLengthM))
const synth = gunFromWeapon(mixed)
check('合成炮取最大装药', synth.charge === 0.9, String(synth.charge))
check('合成炮单发重取平均', Math.abs((synth.roundMassKg ?? 0) - metrics.ammoMassKg / 20) < 0.001, String(synth.roundMassKg))
check('单发体积是正数', roundVolumeL(mixed.gun, mixed.ammo[1]!) > 0, String(roundVolumeL(mixed.gun, mixed.ammo[1]!)))
check('混装反装甲 + 软目标有覆盖加成', ammoCoverage(mixed).roles === 2 && ammoCoverage(mixed).bonus > ammoCoverage(legacy).bonus, `mixed ${ammoCoverage(mixed).bonus} / legacy ${ammoCoverage(legacy).bonus}`)

const legacyDesign: TankDesign = {
  name: '旧车',
  hull: 'ft',
  armor: { material: 'rha', front: 16, frontSlope: 0, side: 16, turretFront: 16, turretSlope: 0 },
  gun: 'sa18',
  engine: 'ft_eng',
  suspension: 'ft_susp',
  aux: 'bare',
}
check('旧设计仍用历史炮', gunOfDesign(legacyDesign).id === 'sa18')
const legacyTank = buildTank(legacyDesign)
check('旧设计评分不变', legacyTank.score.total === 382, String(legacyTank.score.total))

const kvWeapon = weaponFromLegacyGun('m10t')
kvWeapon.custom = true
kvWeapon.ammo = [{ family: 'aphe', cartridge: 'separate', projectileLength: 4.5, charge: 0.55, count: 36 }]
kvWeapon.rack = { turret: 12 }
const kv2: TankDesign = {
  name: 'KV-2 试验',
  hull: 'kv1',
  armor: { material: 'rha', front: 75, frontSlope: 30, side: 75, turretFront: 75, turretSlope: 0 },
  gun: 'm10t',
  engine: 'v2_kv',
  suspension: 'kv1_susp',
  aux: 'interwar',
  weapon: kvWeapon,
}
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
const kvCheck = designCheck(kv2, g.research)
check('自定义 152mm 榴弹炮过 1940 闸门', kvCheck.ok, kvCheck.reason)
check('自定义武器设计能整车计算', buildTank(kv2).physical.mass > 0)

const highVelocity: TankDesign = {
  ...kv2,
  weapon: { ...kvWeapon, gun: { ...kvWeapon.gun, family: 'cannon', caliber: 152, barrelCalibers: 48 } },
}
const hvCheck = designCheck(highVelocity, g.research)
check('1940 年高初速 152mm 仍被挡', !hvCheck.ok, hvCheck.reason)

const saved = decodeSave(encodeSave({ ...g, design: kv2 }))
check('自定义武器能存档往返', saved?.design.weapon?.custom === true && saved.design.weapon.ammo[0]?.family === 'aphe')
check('存档里保留弹架分配', saved?.design.weapon?.rack.turret === 12)

console.log(`\n${pass} 通过 / ${fail} 失败\n`)
if (fail > 0) process.exitCode = 1

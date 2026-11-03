/**
 * 火炮：初速 → 穿深。
 *
 * 三步，中学物理加一个德马尔经验式：
 *   1. 弹重：同口径的标准弹重 × 弹种系数。脱壳弹的弹芯轻得多。
 *   2. 初速：v = √(K · 发射药水平 · 口径³ · 倍径 / 弹重)。口径³ 代表药室容积，倍径代表做功行程。
 *   3. 穿深：德马尔公式 e ∝ v^a · m^b / d^c，但这里的 m 和 d 用的是**弹芯**，
 *      不是火炮口径。这是整段代码里最要紧的一句：脱壳弹的威力来自「把同样的动能
 *      压到更细的芯上」，如果拿口径去算，APDS/APFSDS 就白研发了。
 *
 * 这套式子有个很好的性质：加长身管、加大口径、换更轻的弹芯，三个方向各自能涨穿深，
 * 但都会在别处收账 —— 倍径长→炮重，口径大→座圈大炮塔大，弹芯轻→后效差、造价高。
 * 玩家没法只赚不赔。
 *
 * 注意 charge（发射药水平）是**每门炮的数据**，由真实炮口初速反推，写在 parts.ts。
 * 它不是拟合参数，是「这门炮本来就这样」。回归测试因此变得有意义：
 * 初速已知，德马尔公式必须自己把穿深算对。
 */

import type { GunDef } from '../types'
import type { TechMods } from './mods'
import { TUNING, look } from './tuning'

/** 弹丸全重 kg（含脱壳弹被丢掉的那部分）。 */
export function projectileMass(gun: GunDef): number {
  const t = TUNING.gun
  return t.shellMassK * Math.pow(gun.caliber, 3) * look(t.shellMass, gun.shell, 1)
}

/** 弹芯质量 kg：真正参与穿甲的那部分。 */
export function penetratorMass(gun: GunDef, tech?: TechMods): number {
  const base = projectileMass(gun) * look(TUNING.gun.coreShare, gun.shell, 1)
  // 密度科技只作用于长杆 / 脱壳弹：同样的芯，密度从 15 提到 18/19
  const subcaliber = gun.shell === 'apds' || gun.shell === 'apfsds' || gun.shell === 'apfsds2'
  const densityMult = subcaliber && tech?.density ? tech.density / 15 : 1
  return base * densityMult
}

/** 弹芯直径 mm。全口径弹等于口径，脱壳弹远小于口径。 */
export function penetratorDiameter(gun: GunDef): number {
  return gun.caliber * look(TUNING.gun.coreRatio, gun.shell, 1)
}

/** 炮口初速 m/s。tech.charge 是发射药科技带来的能量倍率。 */
export function muzzleVelocity(gun: GunDef, tech?: TechMods): number {
  const t = TUNING.gun
  const m = projectileMass(gun)
  const energy = gun.charge * (tech?.charge ?? 1) * Math.pow(gun.caliber, 3) * gun.barrelCalibers
  return Math.sqrt((t.velocityK * energy) / m)
}

/**
 * 口径修正。德马尔公式是从中口径火炮拟合出来的，直接套到 37mm 上会高估三成
 * （小弹丸的截面比、弹体强度都吃亏），套到 120mm 上又偏低。这一项是桥。
 */
function caliberEff(caliber: number): number {
  const t = TUNING.gun
  const ratio = Math.max(t.caliberMin, Math.min(t.caliberMax, caliber / t.caliberRef))
  return Math.pow(ratio, t.caliberExp)
}

/**
 * 装填一发要多少秒。
 * 炮塔里只有一个人时，车长要兼装填，慢 25%。自动装弹机等科技后续再接。
 */
export function reloadSeconds(gun: GunDef, turretCrew: number): number {
  const base = 3.8 + gun.caliber * 0.04
  return Math.round((turretCrew >= 2 ? base : base * 1.25) * 10) / 10
}

/** 500m 处穿深 mm RHAe（对均质钢，入射角 0°）。 */export function penetration(gun: GunDef, tech?: TechMods): number {
  const t = TUNING.gun
  if (gun.shell === 'heat') {
    // 破甲弹靠炸药而不是动能，穿深只看口径，而且**不随距离衰减**
    // 1.0 是早期破甲弹的水平（≈1 倍口径）；研发局把它推到 1.8 / 2.8 / 3.4
    const perCaliber = tech?.heatPerCaliber ?? look(t.heatPerCaliberByShell, gun.shell, 1)
    return perCaliber * gun.caliber
  }
  const v = muzzleVelocity(gun, tech)
  const m = penetratorMass(gun, tech)
  const d = penetratorDiameter(gun)
  const k = look(t.deMarreK, gun.shell, 4)
  const raw = (t.penScale * Math.pow(v, t.vExp) * Math.pow(m, t.mExp)) / (k * Math.pow(d, t.dExp))
  return raw * caliberEff(gun.caliber) * t.at500m
}

/** 身管长度 m（用来算车长，也用来判断「这车开进巷子会不会卡住」）。 */
export function barrelLength(gun: GunDef): number {
  return (gun.caliber / 1000) * gun.barrelCalibers
}

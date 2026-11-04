/**
 * 设计局总装：把六个槽位拼成一辆完整的车。
 *
 * 这是唯一一个「串起来」的模块，它自己不做任何计算，只负责按顺序调用：
 *   几何 → 乘员 → 质量 → 防护 → 穿深 → 机动 → 适应性 → 评分 → 成本
 *
 * 顺序是有讲究的：质量必须在防护之后（装甲重量要算进去），
 * 机动必须在质量之后（吨功率和接地压力都依赖总重），
 * 而装甲面积必须在质量之前（面积由几何决定）。链条一错，数字全错。
 */

import type {
  Tank,
  TankCost,
  TankDesign,
  TankPhysical,
} from '../types'
import {
  AUX_BY_ID,
  ENGINE_BY_ID,
  HULL_BY_ID,
  MATERIAL_BY_ID,
  SUSPENSION_BY_ID,
  need,
} from '../data/parts'
import { ammoCoverage, gunOfDesign } from './weapon'
import { solveAdapt } from './adapt'
import { solveProtection } from './armor'
import { resolveGun, solveBallistics } from './ballistics'
import { solveGeometry } from './geometry'
import { penetration, reloadSeconds } from './gun'
import { solveMass } from './mass'
import { solveMobility } from './mobility'
import { NO_TECH, type TechMods } from './mods'
import { rawDimsFrom, scoreDims } from './score'
import { TUNING } from './tuning'

/**
 * 乘员数：两名车体乘员（驾驶员 + 机电员）加上炮塔里的。
 * 炮塔能塞几个人，由座圈直径决定 —— 这也解释了为什么小座圈的车往往车长要兼职装填手。
 */
export function crewCount(ringM: number, crewMin: number): number {
  const turret = ringM < 1.2 ? 1 : ringM < 1.75 ? 2 : 3
  return Math.max(crewMin, 2 + turret)
}

/** 俯仰角：座圈越大，炮尾越容易顶到地板，仰俯范围反而变小（负值，度）。 */
export function depressionOf(ringM: number): number {
  return Math.round(Math.min(10, Math.max(3, 10 - (ringM - 1) * 3)) * 10) / 10
}

export function buildTank(design: TankDesign, tech: TechMods = NO_TECH): Tank {
  const hull = need(HULL_BY_ID, design.hull, '车体')
  const gun = gunOfDesign(design)
  const engine = need(ENGINE_BY_ID, design.engine, '动力包')
  const susp = need(SUSPENSION_BY_ID, design.suspension, '悬挂')
  const aux = need(AUX_BY_ID, design.aux, '辅助设备')
  const material = need(MATERIAL_BY_ID, design.armor.material, '装甲材料')

  const geo = solveGeometry(hull, gun, engine, susp, design.armor)
  const crew = crewCount(geo.ring, hull.crewMin)
  const mass = solveMass(hull, design.armor, gun, engine, susp, geo, crew)
  const prot = solveProtection(design.armor)
  const mob = solveMobility(mass.total, engine, susp)
  const adapt = solveAdapt({
    aux,
    susp,
    geo,
    crew,
    groundPressure: mob.groundPressure,
    trackWidth: susp.trackWidth,
  })

  // 弹药改装会换掉弹种，但不会改变这门炮本身（口径、倍径、装药都不动）
  const realGun = resolveGun(gun, design.mods)
  const ballistic = solveBallistics(gun, design.mods, tech)
  const turretCrew = Math.max(1, crew - 2)
  const hasAps = aux.aps === true

  const physical: TankPhysical = {
    mass: mass.total,
    length: geo.totalLength,
    width: geo.hullWidth,
    height: geo.totalHeight,
    ring: geo.ring,
    hpPerTon: mob.hpPerTon,
    groundPressure: mob.groundPressure,
    vMax: mob.vMax,
    vOffroad: mob.vOffroad,
    vReverse: mob.vReverse,
    armorFront: prot.hull,
    armorTurret: prot.turret,
    armorSide: prot.side,
    armorFrontCe: prot.hullCe + (hasAps ? 400 : 0),
    armorTurretCe: prot.turretCe,
    armorSideCe: prot.sideCe,
    pen: penetration(realGun, tech),
    caliber: gun.caliber,
    crew,
    rounds: gun.rounds,
    reloadSec: reloadSeconds(realGun, turretCrew),
    depression: depressionOf(geo.ring),
    aps: hasAps,
  }

  const raw = rawDimsFrom(physical, adapt.total + (design.weapon?.custom === true ? ammoCoverage(design.weapon).bonus : 0))
  const score = scoreDims(raw)
  const cost = solveCost(design, mass, material.costPerKg, tech.labor)
  const flaws = findFlaws(physical, design, crew)

  return {
    design,
    physical,
    raw,
    score,
    cost,
    flaws,
    ballistics: ballistic,
    weaponCoverage: design.weapon?.custom === true ? ammoCoverage(design.weapon).bonus : undefined,
  }
}

function solveCost(
  design: TankDesign,
  mass: ReturnType<typeof solveMass>,
  armorPricePerKg: number,
  laborMult: number,
): TankCost {
  const c = TUNING.cost
  const engine = need(ENGINE_BY_ID, design.engine, '动力包')
  const hull = need(HULL_BY_ID, design.hull, '车体')
  const material = need(MATERIAL_BY_ID, design.armor.material, '装甲材料')

  // 装甲按材料单价，发动机和火炮是精密件，其余按结构钢单价
  const armorCost = mass.armor * armorPricePerKg
  const engineCost = engine.mass * 34
  const gunCost = mass.gun * 46
  const restMass = Math.max(0, mass.total - mass.armor - engine.mass - mass.gun)
  const restCost = restMass * 8
  const raw = armorCost + engineCost + gunCost + restCost

  const castFactor = material.id === 'cast' ? c.castDiscount : 1
  const hours = (c.hoursBase + mass.total * c.hoursPerKg) * castFactor * hull.structureFactor * laborMult
  const labor = hours * c.laborRate

  return {
    material: Math.round(raw),
    hours: Math.round(hours),
    labor: Math.round(labor),
    total: Math.round(raw + labor),
  }
}

/**
 * 设计缺陷。**不扣分**，但会让订单验收和推销出问题。
 * 放在这里而不是评分里，是为了让「这车有问题」和「这车不够强」变成两件事。
 */
function findFlaws(p: TankPhysical, design: TankDesign, crew: number): string[] {
  const flaws: string[] = []
  const gun = gunOfDesign(design)

  if (p.hpPerTon < 8) flaws.push(`动力不足：吨功率只有 ${p.hpPerTon.toFixed(1)} hp/t`)
  if (p.groundPressure > 95) flaws.push(`接地压力过大：${p.groundPressure.toFixed(0)} kPa，容易陷车`)
  if (crew < 3) flaws.push('车组人数过少，无法兼顾驾驶与射击')
  if (gun.caliber >= 100 && crew < 4) flaws.push('大口径火炮配小炮塔，装填会非常吃力')
  if (p.armorFront < 25 && p.mass > 20000) flaws.push('吨位浪费：重车配薄甲')
  if (p.vOffroad < 8) flaws.push('越野能力差，跟不上步兵')
  if (p.caliber > p.ring * 1000 * 0.075) flaws.push('火炮口径接近座圈极限，俯仰角会很难看')
  return flaws
}

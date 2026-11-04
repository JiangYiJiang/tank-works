/**
 * 质量：一辆车重在哪。
 *
 * 这个模块的**唯一目的**是让「加装甲」和「换大炮」自动变贵、变慢。
 * 只要质量是对的，吨功率、接地压力、材料费、工时费就全部自动正确 ——
 * 这四条是所有平衡问题的根，玩家没法靠选一个「便宜又强」的部件绕过它。
 */

import type { ArmorFit, EngineDef, GunDef, HullDef, SuspensionDef } from '../types'
import { MATERIAL_BY_ID, need } from '../data/parts'
import type { Geometry } from './geometry'
import { projectileMass } from './gun'
import { TUNING } from './tuning'

export interface MassBreakdown {
  armor: number
  structure: number
  drive: number
  gun: number
  ammo: number
  fuel: number
  crew: number
  running: number
  total: number
}

/** 顶甲/底甲相对侧甲的厚度比。真实坦克的顶底永远最薄。 */
const ROOF_RATIO = 0.35
const FLOOR_RATIO = 0.4

export function armorMass(armor: ArmorFit, geo: Geometry): number {
  const mat = need(MATERIAL_BY_ID, armor.material, '装甲材料')
  const roof = armor.side * ROOF_RATIO
  const floor = armor.side * FLOOR_RATIO
  const a = geo.areas
  const volumeMmM2 =
    armor.front * a.hullFront +
    armor.side * a.hullSide +
    armor.side * a.hullRear +
    roof * a.hullRoof +
    floor * a.hullFloor +
    armor.turretFront * a.turretFront +
    armor.side * a.turretSide +
    roof * a.turretRoof
  // m² × mm × (kg/m²/mm) 直接得 kg
  return volumeMmM2 * mat.density
}

export function solveMass(
  hull: HullDef,
  armor: ArmorFit,
  gun: GunDef,
  engine: EngineDef,
  _susp: SuspensionDef,
  geo: Geometry,
  crew: number,
): MassBreakdown {
  const m = TUNING.mass

  const armorKg = armorMass(armor, geo)
  const structureKg = armorKg * m.structurePerArmor * hull.structureFactor + m.structureBase
  const driveKg = engine.mass * m.drivePerEngine
  const gunKg = m.gunMassK * Math.pow(gun.caliber, 2.5) * gun.barrelCalibers
  const perRoundKg = gun.roundMassKg ?? projectileMass(gun)
  const ammoKg = gun.rounds * perRoundKg * m.ammoPerShell
  const fuelKg = (m.fuelRangeKm / 100) * engine.thirst * 0.85
  const crewKg = crew * m.crewWeight

  const subtotal = armorKg + structureKg + driveKg + gunKg + ammoKg + fuelKg + crewKg
  const runningKg = subtotal * m.runningPerMass + m.runningBase

  return {
    armor: armorKg,
    structure: structureKg,
    drive: driveKg,
    gun: gunKg,
    ammo: ammoKg,
    fuel: fuelKg,
    crew: crewKg,
    running: runningKg,
    total: subtotal + runningKg,
  }
}

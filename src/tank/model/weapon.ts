/**
 * 火炮 / 弹药 / 弹架：参数化设计的数据与纯计算。
 *
 * 这一层刻意不碰 DOM，也不改旧的历史零件表：
 *   - 有 weapon 的设计走「自定义炮」，由 GunSpec/AmmoSpec 合成一个 GunDef；
 *   - 没有 weapon 的旧设计继续按 parts.ts 里的历史炮走。
 *
 * 单位：口径 mm、长度 m、体积 L、质量 kg、初速 m/s、穿深 mm。
 */

import type { GunDef, ShellType, TankDesign, WeaponFit, GunSpec, AmmoSpec } from '../types'
import { GUN_BY_ID, need } from '../data/parts'
import { projectileMass } from './gun'

export const MAX_AMMO_TYPES = 4
export const MAX_ROUNDS = 120
export const MIN_PROJECTILE_LENGTH = 1.6
export const MAX_PROJECTILE_LENGTH = 7
export const MIN_CHARGE = 0.2
export const MAX_CHARGE = 1.5

/** 武器选项的科技闸门；mastered 为空表示沙盒，全部开放。 */
export interface WeaponTechGates {
  howitzer: boolean
  semi: boolean
  bustle: boolean
  carousel: boolean
  turretless: boolean
  ready: boolean
  dual: boolean
  smoothbore: boolean
  muzzleBrake: boolean
  thermalSleeve: boolean
}

export function weaponTechGates(mastered?: Readonly<Record<string, number>>): WeaponTechGates {
  if (!mastered) {
    return {
      howitzer: true,
      semi: true,
      bustle: true,
      carousel: true,
      turretless: true,
      ready: true,
      dual: true,
      smoothbore: true,
      muzzleBrake: true,
      thermalSleeve: true,
    }
  }
  const level = (ladder: string): number => mastered[ladder] ?? 0
  const loading = level('gun.loading')
  const feed = level('gun.feed')
  return {
    howitzer: level('gun.howitzer') >= 1,
    semi: loading >= 2,
    bustle: loading >= 3,
    carousel: loading >= 3,
    turretless: loading >= 3,
    ready: feed >= 2,
    dual: feed >= 3,
    smoothbore: level('gun.rifling') >= 2,
    muzzleBrake: level('gun.muzzle') >= 2,
    thermalSleeve: level('gun.thermal') >= 1,
  }
}

export const AMMO_LABELS: Readonly<Record<ShellType, string>> = {
  ap: '穿甲弹',
  aphe: '半穿甲爆破弹',
  apcbc: '被帽穿甲弹',
  apcr: '硬芯穿甲弹',
  apds: '脱壳穿甲弹',
  apfsds: '长杆脱壳穿甲弹',
  apfsds2: '贫铀长杆弹',
  heat: '破甲弹',
}

/** 穿甲优先级：评分取最靠前的那一种，而不是把四种弹相加。 */
export const AMMO_PRIORITY: readonly ShellType[] = [
  'apfsds2',
  'apfsds',
  'apds',
  'apcr',
  'apcbc',
  'aphe',
  'ap',
  'heat',
]

export function ammoLabel(family: ShellType): string {
  return AMMO_LABELS[family] ?? family
}

export function primaryAmmo(weapon: WeaponFit): AmmoSpec | null {
  for (const family of AMMO_PRIORITY) {
    const hit = weapon.ammo.find((a) => a.family === family)
    if (hit) return hit
  }
  return weapon.ammo[0] ?? null
}

export function totalRounds(weapon: WeaponFit): number {
  return weapon.ammo.reduce((sum, a) => sum + Math.max(0, Math.round(a.count)), 0)
}

export function rackHull(weapon: WeaponFit): number {
  return Math.max(0, totalRounds(weapon) - weapon.rack.turret)
}

/** 单发弹的包围盒体积，升。按装填效率折减。 */
export function roundVolumeL(gun: GunSpec, ammo: AmmoSpec): number {
  const d = gun.caliber / 1000
  const projectile = d * ammo.projectileLength
  const caseLen = d * (0.9 + ammo.charge * 1.1)
  const roundLen = projectile + caseLen
  const maxD = d * (ammo.cartridge === 'fixed' ? 1.35 : 1.15)
  const raw = (Math.PI / 4) * maxD * maxD * roundLen * 1000
  return raw / 0.62
}

export function roundMassKg(gun: GunSpec, ammo: AmmoSpec): number {
  const roundGun: GunDef = {
    id: 'round',
    name: 'round',
    caliber: gun.caliber,
    barrelCalibers: gun.barrelCalibers,
    shell: ammo.family,
    rounds: 1,
    charge: ammo.charge,
    lowVelocity: gun.family === 'howitzer',
    era: 0,
  }
  return projectileMass(roundGun) * 1.15 + ammo.charge * 0.8
}

export interface WeaponMetrics {
  totalRounds: number
  turretMin: number
  hullRounds: number
  rackVolumeL: number
  ammoMassKg: number
  breechLengthM: number
  gunLengthM: number
  perRound: Array<{ ammo: AmmoSpec; volumeL: number; massKg: number; roundLengthM: number }>
}

export function weaponMetrics(weapon: WeaponFit): WeaponMetrics {
  const total = totalRounds(weapon)
  const turretMin = minTurretRounds(weapon)
  const perRound = weapon.ammo.map((ammo) => {
    const d = weapon.gun.caliber / 1000
    const projectile = d * ammo.projectileLength
    const caseLen = d * (0.9 + ammo.charge * 1.1)
    const roundLengthM = projectile + caseLen
    return {
      ammo,
      volumeL: roundVolumeL(weapon.gun, ammo),
      massKg: roundMassKg(weapon.gun, ammo),
      roundLengthM,
    }
  })
  const rackVolumeL = perRound.reduce((sum, r) => sum + r.volumeL * Math.max(0, r.ammo.count), 0)
  const ammoMassKg = perRound.reduce((sum, r) => sum + r.massKg * Math.max(0, r.ammo.count), 0)
  const longest = perRound.reduce((m, r) => Math.max(m, r.roundLengthM), 0)
  const breechLengthM = longest + 0.15
  const gunLengthM = (weapon.gun.caliber / 1000) * weapon.gun.barrelCalibers + breechLengthM

  return {
    totalRounds: total,
    turretMin,
    hullRounds: Math.max(0, total - weapon.rack.turret),
    rackVolumeL,
    ammoMassKg,
    breechLengthM,
    gunLengthM,
    perRound,
  }
}

/** 装填方式决定炮塔最少要放多少发。 */
export function minTurretRounds(weapon: WeaponFit): number {
  const total = totalRounds(weapon)
  switch (weapon.gun.loading) {
    case 'bustle':
      return Math.ceil(total / 2)
    case 'manual':
      return Math.ceil(total / 3)
    case 'carousel':
    case 'none':
      return 0
    default:
      return Math.ceil(total / 3)
  }
}

export function synthGun(gun: GunSpec, ammo: AmmoSpec, rounds: number): GunDef {
  return {
    id: 'custom',
    name: `${gun.caliber}mm ${gun.family === 'howitzer' ? '榴弹炮' : '加农炮'}`,
    caliber: gun.caliber,
    barrelCalibers: gun.barrelCalibers,
    shell: ammo.family,
    rounds,
    charge: ammo.charge,
    lowVelocity: gun.family === 'howitzer',
    era: 0,
    roundMassKg: roundMassKg(gun, ammo),
  }
}

export function gunFromWeapon(weapon: WeaponFit): GunDef {
  const primary = primaryAmmo(weapon)
  const fallback: AmmoSpec = {
    family: 'ap',
    cartridge: 'fixed',
    projectileLength: 3,
    charge: 0.55,
    count: 1,
  }
  const metrics = weaponMetrics(weapon)
  const maxCharge = weapon.ammo.reduce((m, a) => Math.max(m, a.charge), 0)
  const averageMass = metrics.totalRounds > 0 ? metrics.ammoMassKg / metrics.totalRounds : 0
  return {
    ...synthGun(weapon.gun, primary ?? fallback, totalRounds(weapon)),
    charge: maxCharge,
    roundMassKg: averageMass,
  }
}

/** 旧设计（没有 weapon）继续走历史炮；新设计合成一把自定义炮。 */
export function gunOfDesign(design: TankDesign): GunDef {
  if (design.weapon?.custom === true) return gunFromWeapon(design.weapon)
  return need(GUN_BY_ID, design.gun, '火炮')
}

/** 从一把历史炮生成一套最小合法的新设计，用于「不提供历史模板」的起步值。 */
export function weaponFromLegacyGun(gunId: string): WeaponFit {
  const gun = need(GUN_BY_ID, gunId, '火炮')
  const total = Math.min(MAX_ROUNDS, Math.max(1, gun.rounds))
  const family = (gun.lowVelocity ? 'howitzer' : 'cannon') as GunSpec['family']
  const ammoFamily = (gun.shell as ShellType) ?? 'ap'
  return {
    gun: {
      family,
      caliber: gun.caliber,
      barrelCalibers: gun.barrelCalibers,
      pressure: gun.charge,
      rifling: 'rifled',
      loading: 'manual',
      feed: 'single',
      muzzleBrake: false,
      thermalSleeve: false,
    },
    ammo: [
      {
        family: ammoFamily,
        cartridge: 'fixed',
        projectileLength: 3.2,
        charge: gun.charge,
        count: total,
      },
    ],
    rack: { turret: Math.ceil(total / 3) },
    custom: false,
  }
}

export function emptyWeapon(): WeaponFit {
  return weaponFromLegacyGun('sa18')
}

export interface WeaponIssue {
  ok: boolean
  reason: string
}

/** 结构校验：1–4 种、类型唯一、数量、弹架分配。科技上限由 designCheck 负责。 */
export function validateWeapon(weapon: WeaponFit): WeaponIssue {
  const ammo = weapon.ammo
  if (ammo.length < 1) return { ok: false, reason: '至少带 1 种弹' }
  if (ammo.length > MAX_AMMO_TYPES) return { ok: false, reason: `最多带 ${MAX_AMMO_TYPES} 种弹` }

  const seen = new Set<string>()
  if (!Number.isFinite(weapon.gun.pressure) || weapon.gun.pressure < MIN_CHARGE || weapon.gun.pressure > MAX_CHARGE) {
    return { ok: false, reason: '膛压上限超出范围' }
  }
  for (const a of ammo) {
    if (seen.has(a.family)) return { ok: false, reason: `${ammoLabel(a.family)}重复了：同类型只能有一种参数` }
    seen.add(a.family)
    if (!Number.isFinite(a.count) || a.count < 1) return { ok: false, reason: `${ammoLabel(a.family)} 至少带 1 发` }
    if (a.projectileLength < MIN_PROJECTILE_LENGTH || a.projectileLength > MAX_PROJECTILE_LENGTH) {
      return { ok: false, reason: `${ammoLabel(a.family)} 弹长超出范围` }
    }
    if (a.charge < MIN_CHARGE || a.charge > MAX_CHARGE) {
      return { ok: false, reason: `${ammoLabel(a.family)} 装药超出范围` }
    }
    if (a.charge > weapon.gun.pressure + 1e-9) {
      return { ok: false, reason: `${ammoLabel(a.family)} 装药超过炮的膛压上限` }
    }
  }

  const total = totalRounds(weapon)
  if (total < 1) return { ok: false, reason: '总备弹至少 1 发' }
  if (total > MAX_ROUNDS) return { ok: false, reason: `总备弹最多 ${MAX_ROUNDS} 发` }
  if (weapon.rack.turret < 0 || weapon.rack.turret > total) {
    return { ok: false, reason: '炮塔备弹不能大于总备弹' }
  }
  const minTurret = minTurretRounds(weapon)
  if (weapon.rack.turret < minTurret) {
    return { ok: false, reason: `这种装填方式炮塔至少要放 ${minTurret} 发` }
  }
  return { ok: true, reason: '' }
}

export function effectiveShell(weapon: WeaponFit): ShellType {
  return primaryAmmo(weapon)?.family ?? 'ap'
}

export interface AmmoCoverage {
  armorRounds: number
  softRounds: number
  roles: number
  bonus: number
}

/**
 * 多弹覆盖的粗粒度加分：反装甲、软目标各算一类；每类至少 3 发才算数。
 * 只给自定义武器，历史炮的评分保持原样。
 */
export function ammoCoverage(weapon: WeaponFit): AmmoCoverage {
  const armorFamilies: ShellType[] = ['ap', 'apcbc', 'apcr', 'apds', 'apfsds', 'apfsds2', 'heat']
  const softFamilies: ShellType[] = ['aphe', 'heat']
  let armorRounds = 0
  let softRounds = 0
  for (const a of weapon.ammo) {
    if (armorFamilies.includes(a.family)) armorRounds += a.count
    if (softFamilies.includes(a.family)) softRounds += a.count
  }
  const roles = (armorRounds >= 3 ? 1 : 0) + (softRounds >= 3 ? 1 : 0)
  const bonus = roles * 15 + Math.min(10, Math.floor(armorRounds / 8))
  return { armorRounds, softRounds, roles, bonus }
}

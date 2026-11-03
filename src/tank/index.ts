/**
 * 坦克厂的公共出口。
 *
 * 这个文件存在的意义是：上层（界面、CLI、将来的联机同步）只从这里 import，
 * 于是「设计局内部怎么算」可以被整个换掉而不影响调用方。
 *
 * 设计局是纯函数：给定一个 TankDesign（六个槽位），返回物理量、四维原始值、
 * 四维分、成本、缺陷清单。没有随机、没有时间、没有 DOM。
 * 同样的输入永远给同样的输出——这是存档、回归测试和联机 lockstep 的前提。
 */

export type {
  AmmoMods,
  ArmorFit,
  ArmorMaterialDef,
  ArmorMaterialId,
  AuxDef,
  Ballistics,
  EngineDef,
  Fcs,
  GunDef,
  HullClass,
  HullDef,
  NightVision,
  RawDims,
  ShellType,
  SuspensionDef,
  SuspensionType,
  Tank,
  TankCost,
  TankDesign,
  TankPhysical,
  TankScore,
} from './types'

export { buildTank } from './model/build'
export { dim, scoreDims, REF, WEIGHT } from './model/score'
export { solveGeometry } from './model/geometry'
export { solveMass } from './model/mass'
export { solveProtection } from './model/armor'
export { solveMobility } from './model/mobility'
export { solveAdapt } from './model/adapt'
export { muzzleVelocity, penetration, projectileMass } from './model/gun'
export {
  canDefeat,
  keepAt,
  keep2kOf,
  lineOfSight,
  losPenetrated,
  penetrationAt,
  plateDefeated,
  resolveGun,
  sectionalDensity,
  slopeExpOf,
  solveBallistics,
  velocityAt,
} from './model/ballistics'
export { TUNING } from './model/tuning'

export {
  AUX_BY_ID,
  ENGINE_BY_ID,
  GUN_BY_ID,
  HULL_BY_ID,
  MATERIAL_BY_ID,
  SUSPENSION_BY_ID,
  ARMOR_MATERIALS,
  AUXES,
  ENGINES,
  GUNS,
  HULLS,
  SUSPENSIONS,
} from './data/parts'

export { HISTORICAL } from './data/historical'
export type { HistoricalTank } from './data/historical'

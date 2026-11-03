/**
 * 几何：把六个槽位变成一辆车的外形。
 *
 * 这里是整个设计局最重要的「耦合点」，也是你构想里点名要建的那条链：
 *   发动机体积 ↑ → 车体拉长 ↑ → 装甲面积 ↑ → 重量 ↑ → 材料与工时 ↑
 *   炮口径 ↑ → 座圈 ↑ → 炮塔变大 → 装甲面积 ↑ → 重量 ↑
 *
 * 所以玩家在设计局里做的每一个选择，都会自己长出代价来，不需要额外的平衡表。
 */

import type { ArmorFit, EngineDef, GunDef, HullDef, SuspensionDef } from '../types'
import { TUNING } from './tuning'

const DEG = Math.PI / 180

export interface Geometry {
  /** 炮塔座圈直径 m */
  ring: number
  /** 炮塔高度 m */
  turretHeight: number
  turretWidth: number
  turretLength: number
  /** 车体尺寸（不含炮塔与行走机构） */
  hullLength: number
  hullWidth: number
  hullHeight: number
  /** 车高（地面到炮塔顶）m */
  totalHeight: number
  /** 车全长（含炮管前伸）m */
  totalLength: number
  /** 各处装甲板面积 m² */
  areas: {
    hullFront: number
    hullSide: number
    hullRear: number
    hullRoof: number
    hullFloor: number
    turretFront: number
    turretSide: number
    turretRoof: number
  }
}

/** 行走机构占的垂直高度：车体是「坐」在负重轮上的。 */
const RUNNING_HEIGHT = 0.35

export function solveGeometry(
  hull: HullDef,
  gun: GunDef,
  engine: EngineDef,
  susp: SuspensionDef,
  armor: ArmorFit,
): Geometry {
  const g = TUNING.geom

  // 座圈要装得下炮尾。小车身扛大口径时，座圈会被火炮顶大。
  const ringMin = g.ringBase + (gun.caliber / 1000) * g.ringPerCaliber
  // 座圈又必须容得下两个乘员和一整套炮尾机构，所以不能小于一个绝对下限。
  const ring = Math.max(hull.ring, ringMin, g.ringAbsMin)

  const turretHeight = g.turretBaseHeight + ring * g.turretHeightPerRing
  const turretWidth = ring * g.turretWidthPerRing
  const turretLength = ring * g.turretLengthPerRing

  // 发动机舱塞不下就拉长车体
  const engineStretch = 1 + g.engineLengthPerM3 * Math.max(0, engine.volume - 1)
  const hullLength = hull.length * engineStretch

  // 车体至少要盖住座圈和两条履带
  const hullWidth = Math.max(
    hull.width,
    ring * g.hullWidthPerRing,
    susp.trackWidth * 2 + g.trackClearance,
  )

  const hullHeight = hull.height
  const totalHeight = RUNNING_HEIGHT + hullHeight + turretHeight
  const barrelLengthM = (gun.caliber / 1000) * gun.barrelCalibers
  // 车全长 = 车体长 + 炮管探出车头的部分。
  // 炮耳轴大约在车体长度的 45% 处，所以炮管前 45% 的车体长度是「悬在车体上方」的，不算长度。
  // 这一条只影响显示：把虎王算成 12.6m（实际 10.3m）会让整张表格看起来不可信。
  const overhang = Math.max(0, barrelLengthM - hullLength * g.gunTrunnionRatio)
  const totalLength = hullLength + overhang

  const rad = (d: number): number => Math.max(1, d) * DEG

  const areas = {
    // 首上：垂直高度不变、板更斜 → 板本身变长 → 面积变大。这一条是倾角「要付重量」的物理来源。
    hullFront: (hullWidth * hullHeight) / Math.cos(rad(armor.frontSlope)),
    hullSide: 2 * hullLength * hullHeight,
    hullRear: hullWidth * hullHeight,
    hullRoof: hullLength * hullWidth * 0.95,
    hullFloor: hullLength * hullWidth,
    turretFront: (turretWidth * turretHeight) / Math.cos(rad(armor.turretSlope)),
    turretSide: 2 * turretLength * turretHeight,
    turretRoof: turretWidth * turretLength,
  }

  return {
    ring,
    turretHeight,
    turretWidth,
    turretLength,
    hullLength,
    hullWidth,
    hullHeight,
    totalHeight,
    totalLength,
    areas,
  }
}

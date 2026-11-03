/**
 * 机动：吨功率 → 速度，重量/履带 → 接地压力。
 *
 * 这里有一条很容易被玩家利用、但物理上必须存在的约束：
 * **悬挂有一个「极速上限」**。1917 年的车就算装上台 1500 匹马力的发动机也跑不到 60，
 * 因为履带会散、驾驶员会颠死。所以极速 = min(功率算出来的速度, 悬挂允许的速度)。
 *
 * 这条约束同时是科技树的抓手：想跑快，就得先研发悬挂。
 */

import type { EngineDef, SuspensionDef } from '../types'
import { TUNING } from './tuning'

export interface Mobility {
  hpPerTon: number
  /** kPa */
  groundPressure: number
  /** 公路极速 km/h */
  vMax: number
  /** 越野速度 km/h */
  vOffroad: number
}

const G = 9.81

export function solveMobility(massKg: number, engine: EngineDef, susp: SuspensionDef): Mobility {
  const t = TUNING.mobility
  const tons = massKg / 1000
  const hpPerTon = engine.power / tons

  // 接地压力 P = m·g / (两条履带的接地面积)
  const contactArea = 2 * susp.trackWidth * susp.contactLength
  const groundPressure = (massKg * G) / contactArea / 1000

  const byPower = t.vmaxK * Math.pow(hpPerTon, t.vmaxExp) * (t.vmaxQualityBase + t.vmaxQualitySpan * susp.quality)
  const vMax = Math.min(byPower, susp.vCap)

  // 越野速度：悬挂品质越差、接地压力越高，掉得越多
  const gpFactor = Math.max(t.gpFloor, Math.min(t.gpCeil, t.groundPressureRef / groundPressure))
  const ratio = t.offroadBase + t.offroadQualitySpan * susp.quality
  const vOffroad = vMax * ratio * gpFactor

  return { hpPerTon, groundPressure, vMax, vOffroad }
}

/**
 * 适应性：这辆车「好不好用」。
 *
 * 这是四个维度里唯一没有单一物理量的一个，因为它本来就是一组东西的合集：
 * 看得见吗（夜视）、打得准吗（火控）、稳不稳（稳定器）、车组累不累（人机）、
 * 陷不陷车（通过性）、会不会坏（可靠性）、打不打得通（电台）。
 *
 * 建模原则：**每一项都是一个可购买的科技，而不是一个可以调的数字**。
 * 这样它自然就成了「研发局 → 设计局」的接口：想涨适应性，只能去研发。
 */

import type { AuxDef, SuspensionDef } from '../types'
import type { Geometry } from './geometry'
import { TUNING, look } from './tuning'

export interface AdaptBreakdown {
  base: number
  night: number
  fcs: number
  stabilizer: number
  nbc: number
  radio: number
  ergo: number
  cross: number
  reliability: number
  total: number
}

export interface AdaptInput {
  aux: AuxDef
  susp: SuspensionDef
  geo: Geometry
  crew: number
  groundPressure: number
  trackWidth: number
}

export function solveAdapt(input: AdaptInput): AdaptBreakdown {
  const t = TUNING.adapt
  const { aux, susp, geo, crew, groundPressure, trackWidth } = input

  // 车内可用容积：车体利用一半，炮塔利用六成（真实坦克就是塞得这么满）
  const hullVolume = geo.hullLength * geo.hullWidth * geo.hullHeight * 0.5
  const turretVolume = geo.turretWidth * geo.turretLength * geo.turretHeight * 0.6
  const perCrew = (hullVolume + turretVolume) / Math.max(1, crew)

  const ergo = Math.min(t.ergoCap, perCrew * t.ergoPerM3)

  // 通过性：接地压力越低越好，履带越宽越好
  const gpTerm = Math.max(0.45, Math.min(1.1, t.gpRefForCross / groundPressure))
  const trackTerm = Math.max(0.55, Math.min(1, trackWidth / 0.66))
  const cross = t.crossCap * gpTerm * trackTerm

  const reliability = look(t.reliability, susp.type, 0)

  const night = look(t.night, aux.night, 0)
  const fcs = look(t.fcs, aux.fcs, 0)
  const stabilizer = aux.stabilizer ? t.stabilizer : 0
  const nbc = t.nbc[aux.nbc] ?? 0
  const radio = t.radio[aux.radio] ?? 0

  // 四类能力各有自己的标定系数：电子（看得远打得准）、人机（车组累不累）、
  // 通过性（陷不陷车）、可靠性（会不会坏）。标定系数是拿来对齐历史曲线的，
  // 而类内的相对大小由 tuning.ts 的表格决定 —— 那些是设计判断，不是拟合值。
  const electronics = (night + fcs + stabilizer + nbc + radio) * t.elecScale
  const total = t.base + electronics + ergo * t.ergoScale + cross * t.crossScale + reliability * t.relScale

  return { base: t.base, night, fcs, stabilizer, nbc, radio, ergo, cross, reliability, total }
}

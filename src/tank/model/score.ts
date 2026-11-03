/**
 * 四维评分：物理量 → 0-10000 的绝对分。
 *
 * 唯一的规则：**每个维度按 1991 年的世界顶尖水平线性归一化。**
 * 10000 分 = 1991 年最强的那辆车在这一项上的水平。
 *
 * 为什么线性而不是对数：早期技术红利大、后期边际递减，这正好是历史本来的手感。
 * 1915 年加 10mm 装甲对 16mm 的车是 +62%，1985 年加 10mm 对 650mm 的车是 +1.5%。
 *
 * 注意：**这里不发任何惩罚**。偏科不扣分，短板不扣分。
 * 铁王八的代价全部在需求侧（订单门槛、推销命中率、单价）体现，
 * 这样总分永远只有一个含义：「这辆车有多强」。
 */

import type { RawDims, TankPhysical, TankScore } from '../types'
import { TUNING } from './tuning'

export const REF = TUNING.ref
export const WEIGHT = TUNING.weight

export type { RawDims }

/** 单维度归一到 0-10000，超过 1991 基准就封顶。 */
export function dim(value: number, ref: number): number {
  return Math.round(Math.min(1, Math.max(0, value / ref)) * 10000)
}

export function scoreDims(raw: RawDims): TankScore {
  const armor = dim(raw.armor, REF.armor)
  const pen = dim(raw.pen, REF.pen)
  const offroad = dim(raw.offroad, REF.offroad)
  const adapt = dim(raw.adapt, REF.adapt)
  const total = armor * WEIGHT.armor + pen * WEIGHT.pen + offroad * WEIGHT.offroad + adapt * WEIGHT.adapt
  return { armor, pen, offroad, adapt, total: Math.round(total) }
}

/** 从物理量里攒出四维的原始值。装甲取「正面最强的那个部位」。 */
export function rawDimsFrom(p: TankPhysical, adaptTotal: number): RawDims {
  return {
    armor: Math.max(p.armorFront, p.armorTurret),
    pen: p.pen,
    offroad: p.vOffroad,
    adapt: adaptTotal,
  }
}

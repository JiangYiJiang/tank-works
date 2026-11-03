/**
 * 材料市场：同一种钢，不同年份、不同月份不是一个价。
 *
 * 这里只做「价格系数」，不改材料表本身：
 *   - 年代漂移：越往后名义料价越高；
 *   - 周期：按天数的正弦波，模拟钢材/合金的景气循环；
 *   - 噪声：同一天同一材质固定，保证存档与回放可复现。
 */

import { dateOf } from './calendar'
import { ARMOR_MATERIALS } from '../data/parts'
import type { ArmorMaterialId } from '../types'

const INDEX = new Map(ARMOR_MATERIALS.map((m, i) => [m.id, i]))

function hash(...nums: number[]): number {
  let h = 2166136261
  for (const n of nums) {
    h ^= n
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 某天某材质的料价系数，落在 0.82–1.25。 */
export function materialFactor(material: ArmorMaterialId, day: number): number {
  const idx = INDEX.get(material) ?? 0
  const year = dateOf(day).year
  const drift = ((year - 1915) / 76) * 0.1
  const cycle = Math.sin(day / 113 + idx * 0.7) * 0.04
  const shock = ((hash(day, idx) % 101) - 50) / 1000
  const raw = 1 + drift + cycle + shock
  return Math.max(0.82, Math.min(1.25, Math.round(raw * 1000) / 1000))
}

export function materialFactorText(material: ArmorMaterialId, day: number): string {
  const f = materialFactor(material, day)
  return `料价 ×${f.toFixed(2)}`
}

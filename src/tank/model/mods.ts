/**
 * 科技对模型的覆盖。
 *
 * 这些值只作用于「玩家按自己的科技造出来的车」，不作用于 19 辆历史校准车 ——
 * 否则每加一条科技，历史回归就会跟着漂，校准台也就失去意义了。
 */

import type { ShellType } from '../types'

export interface TechMods {
  /** 工时倍率：焊接 0.85 / 铸造 0.9 */
  labor: number
  /** 发射药能量倍率（累乘） */
  charge: number
  /** 各弹种的斜板响应；未列出的用 TUNING 默认 */
  slopeExp?: Partial<Record<ShellType, number>>
  /** 各弹种的 2km 保持率；未列出的用 TUNING 默认 */
  rangeKeep?: Partial<Record<ShellType, number>>
  /** 破甲弹的「口径倍数」；未列出的用 TUNING 默认 */
  heatPerCaliber?: number
  /** 弹芯密度（g/cm³），只影响长杆/脱壳弹的穿深质量 */
  density?: number
  /** 炮管寿命倍率，越高越省维护费 */
  barrelLife?: number
}

export const NO_TECH: TechMods = { labor: 1, charge: 1 }

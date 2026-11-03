/** 存档键集中在这里：壳、主菜单、迁移脚本用同一份，避免各自写一份版本列表。 */

export const SAVE_KEY = 'tank-works.save.v7'

export const LEGACY_SAVE_KEYS = [
  'tank-works.save.v6',
  'tank-works.save.v5',
  'tank-works.save.v4',
  'tank-works.save.v3',
  'tank-works.save.v2',
] as const

export const ALL_SAVE_KEYS = [SAVE_KEY, ...LEGACY_SAVE_KEYS] as const

/** 主菜单「新游戏」时要一起清掉的东西。 */
export const RUN_KEYS = [...ALL_SAVE_KEYS, 'tank-works.tech.v1', 'tank-works.design.v1'] as const

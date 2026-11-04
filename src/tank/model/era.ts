/**
 * 一辆车的「年代」：它身上最晚的一个零件是哪一年的。
 *
 * 用途只有两个：
 *   1. 主循环里判断「客户现在会不会要这辆车」；
 *   2. 设计局把车交出去时，告诉玩家它属于哪个时代。
 *
 * 这不是科技树——科技树管的是「能不能造」，这里管的是「拿出去卖时像不像这个年代的车」。
 */

import { AUX_BY_ID, ENGINE_BY_ID, GUN_BY_ID, HULL_BY_ID, MATERIAL_BY_ID, SUSPENSION_BY_ID } from '../data/parts'
import type { TankDesign } from '../types'

export function designYear(design: TankDesign): number {
  const turretMaterial = design.armor.turretMaterial ?? design.armor.material
  return Math.max(
    HULL_BY_ID.get(design.hull)?.era ?? 0,
    design.weapon?.custom === true ? 0 : (GUN_BY_ID.get(design.gun)?.era ?? 0),
    ENGINE_BY_ID.get(design.engine)?.era ?? 0,
    SUSPENSION_BY_ID.get(design.suspension)?.era ?? 0,
    AUX_BY_ID.get(design.aux)?.era ?? 0,
    MATERIAL_BY_ID.get(design.armor.material)?.era ?? 0,
    MATERIAL_BY_ID.get(turretMaterial)?.era ?? 0,
  )
}

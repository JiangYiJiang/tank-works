/**
 * 装甲：厚度 → 等效厚度。
 *
 * 一句物理：斜着的板，炮弹要走更远的路。
 * 所以等效 = 厚度 / cos(倾角)。60° 就是两倍。
 *
 * 但有三个「别照抄公式」的地方，本模型都做了处理：
 *   1. 倾角不是免费的：同样的垂直高度，斜板本身更长、更重。这个代价自动体现在几何面积里。
 *   2. 破甲弹几乎不吃倾角：金属射流是流体，碰壁会拐弯继续钻。所以 KE 和 CE 两套系数分开算。
 *   3. 复合装甲不吃倾角：它报的厚度本来就是沿视线的阵列厚度，再乘一次就重复计算了。
 */

import type { ArmorFit } from '../types'
import { MATERIAL_BY_ID, need } from '../data/parts'
import { TUNING } from './tuning'

const DEG = Math.PI / 180

export interface Protection {
  /** 首上等效抗穿 mm RHAe（对动能弹） */
  hull: number
  /** 炮塔正面等效抗穿 mm RHAe（对动能弹） */
  turret: number
  /** 侧面等效抗穿 mm RHAe */
  side: number
  /** 首上等效抗破 mm RHAe（对化学能弹） */
  hullCe: number
  turretCe: number
  /** 侧面等效抗破 mm RHAe */
  sideCe: number
}

/** 倾角收益：1/cos(θ)^exp。θ 从垂直量起。复合结构直接返回 1（无额外收益）。 */
function slopeGain(slopeDeg: number, exp: number, compound: boolean): number {
  if (compound) return 1
  const rad = Math.max(1, Math.min(84, slopeDeg)) * DEG
  return Math.pow(1 / Math.cos(rad), exp)
}

export function solveProtection(armor: ArmorFit): Protection {
  const hullMat = need(MATERIAL_BY_ID, armor.material, '车体装甲材料')
  const turretMat = need(
    MATERIAL_BY_ID,
    armor.turretMaterial ?? armor.material,
    '炮塔装甲材料',
  )
  const t = TUNING.armor
  // 尖头首上是车体特征，不影响炮塔
  const pike = armor.pike ? t.pikeBonus : 1

  const keHull = armor.front * slopeGain(armor.frontSlope, t.keSlopeExp, hullMat.compound) * hullMat.ke * pike
  const keTurret =
    armor.turretFront * slopeGain(armor.turretSlope, t.keSlopeExp, turretMat.compound) * turretMat.ke
  const keSide = armor.side * hullMat.ke

  const ceHull = armor.front * slopeGain(armor.frontSlope, t.ceSlopeExp, hullMat.compound) * hullMat.ce * pike
  const ceTurret =
    armor.turretFront * slopeGain(armor.turretSlope, t.ceSlopeExp, turretMat.compound) * turretMat.ce
  const ceSide = armor.side * hullMat.ce

  return { hull: keHull, turret: keTurret, side: keSide, hullCe: ceHull, turretCe: ceTurret, sideCe: ceSide }
}

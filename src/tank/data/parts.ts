/**
 * 部件库。设计局能选的六个槽位，全部是数据，没有逻辑。
 *
 * 数据来源说明：这是**校准用的近似值**，不是考据手册。
 * 每个数字的目标不是「精确到毫米」，而是「让模型算出来的四维分落在历史车 ±10% 以内」。
 * 真正的考据版本要等玩法定型以后再做，现在追求的是物理关系正确、量级正确。
 *
 * `era` 字段是年份，将来科技树直接按它门控：1915 年开局只能选 era ≤ 1915 的部件。
 */

import type {
  ArmorMaterialDef,
  AuxDef,
  EngineDef,
  GunDef,
  HullDef,
  SuspensionDef,
} from '../types'

// ────────────────────────────────────────────────────────────
// 车体
// ────────────────────────────────────────────────────────────

export const HULLS: readonly HullDef[] = [
  { id: 'ft', name: '轻型车体 · 战壕型', hullClass: 'light', length: 5.0, width: 1.74, height: 1.2, ring: 0.75, structureFactor: 1.15, crewMin: 2, era: 1917 },
  { id: 'a7v', name: '重型车体 · 箱型', hullClass: 'heavy', length: 7.34, width: 3.06, height: 1.4, ring: 0.95, structureFactor: 1.30, crewMin: 6, era: 1918 },
  { id: 'vickers_mk2', name: '中型车体 · Mk.II', hullClass: 'medium', length: 5.33, width: 2.41, height: 1.0, ring: 1.0, structureFactor: 1.05, crewMin: 3, era: 1928 },
  { id: 'pz3', name: '中型车体 · 三号', hullClass: 'medium', length: 5.38, width: 2.91, height: 1.0, ring: 1.53, structureFactor: 1.0, crewMin: 5, era: 1939 },
  { id: 't34', name: '中型车体 · T-34', hullClass: 'medium', length: 5.92, width: 3.0, height: 0.95, ring: 1.42, structureFactor: 0.95, crewMin: 4, era: 1941 },
  { id: 'm4', name: '中型车体 · M4', hullClass: 'medium', length: 5.9, width: 2.62, height: 1.0, ring: 1.75, structureFactor: 1.0, crewMin: 5, era: 1942 },
  { id: 'panther', name: '重型车体 · 黑豹', hullClass: 'heavy', length: 6.87, width: 3.27, height: 1.1, ring: 1.65, structureFactor: 1.05, crewMin: 5, era: 1943 },
  { id: 'tiger2', name: '重型车体 · 虎王', hullClass: 'heavy', length: 7.38, width: 3.58, height: 1.2, ring: 1.85, structureFactor: 1.10, crewMin: 5, era: 1944 },
  { id: 'is3', name: '重型车体 · IS-3', hullClass: 'heavy', length: 6.77, width: 3.07, height: 1.1, ring: 1.8, structureFactor: 1.0, crewMin: 4, era: 1945 },
  { id: 'centurion', name: '重型车体 · 百夫长', hullClass: 'heavy', length: 7.6, width: 3.05, height: 1.15, ring: 1.85, structureFactor: 1.0, crewMin: 4, era: 1950 },
  { id: 'm48', name: '重型车体 · M48', hullClass: 'heavy', length: 6.9, width: 3.63, height: 1.15, ring: 2.16, structureFactor: 1.0, crewMin: 4, era: 1953 },
  { id: 't54', name: '中型车体 · T-54', hullClass: 'medium', length: 6.0, width: 3.27, height: 0.95, ring: 1.8, structureFactor: 0.92, crewMin: 4, era: 1955 },
  { id: 'leopard1', name: '中型车体 · 豹 1', hullClass: 'medium', length: 7.09, width: 3.15, height: 1.05, ring: 1.9, structureFactor: 0.95, crewMin: 4, era: 1965 },
  { id: 't62', name: '中型车体 · T-62', hullClass: 'medium', length: 6.25, width: 3.3, height: 0.95, ring: 2.0, structureFactor: 0.92, crewMin: 4, era: 1965 },
  { id: 't72', name: '中型车体 · T-72', hullClass: 'medium', length: 6.4, width: 3.38, height: 1.0, ring: 2.2, structureFactor: 0.9, crewMin: 3, era: 1979 },
  { id: 'leopard2', name: '中型车体 · 豹 2', hullClass: 'medium', length: 7.2, width: 3.5, height: 1.15, ring: 2.2, structureFactor: 0.95, crewMin: 4, era: 1985 },
  { id: 't80', name: '中型车体 · T-80', hullClass: 'medium', length: 6.9, width: 3.5, height: 1.05, ring: 2.2, structureFactor: 0.9, crewMin: 3, era: 1990 },
  { id: 'm1', name: '中型车体 · M1', hullClass: 'medium', length: 7.5, width: 3.6, height: 1.2, ring: 2.3, structureFactor: 0.95, crewMin: 4, era: 1991 },
]

// ────────────────────────────────────────────────────────────
// 装甲材料
// ────────────────────────────────────────────────────────────

export const ARMOR_MATERIALS: readonly ArmorMaterialDef[] = [
  { id: 'rha', name: '轧制均质钢', ke: 1.0, ce: 1.0, density: 7.85, costPerKg: 12, compound: false, era: 1917 },
  { id: 'cast', name: '铸造钢', ke: 0.95, ce: 0.97, density: 7.85, costPerKg: 10, compound: false, era: 1917 },
  { id: 'hha', name: '表面硬化钢', ke: 1.12, ce: 0.98, density: 7.85, costPerKg: 18, compound: false, era: 1935 },
  { id: 'composite_early', name: '早期复合（玻璃纤维夹层）', ke: 1.35, ce: 1.9, density: 3.2, costPerKg: 90, compound: true, era: 1963 },
  { id: 'composite', name: '复合装甲（陶瓷/钢夹层）', ke: 1.95, ce: 2.4, density: 3.6, costPerKg: 130, compound: true, era: 1975 },
  { id: 'nera', name: '非爆炸反应装甲', ke: 2.1, ce: 2.8, density: 4.0, costPerKg: 160, compound: true, era: 1985 },
]

// ────────────────────────────────────────────────────────────
// 火炮
// ────────────────────────────────────────────────────────────

export const GUNS: readonly GunDef[] = [
  // charge 是「发射药水平 / 膛压」：由该炮的真实炮口初速反推出来的数据，不是拟合参数。
  // 值域 0.40（1920 年代的低膛压炮）到 1.50（战后高膛压滑膛炮），本身就能看出技术代差。
  { id: 'sa18', name: '37mm SA18', caliber: 37, barrelCalibers: 21, shell: 'ap', rounds: 240, charge: 0.57, era: 1917 },
  { id: 'maxim57', name: '57mm 马克沁', caliber: 57, barrelCalibers: 26, shell: 'ap', rounds: 180, charge: 0.72, era: 1918 },
  { id: 'vickers47', name: '47mm 维克斯', caliber: 47, barrelCalibers: 50, shell: 'ap', rounds: 160, charge: 0.40, era: 1928 },
  { id: 'kwk36_37', name: '37mm KwK36', caliber: 37, barrelCalibers: 46, shell: 'apcbc', rounds: 131, charge: 1.0, era: 1939 },
  { id: 'f34', name: '76mm F-34', caliber: 76.2, barrelCalibers: 42, shell: 'aphe', rounds: 77, charge: 0.83, era: 1941 },
  { id: 'm3_75', name: '75mm M3', caliber: 75, barrelCalibers: 40, shell: 'apcbc', rounds: 90, charge: 0.76, era: 1942 },
  { id: 'kwk42', name: '75mm KwK42', caliber: 75, barrelCalibers: 70, shell: 'apcbc', rounds: 79, charge: 0.97, era: 1943 },
  { id: 'zis53', name: '85mm ZiS-S-53', caliber: 85, barrelCalibers: 52, shell: 'aphe', rounds: 56, charge: 0.96, era: 1944 },
  { id: 'kwk43', name: '88mm KwK43', caliber: 88, barrelCalibers: 71, shell: 'apcbc', rounds: 86, charge: 1.12, era: 1944 },
  { id: 'd25t', name: '122mm D-25T', caliber: 122, barrelCalibers: 43, shell: 'aphe', rounds: 28, charge: 1.13, era: 1945 },
  { id: 'qwf20', name: '84mm 20 磅炮', caliber: 84, barrelCalibers: 66.7, shell: 'apds', rounds: 65, charge: 0.52, era: 1950 },
  { id: 'm41gun', name: '90mm M41', caliber: 90, barrelCalibers: 48, shell: 'apcr', rounds: 60, charge: 1.23, era: 1953 },
  { id: 'd10t', name: '100mm D-10T', caliber: 100, barrelCalibers: 56, shell: 'apcbc', rounds: 34, charge: 1.16, era: 1955 },
  { id: 'l7', name: '105mm L7', caliber: 105, barrelCalibers: 52, shell: 'apds', rounds: 60, charge: 1.4, era: 1965 },
  { id: 'u5ts', name: '115mm U-5TS', caliber: 115, barrelCalibers: 55, shell: 'apfsds', rounds: 40, charge: 1.05, era: 1965 },
  { id: '2a46', name: '125mm 2A46', caliber: 125, barrelCalibers: 48, shell: 'apfsds', rounds: 44, charge: 1.5, era: 1979 },
  { id: 'rh120', name: '120mm Rh-120', caliber: 120, barrelCalibers: 44, shell: 'apfsds', rounds: 42, charge: 1.38, era: 1985 },
  { id: '2a46m', name: '125mm 2A46M', caliber: 125, barrelCalibers: 48, shell: 'apfsds', rounds: 45, charge: 1.47, era: 1990 },
  { id: 'm256', name: '120mm M256', caliber: 120, barrelCalibers: 44, shell: 'apfsds2', rounds: 40, charge: 1.41, era: 1991 },
]

// ────────────────────────────────────────────────────────────
// 动力包
// ────────────────────────────────────────────────────────────

export const ENGINES: readonly EngineDef[] = [
  // thirst 是百公里油耗（L/100km）。燃气轮机是著名的油老虎，这个值直接决定油箱重量。
  { id: 'ft_eng', name: '雷诺 4 缸汽油机', power: 35, mass: 250, volume: 0.6, thirst: 270, era: 1917 },
  { id: 'a7v_eng', name: '戴姆勒双联汽油机', power: 200, mass: 1200, volume: 3.0, thirst: 480, era: 1918 },
  { id: 'vickers_eng', name: '阿姆斯特朗 90hp', power: 90, mass: 600, volume: 1.4, thirst: 250, era: 1928 },
  { id: 'maybach_hl120', name: '迈巴赫 HL120', power: 300, mass: 550, volume: 1.3, thirst: 220, era: 1939 },
  { id: 'v2_34', name: 'V-2 柴油机', power: 500, mass: 1000, volume: 1.9, thirst: 137, era: 1941 },
  { id: 'continental_r975', name: '大陆 R975 星型', power: 400, mass: 850, volume: 2.2, thirst: 347, era: 1942 },
  { id: 'maybach_hl230', name: '迈巴赫 HL230', power: 700, mass: 1200, volume: 2.2, thirst: 400, era: 1943 },
  { id: 'v2_is3', name: 'V-2-IS 柴油机', power: 600, mass: 1050, volume: 1.9, thirst: 150, era: 1945 },
  { id: 'meteor', name: '流星 V12', power: 650, mass: 1100, volume: 2.4, thirst: 300, era: 1950 },
  { id: 'av1790', name: '大陆 AV1790 汽油机', power: 810, mass: 1400, volume: 3.2, thirst: 420, era: 1953 },
  { id: 'v54', name: 'V-54 柴油机', power: 520, mass: 1000, volume: 1.7, thirst: 160, era: 1955 },
  { id: 'mb838', name: 'MTU MB838', power: 830, mass: 1500, volume: 2.6, thirst: 190, era: 1965 },
  { id: 'v55', name: 'V-55 柴油机', power: 580, mass: 1050, volume: 1.6, thirst: 175, era: 1965 },
  { id: 'v46', name: 'V-46 柴油机', power: 780, mass: 1100, volume: 1.7, thirst: 160, era: 1979 },
  { id: 'mb873', name: 'MTU MB873', power: 1500, mass: 2200, volume: 4.0, thirst: 220, era: 1985 },
  { id: 'gtd1000', name: 'GTD-1000 燃气轮机', power: 1250, mass: 1600, volume: 4.0, thirst: 260, era: 1990 },
  { id: 'agd1500', name: 'AGT-1500 燃气轮机', power: 1500, mass: 1800, volume: 4.5, thirst: 410, era: 1991 },
]

// ────────────────────────────────────────────────────────────
// 行走
// ────────────────────────────────────────────────────────────

export const SUSPENSIONS: readonly SuspensionDef[] = [
  { id: 'ft_susp', name: '螺旋弹簧', type: 'leaf', trackWidth: 0.30, contactLength: 1.60, quality: 0.25, vCap: 9, era: 1917 },
  { id: 'a7v_susp', name: '板簧台车', type: 'leaf', trackWidth: 0.35, contactLength: 2.00, quality: 0.20, vCap: 10, era: 1918 },
  { id: 'vickers_susp', name: '板簧台车', type: 'leaf', trackWidth: 0.40, contactLength: 2.20, quality: 0.30, vCap: 26, era: 1928 },
  { id: 'pz3_susp', name: '板簧台车', type: 'leaf', trackWidth: 0.40, contactLength: 2.60, quality: 0.45, vCap: 42, era: 1939 },
  { id: 'christie', name: '克里斯蒂悬挂', type: 'christie', trackWidth: 0.55, contactLength: 3.50, quality: 0.55, vCap: 56, era: 1941 },
  { id: 'vvss', name: 'VVSS 垂直蜗卷', type: 'leaf', trackWidth: 0.42, contactLength: 2.90, quality: 0.50, vCap: 44, era: 1942 },
  { id: 'panther_susp', name: '扭杆 · 大直径负重轮', type: 'torsion', trackWidth: 0.66, contactLength: 3.60, quality: 0.62, vCap: 48, era: 1943 },
  { id: 'tiger2_susp', name: '扭杆 · 交错负重轮', type: 'torsion', trackWidth: 0.80, contactLength: 3.60, quality: 0.58, vCap: 43, era: 1944 },
  { id: 'is3_susp', name: '扭杆', type: 'torsion', trackWidth: 0.65, contactLength: 3.20, quality: 0.55, vCap: 41, era: 1945 },
  { id: 'cent_susp', name: '扭杆', type: 'torsion', trackWidth: 0.61, contactLength: 3.30, quality: 0.62, vCap: 37, era: 1950 },
  { id: 'm48_susp', name: '扭杆', type: 'torsion', trackWidth: 0.71, contactLength: 3.50, quality: 0.60, vCap: 46, era: 1953 },
  { id: 't54_susp', name: '扭杆', type: 'torsion', trackWidth: 0.58, contactLength: 3.30, quality: 0.60, vCap: 51, era: 1955 },
  { id: 'leo1_susp', name: '扭杆', type: 'torsion', trackWidth: 0.66, contactLength: 3.60, quality: 0.72, vCap: 66, era: 1965 },
  { id: 't62_susp', name: '扭杆', type: 'torsion', trackWidth: 0.58, contactLength: 3.40, quality: 0.62, vCap: 51, era: 1965 },
  { id: 't72_susp', name: '扭杆', type: 'torsion', trackWidth: 0.58, contactLength: 3.40, quality: 0.66, vCap: 61, era: 1979 },
  { id: 'leo2_susp', name: '扭杆', type: 'torsion', trackWidth: 0.635, contactLength: 4.00, quality: 0.82, vCap: 69, era: 1985 },
  { id: 't80_susp', name: '扭杆', type: 'torsion', trackWidth: 0.58, contactLength: 3.50, quality: 0.78, vCap: 71, era: 1990 },
  { id: 'm1_susp', name: '扭杆', type: 'torsion', trackWidth: 0.635, contactLength: 4.10, quality: 0.80, vCap: 68, era: 1991 },
]

// ────────────────────────────────────────────────────────────
// 辅助设备
// ────────────────────────────────────────────────────────────

export const AUXES: readonly AuxDef[] = [
  { id: 'bare', name: '裸车（无电台无火控）', night: 'none', fcs: 'none', stabilizer: false, nbc: 0, radio: 0, era: 1917 },
  { id: 'ww1_flag', name: '旗语指挥', night: 'none', fcs: 'none', stabilizer: false, nbc: 0, radio: 1, era: 1918 },
  { id: 'interwar', name: '基本电台 + 光学瞄准', night: 'none', fcs: 'optical', stabilizer: false, nbc: 0, radio: 2, era: 1935 },
  { id: 'ww2_std', name: '电台 + 光学瞄准', night: 'none', fcs: 'optical', stabilizer: false, nbc: 0, radio: 2, era: 1941 },
  { id: 'ww2_rf', name: '电台 + 体视测距', night: 'none', fcs: 'rangefinder', stabilizer: false, nbc: 0, radio: 2, era: 1943 },
  // 年代按「T-34/76 就用得上」算：1941。原先写 1944，会把 1941 年的车判成超前。
  { id: 'ww2_simple', name: '有限电台（苏联早期）', night: 'none', fcs: 'none', stabilizer: false, nbc: 0, radio: 1, era: 1941 },
  { id: 'early_cold', name: '全员电台 + 光学测距', night: 'none', fcs: 'rangefinder', stabilizer: false, nbc: 1, radio: 3, era: 1950 },
  { id: 'cold_ir', name: '全员电台 + 测距 + 红外夜视', night: 'ir', fcs: 'rangefinder', stabilizer: false, nbc: 2, radio: 3, era: 1958 },
  { id: 'cold_stab', name: '激光测距 + 双向稳定', night: 'ir', fcs: 'laser', stabilizer: true, nbc: 2, radio: 3, era: 1965 },
  { id: 'cold_late', name: '激光测距 + 稳定 + 微光', night: 'ir', fcs: 'laser', stabilizer: true, nbc: 3, radio: 3, era: 1975 },
  { id: 'thermal', name: '数字火控 + 稳定 + 热成像', night: 'thermal1', fcs: 'digital', stabilizer: true, nbc: 3, radio: 3, era: 1985 },
  { id: 'thermal2', name: '数字火控 + 稳定 + 二代热成像', night: 'thermal2', fcs: 'digital', stabilizer: true, nbc: 3, radio: 3, era: 1990 },
]

// ────────────────────────────────────────────────────────────
// 查表
// ────────────────────────────────────────────────────────────

export const HULL_BY_ID = new Map(HULLS.map((h) => [h.id, h]))
export const GUN_BY_ID = new Map(GUNS.map((g) => [g.id, g]))
export const ENGINE_BY_ID = new Map(ENGINES.map((e) => [e.id, e]))
export const SUSPENSION_BY_ID = new Map(SUSPENSIONS.map((s) => [s.id, s]))
export const AUX_BY_ID = new Map(AUXES.map((a) => [a.id, a]))
export const MATERIAL_BY_ID = new Map(ARMOR_MATERIALS.map((m) => [m.id, m]))

/** 取部件，取不到就抛 —— 设计数据写错时宁可炸掉，也不要静默算出个假车。 */
export function need<T>(map: Map<string, T>, id: string, what: string): T {
  const found = map.get(id)
  if (!found) throw new Error(`未知${what}：${id}`)
  return found
}

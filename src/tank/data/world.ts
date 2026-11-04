/**
 * 世界装甲编制：主界面左侧国家卡片的「总坦克数 / 具体构成」。
 *
 * 这是**占位数据**：9 个主要国家的现役型号、数量与退役年份还没做历史考证，
 * 目前先用真实车名 + 近似编制量，保证主界面能随年份变化、能点开看构成。
 * 后续接真实编制表时，只替换本文件，不动界面。
 */

import { HISTORICAL } from './historical'
import { PLAYABLE_NATION_IDS, type PlayableNationId } from './nation-profiles'
import { buildTank } from '../model/build'
import { scoreDims } from '../model/score'
import type { RawDims } from '../types'

export interface WorldTankEntry {
  /** 显示名 */
  name: string
  from: number
  /** 含；退役后从现役编制里消失 */
  to: number
  /** 峰值编制量，按服役年数爬坡；不是精确产量 */
  peak: number
  /** 历史 fixture 的名字；给了就用 buildTank 算四维 */
  refName?: string
  /** 没有 fixture 的国家先用估算值，界面上会标「估」 */
  raw?: RawDims
}

export interface WorldTank {
  name: string
  qty: number
  armor: number
  pen: number
  offroad: number
  adapt: number
  total: number
  estimated: boolean
}

export interface WorldInventory {
  tanks: WorldTank[]
  total: number
}

/**
 * 数量曲线：刚列装时只到位约 35%，八年内爬满峰值。
 * 这不是产量模拟，只是让 1915—1991 的国家卡片每年看起来不一样。
 */
function qtyAt(entry: WorldTankEntry, year: number): number {
  const age = Math.max(0, year - entry.from)
  const ramp = 0.35 + 0.65 * Math.min(1, age / 8)
  return Math.max(1, Math.round(entry.peak * ramp))
}

const REFS = new Map(HISTORICAL.map((h) => [h.name, h]))

function statsOf(entry: WorldTankEntry): Omit<WorldTank, 'qty'> {
  if (entry.refName) {
    const h = REFS.get(entry.refName)
    if (h) {
      const built = buildTank(h.design)
      return {
        name: entry.name,
        armor: Math.round(built.raw.armor),
        pen: Math.round(built.raw.pen),
        offroad: Math.round(built.raw.offroad),
        adapt: Math.round(built.raw.adapt),
        total: built.score.total,
        estimated: false,
      }
    }
  }
  const raw = entry.raw ?? { armor: 0, pen: 0, offroad: 0, adapt: 0 }
  return {
    name: entry.name,
    armor: raw.armor,
    pen: raw.pen,
    offroad: raw.offroad,
    adapt: raw.adapt,
    total: scoreDims(raw).total,
    estimated: true,
  }
}

const ENTRIES: Record<PlayableNationId, readonly WorldTankEntry[]> = {
  usa: [
    { name: 'M4A1 谢尔曼', from: 1942, to: 1957, peak: 49_000, refName: 'M4A1 谢尔曼' },
    { name: 'M48A2 巴顿', from: 1953, to: 1980, peak: 12_000, refName: 'M48A2' },
    { name: 'M1A1HA 艾布拉姆斯', from: 1991, to: 1991, peak: 3_000, refName: 'M1A1HA' },
  ],
  gbr: [
    { name: 'Mark I', from: 1916, to: 1918, peak: 150, raw: { armor: 12, pen: 25, offroad: 3, adapt: 500 } },
    { name: '维克斯 Mk.II', from: 1928, to: 1939, peak: 150, refName: '维克斯中型 Mk.II' },
    { name: '丘吉尔', from: 1941, to: 1952, peak: 5_600, raw: { armor: 100, pen: 70, offroad: 12, adapt: 1_600 } },
    { name: '百夫长 Mk.3', from: 1950, to: 1965, peak: 3_000, refName: '百夫长 Mk.3' },
    { name: '酋长', from: 1966, to: 1991, peak: 2_000, raw: { armor: 250, pen: 350, offroad: 30, adapt: 2_200 } },
  ],
  fra: [
    { name: '雷诺 FT-17', from: 1917, to: 1935, peak: 3_000, refName: '雷诺 FT-17' },
    { name: 'B1 bis', from: 1936, to: 1945, peak: 400, raw: { armor: 60, pen: 45, offroad: 12, adapt: 1_500 } },
    { name: 'AMX-30', from: 1966, to: 1991, peak: 1_200, raw: { armor: 80, pen: 320, offroad: 40, adapt: 2_200 } },
  ],
  ger: [
    { name: 'A7V', from: 1918, to: 1919, peak: 20, refName: 'A7V' },
    { name: '三号 F 型', from: 1939, to: 1943, peak: 1_200, refName: '三号 F 型' },
    { name: '黑豹 D 型', from: 1943, to: 1945, peak: 3_000, refName: '黑豹 D 型' },
    { name: '虎王', from: 1944, to: 1945, peak: 500, refName: '虎王 (Tiger II)' },
    { name: '豹 1', from: 1965, to: 1985, peak: 2_500, refName: '豹 1' },
    { name: '豹 2A4', from: 1985, to: 1991, peak: 2_000, refName: '豹 2A4' },
  ],
  ita: [
    { name: 'Fiat 2000', from: 1918, to: 1920, peak: 6, raw: { armor: 20, pen: 20, offroad: 4, adapt: 500 } },
    { name: 'M13/40', from: 1940, to: 1943, peak: 800, raw: { armor: 42, pen: 45, offroad: 15, adapt: 1_200 } },
    { name: 'OF-40', from: 1980, to: 1991, peak: 300, raw: { armor: 300, pen: 330, offroad: 40, adapt: 2_300 } },
    { name: '公羊', from: 1988, to: 1991, peak: 200, raw: { armor: 320, pen: 380, offroad: 45, adapt: 2_500 } },
  ],
  csk: [
    { name: 'LT-38', from: 1938, to: 1945, peak: 1_400, raw: { armor: 25, pen: 45, offroad: 24, adapt: 1_500 } },
    { name: 'T-55（许可生产）', from: 1960, to: 1991, peak: 1_500, raw: { armor: 200, pen: 300, offroad: 35, adapt: 2_100 } },
  ],
  swe: [
    { name: 'Strv m/42', from: 1943, to: 1957, peak: 300, raw: { armor: 50, pen: 55, offroad: 22, adapt: 1_300 } },
    { name: 'Strv 103', from: 1967, to: 1991, peak: 300, raw: { armor: 120, pen: 300, offroad: 35, adapt: 1_800 } },
  ],
  sov: [
    { name: 'T-34/76', from: 1941, to: 1944, peak: 30_000, refName: 'T-34/76' },
    { name: 'T-34/85', from: 1944, to: 1958, peak: 25_000, refName: 'T-34/85' },
    { name: 'IS-3', from: 1945, to: 1960, peak: 2_000, refName: 'IS-3' },
    { name: 'T-54', from: 1955, to: 1975, peak: 20_000, refName: 'T-54' },
    { name: 'T-62', from: 1965, to: 1985, peak: 12_000, refName: 'T-62' },
    { name: 'T-72A', from: 1979, to: 1991, peak: 15_000, refName: 'T-72A' },
    { name: 'T-80U', from: 1990, to: 1991, peak: 3_000, refName: 'T-80U' },
  ],
  jpn: [
    { name: '九七式中战车', from: 1938, to: 1945, peak: 1_500, raw: { armor: 25, pen: 40, offroad: 20, adapt: 1_100 } },
    { name: '74 式', from: 1975, to: 1991, peak: 800, raw: { armor: 200, pen: 320, offroad: 40, adapt: 2_300 } },
    { name: '90 式', from: 1990, to: 1991, peak: 300, raw: { armor: 350, pen: 400, offroad: 45, adapt: 2_600 } },
  ],
}

export function worldAt(id: PlayableNationId, year: number): WorldInventory {
  const tanks: WorldTank[] = []
  for (const entry of ENTRIES[id]) {
    if (year < entry.from || year > entry.to) continue
    tanks.push({ ...statsOf(entry), qty: qtyAt(entry, year) })
  }
  tanks.sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, 'zh'))
  return { tanks, total: tanks.reduce((sum, t) => sum + t.qty, 0) }
}

export function worldCountries(year: number): { id: PlayableNationId; total: number }[] {
  return PLAYABLE_NATION_IDS.map((id) => ({ id, total: worldAt(id, year).total }))
}

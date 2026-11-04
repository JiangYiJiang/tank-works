/**
 * 国家与阵营。
 *
 * 阵营不是固定的「德国永远是轴心」—— 它随年代变：
 *   1939–1945：同盟国 vs 轴心国
 *   1947–1991：西方 vs 东方
 *   其余年份（1915–1938、1946）：自由军贸，谁都能买
 *
 * 玩家开局选一个国家，客户阵营不同就买不到你的车。这条规则让「选国家」
 * 成为开局第一个大决策，而不是换一层皮。
 */

export type NationId = 'fra' | 'gbr' | 'usa' | 'sov' | 'ger' | 'ita' | 'csk' | 'jpn' | 'chn' | 'swe' | 'che'

export interface Nation {
  id: NationId
  name: string
  short: string
  /** 这个国家从哪一年开始出现在军贸市场上（苏联 1922、新中国 1949） */
  from?: number
}

export const NATIONS: readonly Nation[] = [
  { id: 'fra', name: '法国', short: '法' },
  { id: 'gbr', name: '英国', short: '英' },
  { id: 'usa', name: '美国', short: '美' },
  { id: 'sov', name: '苏联', short: '苏', from: 1922 },
  { id: 'ger', name: '德国', short: '德' },
  { id: 'ita', name: '意大利', short: '意' },
  { id: 'csk', name: '捷克斯洛伐克', short: '捷', from: 1918 },
  { id: 'jpn', name: '日本', short: '日' },
  { id: 'chn', name: '中国', short: '中', from: 1949 },
  { id: 'swe', name: '瑞典', short: '瑞' },
  { id: 'che', name: '瑞士', short: '瑞' },
]

export const NATION_BY_ID = new Map(NATIONS.map((n) => [n.id, n]))

const AXIS: NationId[] = ['ger', 'ita', 'jpn']
const ALLIES: NationId[] = ['fra', 'gbr', 'usa', 'sov', 'chn', 'csk']
const WEST: NationId[] = ['fra', 'gbr', 'usa', 'ger', 'ita', 'jpn']
const EAST: NationId[] = ['sov', 'chn', 'csk']
const NEUTRAL: NationId[] = ['swe', 'che']

export type Bloc = 'axis' | 'allies' | 'west' | 'east' | 'neutral'

/** 某国在某年属于哪个阵营。 */
export function blocOf(id: string, year: number): Bloc {
  if (year < 1939 || year >= 1946) {
    // 1939 前与 1946 是自由军贸；1947 起进入冷战
    if (year < 1939) return 'neutral'
    if (year === 1946) return 'neutral'
    if (EAST.includes(id as NationId)) return 'east'
    if (WEST.includes(id as NationId)) return 'west'
    return 'neutral'
  }
  if (AXIS.includes(id as NationId)) return 'axis'
  if (ALLIES.includes(id as NationId)) return 'allies'
  return 'neutral'
}

/** 这个客户现在能不能买你的车。中立国谁都能卖；其余必须同阵营。 */
export function customerAllowed(home: string, customer: string, year: number): boolean {
  const h = blocOf(home, year)
  const c = blocOf(customer, year)
  if (c === 'neutral' || h === 'neutral') return true
  return h === c
}

/** 当前能卖的国家（不含本国）。 */
export function customersFor(home: string, year: number): Nation[] {
  return NATIONS.filter((n) => n.id !== home && (n.from ?? 0) <= year && customerAllowed(home, n.id, year))
}

export function nationName(id: string): string {
  return NATION_BY_ID.get(id as NationId)?.name ?? id
}

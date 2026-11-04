/**
 * 国家与市场。
 *
 * 这里只负责「有哪些国家、从哪一年进入军贸市场」。
 *
 * 阵营系统暂时关闭：原来的 1939–45 同盟/轴心、1947–91 西方/东方分段
 * 不足以表达历史（法国 1940 投降、美国 1917 参战前后都不同），
 * 后续会按年份、投降/参战事件重新设计。当前所有已进入市场的国家
 * 都可以向任何客户供货，只排除本国。
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

/** 当前能卖的国家：所有已进入市场的国家，排除本国。阵营限制暂不启用。 */
export function customersFor(home: string, year: number): Nation[] {
  return NATIONS.filter((n) => n.id !== home && (n.from ?? 0) <= year)
}

export function nationName(id: string): string {
  return NATION_BY_ID.get(id as NationId)?.name ?? id
}

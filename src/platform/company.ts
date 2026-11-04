/**
 * 厂牌：玩家给厂子起的名字 + 手绘 logo。
 *
 * 和存档分开存，是因为它不参与模拟，也不该让存档版本再涨一级。
 * 新游戏会通过 RUN_KEYS 一起清掉；旧存档第一次打开时没有厂牌，主界面会补一次登记。
 */

import type { SaveStore } from './storage'

export const COMPANY_KEY = 'tank-works.company.v1'
export const COMPANY_NAME_MAX = 24
const LOGO_MAX = 400_000
const LOGO_PREFIX = 'data:image/png;base64,'

export interface Company {
  name: string
  /** 手绘 canvas 导出的 PNG data URL；留空时界面用名字首字做标记。 */
  logo: string
}

export function readCompany(store: Pick<SaveStore, 'read'>): Company | null {
  let raw: string | null = null
  try {
    raw = store.read(COMPANY_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as { name?: unknown; logo?: unknown }
    const name = typeof data.name === 'string' ? data.name.trim().slice(0, COMPANY_NAME_MAX) : ''
    if (!name) return null
    const logo =
      typeof data.logo === 'string' && data.logo.startsWith(LOGO_PREFIX) && data.logo.length <= LOGO_MAX
        ? data.logo
        : ''
    return { name, logo }
  } catch {
    return null
  }
}

export function writeCompany(store: Pick<SaveStore, 'write'>, company: Company): boolean {
  const name = company.name.trim().slice(0, COMPANY_NAME_MAX)
  if (!name) return false
  const logo =
    typeof company.logo === 'string' && company.logo.startsWith(LOGO_PREFIX) && company.logo.length <= LOGO_MAX
      ? company.logo
      : ''
  try {
    store.write(COMPANY_KEY, JSON.stringify({ name, logo }))
    return true
  } catch {
    return false
  }
}

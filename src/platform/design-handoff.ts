/**
 * 设计局 → 主循环的交接。
 *
 * 两个页面是独立的入口，没有共享的运行时状态，所以用 localStorage 传一份
 * 「刚采用的设计」。**只传设计，不传钱和订单** —— 那些在主循环的存档里。
 *
 * 以后换 Electron / Tauri 时，这个模块换成写文件即可，上层不用改。
 */

import type { TankDesign } from '../tank/types'

export const ADOPTED_DESIGN_KEY = 'tank-works.design.v1'
/** 主循环打开「设计本厂车」时，先把当前设计放进这个草稿位。 */
export const DRAFT_DESIGN_KEY = 'tank-works.draft.v1'

export interface AdoptedDesign {
  /** 采用时刻（毫秒），用来区分「新采用的一份」和旧的 */
  at: number
  design: TankDesign
}

function store(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function isDesignLike(d: unknown): d is TankDesign {
  if (!d || typeof d !== 'object') return false
  const x = d as Partial<TankDesign>
  return (
    typeof x.name === 'string' &&
    typeof x.hull === 'string' &&
    typeof x.gun === 'string' &&
    typeof x.engine === 'string' &&
    typeof x.suspension === 'string' &&
    typeof x.aux === 'string' &&
    !!x.armor &&
    typeof x.armor.material === 'string'
  )
}

export function readAdopted(): AdoptedDesign | null {
  const s = store()
  if (!s) return null
  try {
    const raw = s.getItem(ADOPTED_DESIGN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AdoptedDesign>
    if (typeof parsed?.at !== 'number' || !isDesignLike(parsed.design)) return null
    return { at: parsed.at, design: parsed.design }
  } catch {
    return null
  }
}

export function writeAdopted(design: TankDesign): boolean {
  const s = store()
  if (!s) return false
  try {
    const payload: AdoptedDesign = { at: Date.now(), design }
    s.setItem(ADOPTED_DESIGN_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

export function clearAdopted(): void {
  const s = store()
  if (!s) return
  try {
    s.removeItem(ADOPTED_DESIGN_KEY)
  } catch {
    /* 清不掉就算了 */
  }
}

export function writeDraft(design: TankDesign): boolean {
  const s = store()
  if (!s) return false
  try {
    s.setItem(DRAFT_DESIGN_KEY, JSON.stringify(design))
    return true
  } catch {
    return false
  }
}

export function readDraft(): TankDesign | null {
  const s = store()
  if (!s) return null
  try {
    const raw = s.getItem(DRAFT_DESIGN_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isDesignLike(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function clearDraft(): void {
  const s = store()
  if (!s) return
  try {
    s.removeItem(DRAFT_DESIGN_KEY)
  } catch {
    /* 清不掉就算了 */
  }
}

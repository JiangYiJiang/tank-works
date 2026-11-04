/**
 * 主循环 → 设计局的科技快照。
 *
 * 设计局是独立入口，不应该自己去读存档、也不应该重新算一遍研发状态。
 * 主循环把「哪些零件能选、上限多少」写成一份快照，设计局只负责显示和拦人。
 */

import type { TechSnapshot } from '../tank/sim/research'

export const TECH_SNAPSHOT_KEY = 'tank-works.tech.v1'

function store(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function num(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function strArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

export function readTech(): TechSnapshot | null {
  const s = store()
  if (!s) return null
  try {
    const raw = s.getItem(TECH_SNAPSHOT_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Partial<TechSnapshot>
    const limits = o.limits
    const parts = o.parts
    const mods = o.mods
    const howitzerCaliberMax = num(limits?.howitzerCaliberMax) ? limits.howitzerCaliberMax : 0
    if (
      !num(o.at) ||
      !num(o.year) ||
      !o.mastered ||
      typeof o.mastered !== 'object' ||
      !limits ||
      !num(limits.slopeMax) ||
      !num(limits.pike) ||
      !num(limits.caliberMax) ||
      !num(limits.barrelMax) ||
      !num(limits.chargeMax) ||
      !num(limits.labor) ||
      (mods !== undefined && (!num(mods.labor) || !num(mods.charge))) ||
      !parts ||
      !strArray(parts.hull) ||
      !strArray(parts.material) ||
      !strArray(parts.gun) ||
      !strArray(parts.engine) ||
      !strArray(parts.suspension) ||
      !strArray(parts.aux)
    ) {
      return null
    }
    return {
      ...(o as TechSnapshot),
      limits: { ...limits, howitzerCaliberMax },
      mods: mods ?? { labor: 1, charge: 1 },
    }
  } catch {
    return null
  }
}

export function writeTech(snapshot: TechSnapshot): boolean {
  const s = store()
  if (!s) return false
  try {
    s.setItem(TECH_SNAPSHOT_KEY, JSON.stringify(snapshot))
    return true
  } catch {
    return false
  }
}

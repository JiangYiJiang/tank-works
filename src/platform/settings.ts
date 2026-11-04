/**
 * 主菜单与桌面壳共享的设置。
 *
 * 这里只做「读写 + 归一化」，不碰 DOM；菜单负责渲染，Electron 主进程负责窗口。
 * 旧版只有 reduceMotion，读取时缺的字段一律补默认值，不丢老设置。
 */

import type { SaveStore } from './storage'

export type DisplayMode = 'fullscreen' | 'borderless' | 'window'

export interface GameSettings {
  displayMode: DisplayMode
  reduceMotion: boolean
  masterVolume: number
  musicVolume: number
  sfxVolume: number
}

export const SETTINGS_KEY = 'tank-works.settings.v1'

export const DEFAULT_SETTINGS: GameSettings = {
  displayMode: 'window',
  reduceMotion: false,
  masterVolume: 80,
  musicVolume: 60,
  sfxVolume: 75,
}

const DISPLAY_MODES: readonly DisplayMode[] = ['fullscreen', 'borderless', 'window']

export function isDisplayMode(value: unknown): value is DisplayMode {
  return typeof value === 'string' && (DISPLAY_MODES as readonly string[]).includes(value)
}

function volume(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function normalizeSettings(raw: unknown): GameSettings {
  const source = raw && typeof raw === 'object' ? (raw as Partial<GameSettings>) : {}
  return {
    displayMode: isDisplayMode(source.displayMode) ? source.displayMode : DEFAULT_SETTINGS.displayMode,
    reduceMotion: source.reduceMotion === true,
    masterVolume: volume(source.masterVolume, DEFAULT_SETTINGS.masterVolume),
    musicVolume: volume(source.musicVolume, DEFAULT_SETTINGS.musicVolume),
    sfxVolume: volume(source.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
  }
}

export function readSettings(storage: Pick<SaveStore, 'read'>): GameSettings {
  try {
    const raw = storage.read(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return normalizeSettings(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function writeSettings(
  storage: Pick<SaveStore, 'write'>,
  settings: GameSettings,
): void {
  storage.write(SETTINGS_KEY, JSON.stringify(settings))
}

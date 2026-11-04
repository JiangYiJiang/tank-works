/**
 * 渲染进程看到的桌面桥。
 *
 * Web 版没有这个对象；任何桌面能力都必须先判断它是否存在，不能假设 window.close()
 * 或全屏 API 的行为和 Electron 一致。
 */

import type { DisplayMode } from './settings'

export interface DesktopBridge {
  readonly isDesktop: true
  getDisplayMode(): Promise<DisplayMode>
  setDisplayMode(mode: DisplayMode): Promise<DisplayMode>
  quit(): void
}

declare global {
  interface Window {
    tankWorksDesktop?: DesktopBridge
  }
}

export function desktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null
  return window.tankWorksDesktop ?? null
}

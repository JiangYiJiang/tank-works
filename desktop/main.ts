/**
 * Electron 主进程：窗口、显示模式、自定义协议、单实例。
 *
 * 页面仍然是原来的 Vite 多页站，主进程只负责把它装进一个桌面窗口。
 * dist/ 通过 app://tankworks/ 加载，而不是 file://：这样 localStorage 的 origin
 * 稳定，页面之间的 './game.html' 相对跳转也和浏览器里一致。
 */

import { app, BrowserWindow, ipcMain, protocol, screen } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import type { DisplayMode } from '../src/platform/settings'
import { isDisplayMode } from '../src/platform/settings'

const APP_SCHEME = 'app'
const APP_HOST = 'tankworks'
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`
const DEV_URL = process.env.TW_DEV_URL ?? ''

interface WindowBounds {
  x?: number
  y?: number
  width?: number
  height?: number
}

interface WindowState {
  displayMode: DisplayMode
  bounds: WindowBounds
}

const DEFAULT_WINDOW_STATE: WindowState = {
  displayMode: 'window',
  bounds: { width: 1280, height: 800 },
}

let mainWindow: BrowserWindow | null = null
let windowState: WindowState = { ...DEFAULT_WINDOW_STATE }
let recreating = false

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

const DIST_DIR = (): string => join(app.getAppPath(), 'dist')
const PRELOAD_PATH = (): string => join(app.getAppPath(), 'desktop-dist', 'preload.cjs')
const STATE_PATH = (): string => join(app.getPath('userData'), 'window-state.json')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

function loadWindowState(): void {
  try {
    const raw = readFileSync(STATE_PATH(), 'utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(raw) as Partial<WindowState>
    windowState = {
      displayMode: isDisplayMode(parsed.displayMode) ? parsed.displayMode : DEFAULT_WINDOW_STATE.displayMode,
      bounds: parsed.bounds && typeof parsed.bounds === 'object' ? parsed.bounds : { ...DEFAULT_WINDOW_STATE.bounds },
    }
  } catch {
    windowState = { ...DEFAULT_WINDOW_STATE, bounds: { ...DEFAULT_WINDOW_STATE.bounds } }
  }
}

function writeWindowState(): void {
  try {
    writeFileSync(STATE_PATH(), JSON.stringify(windowState, null, 2), 'utf8')
  } catch {
    /* 写不了窗口状态不影响游戏 */
  }
}

function saveWindowState(win: BrowserWindow | null): void {
  if (win && !win.isDestroyed() && windowState.displayMode === 'window') {
    const bounds = win.getBounds()
    windowState.bounds = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
  }
  writeWindowState()
}

function allowedNavigation(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === `${APP_SCHEME}:` && parsed.host === APP_HOST) return true
    return DEV_URL !== '' && parsed.origin === new URL(DEV_URL).origin
  } catch {
    return false
  }
}

function safeFilePath(pathname: string): string | null {
  const decoded = decodeURIComponent(pathname)
  const relative = decoded === '/' ? '/index.html' : decoded
  const target = normalize(join(DIST_DIR(), relative))
  const root = normalize(DIST_DIR()) + sep
  if (!target.startsWith(root) && target !== normalize(DIST_DIR())) return null
  return target
}

async function registerProtocol(): Promise<void> {
  await protocol.handle(APP_SCHEME, async (request) => {
    const parsed = new URL(request.url)
    if (parsed.host !== APP_HOST) return new Response('Forbidden', { status: 403 })
    const target = safeFilePath(parsed.pathname)
    if (!target || !existsSync(target)) return new Response('Not found', { status: 404 })
    try {
      const body = await readFile(target)
      return new Response(body, {
        headers: { 'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream' },
      })
    } catch {
      return new Response('Read failed', { status: 500 })
    }
  })
}

function windowOptions(mode: DisplayMode): Electron.BrowserWindowConstructorOptions {
  const common: Electron.BrowserWindowConstructorOptions = {
    show: false,
    backgroundColor: '#0b0d10',
    autoHideMenuBar: true,
    title: 'TANK WORKS',
    webPreferences: {
      preload: PRELOAD_PATH(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  }

  if (mode === 'window') {
    const { width = 1280, height = 800, x, y } = windowState.bounds
    return {
      ...common,
      width,
      height,
      ...(typeof x === 'number' ? { x } : {}),
      ...(typeof y === 'number' ? { y } : {}),
      minWidth: 1024,
      minHeight: 640,
      frame: true,
      resizable: true,
    }
  }

  if (mode === 'borderless') {
    const bounds = screen.getPrimaryDisplay().bounds
    return {
      ...common,
      frame: false,
      resizable: false,
      fullscreen: false,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    }
  }

  const bounds = screen.getPrimaryDisplay().bounds
  return {
    ...common,
    frame: false,
    fullscreen: false,
    fullscreenable: true,
    resizable: false,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  }
}

function createWindow(mode: DisplayMode, url?: string): BrowserWindow {
  const win = new BrowserWindow(windowOptions(mode))
  mainWindow = win
  win.setMenuBarVisibility(false)

  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return
    win.show()
    if (mode === 'fullscreen') win.setFullScreen(true)
  })

  win.on('close', () => {
    if (mainWindow === win) saveWindowState(win)
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, target) => {
    if (!allowedNavigation(target)) event.preventDefault()
  })

  const target =
    url ??
    (DEV_URL !== '' && !app.isPackaged
      ? DEV_URL
      : `${APP_ORIGIN}/index.html`)
  void win.loadURL(target)

  return win
}

function switchDisplayMode(next: DisplayMode): DisplayMode {
  if (next === windowState.displayMode) return next
  const previousUrl = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents.getURL() : ''
  saveWindowState(mainWindow)
  windowState.displayMode = next
  writeWindowState()

  const oldWindow = mainWindow
  mainWindow = null
  recreating = true
  setImmediate(() => {
    if (oldWindow && !oldWindow.isDestroyed()) oldWindow.destroy()
    createWindow(next, allowedNavigation(previousUrl) ? previousUrl : undefined)
    recreating = false
  })
  return next
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    loadWindowState()
    await registerProtocol()

    ipcMain.handle('desktop:get-display-mode', () => windowState.displayMode)
    ipcMain.handle('desktop:set-display-mode', (_event, mode: unknown) => {
      if (!isDisplayMode(mode)) return windowState.displayMode
      return switchDisplayMode(mode)
    })
    ipcMain.on('desktop:quit', () => app.quit())

    createWindow(windowState.displayMode)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(windowState.displayMode)
    })
  })

  app.on('before-quit', () => saveWindowState(mainWindow))
  app.on('window-all-closed', () => {
    if (recreating) return
    if (process.platform !== 'darwin') app.quit()
  })
}

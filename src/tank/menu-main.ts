/**
 * 主菜单：一局游戏的唯一入口。
 *
 * 左栏是 logo 与四个动作，右栏预留背景图位置（内容以后再定）。
 * 这里不创建 GameState —— 主循环自己会解码 / 新开，避免两套真相。
 */

import { ERAS, formatDate } from './sim/calendar'
import { decodeSave } from './sim/save'
import { ALL_SAVE_KEYS, RUN_KEYS } from '../platform/save-keys'
import { createWebStorage, type SaveStore } from '../platform/storage'
import { desktopBridge, type DesktopBridge } from '../platform/desktop'
import {
  readSettings,
  writeSettings,
  type DisplayMode,
  type GameSettings,
} from '../platform/settings'
import { nationName } from './data/nations'
import type { GameState } from './sim/state'

interface MenuStorage extends Pick<SaveStore, 'read' | 'write' | 'remove'> {}

export interface MenuOptions {
  storage?: MenuStorage
  /** 测试里替换掉 location.assign */
  navigate?: (url: string) => void
  /** 测试里注入假的桌面桥；不传则读取 preload 暴露的 window.tankWorksDesktop */
  desktop?: DesktopBridge | null
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v
    else if (k === 'text') node.textContent = v
    else node.setAttribute(k, v)
  }
  for (const c of children) node.append(c)
  return node
}

const money = (n: number): string => `¥${Math.round(n).toLocaleString('en-US')}`

function readSave(storage: MenuStorage): GameState | null {
  for (const key of ALL_SAVE_KEYS) {
    let raw: string | null = null
    try {
      raw = storage.read(key)
    } catch {
      return null
    }
    if (!raw) continue
    const state = decodeSave(raw)
    if (state) return state
  }
  return null
}

function applySettings(settings: GameSettings): void {
  document.documentElement.classList.toggle('reduce-motion', settings.reduceMotion)
}

function settingRow(title: string, desc: string, control: HTMLElement): HTMLElement {
  return el(
    'div',
    { class: 'setting-row' },
    el('div', { class: 'setting-copy' }, el('strong', { text: title }), el('p', { text: desc })),
    control,
  )
}

export function mountMenu(root: HTMLElement, opts: MenuOptions = {}): void {
  const storage = opts.storage ?? createWebStorage()
  const navigate = opts.navigate ?? ((url: string) => window.location.assign(url))
  const desktop = opts.desktop !== undefined ? opts.desktop : desktopBridge()
  const settings = readSettings(storage)
  applySettings(settings)
  const persist = (): void => writeSettings(storage, settings)
  let save = readSave(storage)
  let armed = false
  let armTimer = 0
  let clearArmed = false
  let clearTimer = 0

  const loadBtn = el(
    'button',
    { class: 'menu-btn menu-load', type: 'button' },
    el('span', { class: 'btn-index', text: '01' }),
    el('span', { class: 'btn-label', text: '加载游戏' }),
    el('span', { class: 'btn-tail', text: 'CONTINUE' }),
  ) as HTMLButtonElement

  const newLabel = el('span', { class: 'btn-label', text: '新游戏' })
  const newTail = el('span', { class: 'btn-tail', text: 'NEW GAME' })
  const newBtn = el(
    'button',
    { class: 'menu-btn menu-new', type: 'button' },
    el('span', { class: 'btn-index', text: '02' }),
    newLabel,
    newTail,
  ) as HTMLButtonElement

  const settingsBtn = el(
    'button',
    { class: 'menu-btn menu-settings', type: 'button', 'aria-expanded': 'false' },
    el('span', { class: 'btn-index', text: '03' }),
    el('span', { class: 'btn-label', text: '设置' }),
    el('span', { class: 'btn-tail', text: 'SETTINGS' }),
  ) as HTMLButtonElement

  const exitBtn = el(
    'button',
    { class: 'menu-btn menu-exit', type: 'button' },
    el('span', { class: 'btn-index', text: '04' }),
    el('span', { class: 'btn-label', text: '退出游戏' }),
    el('span', { class: 'btn-tail', text: 'EXIT' }),
  ) as HTMLButtonElement

  const newHint = el('p', { class: 'menu-hint' })
  const saveLine = el('div', { class: 'menu-save-line' })

  const settingsSaveDetail = el('p', { class: 'setting-note' })
  const clearBtn = el('button', {
    class: 'text-btn settings-clear',
    type: 'button',
    text: '清除存档',
  }) as HTMLButtonElement

  const closeSettingsBtn = el('button', {
    class: 'modal-close settings-close',
    type: 'button',
    'aria-label': '关闭设置',
    text: '×',
  }) as HTMLButtonElement

  const motionInput = el('input', {
    class: 'switch-input',
    type: 'checkbox',
    'aria-label': '减少界面动画',
  }) as HTMLInputElement
  motionInput.checked = settings.reduceMotion

  const motionSwitch = el(
    'label',
    { class: 'switch' },
    motionInput,
    el('span', { class: 'switch-track', 'aria-hidden': 'true' }),
  )

  const modeButtons = new Map<DisplayMode, HTMLButtonElement>()
  const modeNote = el('p', { class: 'setting-note mode-note' })
  const modeOptions = el('div', {
    class: 'mode-options',
    role: 'group',
    'aria-label': '显示模式',
  })

  function updateModeUI(): void {
    for (const [mode, btn] of modeButtons) {
      const active = settings.displayMode === mode
      btn.classList.toggle('active', active)
      btn.setAttribute('aria-pressed', String(active))
    }
    modeNote.textContent = desktop
      ? '切换显示模式会重开窗口，存档和设置不会丢。'
      : '浏览器里使用当前窗口；桌面版可切换全屏 / 窗口化全屏 / 窗口。'
  }

  const modeItems: Array<[DisplayMode, string, string]> = [
    ['fullscreen', '全屏', '无边框，铺满整块屏幕'],
    ['borderless', '窗口化全屏幕', '无边框，铺满桌面但保留窗口'],
    ['window', '窗口', '带系统边框，可拖动缩放'],
  ]
  for (const [mode, title, desc] of modeItems) {
    const btn = el(
      'button',
      { class: 'mode-option', type: 'button', 'data-mode': mode, 'aria-pressed': 'false' },
      el('strong', { text: title }),
      el('span', { text: desc }),
    ) as HTMLButtonElement
    btn.disabled = !desktop
    btn.addEventListener('click', () => {
      if (!desktop || settings.displayMode === mode) return
      settings.displayMode = mode
      updateModeUI()
      persist()
      modeNote.textContent = '正在切换窗口…'
      void desktop.setDisplayMode(mode).catch(() => {
        modeNote.textContent = '切换失败，已保持当前窗口。'
      })
    })
    modeButtons.set(mode, btn)
    modeOptions.append(btn)
  }
  updateModeUI()

  if (desktop) {
    void desktop
      .getDisplayMode()
      .then((mode) => {
        settings.displayMode = mode
        updateModeUI()
        persist()
      })
      .catch(() => {
        /* 桥不可用时保持本地设置 */
      })
  }

  function volumeRow(
    key: 'masterVolume' | 'musicVolume' | 'sfxVolume',
    title: string,
    desc: string,
  ): HTMLElement {
    const output = el('output', { class: 'volume-value' })
    const input = el('input', {
      class: 'volume-slider',
      type: 'range',
      min: '0',
      max: '100',
      step: '1',
      'aria-label': title,
    }) as HTMLInputElement
    input.value = String(settings[key])
    output.textContent = `${input.value}%`
    input.addEventListener('input', () => {
      settings[key] = Number(input.value)
      output.textContent = `${input.value}%`
      persist()
    })
    return settingRow(
      title,
      desc,
      el('div', { class: 'volume-control' }, input, output),
    )
  }

  const settingsOverlay = el(
    'div',
    { class: 'menu-overlay menu-settings-overlay' },
    el(
      'section',
      { class: 'settings-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': '设置' },
      el(
        'div',
        { class: 'settings-head' },
        el(
          'div',
          {},
          el('p', { class: 'kicker', text: 'SYSTEM' }),
          el('h2', { text: '设置' }),
        ),
        closeSettingsBtn,
      ),
      el(
        'div',
        { class: 'settings-body' },
        el(
          'div',
          { class: 'setting-block' },
          el(
            'div',
            { class: 'setting-copy' },
            el('strong', { text: '显示模式' }),
            el('p', { text: '决定这一局是在全屏、无边框全屏，还是普通窗口里运行。' }),
          ),
          modeOptions,
          modeNote,
        ),
        volumeRow('masterVolume', '主音量', '总音量，音乐和音效都会乘在它上面。'),
        volumeRow('musicVolume', '音乐', '背景音乐音量；音频资源接入后生效。'),
        volumeRow('sfxVolume', '音效', '按钮、开火、交付等音效音量；音频资源接入后生效。'),
        el('p', { class: 'setting-note', text: '音量设置会保存在本机；当前版本还没有接入音频文件。' }),
        settingRow('减少界面动画', '关闭按钮、面板与覆盖层的过渡效果。', motionSwitch),
        settingRow('本局存档', '存档只保存在这台电脑的 localStorage 里。', clearBtn),
        settingsSaveDetail,
      ),
      el(
        'div',
        { class: 'settings-foot' },
        el('span', { text: 'TANK WORKS v0.2 · 单机版' }),
        el('span', { text: '本地运行 · 无运行时依赖' }),
      ),
    ),
  ) as HTMLDivElement
  settingsOverlay.hidden = true

  const exitBackBtn = el('button', {
    class: 'menu-btn exit-back',
    type: 'button',
    text: '返回主菜单',
  }) as HTMLButtonElement
  const exitOverlay = el(
    'div',
    { class: 'menu-overlay menu-exit-overlay' },
    el(
      'section',
      { class: 'exit-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': '游戏已退出' },
      el('div', { class: 'brand-mark exit-mark', text: '▚', 'aria-hidden': 'true' }),
      el('p', { class: 'kicker', text: 'TANK WORKS' }),
      el('h2', { text: '游戏已退出' }),
      el('p', { class: 'exit-note', text: '这一局已经留在本地存档里。关闭这个标签页，或者回到主菜单。' }),
      exitBackBtn,
    ),
  ) as HTMLDivElement
  exitOverlay.hidden = true

  function renderSaveState(): void {
    const hasSave = save !== null
    loadBtn.disabled = !hasSave
    loadBtn.classList.toggle('menu-btn-primary', hasSave)
    newBtn.classList.toggle('menu-btn-primary', !hasSave)
    const loadTail = loadBtn.querySelector('.btn-tail')
    if (loadTail) loadTail.textContent = hasSave ? (save?.over ? 'REPORT' : 'CONTINUE') : 'NO SAVE'
    clearBtn.disabled = !hasSave
    settingsSaveDetail.textContent = save
      ? `当前存档：${formatDate(save.day)} · ${money(save.cash)}`
      : '当前没有存档。'

    saveLine.replaceChildren()
    if (!save) {
      saveLine.append(
        el('span', { class: 'dot dim' }),
        el('span', { class: 'save-line-text', text: '没有可加载的存档 · 从 1915 年开始新的一局' }),
      )
      return
    }
    const s = save
    const techs = Object.values(s.research.mastered).filter((v) => v > 0).length
    saveLine.append(
      el('span', { class: 'dot' }),
      el('span', { class: 'save-date', text: formatDate(s.day) }),
      el('span', { class: 'save-line-sep', text: '·' }),
      el('span', { class: 'save-line-text', text: `${ERAS[s.era]?.name ?? ''} · ${nationName(s.home)}` }),
      el('span', { class: 'save-line-sep', text: '·' }),
      el('span', { class: 'save-line-money', text: money(s.cash) }),
      el('span', { class: 'save-line-sep', text: '·' }),
      el('span', { class: 'save-line-text', text: `${techs} 条科技` }),
      el('span', { class: 'save-line-sep', text: '·' }),
      el('span', { class: 'save-line-text', text: `信誉 ${s.rep}` }),
    )
  }

  function disarm(): void {
    armed = false
    window.clearTimeout(armTimer)
    newBtn.classList.remove('danger')
    newLabel.textContent = '新游戏'
    newTail.textContent = 'NEW GAME'
    newHint.textContent = ''
  }

  function resetClear(): void {
    clearArmed = false
    window.clearTimeout(clearTimer)
    clearBtn.classList.remove('danger')
    clearBtn.textContent = '清除存档'
  }

  function openSettings(): void {
    settingsOverlay.hidden = false
    settingsBtn.setAttribute('aria-expanded', 'true')
    closeSettingsBtn.focus()
  }

  function closeSettings(): void {
    settingsOverlay.hidden = true
    settingsBtn.setAttribute('aria-expanded', 'false')
    resetClear()
  }

  function openExit(): void {
    exitOverlay.hidden = false
    exitBackBtn.focus()
  }

  function closeExit(): void {
    exitOverlay.hidden = true
    exitBtn.focus()
  }

  loadBtn.addEventListener('click', () => {
    if (save) navigate('./game.html')
  })

  newBtn.addEventListener('click', () => {
    if (save && !armed) {
      armed = true
      newBtn.classList.add('danger')
      newLabel.textContent = '再点一次：覆盖存档'
      newTail.textContent = 'CONFIRM'
      newHint.textContent = '下一步选国家；点「开始游戏」后才会覆盖这一局。'
      armTimer = window.setTimeout(disarm, 5000)
      return
    }
    // 真正的清档放在国家选择页的「开始游戏」：玩家中途反悔还能回主菜单读档。
    navigate('./nations.html')
  })

  settingsBtn.addEventListener('click', openSettings)
  closeSettingsBtn.addEventListener('click', closeSettings)
  settingsOverlay.addEventListener('click', (event) => {
    if (event.target === settingsOverlay) closeSettings()
  })

  motionInput.addEventListener('change', () => {
    settings.reduceMotion = motionInput.checked
    persist()
    applySettings(settings)
  })

  clearBtn.addEventListener('click', () => {
    if (!save) return
    if (!clearArmed) {
      clearArmed = true
      clearBtn.classList.add('danger')
      clearBtn.textContent = '确认清除'
      clearTimer = window.setTimeout(resetClear, 4000)
      return
    }
    for (const key of RUN_KEYS) {
      try {
        storage.remove(key)
      } catch {
        /* 同新游戏：清不掉也不让菜单崩 */
      }
    }
    save = null
    renderSaveState()
    resetClear()
    closeSettings()
    newHint.textContent = '存档已清除，可以从 1915 年重新开始。'
    newBtn.focus()
  })

  exitBtn.addEventListener('click', () => {
    if (desktop) {
      desktop.quit()
      return
    }
    openExit()
  })
  exitBackBtn.addEventListener('click', closeExit)
  exitOverlay.addEventListener('click', (event) => {
    if (event.target === exitOverlay) closeExit()
  })

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    if (!settingsOverlay.hidden) closeSettings()
    else if (!exitOverlay.hidden) closeExit()
  })

  const brand = el(
    'div',
    { class: 'menu-brand', 'aria-label': 'TANK WORKS 坦克厂' },
    el('div', { class: 'brand-mark', text: '▚', 'aria-hidden': 'true' }),
    el(
      'div',
      { class: 'brand-copy' },
      el('p', { class: 'brand-kicker', text: '装甲车辆设计与制造' }),
      el('h1', { text: 'TANK WORKS' }),
      el('p', { class: 'brand-sub', text: '坦克厂 · 1915—1991' }),
    ),
  )

  const stage = el(
    'div',
    { class: 'menu-stage' },
    el(
      'section',
      { class: 'menu-panel' },
      brand,
      el('div', { class: 'menu-nav' }, loadBtn, newBtn, settingsBtn, exitBtn),
      newHint,
      saveLine,
      el(
        'div',
        { class: 'menu-meta' },
        el('span', { text: 'v0.2 · 单机版' }),
        el('span', { text: '本地存档 / localStorage' }),
      ),
    ),
    el('div', { class: 'menu-art', 'aria-hidden': 'true' }),
  )

  root.replaceChildren(el('div', { class: 'menu' }, stage, settingsOverlay, exitOverlay))
  renderSaveState()
}

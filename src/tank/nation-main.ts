/**
 * 新游戏的第一步：选国家。
 *
 * 这里只负责「选谁」和导航；真正的开局在 game.html 里由 ?home=xxx 创建。
 * 清档放在「开始游戏」这一刻 —— 玩家看了介绍反悔，还能回主菜单继续旧局。
 */

import { ALL_SAVE_KEYS, RUN_KEYS } from '../platform/save-keys'
import { createWebStorage, type SaveStore } from '../platform/storage'
import { nationName } from './data/nations'
import {
  NATION_PROFILES,
  PLAYABLE_NATION_IDS,
  flagSvg,
  type PlayableNationId,
} from './data/nation-profiles'

interface NationStorage extends Pick<SaveStore, 'read' | 'remove'> {}

export interface NationOptions {
  storage?: NationStorage
  /** 测试里替换掉 location.assign */
  navigate?: (url: string) => void
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

function hasSave(storage: NationStorage): boolean {
  for (const key of ALL_SAVE_KEYS) {
    try {
      if (storage.read(key) !== null) return true
    } catch {
      return false
    }
  }
  return false
}

export function mountNationSelect(root: HTMLElement, opts: NationOptions = {}): void {
  const storage = opts.storage ?? createWebStorage()
  const navigate = opts.navigate ?? ((url: string) => window.location.assign(url))

  let selected: PlayableNationId | null = null
  let starting = false

  const cards: Array<{ id: PlayableNationId; node: HTMLButtonElement; mark: HTMLElement }> = []
  const grid = el('main', { class: 'nation-grid', 'aria-label': '可选国家' })

  for (const [index, profile] of NATION_PROFILES.entries()) {
    const flag = el('span', { class: 'nation-flag', 'aria-hidden': 'true' })
    flag.innerHTML = flagSvg(profile.id)
    const mark = el('span', { class: 'nation-mark', text: '选择' })
    const card = el(
      'button',
      {
        class: 'nation-card',
        type: 'button',
        'data-id': profile.id,
        'aria-pressed': 'false',
        'aria-label': `${nationName(profile.id)}，${profile.en}`,
      },
      el('span', { class: 'nation-index', text: String(index + 1).padStart(2, '0') }),
      flag,
      el(
        'span',
        { class: 'nation-body' },
        el(
          'span',
          { class: 'nation-title' },
          el('span', { class: 'nation-name', text: nationName(profile.id) }),
          el('span', { class: 'nation-en', text: profile.en }),
        ),
        el('span', { class: 'nation-years', text: `${profile.years} · ${profile.tagline}` }),
        el('span', { class: 'nation-history', text: profile.history }),
        el('span', { class: 'nation-tanks', text: profile.tanks }),
      ),
      mark,
    ) as HTMLButtonElement
    card.addEventListener('click', () => select(profile.id))
    cards.push({ id: profile.id, node: card, mark })
    grid.append(card)
  }

  const choiceDot = el('span', { class: 'dot dim' })
  const choiceText = el('span', { class: 'choice-text', text: '先选一个国家' })
  const choice = el('div', { class: 'nation-choice', 'aria-live': 'polite' }, choiceDot, choiceText)

  const startMeta = el('span', { class: 'start-meta', text: 'SELECT A NATION' })
  const startBtn = el(
    'button',
    { class: 'nation-start', type: 'button' },
    el('span', { class: 'start-label', text: '开始游戏' }),
    startMeta,
    el('span', { class: 'start-arrow', text: '→', 'aria-hidden': 'true' }),
  ) as HTMLButtonElement
  startBtn.disabled = true

  const note = el('p', {
    class: 'nation-note',
    text: hasSave(storage)
      ? '开始新局会覆盖当前存档、科技快照与设计草稿。'
      : '新局从 1915 年 1 月 1 日开始。',
  })

  function select(id: PlayableNationId): void {
    selected = id
    for (const card of cards) {
      const on = card.id === id
      card.node.classList.toggle('selected', on)
      card.node.setAttribute('aria-pressed', on ? 'true' : 'false')
      card.mark.textContent = on ? '已选择' : '选择'
    }
    const profile = NATION_PROFILES.find((p) => p.id === id)
    if (profile) {
      choiceDot.className = 'dot'
      choiceText.textContent = `${nationName(id)} · ${profile.en}`
      choice.classList.add('has-choice')
    }
    startBtn.disabled = false
    startMeta.textContent = 'START 1915'
  }

  startBtn.addEventListener('click', () => {
    if (!selected || starting) return
    starting = true
    // 直接打开 nations.html 时也保证旧局不会混进新局。
    for (const key of RUN_KEYS) {
      try {
        storage.remove(key)
      } catch {
        /* 清不掉也继续；?day=0 会强制新局 */
      }
    }
    navigate(`./game.html?day=0&home=${selected}`)
  })

  const back = el('a', { class: 'nation-back', href: './' }, '← 返回主菜单')
  const top = el(
    'div',
    { class: 'nation-top' },
    back,
    el(
      'div',
      { class: 'nation-counter' },
      el('span', { text: 'NEW GAME' }),
      el('span', { class: 'counter-sep', text: '/' }),
      el('span', { text: '1915—1991' }),
    ),
  )

  const head = el(
    'header',
    { class: 'nation-head' },
    el(
      'div',
      { class: 'nation-heading' },
      el('p', { class: 'kicker', text: 'CHOOSE YOUR NATION' }),
      el('h1', { text: '选择你的国家' }),
      el('p', {
        class: 'nation-lede',
        text: '不同国家的坦克工业起点、客户阵营与技术路线不同。先定国家，再开始这间厂。',
      }),
    ),
    el(
      'div',
      { class: 'nation-stat', 'aria-hidden': 'true' },
      el('strong', { text: String(PLAYABLE_NATION_IDS.length) }),
      el('span', { text: '个可选国家' }),
      el('small', { text: '每国一张工业底牌' }),
    ),
  )

  const foot = el(
    'footer',
    { class: 'nation-foot' },
    el('div', { class: 'nation-footer-left' }, choice, note),
    el('div', { class: 'nation-footer-right' }, startBtn),
  )

  root.replaceChildren(
    el('div', { class: 'nation-screen' }, el('div', { class: 'nation-shell' }, top, head, grid, foot)),
  )
}

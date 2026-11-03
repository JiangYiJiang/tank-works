/**
 * 主菜单：一局游戏的入口，也是三个工具页的入口。
 *
 * 这里只做三件事：
 *   1. 读存档，显示「继续哪一局」；
 *   2. 新游戏：清掉这一局的键，带 `?day=0` 进主循环；
 *   3. 把设计局 / 研发局 / 制造局摆出来。
 *
 * 不在这里创建 GameState —— 主循环自己会解码 / 新开，避免两套真相。
 */

import { ERAS, formatDate } from './sim/calendar'
import { decodeSave } from './sim/save'
import { ALL_SAVE_KEYS, RUN_KEYS } from '../platform/save-keys'
import { createWebStorage, type SaveStore } from '../platform/storage'
import { nationName } from './data/nations'
import type { GameState } from './sim/state'

interface MenuStorage extends Pick<SaveStore, 'read' | 'remove'> {}

export interface MenuOptions {
  storage?: MenuStorage
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

function moduleCard(
  index: string,
  title: string,
  desc: string,
  href: string | undefined,
  note: string,
): HTMLElement {
  const children = [
    el('div', { class: 'module-top' }, el('span', { class: 'module-index', text: index }), el('span', { class: 'module-arrow', text: '↗' })),
    el('h3', { text: title }),
    el('p', { text: desc }),
    el('span', { class: 'module-note', text: note }),
  ]
  return href
    ? el('a', { class: 'module-card', href }, ...children)
    : el('div', { class: 'module-card' }, ...children)
}

export function mountMenu(root: HTMLElement, opts: MenuOptions = {}): void {
  const storage = opts.storage ?? createWebStorage()
  const navigate = opts.navigate ?? ((url: string) => window.location.assign(url))
  const save = readSave(storage)
  let armed = false
  let armTimer = 0

  const continueBtn = el('button', {
    class: 'menu-btn menu-btn-primary menu-continue',
    type: 'button',
    text: save ? (save.over ? '查看关厂报告' : '继续游戏') : '还没有存档',
  }) as HTMLButtonElement
  continueBtn.disabled = save === null
  continueBtn.addEventListener('click', () => {
    if (save) navigate('./game.html')
  })

  const newBtn = el('button', {
    class: 'menu-btn menu-new',
    type: 'button',
    text: save ? '新游戏' : '开始新游戏',
  }) as HTMLButtonElement
  const newHint = el('p', { class: 'menu-hint' })

  function disarm(): void {
    armed = false
    window.clearTimeout(armTimer)
    newBtn.classList.remove('danger')
    newBtn.textContent = save ? '新游戏' : '开始新游戏'
    newHint.textContent = ''
  }

  newBtn.addEventListener('click', () => {
    if (save && !armed) {
      armed = true
      newBtn.classList.add('danger')
      newBtn.textContent = '再点一次：覆盖存档并重开'
      newHint.textContent = '这会清掉当前这一局的存档、科技快照和设计交接。'
      armTimer = window.setTimeout(disarm, 5000)
      return
    }
    for (const key of RUN_KEYS) {
      try {
        storage.remove(key)
      } catch {
        /* 清不掉也继续，主循环带 ?day=0 会强制新局 */
      }
    }
    navigate('./game.html?day=0')
  })

  const saveCard = el('section', { class: 'save-card' })
  if (save) {
    const s = save
    const techs = Object.values(s.research.mastered).filter((v) => v > 0).length
    const status = s.over ? '已结束' : s.contract ? `订单：${s.contract.nation} ${s.contract.qty} 台` : '空档期 · 可接单'
    saveCard.append(
      el('div', { class: 'save-kicker' }, el('span', { class: 'dot' }), '当前存档'),
      el('div', { class: 'save-date', text: formatDate(s.day) }),
      el('div', { class: 'save-era', text: `${ERAS[s.era]?.name ?? ''} · ${nationName(s.home)}` }),
      el(
        'div',
        { class: 'save-grid' },
        el('div', { class: 'save-stat' }, el('span', { text: '现金' }), el('strong', { text: money(s.cash) })),
        el('div', { class: 'save-stat' }, el('span', { text: '信誉' }), el('strong', { text: `${s.rep} / 100` })),
        el('div', { class: 'save-stat' }, el('span', { text: '产品' }), el('strong', { text: s.design.name })),
        el('div', { class: 'save-stat' }, el('span', { text: '科技' }), el('strong', { text: `${techs} 条` })),
      ),
      el('div', { class: 'save-status', text: status }),
    )
  } else {
    saveCard.append(
      el('div', { class: 'save-kicker' }, el('span', { class: 'dot dim' }), '还没有存档'),
      el('div', { class: 'save-empty-title', text: '从 1915 年开始' }),
      el('p', {
        class: 'save-empty-text',
        text: '开局选国家、接第一份标；研发、设计、产能扩张都在主循环里。',
      }),
    )
  }

  const header = el(
    'header',
    { class: 'menu-top' },
    el(
      'div',
      { class: 'brand' },
      el('span', { class: 'brand-mark', text: '▚' }),
      el(
        'div',
        {},
        el('h1', { text: 'TANK WORKS' }),
        el('p', { text: '坦克厂 · 1915—1991' }),
      ),
    ),
    el('span', { class: 'menu-version', text: 'v0.2 · 单机版' }),
  )

  const hero = el(
    'main',
    { class: 'menu-hero' },
    el(
      'section',
      { class: 'hero-copy' },
      el('p', { class: 'kicker', text: '装甲车辆设计与制造' }),
      el('h2', {}, '从一间铁皮棚，', el('br'), '造到主战坦克。'),
      el('p', {
        class: 'lede',
        text: '选国家、研发技术、设计车辆、抢标交付。七十七年，一条产线，一本账。',
      }),
      el('div', { class: 'menu-actions' }, continueBtn, newBtn),
      newHint,
    ),
    saveCard,
  )

  const strip = el(
    'section',
    { class: 'menu-strip' },
    el('div', { class: 'strip-item' }, el('strong', { text: '77' }), el('span', { text: '年经营跨度' })),
    el('div', { class: 'strip-item' }, el('strong', { text: '159' }), el('span', { text: '条科技' })),
    el('div', { class: 'strip-item' }, el('strong', { text: '19' }), el('span', { text: '辆历史车校准' })),
    el('div', { class: 'strip-item' }, el('strong', { text: '3' }), el('span', { text: '条产线上限' })),
  )

  const modules = el(
    'section',
    { class: 'modules' },
    el('div', { class: 'modules-head' }, el('span', { text: '游戏内四个局' }), el('span', { class: 'line' })),
    el(
      'div',
      { class: 'module-grid' },
      moduleCard('01', '主循环', '接单、备料、排产、交付、回款；研发、贷款、关厂报告。', './game.html', '进入这一局'),
      moduleCard('02', '设计局', '六个槽位、四维评分、弹道三轴、成本与缺陷。', undefined, '游戏内 · 产品面板「设计本厂车」'),
      moduleCard('03', '研发局', '159 条科技树，超前更贵、落后打折；槽位与速度升级。', undefined, '游戏内 · 研发面板'),
      moduleCard('04', '制造局', '多线、仓库、学习曲线、人力与班次；游说局在同一局里。', undefined, '游戏内 · 产线 / 订单面板'),
    ),
  )

  const footer = el(
    'footer',
    { class: 'menu-foot' },
    el(
      'div',
      { class: 'foot-links' },
      el('a', { href: 'README.md', target: '_blank', rel: 'noreferrer' }, 'README'),
      el('a', { href: 'docs/DESIGN.md', target: '_blank', rel: 'noreferrer' }, '设计文档'),
      el('a', { href: 'docs/STATUS.md', target: '_blank', rel: 'noreferrer' }, '进度 / 待办'),
      el('a', { href: './tank.html', target: '_blank', rel: 'noreferrer' }, '独立设计页'),
      el('a', { href: './research.html', target: '_blank', rel: 'noreferrer' }, '研发规划页'),
      el('a', { href: 'https://github.com/JiangYiJiang/tank-works', target: '_blank', rel: 'noreferrer' }, 'GitHub'),
    ),
    el('span', { class: 'foot-note', text: '本地运行 · 无运行时依赖 · 存档在本机 localStorage' }),
  )

  root.replaceChildren(el('div', { class: 'menu' }, header, hero, strip, modules, footer))
  if (save) continueBtn.focus()
}

/**
 * 游戏外壳：时间在走。
 *
 * 这一步只有一件事是真的 —— 时钟。账本、订单、产线都还没接，
 * 但时间轴本身必须是真的：能暂停、能变速、能跳过、能读档，而且不会越跑越卡。
 *
 * 两条渲染纪律：
 *   1. 每帧只改 textContent，绝不重建 DOM（30 天/秒时一秒钟要刷十几次）
 *   2. 日志只在长度变了时重建
 */

import {
  ERAS,
  NEWS,
  TOTAL_DAYS,
  eraIndexAt,
  formatDate,
  formatMonth,
  threatAt,
} from '../sim/calendar'
import { advanceDays, skipToNextEvent } from '../sim/advance'
import { createGame, daysLeft, progress, type GameState, type LogEntry } from '../sim/state'
import { decodeSave, encodeSave } from '../sim/save'
import type { SaveStore } from '../../platform/storage'

const SAVE_KEY = 'tank-works.save.v2'
const SPEEDS = [1, 3, 10, 30] as const
const RENDER_INTERVAL_MS = 70
const FEED_LIMIT = 60

type PauseReason = 'manual' | 'event' | 'ended'

export interface GameOptions {
  storage: SaveStore
  seed?: () => number
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
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

const KIND_CLASS: Record<LogEntry['k'], string> = {
  era: 'k-era',
  news: 'k-news',
  build: 'k-build',
  order: 'k-order',
  money: 'k-money',
  tech: 'k-tech',
  note: 'k-note',
}

export function mountGame(root: HTMLElement, opts: GameOptions): void {
  const storage = opts.storage
  const seed = opts.seed ?? ((): number => Math.floor(Math.random() * 1e9))

  // ?day=623 直接从某天开局。只给调试和截图用，不写进存档。
  // 注意 get() 在没有参数时返回 null，而 Number(null) === 0 —— 不判 null 的话
  // 每一局都会被悄悄重置到 1915-01-01，存档等于没写。
  const dayParam = new URLSearchParams(location.search).get('day')
  const forced =
    dayParam === null ? null : Math.max(0, Math.min(TOTAL_DAYS - 1, Math.floor(Number(dayParam)) || 0))
  let state: GameState = (forced === null ? decodeSave(storage.read(SAVE_KEY)) : null) ?? createGame(seed())
  if (forced !== null && forced > 0) advanceDays(state, forced)
  let speed = 3
  let paused = false
  let pauseReason: PauseReason = 'manual'
  let acc = 0
  let dirty = true
  let lastFrame = performance.now()
  /** 上一次 step() 的时刻；两个驱动共用它算 dt */
  let last = lastFrame
  let lastRender = 0
  let renderedLogCount = -1
  let flashUntil = 0
  let savedAtDay = state.day

  // ── 静态骨架（只建一次） ───────────────────────────────────

  const dateText = el('span', { class: 'date' })
  const eraText = el('span', { class: 'era' })
  const clockMeta = el('span', { class: 'clock-meta' })

  const speedButtons = SPEEDS.map((s) =>
    el('button', { class: 'chip', 'data-speed': String(s), text: `${s}×` }),
  )
  const pauseBtn = el('button', { class: 'chip chip-pause', text: '⏸' })
  const jumpBtn = el('button', { class: 'chip chip-jump', text: '跳到下一件事 →' })

  const topbar = el(
    'header',
    { class: 'topbar' },
    el('div', { class: 'clock' }, dateText, eraText),
    el('div', { class: 'clock-right' }, clockMeta),
    el('div', { class: 'speed' }, pauseBtn, ...speedButtons, jumpBtn),
  )

  // 时间轴：八个时代按真实天数分宽度，游标是一条 1px 的线
  const timeline = el('div', { class: 'timeline' })
  const cursor = el('div', { class: 'cursor' })
  for (const e of ERAS) {
    const seg = el('div', { class: 'seg', title: `${e.name}（${formatDate(e.from)} – ${formatDate(e.to)}）` })
    seg.style.flexGrow = String(Math.max(1, e.to - e.from + 1))
    seg.append(el('span', { class: 'seg-label', text: e.short }))
    timeline.append(seg)
  }
  timeline.append(cursor)

  const cashValue = el('span', { class: 'kv-num' })
  const threatBar = el('div', { class: 'bar-fill' })
  const threatWrap = el('div', { class: 'bar' }, threatBar)
  const threatWord = el('span', { class: 'threat-word' })
  const leftValue = el('span', { class: 'kv-num' })
  const eraBlurb = el('p', { class: 'blurb' })

  const sidebar = el(
    'aside',
    { class: 'side' },
    el(
      'section',
      { class: 'panel' },
      el('h2', { text: '厂子' }),
      el('div', { class: 'kv' }, el('span', { class: 'kv-key', text: '现金' }), cashValue),
      el('div', { class: 'kv' }, el('span', { class: 'kv-key', text: '剩余' }), leftValue),
      el('p', { class: 'hintline', text: '现金流、产线、订单都还没接上 —— 这一步只做时间。' }),
    ),
    el(
      'section',
      { class: 'panel' },
      el('h2', { text: '局势' }),
      el('div', { class: 'bar-row' }, threatWrap, threatWord),
      eraBlurb,
    ),
  )

  const feedList = el('ol', { class: 'feed-list' })
  const feed = el('section', { class: 'feed' }, el('h2', { text: '日志' }), feedList)

  const flash = el('div', { class: 'flash' })
  const banner = el('div', { class: 'banner' })
  const pausedTag = el('div', { class: 'paused-tag', text: '已暂停' })

  root.append(el('div', { class: 'game' }, topbar, timeline, banner, el('main', { class: 'body' }, sidebar, feed), flash, pausedTag))

  // ── 交互 ─────────────────────────────────────────────────

  function setSpeed(s: number): void {
    speed = s
    paused = false
    pauseReason = 'manual'
    acc = 0
    dirty = true
    render()
  }

  function togglePause(): void {
    if (state.over) return
    paused = !paused
    pauseReason = 'manual'
    acc = 0
    dirty = true
    render()
  }

  function doJump(): void {
    if (state.over) return
    paused = true
    const before = state.day
    const r = skipToNextEvent(state)
    if (r.days === 0 && before === state.day) {
      // 今天已经没有可跳的事件了，那就直接跑到底
      advanceDays(state, TOTAL_DAYS)
    }
    pauseReason = 'event'
    acc = 0
    dirty = true
    render()
    save()
  }

  pauseBtn.addEventListener('click', togglePause)
  jumpBtn.addEventListener('click', doJump)
  for (const b of speedButtons) {
    b.addEventListener('click', () => setSpeed(Number(b.dataset.speed)))
  }

  window.addEventListener('keydown', (ev) => {
    const e = ev as KeyboardEvent
    if (e.code === 'Space') {
      e.preventDefault()
      togglePause()
    } else if (e.key === '1') setSpeed(1)
    else if (e.key === '2') setSpeed(3)
    else if (e.key === '3') setSpeed(10)
    else if (e.key === '4') setSpeed(30)
    else if (e.key === 'ArrowRight') doJump()
  })
  ;(root as unknown as HTMLElement & { tabIndex: number }).tabIndex = 0

  // ── 存档 ─────────────────────────────────────────────────

  function save(): void {
    savedAtDay = state.day
    try {
      storage.write(SAVE_KEY, encodeSave(state))
    } catch {
      /* 存档失败不该让游戏崩 */
    }
  }

  window.addEventListener('beforeunload', save)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save()
  })

  // ── 渲染 ─────────────────────────────────────────────────

  function render(): void {
    const dateStr = formatDate(state.day)
    dateText.textContent = dateStr
    const era = ERAS[state.era]!
    eraText.textContent = state.over ? '结束' : era.name
    eraBlurb.textContent = era.blurb

    cashValue.textContent = `¥${Math.round(state.cash).toLocaleString('en-US')}`
    leftValue.textContent = state.over ? '—' : `${daysLeft(state).toLocaleString('en-US')} 天`

    const threat = threatAt(state.day)
    threatBar.style.width = `${(threat * 100).toFixed(0)}%`
    threatBar.classList.toggle('hot', threat > 0.7)
    threatWord.textContent = threat > 0.85 ? '全面战争' : threat > 0.55 ? '局部战争' : threat > 0.3 ? '紧张' : '和平'

    cursor.style.left = `${(progress(state) * 100).toFixed(3)}%`

    clockMeta.textContent = `第 ${(state.day + 1).toLocaleString('en-US')} / ${TOTAL_DAYS.toLocaleString('en-US')} 天 · ${formatMonth(state.day)}`

    pauseBtn.classList.toggle('on', paused)
    for (const b of speedButtons) b.classList.toggle('on', !paused && Number(b.dataset.speed) === speed)
    pausedTag.textContent = pauseReason === 'event' ? '自动暂停 · 世界变了' : '已暂停'
    pausedTag.classList.toggle('show', paused && !state.over)

    if (state.log.length !== renderedLogCount) {
      renderedLogCount = state.log.length
      feedList.replaceChildren()
      const items = state.log.slice(-FEED_LIMIT).reverse()
      for (const e of items) {
        feedList.append(
          el(
            'li',
            { class: `feed-item ${KIND_CLASS[e.k]}` },
            el('span', { class: 'feed-day', text: formatMonth(e.d) }),
            el('span', { class: 'feed-text', text: e.t }),
          ),
        )
      }
    }

    if (state.over) {
      banner.textContent = '这一局结束了。刷新页面可以开新的一局。'
      banner.classList.add('show')
    }
  }

  function showFlash(entry: LogEntry): void {
    flash.replaceChildren(
      el('span', { class: 'flash-day', text: formatDate(entry.d) }),
      el('span', { class: 'flash-text', text: entry.t }),
    )
    flash.classList.add('show')
    flashUntil = performance.now() + 2600
  }

  // ── 主循环 ───────────────────────────────────────────────

  /**
   * 走一步。**只由两个驱动调用**，而且它们互斥：
   *   - rAF：正常浏览器，跟着显示器刷新走
   *   - 兜底定时器：无头浏览器、某些 WebView 里 rAF 根本不触发
   *
   * 时间差用 performance.now() 真实测量，所以掉帧只会让这一跳跨更多天，不会让游戏变慢。
   */
  function step(): void {
    const now = performance.now()
    let dt = (now - last) / 1000
    last = now
    if (!(dt > 0)) dt = 0
    if (dt > 0.25) dt = 0.25

    if (!paused && !state.over) {
      acc += dt * speed
      if (acc >= 1) {
        const days = Math.floor(acc)
        acc -= days
        const sizeBefore = state.log.length
        const r = advanceDays(state, days)

        if (r.ended) {
          paused = true
          pauseReason = 'ended'
        } else if (r.eraChanged || r.newsCount > 0) {
          paused = true
          pauseReason = 'event'
          const newest = state.log[state.log.length - 1]
          if (newest && state.log.length > sizeBefore) showFlash(newest)
        }
        acc = 0
        dirty = true
      }
      if (state.day - savedAtDay >= 400) save()
    }

    if (dirty && now - lastRender >= RENDER_INTERVAL_MS) {
      render()
      dirty = false
      lastRender = now
    }

    if (flashUntil && now > flashUntil) {
      flash.classList.remove('show')
      flashUntil = 0
    }
  }

  function rafLoop(): void {
    step()
    requestAnimationFrame(rafLoop)
  }

  render()
  requestAnimationFrame(rafLoop)

  /*
   * 切到后台就冻结时间。
   * 不然出去玩一天回来，厂子已经过完冷战了 —— 这类游戏最不能接受的 bug。
   */
  setInterval(() => {
    if (document.visibilityState === 'hidden') {
      last = performance.now()
      return
    }
    if (performance.now() - last > 200) step()
  }, 120)
}

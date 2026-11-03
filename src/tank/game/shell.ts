/**
 * 游戏外壳：时间在走，厂子也在走。
 *
 * v3 起，这里第一次有了闭环：
 *   接单 → 产线排产（工时/料/工资）→ 交付 → 回款 → 下一单
 *
 * 两条渲染纪律没变：
 *   1. 每帧只改 textContent；只有「结构真的变了」才重建列表
 *   2. 日志只在长度变了时重建
 */

import { ERAS, TOTAL_DAYS, dateOf, formatDate, formatMonth, threatAt } from '../sim/calendar'
import { advanceDays, skipToNextEvent } from '../sim/advance'
import { createGame, daysLeft, progress, pushLog, type GameState, type LogEntry } from '../sim/state'
import { decodeSave, encodeSave } from '../sim/save'
import { PRODUCT_LEAD_YEARS, acceptOffer, bidPrice, needText, productCandidates, productMeets, refreshOffers, type BidMode } from '../sim/contract'
import {
  availableTechs,
  buyResearchUpgrade,
  designCheck,
  effortForTier,
  monthlyUpkeep,
  slotsOf,
  speedOf,
  startResearch,
  techMods,
  techSnapshot,
} from '../sim/research'
import { SLOT_UPGRADES, SPEED_UPGRADES, TECH_BY_ID } from '../data/tech'
import { NATIONS } from '../data/nations'
import { buildTank } from '../model/build'
import { designYear } from '../model/era'
import { daysPerUnit, inTransitKg, stockOf } from '../sim/factory'
import { LOAN_STEP, availableCredit, borrow, creditLimit, repay } from '../sim/loan'
import {
  LINE_COST,
  MAX_LINES,
  SHIFT_COST,
  STAFF_COST,
  STAFF_MAX,
  STAFF_STEP,
  addProductionLine,
  upgradeLine,
} from '../sim/lines'
import { materialFactorText } from '../sim/market'
import { readAdopted } from '../../platform/design-handoff'
import { writeTech } from '../../platform/tech-handoff'
import type { SaveStore } from '../../platform/storage'

const SAVE_KEY = 'tank-works.save.v7'
/** 旧版本存档：v6 有国家，v5 有信誉/贿赂，v4 有研发，v3 产品/订单，v2 日期/现金。 */
const LEGACY_SAVE_KEYS = [
  'tank-works.save.v6',
  'tank-works.save.v5',
  'tank-works.save.v4',
  'tank-works.save.v3',
  'tank-works.save.v2',
] as const
const SPEEDS = [1, 3, 10, 30] as const
const RENDER_INTERVAL_MS = 70
const FEED_LIMIT = 60

type PauseReason = 'manual' | 'event' | 'contract' | 'research' | 'cash' | 'deadline' | 'ended'

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

const money = (n: number): string => `¥${Math.round(n).toLocaleString('en-US')}`
const num = (n: number): string => Math.round(n).toLocaleString('en-US')

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
  const saved =
    storage.read(SAVE_KEY) ??
    LEGACY_SAVE_KEYS.map((k) => storage.read(k)).find((v): v is string => typeof v === 'string') ??
    null
  let state: GameState = (forced === null ? decodeSave(saved) : null) ?? createGame(seed())
  if (forced !== null && forced > 0) advanceDays(state, forced)
  // 老存档 / 新开局都可能没有标；没有在手订单就按当前时代补一批。
  refreshOffers(state)

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
  let offerSig = ''
  let candidateSig = ''
  let techSig = ''
  let lineSig = ''
  let cashWarned = false
  let deadlineWarned = false
  /** 产品下拉里是否挂着「本厂设计」那个选项 */
  let hasCustom = false
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

  const cashValue = el('span', { class: 'kv-num cash-value' })
  const repValue = el('span', { class: 'kv-num' })
  const homeSelect = el('select', { class: 'sel home-select' })
  for (const n of NATIONS) homeSelect.append(el('option', { value: n.id, text: n.name }))
  homeSelect.value = state.home
  const debtValue = el('span', { class: 'kv-num debt-value' })
  const borrowBtn = el('button', { class: 'chip chip-bank', type: 'button', text: '借 50 万' })
  const repayBtn = el('button', { class: 'chip chip-bank', type: 'button', text: '还 50 万' })
  const bankRow = el('div', { class: 'bank-row' }, borrowBtn, repayBtn)

  const materialNote = el('div', { class: 'material-note' })
  const linesWrap = el('div', { class: 'lines' })
  const addLineBtn = el('button', { class: 'chip chip-addline', type: 'button', text: `加一条产线 ${money(LINE_COST)}` })
  const linesPanel = el(
    'section',
    { class: 'panel' },
    el('h2', { text: '产线' }),
    materialNote,
    linesWrap,
    addLineBtn,
  )
  const leftValue = el('span', { class: 'kv-num' })
  const productSelect = el('select', { class: 'sel product-select' })
  const productStats = el('div', { class: 'mini-grid' })
  const productHint = el('p', { class: 'hintline' })
  const adoptBtn = el('button', { class: 'chip chip-adopt', type: 'button' }, '导入设计局的车')
  const adoptNote = el('span', { class: 'adopt-note' })
  const adoptRow = el('div', { class: 'adopt-row' }, adoptBtn, adoptNote)
  adoptBtn.addEventListener('click', importAdopted)

  const researchInfo = el('div', { class: 'research-info' })
  const projectsWrap = el('div', { class: 'projects' })
  const techSelect = el('select', { class: 'sel tech-select' })
  const techStart = el('button', { class: 'chip chip-tech', type: 'button' }, '开工')
  const techRow = el('div', { class: 'tech-row' }, techSelect, techStart)
  const techHint = el('div', { class: 'research-info tech-hint' })
  const upgradeWrap = el('div', { class: 'upgrades' })
  const researchPanel = el(
    'section',
    { class: 'panel' },
    el('h2', { text: '研发' }),
    researchInfo,
    projectsWrap,
    techRow,
    techHint,
    upgradeWrap,
  )

  const offersWrap = el('div', { class: 'offers' })
  const contractWrap = el('div', { class: 'contract' })

  const threatBar = el('div', { class: 'bar-fill' })
  const threatWrap = el('div', { class: 'bar' }, threatBar)
  const threatWord = el('span', { class: 'threat-word' })
  const eraBlurb = el('p', { class: 'blurb' })

  const sidebar = el(
    'aside',
    { class: 'side' },
    el(
      'section',
      { class: 'panel' },
      el('h2', { text: '厂子' }),
      el('div', { class: 'kv' }, el('span', { class: 'kv-key', text: '现金' }), cashValue),
      el('div', { class: 'kv' }, el('span', { class: 'kv-key', text: '信誉' }), repValue),
      el('div', { class: 'kv' }, el('span', { class: 'kv-key', text: '国家' }), homeSelect),
      el('div', { class: 'kv' }, el('span', { class: 'kv-key', text: '债务' }), debtValue),
      bankRow,
      el('div', { class: 'kv' }, el('span', { class: 'kv-key', text: '剩余' }), leftValue),
      el('div', { class: 'kv' }, el('span', { class: 'kv-key', text: '产品' }), productSelect),
      productStats,
      productHint,
      adoptRow,
    ),
    el('section', { class: 'panel' }, el('h2', { text: '订单' }), offersWrap, contractWrap),
    linesPanel,
    researchPanel,
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
  const endTitle = el('h2', { class: 'end-title' })
  const endBody = el('div', { class: 'end-body' })
  const endOverlay = el('div', { class: 'end-overlay' }, el('div', { class: 'end-card' }, endTitle, endBody))

  root.append(
    el(
      'div',
      { class: 'game' },
      topbar,
      timeline,
      banner,
      el('main', { class: 'body' }, sidebar, feed),
      flash,
      pausedTag,
      endOverlay,
    ),
  )

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
    pauseReason = state.over ? 'ended' : r.contractDone ? 'contract' : r.researchDone ? 'research' : 'event'
    acc = 0
    offerSig = ''
    dirty = true
    render()
    save()
  }

  function handleAccept(offerId: string, mode: BidMode = 'normal'): void {
    const r = acceptOffer(state, offerId, mode)
    if (!r.ok) {
      showFlash({ d: state.day, k: 'note', t: r.msg })
      return
    }
    paused = false
    pauseReason = 'manual'
    acc = 0
    cashWarned = false
    deadlineWarned = false
    offerSig = ''
    dirty = true
    render()
    save()
  }

  function importAdopted(): void {
    if (state.contract) {
      showFlash({ d: state.day, k: 'note', t: '订单执行中，交完再换产品。' })
      return
    }
    const a = readAdopted()
    if (!a) {
      showFlash({ d: state.day, k: 'note', t: '设计局里还没有采用的车：去 /tank.html 点「采用此设计」。' })
      return
    }
    try {
      buildTank(a.design)
    } catch {
      showFlash({ d: state.day, k: 'note', t: '这份设计的数据不完整，去设计局重新采用一次。' })
      return
    }
    const gate = designCheck(a.design, state.research)
    if (!gate.ok) {
      showFlash({ d: state.day, k: 'note', t: `这辆车现在造不出来：${gate.reason}` })
      return
    }
    const year = designYear(a.design)
    const limit = dateOf(state.day).year + PRODUCT_LEAD_YEARS
    if (year > limit) {
      showFlash({
        d: state.day,
        k: 'note',
        t: `${a.design.name} 的零件 ${year} 年才成熟，${limit} 年前客户不会要。`,
      })
      return
    }
    state.design = JSON.parse(JSON.stringify(a.design)) as typeof state.design
    pushLog(state, { d: state.day, k: 'note', t: `导入本厂设计：${a.design.name}（${year} 年）。` })
    candidateSig = ''
    offerSig = ''
    dirty = true
    render()
    save()
  }

  function refreshAdopt(): void {
    const a = readAdopted()
    if (!a) {
      adoptRow.classList.remove('show')
      return
    }
    adoptRow.classList.add('show')
    adoptBtn.disabled = state.contract !== null
    adoptNote.textContent = `${a.design.name} · ${designYear(a.design)} 年`
  }

  addLineBtn.addEventListener('click', () => {
    const r = addProductionLine(state)
    if (!r.ok) {
      showFlash({ d: state.day, k: 'note', t: r.msg })
      return
    }
    lineSig = ''
    render()
    save()
  })

  borrowBtn.addEventListener('click', () => {
    const r = borrow(state, LOAN_STEP)
    if (!r.ok) {
      showFlash({ d: state.day, k: 'note', t: r.msg })
      return
    }
    render()
    save()
  })

  repayBtn.addEventListener('click', () => {
    const r = repay(state, LOAN_STEP)
    if (!r.ok) {
      showFlash({ d: state.day, k: 'note', t: r.msg })
      return
    }
    render()
    save()
  })

  homeSelect.addEventListener('change', () => {
    if (state.day !== 0 || state.factory || state.contract) {
      homeSelect.value = state.home
      showFlash({ d: state.day, k: 'note', t: '开工之后不能改国籍；下一局再选。' })
      return
    }
    state.home = homeSelect.value
    refreshOffers(state, true)
    offerSig = ''
    render()
    save()
  })

  techSelect.addEventListener('change', updateTechHint)

  techStart.addEventListener('click', () => {
    const id = techSelect.value
    if (!id) return
    const res = startResearch(state, id)
    if (!res.ok) {
      showFlash({ d: state.day, k: 'note', t: res.msg })
      return
    }
    techSig = ''
    candidateSig = ''
    render()
    save()
  })

  productSelect.addEventListener('change', () => {
    if (state.contract) return
    if (productSelect.value === '__custom__') return
    const h = productCandidates(state.day, state.research).find((c) => c.design.name === productSelect.value)
    if (!h) return
    state.design = JSON.parse(JSON.stringify(h.design)) as typeof state.design
    pushLog(state, { d: state.day, k: 'note', t: `改用 ${h.name}（${h.year}）。` })
    candidateSig = ''
    offerSig = ''
    dirty = true
    render()
    save()
  })

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
  // 从设计局切回来时，刷新「导入设计局的车」那一行。
  window.addEventListener('focus', () => {
    refreshAdopt()
    dirty = true
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
    publishTech()
  }

  /** 把「哪些零件能选、上限多少」写给设计局，避免它自己去读存档。 */
  function publishTech(): void {
    try {
      writeTech(techSnapshot(state))
    } catch {
      /* 本地存储写不进去就退化成沙盒 */
    }
  }

  window.addEventListener('beforeunload', save)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save()
  })

  // ── 渲染：产品 / 订单 / 产线 ─────────────────────────────

  function statCell(label: string, value: string): HTMLElement {
    return el(
      'div',
      { class: 'mini-cell' },
      el('span', { class: 'mini-k', text: label }),
      el('span', { class: 'mini-v', text: value }),
    )
  }

  function renderResearch(): void {
    const r = state.research
    const year = dateOf(state.day).year
    researchInfo.textContent = `槽 ${slotsOf(r)} · 速度 ×${speedOf(r).toFixed(2)} · 月维持 ${money(monthlyUpkeep(r, year))}${
      r.projects.length ? '' : '（空闲不扣）'
    }`

    projectsWrap.replaceChildren()
    if (r.projects.length === 0) {
      projectsWrap.append(el('p', { class: 'hintline', text: '没有在研项目。' }))
    }
    for (const p of r.projects) {
      const t = TECH_BY_ID.get(`${p.ladder}.${p.tier}`)
      const pct = Math.min(100, (p.progress / Math.max(0.01, p.months)) * 100)
      const fill = el('div', { class: 'meter-fill' })
      fill.style.width = `${pct.toFixed(1)}%`
      projectsWrap.append(
        el(
          'div',
          { class: 'project' },
          el(
            'div',
            { class: 'project-top' },
            el('span', { text: t?.name ?? p.ladder }),
            el('span', { class: 'project-pct', text: `${p.progress.toFixed(1)} / ${p.months.toFixed(1)} 槽月` }),
          ),
          el('div', { class: 'meter' }, fill),
        ),
      )
    }

    const list = availableTechs(state)
    const slotFull = r.projects.length >= slotsOf(r)
    const sig = `${year}|${slotFull}|${list.map((t) => t.id).join(',')}|${r.projects.length}`
    if (sig !== techSig) {
      techSig = sig
      techSelect.replaceChildren()
      if (list.length === 0) {
        techSelect.append(el('option', { value: '', text: '— 没有可开工的技术 —' }))
      }
      for (const t of list) {
        techSelect.append(el('option', { value: t.id, text: `${t.year} · ${t.name}` }))
      }
    }
    techSelect.disabled = list.length === 0 || slotFull
    techStart.disabled = techSelect.disabled
    updateTechHint()

    upgradeWrap.replaceChildren()
    const groups: Array<readonly [string, readonly (typeof SLOT_UPGRADES)[number][]]> = [
      ['slot', SLOT_UPGRADES],
      ['speed', SPEED_UPGRADES],
    ]
    for (const [kind, table] of groups) {
      for (const u of table) {
        const id = `${kind}-${u.year}`
        if (r.upgrades.includes(id) || year < u.year) continue
        const b = el('button', { class: 'chip chip-upgrade', type: 'button', text: `${u.name} ${money(u.cost)}` })
        b.disabled = state.cash < u.cost
        b.title = u.effect
        b.addEventListener('click', () => {
          const res = buyResearchUpgrade(state, id)
          if (!res.ok) {
            showFlash({ d: state.day, k: 'note', t: res.msg })
            return
          }
          techSig = ''
          candidateSig = ''
          render()
          save()
        })
        upgradeWrap.append(b)
      }
    }
    if (upgradeWrap.childElementCount === 0) {
      const next = [...SLOT_UPGRADES, ...SPEED_UPGRADES]
        .filter((u) => year < u.year)
        .sort((a, b) => a.year - b.year)[0]
      upgradeWrap.append(
        el('span', { class: 'hintline', text: next ? `${next.year} 年起可以扩建槽位 / 速度。` : '暂时没有可扩建项。' }),
      )
    }
  }

  function updateTechHint(): void {
    const id = techSelect.value
    const t = id ? TECH_BY_ID.get(id) : undefined
    if (!t) {
      techHint.textContent = '没有可开工的技术。'
      return
    }
    const effort = effortForTier(state, t)
    techHint.textContent = `${effort.months.toFixed(1)} 槽月 · ${money(effort.cost)}${
      effort.mult === 1 ? '' : ` · ×${effort.mult.toFixed(2)}`
    }`
  }

  function renderLines(): void {
    const f = state.factory
    const lines = f?.lines ?? []
    const material = lines[0]?.spec.material ?? state.design.armor.material
    materialNote.textContent = `${materialFactorText(material, state.day)} · 接单时锁价`
    const sig = `${lines
      .map((l) => `${l.id}:${l.workers}:${l.shifts}:${l.state}:${l.built}:${l.starved}`)
      .join('|')}|${state.cash >= LINE_COST}|${state.cash >= STAFF_COST}|${state.cash >= SHIFT_COST}|${state.over}`
    if (sig === lineSig) return
    lineSig = sig

    linesWrap.replaceChildren()
    if (lines.length === 0) {
      linesWrap.append(el('p', { class: 'hintline', text: '还没有产线；接单时自动建第一条。' }))
    }
    for (const l of lines) {
      const stateText = l.state === 'running' ? '运转' : l.state === 'retooling' ? '换型' : '停工'
      const staffBtn = el('button', { class: 'chip chip-line', type: 'button', text: `+100 人 ${money(STAFF_COST)}` })
      staffBtn.disabled = state.over || l.workers + STAFF_STEP > STAFF_MAX || state.cash < STAFF_COST
      staffBtn.addEventListener('click', () => {
        const r = upgradeLine(state, l.id, 'staff')
        if (!r.ok) {
          showFlash({ d: state.day, k: 'note', t: r.msg })
          return
        }
        lineSig = ''
        render()
        save()
      })
      const shiftBtn = el('button', { class: 'chip chip-line', type: 'button', text: `+1 班 ${money(SHIFT_COST)}` })
      shiftBtn.disabled = state.over || l.shifts >= 3 || state.cash < SHIFT_COST
      shiftBtn.addEventListener('click', () => {
        const r = upgradeLine(state, l.id, 'shift')
        if (!r.ok) {
          showFlash({ d: state.day, k: 'note', t: r.msg })
          return
        }
        lineSig = ''
        render()
        save()
      })
      linesWrap.append(
        el(
          'div',
          { class: 'line-card' },
          el(
            'div',
            { class: 'line-top' },
            el('span', { text: `${l.id} 号线 · ${l.workers} 人 × ${l.shifts} 班` }),
            el('span', { class: 'line-state', text: stateText }),
          ),
          el('div', { class: 'line-meta', text: `已造 ${l.built} 台${l.starved > 0 ? ' · 缺料停线' : ''}` }),
          el('div', { class: 'line-actions' }, staffBtn, shiftBtn),
        ),
      )
    }
    addLineBtn.disabled = state.over || lines.length >= MAX_LINES || state.cash < LINE_COST
  }

  function renderProduct(): void {
    const candidates = productCandidates(state.day, state.research)
    const sig = candidates.map((c) => c.design.name).join('|')
    if (sig !== candidateSig) {
      candidateSig = sig
      hasCustom = false
      productSelect.replaceChildren()
      for (const c of candidates) {
        productSelect.append(el('option', { value: c.design.name, text: `${c.year} · ${c.name}` }))
      }
    }
    // 和历史样车逐字段比对：完全一样才显示成历史车，否则挂「本厂设计」。
    const exact = candidates.find((c) => fingerprint(c.design) === fingerprint(state.design))
    if (exact) {
      if (hasCustom) {
        ;[...productSelect.options].find((o) => o.value === '__custom__')?.remove()
        hasCustom = false
      }
    } else {
      let opt = [...productSelect.options].find((o) => o.value === '__custom__') as HTMLOptionElement | undefined
      if (!opt) {
        opt = el('option', { value: '__custom__' })
        productSelect.append(opt)
        hasCustom = true
      }
      opt.textContent = `本厂 · ${state.design.name}`
    }
    productSelect.value = exact ? state.design.name : '__custom__'
    productSelect.disabled = state.contract !== null

    const tank = buildTank(state.design, techMods(state.research))
    productStats.replaceChildren(
      statCell('装甲', `${Math.round(tank.raw.armor)} mm`),
      statCell('火力', `${Math.round(tank.raw.pen)} mm`),
      statCell('机动', `${Math.round(tank.raw.offroad)} km/h`),
      statCell('适应', `${Math.round(tank.raw.adapt)}`),
      statCell('总分', `${tank.score.total}`),
      statCell('单台', money(tank.cost.total)),
    )
    productHint.textContent = state.contract
      ? '订单执行中，交完才能换产品。'
      : '换产品在下次接单时生效：熟练度只保留 35%。'
    refreshAdopt()
  }

  function designKey(): string {
    return fingerprint(state.design)
  }

  function fingerprint(d: typeof state.design): string {
    const a = d.armor
    return [
      d.name,
      d.hull,
      d.gun,
      d.engine,
      d.suspension,
      d.aux,
      a.material,
      a.turretMaterial ?? '',
      a.front,
      a.frontSlope,
      a.side,
      a.turretFront,
      a.turretSlope,
      a.pike ? 1 : 0,
      d.mods ? JSON.stringify(d.mods) : '',
    ].join('|')
  }

  function renderOrders(): void {
    const c = state.contract
    const line = state.factory?.lines[0]
    const sig = c
      ? `c|${c.id}|${c.delivered}|${c.paid}|${c.late}|${state.day}|${line?.state ?? ''}|${line?.starved ?? 0}`
      : `o|${state.offers.map((o) => o.id).join(',')}|${designKey()}|${state.rep}|${state.bribes}|${Math.round(state.cash)}`
    if (sig === offerSig) return
    offerSig = sig
    offersWrap.replaceChildren()
    contractWrap.replaceChildren()
    if (c) {
      renderContract(c)
      return
    }
    if (state.offers.length === 0) {
      offersWrap.append(el('p', { class: 'hintline', text: '桌上暂时没有标，等下一个时代。' }))
      return
    }
    const tank = buildTank(state.design, techMods(state.research))
    for (const o of state.offers) {
      const ok = productMeets(tank, o)
      const acceptBtn = el('button', { class: 'chip chip-accept', text: ok ? '接单' : '不达标' })
      acceptBtn.disabled = !ok
      acceptBtn.addEventListener('click', () => handleAccept(o.id))
      const underBtn = el('button', { class: 'chip chip-undercut', text: '压价 5%' })
      underBtn.disabled = !ok
      underBtn.addEventListener('click', () => handleAccept(o.id, 'undercut'))
      const bribeBtn = el('button', { class: 'chip chip-bribe', text: `贿赂 ${Math.round(o.bribeCost / 1000)}k` })
      bribeBtn.disabled = !ok || state.cash < o.bribeCost
      bribeBtn.addEventListener('click', () => handleAccept(o.id, 'bribe'))
      const price = bidPrice(o, state.rep, 'normal')
      offersWrap.append(
        el(
          'div',
          { class: 'offer' },
          el(
            'div',
            { class: 'offer-top' },
            el('span', { class: 'offer-ref', text: `${o.nation} · ${o.ref} 级` }),
            el('span', { class: 'offer-qty', text: `${o.qty} 台` }),
          ),
          el('div', { class: 'offer-need', text: needText(o) }),
          el('div', { class: 'offer-force', text: `${o.nation}现役：${o.ref} · 需求 ${o.qty} 台` }),
          el(
            'div',
            { class: 'offer-meta' },
            el('span', { text: `${money(price)}/台` }),
            el('span', { text: `交期 ${formatDate(o.deadline)}` }),
          ),
          el('div', { class: 'offer-rival', text: `竞品 ${o.rival.name} · 总分 ${o.rival.score} · 报价 ${money(o.rival.price)}/台` }),
          el('div', { class: 'offer-actions' }, acceptBtn, underBtn, bribeBtn),
        ),
      )
    }
  }

  function renderContract(c: NonNullable<GameState['contract']>): void {
    const lines = state.factory?.lines ?? []
    const line = lines[0]
    const pct = Math.min(100, (c.delivered / Math.max(1, c.qty)) * 100)
    const meterFill = el('div', { class: 'meter-fill' })
    meterFill.style.width = `${pct.toFixed(1)}%`
    const late = state.day > c.deadline
    const due = late ? `已逾期 ${state.day - c.deadline} 天` : `还剩 ${c.deadline - state.day} 天`
    const status =
      lines.length === 0
        ? '没有产线'
        : lines.some((l) => l.starved > 0)
          ? '缺料停线'
          : lines.some((l) => l.state === 'running')
            ? '运转中'
            : '停工'
    const per = line ? daysPerUnit(line) : Infinity
    const materialDays =
      line && state.factory
        ? per * ((stockOf(state.factory, line.spec.material) + inTransitKg(state.factory)) / Math.max(1, line.spec.unitKg))
        : 0

    contractWrap.append(
      el(
        'div',
        { class: 'contract-head' },
        el('span', { class: 'contract-ref', text: `${c.nation} · ${c.ref} 级` }),
        el('span', { class: `badge ${late ? 'bad' : 'ok'}`, text: due }),
      ),
      el('div', { class: 'meter' }, meterFill),
      el(
        'div',
        { class: 'contract-line' },
        el('span', { text: `已交付 ${c.delivered} / ${c.qty} 台` }),
        el('span', { class: 'money', text: `回款 ${money(c.paid)}` }),
      ),
      el(
        'div',
        { class: 'contract-line dim' },
        el('span', { text: `单价 ${money(c.unitPrice)}` }),
        el('span', { text: `交期 ${formatDate(c.deadline)}` }),
      ),
      el(
        'div',
        { class: 'contract-line dim' },
        el('span', { text: `产线 ${lines.length} 条 · ${status}` }),
        el('span', { text: line ? `单台 ${per.toFixed(1)} 天 · 料够 ${materialDays.toFixed(1)} 天` : '—' }),
      ),
    )
    if (c.late) {
      contractWrap.append(el('p', { class: 'hintline', text: '已逾期：后续交付按单价 70% 结算。' }))
    }
  }

  // ── 渲染：主循环 ─────────────────────────────────────────

  function renderEnd(): void {
    if (!state.over) {
      endOverlay.classList.remove('show')
      return
    }
    const s = state.stats
    const bankrupt = state.day < TOTAL_DAYS - 1
    const techs = Object.values(state.research.mastered).filter((v) => v > 0).length
    endTitle.textContent = bankrupt ? `破产 · ${formatDate(state.day)}` : `1991 · 关厂报告（${formatDate(state.day)}）`
    const rows: Array<[string, string, boolean?]> = [
      ['累计回款', money(s.revenue)],
      ['材料', money(s.material)],
      ['工资 / 维持', money(s.wages)],
      ['研发', money(s.research)],
      ['贿赂', money(s.bribes)],
      ['罚款', money(s.fines)],
      ['利息', money(Math.round(s.interest))],
      ['期末现金', money(state.cash)],
      ['债务', money(Math.round(state.debt))],
      ['净资产', money(Math.round(state.cash - state.debt)), state.cash - state.debt < 0],
      ['完成订单', `${s.contracts} 张`],
      ['累计出车', `${s.produced} 台`],
      ['信誉', `${state.rep} / 100`],
      ['已掌握科技', `${techs} 条`],
    ]
    endBody.replaceChildren(
      ...rows.map(([k, v, bad]) =>
        el(
          'div',
          { class: 'end-row' },
          el('span', { class: 'end-key', text: k }),
          el('span', { class: `end-val${bad ? ' bad' : ''}`, text: v }),
        ),
      ),
    )
    endOverlay.classList.add('show')
  }

  function render(): void {
    const dateStr = formatDate(state.day)
    dateText.textContent = dateStr
    const era = ERAS[state.era]!
    eraText.textContent = state.over ? '结束' : era.name
    eraBlurb.textContent = era.blurb

    cashValue.textContent = money(state.cash)
    repValue.textContent = `${state.rep} / 100${state.bribes > 0 ? ` · 未消账 ${state.bribes}` : ''}`
    homeSelect.value = state.home
    homeSelect.disabled = state.day !== 0 || state.factory !== null || state.contract !== null
    homeSelect.title = homeSelect.disabled ? '开工之后不能改国籍' : '换国家会按新阵营重新招标'
    debtValue.textContent = `${money(state.debt)} / ${money(creditLimit(state))}`
    borrowBtn.disabled = state.over || availableCredit(state) < LOAN_STEP
    repayBtn.disabled = state.over || state.debt <= 0 || state.cash < Math.min(LOAN_STEP, state.debt)
    leftValue.textContent = state.over ? '—' : `${num(daysLeft(state))} 天`

    const threat = threatAt(state.day)
    threatBar.style.width = `${(threat * 100).toFixed(0)}%`
    threatBar.classList.toggle('hot', threat > 0.7)
    threatWord.textContent = threat > 0.85 ? '全面战争' : threat > 0.55 ? '局部战争' : threat > 0.3 ? '紧张' : '和平'

    cursor.style.left = `${(progress(state) * 100).toFixed(3)}%`

    clockMeta.textContent = `第 ${num(state.day + 1)} / ${num(TOTAL_DAYS)} 天 · ${formatMonth(state.day)}`

    pauseBtn.classList.toggle('on', paused)
    for (const b of speedButtons) b.classList.toggle('on', !paused && Number(b.dataset.speed) === speed)
    pausedTag.textContent =
      pauseReason === 'contract'
        ? '订单完成 · 接下一单'
        : pauseReason === 'research'
          ? '科技完成 · 选下一项'
          : pauseReason === 'cash'
            ? '现金告急 · 先看账'
            : pauseReason === 'deadline'
              ? '交期临近 · 5 天'
              : pauseReason === 'event'
                ? '自动暂停 · 世界变了'
                : '已暂停'
    pausedTag.classList.toggle('show', paused && !state.over)

    renderProduct()
    renderOrders()
    renderLines()
    renderResearch()
    renderEnd()

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
      const last = state.log[state.log.length - 1]
      const broke = last?.t.includes('破产') === true
      banner.textContent = broke ? '破产了。刷新页面可以开新的一局。' : '这一局结束了。刷新页面可以开新的一局。'
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
        } else if (r.contractDone) {
          paused = true
          pauseReason = 'contract'
          if (state.log.length > sizeBefore) showFlash(state.log[state.log.length - 1]!)
        } else if (r.researchDone) {
          paused = true
          pauseReason = 'research'
          if (state.log.length > sizeBefore) showFlash(state.log[state.log.length - 1]!)
          publishTech()
        } else if (state.contract && !cashWarned && state.cash < 50_000) {
          paused = true
          pauseReason = 'cash'
          cashWarned = true
          showFlash({ d: state.day, k: 'note', t: '现金告急：不到 5 万，先看看账。' })
        } else if (state.contract && !deadlineWarned && state.contract.deadline - state.day <= 5) {
          paused = true
          pauseReason = 'deadline'
          deadlineWarned = true
          showFlash({ d: state.day, k: 'note', t: '交期只剩 5 天，确认还能交上。' })
        } else if (r.eraChanged || r.newsCount > 0) {
          paused = true
          pauseReason = 'event'
          const newest = state.log[state.log.length - 1]
          if (newest && state.log.length > sizeBefore) showFlash(newest)
        }
        acc = 0
        dirty = true
        offerSig = ''
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
  publishTech()
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

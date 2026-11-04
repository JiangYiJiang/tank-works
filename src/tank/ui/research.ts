/**
 * 研发局界面。
 *
 * 这一版要做的事只有一件：**让「落后」看得见**。
 *
 * 科技树不是一张能勾选的清单，它是一条条按年份铺开的泳道：
 * 每个方块画在它最早可开工的那一年，方块宽度约等于工期，
 * 一条竖线是「今天」—— 竖线左边的才是你现在能碰的东西。
 *
 * 三条刻意的选择：
 *   1. 不做存档。这一版是「读图」，不是「操作」：点方块只是在你心里做标记，
 *      用来试着回答「如果我 1939 年才开工，哪些线会停在哪一年」。
 *   2. 同一泳道里挨得太近的方块会自动叠成子行，不重叠 —— 数据一改也不会糊成一团。
 *   3. 超前研发不是禁区，是价签。线上右边的方块照样可点，只是标着 ×2.0 这种价钱。
 */

import {
  BOARD_NAMES,
  SLOT_UPGRADES,
  SLOT_UPKEEP_BASE,
  SPEED_UPGRADES,
  TECH,
  effortFor,
  intensityAt,
  isHorizon,
  slotsAt,
  upkeepIndex,
} from '../data/tech'
import type { TechBoard, TechTier } from '../data/tech'
import { ERAS, dayOf } from '../sim/calendar'

// ────────────────────────────────────────────────────────────
// 小工具
// ────────────────────────────────────────────────────────────

type Attrs = Record<string, string | number | boolean | undefined>

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Array<string | Node>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue
    if (k === 'class') node.className = String(v)
    else if (k === 'text') node.textContent = String(v)
    else if (k === 'style') node.setAttribute('style', String(v))
    else node.setAttribute(k, v === true ? '' : String(v))
  }
  for (const c of children) node.append(c)
  return node
}

const nf = (n: number, digits = 0): string =>
  n.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })

/** ¥1.2M / ¥840k —— 大数字用单位，小数字保留原值。 */
function money(n: number): string {
  if (n >= 1_000_000) return `¥${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 10_000) return `¥${(n / 1000).toFixed(0)}k`
  return `¥${nf(n)}`
}

/** 工期：月份 → 「14 月」或「4 年 2 月」。 */
function duration(months: number): string {
  if (months <= 0) return '开局自带'
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0) return `${m} 月`
  return m === 0 ? `${y} 年` : `${y} 年 ${m} 月`
}

function eraNameOf(year: number): string {
  const day = dayOf(year, 6, 1)
  let name = ERAS[0]!.name
  for (const e of ERAS) if (e.from <= day) name = e.name
  return name
}

// ────────────────────────────────────────────────────────────
// 布局常量
// ────────────────────────────────────────────────────────────

const BOARD_ORDER: readonly TechBoard[] = ['armor', 'gun', 'ammo', 'power', 'run', 'aux', 'ind']

/** 时间轴范围。终局清单（1992 之后）不铺在这条轴上，单独列。 */
const AXIS_FROM = 1912
const AXIS_TO = 1991

/** 方块宽度（像素）。 */
const CHIP_W = 82
/**
 * 碰撞检测用的占位宽度（百分比），比 CHIP_W 保守：宁可多叠一层子行，
 * 也不要两个方块压在一起 —— 轨道实际宽度随窗口变化，这里按最窄的情形算。
 */
const CHIP_PCT = 9
/** 泳道左侧标签列宽，必须和 CSS 里的 grid-template-columns 对齐。 */
const LABEL_W = 150
const SUB_ROW_H = 34

const YEAR_MIN = 1915
const YEAR_MAX = 1991

interface Lane {
  ladder: string
  label: string
  tiers: TechTier[]
  /** 每个 tier 所在的子行（0 起），用于避免同泳道方块重叠 */
  subRows: number[]
  /** 每个 tier 的左边界，百分比 0–100 */
  pos: number[]
}

function posOf(year: number): number {
  return ((year - AXIS_FROM) / (AXIS_TO - AXIS_FROM)) * 100
}

function buildLanes(board: TechBoard): Lane[] {
  const tiers = TECH.filter((t) => t.board === board && !isHorizon(t))
  const byLadder = new Map<string, TechTier[]>()
  for (const t of tiers) {
    const list = byLadder.get(t.ladder) ?? []
    list.push(t)
    byLadder.set(t.ladder, list)
  }
  const lanes: Lane[] = []
  for (const [ladder, list] of byLadder) {
    list.sort((a, b) => a.tier - b.tier)
    const pos = list.map((t) => posOf(t.year))
    // 贪心分配子行：放得下就复用最小的子行，放不下就往下一层。
    const ends: number[] = []
    const subRows = pos.map((p) => {
      for (let r = 0; r < ends.length; r++) {
        if (p >= (ends[r] ?? 0) + CHIP_PCT + 1.2) {
          ends[r] = p
          return r
        }
      }
      ends.push(p)
      return ends.length - 1
    })
    lanes.push({ ladder, label: list[0]!.ladder.replace(/^[a-z]+\./, ''), tiers: list, subRows, pos })
  }
  return lanes
}

const LANES: ReadonlyMap<TechBoard, Lane[]> = new Map(BOARD_ORDER.map((b) => [b, buildLanes(b)]))

/** 泳道中文名：用第一代的措辞太怪，用手写表。 */
const LADDER_NAMES: Record<string, string> = {
  'armor.steel': '钢质装甲',
  'armor.face': '表面处理',
  'armor.form': '车体成型',
  'armor.slope': '倾角设计',
  'armor.composite': '复合装甲',
  'armor.era': '反应装甲',
  'armor.spall': '防崩落',
  'armor.layout': '炮塔布局',
  'armor.aps': '主动防护',
  'gun.caliber': '口径上限',
  'gun.barrel': '身管倍径',
  'gun.breech': '膛压承受',
  'gun.rifling': '膛线',
  'gun.loading': '装填方式',
  'gun.muzzle': '炮口装置',
  'gun.thermal': '身管热护套',
  'gun.feed': '供弹形式',
  'gun.etc': '新概念发射',
  'ammo.ap': '全口径穿甲弹',
  'ammo.apcr': '硬芯弹',
  'ammo.apds': '脱壳弹',
  'ammo.apfsds': '长杆弹',
  'ammo.heat': '破甲弹',
  'ammo.prop': '发射药',
  'ammo.pen': '弹芯材料',
  'ammo.sabot': '弹托',
  'ammo.mp': '多用途弹',
  'ammo.guided': '制导炮弹',
  'ammo.prog': '引信',
  'power.type': '发动机型式',
  'power.boost': '增压',
  'power.trans': '传动',
  'power.cool': '冷却',
  'power.fuel': '供油',
  'power.apu': '辅助动力',
  'power.exhaust': '排气',
  'power.hybrid': '混合电传动',
  'power.fuelcell': '燃料电池',
  'run.susp': '悬挂',
  'run.track': '履带',
  'run.wheel': '负重轮',
  'run.drive': '驱动布置',
  'run.damper': '减震',
  'run.active': '主动悬挂',
  'aux.radio': '电台',
  'aux.optics': '瞄准镜',
  'aux.rangefinder': '测距仪',
  'aux.night': '夜视',
  'aux.stab': '稳定器',
  'aux.nbc': '三防',
  'aux.fcs': '火控',
  'aux.warn': '告警',
  'aux.nav': '导航',
  'aux.bms': '战场管理',
  'aux.crew': '乘员视野',
  'aux.ai': '智能辅助',
  'ind.assembly': '总装',
  'ind.mat': '材料利用',
  'ind.qc': '质检',
  'ind.log': '仓储物流',
  'ind.tool': '工装',
  'ind.robot': '机器人',
  'ind.cad': '数字化',
  'ind.lean': '精益生产',
  'ind.additive': '增材制造',
}

type State = 'done' | 'open' | 'early' | 'locked'

// ────────────────────────────────────────────────────────────
// 主界面
// ────────────────────────────────────────────────────────────

export function mountResearch(root: HTMLElement): void {
  const params = new URLSearchParams(location.search)
  const yearParam = params.get('year')
  let year = yearParam === null ? 1939 : Math.min(YEAR_MAX, Math.max(YEAR_MIN, Number(yearParam) || 1939))

  /**
   * 玩家自己点的「已掌握」。不存档 —— 这一版是读图工具，不是游戏状态。
   *
   * 默认给一个「按部就班」的基线：凡是年份已到的都算掌握。
   * 这样打开就看见一条齐整的前沿，然后你一个一个删，看哪条线先塌 ——
   * 从「什么都没有」开始反而看不出落后长什么样。
   * 只要手动动过任何一个方块，就不再自动铺基线（touched）。
   */
  let touched = false
  let mastered = new Set<string>()
  let selected: TechTier | null = null

  const reachable = TECH.filter((t) => !isHorizon(t))
  const horizon = TECH.filter((t) => isHorizon(t))

  function idealSet(y: number): Set<string> {
    return new Set(TECH.filter((t) => !isHorizon(t) && t.year <= y).map((t) => t.id))
  }

  function syncBaseline(): void {
    if (!touched) mastered = idealSet(year)
  }
  syncBaseline()

  // ── 头部（只建一次）───────────────────────────────────────

  const titleBlock = el(
    'div',
    { class: 'rs-titleblock' },
    el('h1', { class: 'rs-h1', text: '研发局' }),
    el('p', { class: 'rs-sub', text: `七个板块、${new Set(TECH.map((t) => t.ladder)).size} 条泳道、${TECH.length} 条技术。竖线是今天 —— 线左边的才摸得到，右边的只是价签。` }),
  )

  const yearValue = el('div', { class: 'rs-yearv' })
  const eraLine = el('div', { class: 'rs-era' })

  const slider = el('input', {
    class: 'rs-slider',
    type: 'range',
    min: YEAR_MIN,
    max: YEAR_MAX,
    step: 1,
    value: year,
    'aria-label': '今天',
  })
  slider.addEventListener('input', () => {
    year = Number(slider.value)
    syncBaseline()
    render()
  })

  const PRESETS: ReadonlyArray<readonly [string, number]> = [
    ['索姆河 1916', 1916],
    ['战间 1930', 1930],
    ['二战 1943', 1943],
    ['冷战 1960', 1960],
    ['缓和 1975', 1975],
    ['落幕 1990', 1990],
  ]
  const presets = el('div', { class: 'rs-presets' })
  for (const [label, y] of PRESETS) {
    const b = el('button', { class: 'rs-preset', type: 'button', text: label })
    b.addEventListener('click', () => {
      year = y
      slider.value = String(y)
      syncBaseline()
      render()
    })
    presets.append(b)
  }

  const resetBtn = el('button', { class: 'rs-preset is-action', type: 'button', text: '回到按部就班' })
  resetBtn.addEventListener('click', () => {
    touched = false
    syncBaseline()
    render()
  })

  const clearBtn = el('button', { class: 'rs-preset is-action', type: 'button', text: '清空重来' })
  clearBtn.addEventListener('click', () => {
    touched = true
    mastered = new Set()
    render()
  })

  const yearBox = el(
    'div',
    { class: 'rs-yearbox' },
    el('div', { class: 'rs-yearlabel', text: '今天' }),
    yearValue,
    eraLine,
    slider,
    el('div', { class: 'rs-tools' }, presets, resetBtn, clearBtn),
  )

  const head = el('header', { class: 'rs-head' }, titleBlock, yearBox)

  // ── 概览条 ───────────────────────────────────────────────

  const summary = el('div', { class: 'rs-sum' })

  function legendItem(kind: string, label: string): HTMLElement {
    return el(
      'span',
      { class: 'rs-legenditem' },
      el('span', { class: `rs-sw is-${kind}` }),
      el('span', { text: label }),
    )
  }

  const legend = el(
    'div',
    { class: 'rs-legend' },
    legendItem('done', '已掌握'),
    legendItem('open', '可开工'),
    legendItem('early', '超前 —— 右边的只是价签，点得动'),
    legendItem('locked', '前置未满足'),
    el('span', { class: 'rs-legendhint', text: '点方块切换「已掌握」，拖滑条换「今天」' }),
  )

  // ── 主体：左边树，右边检视器 ──────────────────────────────

  const tree = el('div', { class: 'rs-tree' })
  const detail = el('aside', { class: 'rs-detail' })

  const body = el('div', { class: 'rs-body' }, tree, detail)
  root.append(el('div', { class: 'rs-shell' }, head, summary, legend, body))

  // ── 状态判定 ─────────────────────────────────────────────

  function statusOf(t: TechTier): State {
    if (mastered.has(t.id)) return 'done'
    if (t.needs.some((n) => !mastered.has(n) && !isStarting(n))) return 'locked'
    return t.year <= year ? 'open' : 'early'
  }

  function isStarting(id: string): boolean {
    const t = TECH.find((x) => x.id === id)
    return t !== undefined && t.months === 0 && t.year <= 1915
  }

  /** 某条泳道「已掌握到哪一年」。没起步返回 null。 */
  function ladderHead(lane: Lane): number | null {
    let best: number | null = null
    for (const t of lane.tiers) if (mastered.has(t.id)) best = Math.max(best ?? -Infinity, t.year)
    return best
  }

  /** 这条泳道**今天为止已经存在**的最新一代。还没到年份的泳道返回 null。 */
  function laneFrontier(lane: Lane): number | null {
    let best: number | null = null
    for (const t of lane.tiers) if (t.year <= year) best = Math.max(best ?? -Infinity, t.year)
    return best
  }

  /**
   * 落后年数 = 前沿 − 你停的地方。
   *
   * 注意是拿「今天已经存在的最后一代」比，不是拿「整条泳道的未来」比 ——
   * 否则一条只有 1915 和 1989 两代的泳道，会因为日历翻到 1939 就凭空「落后 24 年」。
   */
  function laneLag(lane: Lane): number {
    const front = laneFrontier(lane)
    if (front === null) return 0
    const head = ladderHead(lane)
    if (head === null) return front - lane.tiers[0]!.year
    return Math.max(0, front - head)
  }

  function lagOfBoard(board: TechBoard): { lag: number | null; head: number | null } {
    let worst: number | null = null
    let head: number | null = null
    for (const lane of LANES.get(board) ?? []) {
      const h = ladderHead(lane)
      if (h !== null) head = Math.max(head ?? -Infinity, h)
      if (laneFrontier(lane) === null) continue
      worst = Math.max(worst ?? -Infinity, laneLag(lane))
    }
    return { lag: worst, head }
  }

  // ── 渲染 ─────────────────────────────────────────────────

  function render(): void {
    yearValue.textContent = `${year} 年`
    eraLine.textContent = eraNameOf(year)

    const slots = slotsAt(year, SLOT_UPGRADES.length)
    const speed = SPEED_UPGRADES.filter((u) => u.year <= year).reduce((m, u) => {
      const parsed = Number.parseFloat(u.effect.replace(/[^\d.]/g, ''))
      return m * (Number.isFinite(parsed) && parsed > 0 ? parsed : 1)
    }, 1)
    const upkeep = SLOT_UPKEEP_BASE * upkeepIndex(year) * slots
    const doneCount = mastered.size
    const spend = TECH.filter((t) => mastered.has(t.id)).reduce((s, t) => s + t.cost, 0)
    const available = reachable.filter((t) => t.year <= year).length
    const maxLag = Math.max(
      0,
      ...BOARD_ORDER.map((b) => lagOfBoard(b).lag ?? 0),
    )

    summary.replaceChildren(
      stat('科研槽', `${slots} 个`),
      stat('研发速度', `×${speed.toFixed(2)}`),
      stat('时代强度', `×${intensityAt(year).toFixed(2)}`),
      stat('月固定开销', money(upkeep)),
      stat('已掌握 / 应有', `${doneCount} / ${available} 条`),
      stat('累计研发费', money(spend)),
      stat('最大落后', maxLag > 0 ? `${maxLag} 年` : '在线上'),
      stat('还没摸到', `${reachable.length - doneCount} 条`),
    )

    renderTree()
    renderDetail()
  }

  function stat(k: string, v: string): HTMLElement {
    return el('div', { class: 'rs-stat' }, el('div', { class: 'rs-stat-k', text: k }), el('div', { class: 'rs-stat-v', text: v }))
  }

  function renderTree(): void {
    const nodes: Node[] = [renderAxis()]
    // 泳道轨道左右各留 10px 内边距，竖线要跟着一起让开，否则会和方块错开 10px。
    const todayLeft = `calc(${LABEL_W + 10}px + (100% - ${LABEL_W + 20}px) * ${posOf(year) / 100})`
    const line = el('div', { class: 'rs-today', style: `left: ${todayLeft}`, title: `今天：${year} 年` })

    for (const board of BOARD_ORDER) {
      const lanes = LANES.get(board) ?? []
      const { lag, head } = lagOfBoard(board)
      const section = el('section', { class: 'rs-board' })
      const meta =
        head === null
          ? '未起步'
          : lag !== null && lag > 0
            ? `掌握到 ${head} 年 · 落后 ${lag} 年`
            : `掌握到 ${head} 年 · 在线上`
      section.append(
        el(
          'div',
          { class: 'rs-boardhead' },
          el('span', { class: 'rs-boardname', text: BOARD_NAMES[board] }),
          el('span', { class: `rs-boardmeta${lag !== null && lag >= 6 ? ' is-warn' : ''}`, text: meta }),
        ),
      )
      for (const lane of lanes) section.append(renderLane(lane))
      nodes.push(section)
    }

    // 终局清单：1992 之后，不铺在轴上
    const hz = el('section', { class: 'rs-board rs-horizon' })
    hz.append(
      el(
        'div',
        { class: 'rs-boardhead' },
        el('span', { class: 'rs-boardname', text: '终局清单' }),
        el('span', { class: 'rs-boardmeta', text: `${horizon.length} 条 · 1992 年之后，本作不做验收` }),
      ),
    )
    const hzwrap = el('div', { class: 'rs-hzlist' })
    for (const t of horizon) {
      const chip = el('button', { class: 'rs-hzchip', type: 'button' }, el('span', { class: 'rs-hzyear', text: String(t.year) }), el('span', { text: t.name }))
      chip.addEventListener('click', () => {
        selected = t
        renderDetail()
      })
      hzwrap.append(chip)
    }
    hz.append(hzwrap)
    nodes.push(hz)

    tree.replaceChildren(...nodes, line)
  }

  function renderAxis(): HTMLElement {
    const axis = el('div', { class: 'rs-axis' })
    axis.append(el('div', { class: 'rs-axis-label', text: '泳道' }))
    const track = el('div', { class: 'rs-axis-track' })
    const ticks = [1915, 1920, 1925, 1930, 1935, 1940, 1945, 1950, 1955, 1960, 1965, 1970, 1975, 1980, 1985, 1990]
    for (const y of ticks) {
      track.append(
        el('div', {
          class: `rs-tick${y % 10 === 0 ? ' is-major' : ''}`,
          style: `left: ${posOf(y)}%`,
          text: String(y),
        }),
      )
    }
    axis.append(track)
    return axis
  }

  function renderLane(lane: Lane): HTMLElement {
    const subs = Math.max(...lane.subRows) + 1
    const row = el('div', { class: 'rs-lane', style: `height: ${subs * SUB_ROW_H}px` })
    const head = ladderHead(lane)
    const lag = laneLag(lane)
    row.append(
      el(
        'div',
        { class: `rs-lanelabel${lag > 0 ? ' is-late' : ''}` },
        el('span', { class: 'rs-lanename', text: LADDER_NAMES[lane.ladder] ?? lane.label }),
        el('span', { class: 'rs-lanehead', text: head === null ? '未起步' : `${head}${lag > 0 ? ` ·−${lag}` : ''}` }),
      ),
    )
    const track = el('div', { class: 'rs-lanetrack' })
    // 纵向网格线：5 年一格，用百分比让它在任何宽度下都对齐时间轴。
    track.style.setProperty('--grid', `${((5 / (AXIS_TO - AXIS_FROM)) * 100).toFixed(4)}%`)
    lane.tiers.forEach((t, i) => {
      const state = statusOf(t)
      const p = lane.pos[i] ?? 0
      const top = (lane.subRows[i] ?? 0) * SUB_ROW_H + 4
      const chip = el(
        'button',
        {
          class: `rs-chip is-${state}${selected?.id === t.id ? ' is-sel' : ''}`,
          type: 'button',
          style: `left: min(${p}%, calc(100% - ${CHIP_W + 6}px)); top: ${top}px`,
          title: `${t.name} · ${t.year} · ${duration(t.months)}`,
        },
        el('span', { class: 'rs-chipname', text: t.name }),
      )
      if (state === 'early') {
        chip.append(el('span', { class: 'rs-chipmult', text: `×${effortFor(t.months, t.cost, t.year, year).mult.toFixed(1)}` }))
      }
      chip.addEventListener('click', () => {
        touched = true
        if (mastered.has(t.id)) mastered.delete(t.id)
        else mastered.add(t.id)
        selected = t
        render()
      })
      chip.addEventListener('mouseenter', () => {
        selected = t
        renderDetail()
      })
      track.append(chip)
    })
    row.append(track)
    return row
  }

  // ── 检视器 ───────────────────────────────────────────────

  function renderDetail(): void {
    const t = selected
    if (!t) {
      detail.replaceChildren(
        el('div', { class: 'rs-detail-empty' },
          el('div', { class: 'rs-de-h', text: '点一个方块' }),
          el('div', { class: 'rs-de-p', text: '左边看它来自哪条泳道、要吃什么前置；右边看它今天开工要花多少个月、多少钱。' }),
          el('div', { class: 'rs-de-p', text: '点下去会把它标成「已掌握」，泳道顶部就会显示你停在哪一年。' }),
        ),
      )
      return
    }

    const state = statusOf(t)
    const mult = effortFor(t.months, t.cost, t.year, year)
    const stateText: Record<State, string> = {
      done: '已掌握',
      open: '可开工',
      early: '超前研发',
      locked: '前置未满足',
    }

    const needs = t.needs.length
      ? el(
          'div',
          { class: 'rs-needs' },
          ...t.needs.map((n) => {
            const nt = TECH.find((x) => x.id === n)
            const ok = mastered.has(n) || isStarting(n)
            return el('span', { class: `rs-need${ok ? ' is-ok' : ''}`, text: `${ok ? '✓' : '·'} ${nt?.name ?? n}` })
          }),
        )
      : el('div', { class: 'rs-needs' }, el('span', { class: 'rs-need is-ok', text: '✓ 无前置' }))

    const fnRows = t.fn
      ? Object.entries(t.fn).map(([k, v]) => el('div', { class: 'rs-fnrow' }, el('span', { class: 'rs-fnk', text: k }), el('span', { class: 'rs-fnv', text: String(v) })))
      : []

    const toggle = el('button', { class: 'rs-toggle', type: 'button', text: mastered.has(t.id) ? '取消已掌握' : '标记为已掌握' })
    toggle.addEventListener('click', () => {
      touched = true
      if (mastered.has(t.id)) mastered.delete(t.id)
      else mastered.add(t.id)
      render()
    })

    const costNote =
      t.months === 0
        ? null
        : el(
            'div',
            {
              class: `rs-today-cost${mult.mult > 1.02 ? ' is-early' : mult.mult < 0.98 ? ' is-late' : ''}`,
            },
            el('div', { class: 'rs-tc-k', text: `${year} 年开工实际要付` }),
            el('div', { class: 'rs-tc-v', text: `${duration(mult.months)} · ${money(mult.cost)}` }),
            el('div', {
              class: 'rs-tc-m',
              text:
                mult.mult > 1.02
                  ? `超前 ${t.year - year} 年，×${mult.mult.toFixed(2)}`
                  : mult.mult < 0.98
                    ? `落后 ${year - t.year} 年，×${mult.mult.toFixed(2)}`
                    : '正当年份，×1.00',
            }),
          )

    const parts: Array<HTMLElement | null> = [
      el(
        'div',
        { class: 'rs-detail-head' },
        el('div', { class: 'rs-d-name', text: t.name }),
        el('div', {
          class: 'rs-d-meta',
          text: `${BOARD_NAMES[t.board]} · ${LADDER_NAMES[t.ladder] ?? t.ladder} · 第 ${t.tier} 代`,
        }),
      ),
      el('div', { class: `rs-pill is-${state}`, text: stateText[state] }),
      el(
        'div',
        { class: 'rs-kv' },
        kv('最早开工', `${t.year} 年`),
        kv('工期', t.months === 0 ? '开局自带' : duration(t.months)),
        kv('研发费', t.months === 0 ? '—' : money(t.cost)),
      ),
      costNote,
      el('div', { class: 'rs-d-sec', text: '前置' }),
      needs,
      el('div', { class: 'rs-d-sec', text: '它改了什么' }),
      el('div', { class: 'rs-d-effect', text: t.effect }),
      fnRows.length ? el('div', { class: 'rs-d-sec', text: '系数' }) : null,
      fnRows.length ? el('div', { class: 'rs-fnbox' }, ...fnRows) : null,
      toggle,
    ]
    detail.replaceChildren(...parts.filter((p): p is HTMLElement => p !== null))
  }

  function kv(k: string, v: string): HTMLElement {
    return el('div', { class: 'rs-kvrow' }, el('span', { class: 'rs-kvk', text: k }), el('span', { class: 'rs-kvv', text: v }))
  }

  render()
}

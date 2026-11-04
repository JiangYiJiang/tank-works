/**
 * 研发局：左边是人和房间，右边是时间。
 *
 * 这个视图只做两件事：
 *   1. 把槽位、解锁、升级画成能点的东西。
 *   2. 把科技树画成一张能读的时间地图，点开卡片才谈「开不开工」。
 *
 * 所有数值仍然由 sim/research 决定；这里不复制任何一条研发规则。
 */

import {
  BOARD_NAMES,
  BOARD_ORDER,
  LADDER_NAMES,
  TECH,
  TECH_BY_ID,
  effortMult,
  intensityAt,
  isHorizon,
  type TechBoard,
  type TechTier,
} from '../data/tech'
import { dateOf } from '../sim/calendar'
import {
  DAYS_PER_MONTH,
  MAX_RESEARCH_SLOTS,
  MAX_SLOT_LEVEL,
  effortForTier,
  isMastered,
  masteredOf,
  monthlyUpkeep,
  slotIsFree,
  slotProject,
  slotSpeedOf,
  slotUnlockOffer,
  slotUpgradeOffer,
  slotsOf,
  speedOf,
  startResearch,
  startSlotUnlock,
  startSlotUpgrade,
} from '../sim/research'
import type { GameState, ResearchState } from '../sim/state'

type TechState = 'done' | 'researching' | 'open' | 'locked'

interface ResearchViewOptions {
  getState: () => GameState
  onChange: () => void
  onError: (message: string) => void
}

export interface ResearchView {
  root: HTMLElement
  render: () => void
}

const AXIS_FROM = 1912
const AXIS_TO = 2020
const CARD_W = 112
const CHIP_PCT = 12.4
const SUB_ROW_H = 39
const LANE_PAD = 8

interface Lane {
  ladder: string
  label: string
  tiers: TechTier[]
  subRows: number[]
  pos: number[]
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | undefined> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) continue
    if (k === 'class') node.className = v
    else if (k === 'text') node.textContent = v
    else node.setAttribute(k, v)
  }
  for (const c of children) node.append(c)
  return node
}

function money(n: number): string {
  if (n >= 1_000_000) return `¥${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `¥${Math.round(n / 1000)}k`
  return `¥${Math.round(n).toLocaleString('en-US')}`
}

function posOf(year: number): number {
  return ((year - AXIS_FROM) / (AXIS_TO - AXIS_FROM)) * 100
}

function buildLanes(board: TechBoard): Lane[] {
  const tiers = TECH.filter((t) => t.board === board)
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
    lanes.push({
      ladder,
      label: LADDER_NAMES[ladder] ?? list[0]?.ladder.replace(/^[a-z]+\./, '') ?? ladder,
      tiers: list,
      subRows,
      pos,
    })
  }
  return lanes
}

const LANES: ReadonlyMap<TechBoard, Lane[]> = new Map(BOARD_ORDER.map((b) => [b, buildLanes(b)]))

function techStateOf(state: GameState, tier: TechTier): TechState {
  const r = state.research
  if (isMastered(state, tier.id)) return 'done'
  if (r.projects.some((p) => p.ladder === tier.ladder)) return 'researching'
  if (masteredOf(r, tier.ladder) + 1 !== tier.tier) return 'locked'
  if (!tier.needs.every((id) => isMastered(state, id))) return 'locked'
  return 'open'
}

function missingNeeds(state: GameState, tier: TechTier): TechTier[] {
  return tier.needs
    .filter((id) => !isMastered(state, id))
    .map((id) => TECH_BY_ID.get(id))
    .filter((x): x is TechTier => Boolean(x))
}

function monthsLabel(months: number): string {
  if (months <= 0) return '开局自带'
  if (months < 1) return '<1 个月'
  return `${months.toFixed(1)} 个月`
}

function statusLabel(s: TechState): string {
  return s === 'done' ? '已掌握' : s === 'researching' ? '在研' : s === 'open' ? '可开工' : '未解锁'
}

function slotLevelSpeed(level: number): number {
  return Math.pow(1.15, level - 1)
}

/**
 * 挂载研发局。
 * 结构只建一次；之后 render() 只更新状态、进度和竖线。
 */
export function createResearchView(opts: ResearchViewOptions): ResearchView {
  const root = el('div', { class: 'research-workspace' })
  const slotsPanel = el('aside', { class: 'research-slots' })
  const treePanel = el('section', { class: 'tech-tree' })

  const slotsHead = el('div', { class: 'research-slots-head' })
  const slotsList = el('div', { class: 'research-slot-list' })
  const unlockWrap = el('div', { class: 'research-unlock' })
  slotsPanel.append(slotsHead, slotsList, unlockWrap)

  const treeHead = el('div', { class: 'tech-tree-head' })
  const treeScroll = el('div', { class: 'tech-scroll' })
  const canvas = el('div', { class: 'tech-canvas' })
  const nowLine = el('div', { class: 'tech-now' })
  const nowLabel = el('span', { class: 'tech-now-label' })
  nowLine.append(nowLabel)
  const links = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  links.setAttribute('class', 'tech-links')
  links.setAttribute('aria-hidden', 'true')
  const cards = new Map<string, HTMLButtonElement>()
  treeScroll.append(canvas)
  treePanel.append(treeHead, treeScroll)
  root.append(slotsPanel, treePanel)

  const modal = el('div', { class: 'tech-modal', hidden: 'hidden' })
  const modalCard = el('div', { class: 'tech-modal-card' })
  modal.append(modalCard)
  root.append(modal)

  let selected: TechTier | null = null
  let linksFrame = 0
  let linksDrawn = false

  function buildTree(): void {
    const axis = el('div', { class: 'tech-axis' })
    axis.append(el('span', { class: 'tech-axis-label', text: 'TECH TREE' }))
    const axisTrack = el('div', { class: 'tech-axis-track' })
    for (let year = 1920; year <= AXIS_TO; year += 10) {
      axisTrack.append(
        el('span', {
          class: 'tech-axis-tick',
          style: `left:${posOf(year).toFixed(3)}%`,
          text: String(year),
        }),
      )
    }
    axis.append(axisTrack)
    canvas.append(axis)

    const body = el('div', { class: 'tech-body' })
    for (const board of BOARD_ORDER) {
      const section = el('section', { class: 'tech-board', 'data-board': board })
      const lanes = LANES.get(board) ?? []
      section.append(
        el(
          'div',
          { class: 'tech-board-head' },
          el('span', { class: 'tech-board-name', text: BOARD_NAMES[board] }),
          el('span', { class: 'tech-board-en', text: board.toUpperCase() }),
          el('span', { class: 'tech-board-count', text: `${lanes.reduce((s, lane) => s + lane.tiers.length, 0)} 项` }),
        ),
      )
      for (const lane of lanes) {
        const rows = Math.max(...lane.subRows, 0) + 1
        const laneEl = el('div', {
          class: 'tech-lane',
          style: `min-height:${rows * SUB_ROW_H + LANE_PAD * 2}px`,
        })
        laneEl.append(el('div', { class: 'tech-lane-label', text: lane.label }))
        const track = el('div', { class: 'tech-lane-track' })
        for (let i = 0; i < lane.tiers.length; i++) {
          const t = lane.tiers[i]!
          const p = lane.pos[i] ?? 0
          const row = lane.subRows[i] ?? 0
          const card = el('button', {
            class: 'tech-card',
            type: 'button',
            'data-tech-id': t.id,
            style: `left:clamp(2px, calc(${p.toFixed(3)}% - ${CARD_W / 2}px), calc(100% - ${CARD_W + 2}px));top:${LANE_PAD + row * SUB_ROW_H}px`,
            title: t.effect,
            'aria-label': `${t.name} · ${t.year} 年`,
          })
          card.append(
            el('span', { class: 'tech-card-name', text: t.name }),
            el('span', { class: 'tech-card-year', text: String(t.year) }),
          )
          cards.set(t.id, card)
          track.append(card)
        }
        laneEl.append(track)
        section.append(laneEl)
      }
      body.append(section)
    }
    canvas.append(body, links, nowLine)
  }

  function renderSlots(): void {
    const state = opts.getState()
    const r = state.research
    const year = dateOf(state.day).year
    const count = slotsOf(r)
    const active = r.projects.length
    slotsHead.replaceChildren(
      el('span', { class: 'research-kicker', text: 'RESEARCH SLOTS' }),
      el('h2', { text: '科研槽' }),
      el(
        'div',
        { class: 'research-slots-meta' },
        el('span', { text: `已打开 ${count} / ${MAX_RESEARCH_SLOTS}` }),
        el('span', { text: `最快 ×${speedOf(r).toFixed(2)}` }),
        el('span', { text: active > 0 ? `月维持 ${money(monthlyUpkeep(r, year))}` : '空闲不扣维持' }),
      ),
    )

    slotsList.replaceChildren()
    for (let i = 0; i < count; i++) {
      const slot = r.slots[i]
      if (!slot) continue
      const project = slotProject(r, i)
      const job = slot.job
      const speed = slotSpeedOf(r, i)
      const offer = slotUpgradeOffer(r, i)
      const card = el('article', { class: `research-slot${job ? ' is-upgrading' : project ? ' is-busy' : ''}` })

      const top = el(
        'div',
        { class: 'research-slot-top' },
        el('span', { class: 'research-slot-no', text: `SLOT ${String(i + 1).padStart(2, '0')}` }),
        el('span', { class: 'research-slot-speed', text: `×${speed.toFixed(2)}` }),
      )
      card.append(top)

      if (job) {
        const pct = Math.min(100, (job.progress / Math.max(0.01, job.months)) * 100)
        card.append(
          el('div', { class: 'research-slot-title', text: `升级至 Lv.${job.targetLevel}` }),
          el('div', { class: 'research-slot-note', text: `槽位锁定 · ${job.progress.toFixed(1)} / ${job.months} 个月` }),
          meter(pct, 'upgrade'),
        )
      } else if (project) {
        const pct = Math.min(100, (project.progress / Math.max(0.01, project.months)) * 100)
        const tech = TECH_BY_ID.get(`${project.ladder}.${project.tier}`)
        card.append(
          el('div', { class: 'research-slot-title', text: tech?.name ?? project.ladder }),
          el('div', {
            class: 'research-slot-note',
            text: `${project.progress.toFixed(1)} / ${project.months.toFixed(1)} 槽月 · 完成后 Lv.${slot.level} 槽释放`,
          }),
          meter(pct, 'project'),
        )
      } else {
        card.append(
          el('div', { class: 'research-slot-title', text: '空闲' }),
          el('div', { class: 'research-slot-note', text: '可以在右侧选择一项技术开工' }),
        )
      }

      if (offer) {
        const btn = el('button', {
          class: 'research-slot-action',
          type: 'button',
          'data-slot-upgrade': String(i),
          disabled: job || project || state.cash < offer.cost ? 'disabled' : undefined,
        })
        btn.append(
          el('span', { text: `升级 Lv.${offer.level + 1}` }),
          el('span', { class: 'research-slot-cost', text: `${money(offer.cost)} · ${offer.months} 月` }),
        )
        btn.title = `升级后本槽速度 ×${slotLevelSpeed(offer.level + 1).toFixed(2)}`
        card.append(btn)
      } else {
        card.append(el('div', { class: 'research-slot-max', text: `已满级 Lv.${MAX_SLOT_LEVEL}` }))
      }
      slotsList.append(card)
    }

    unlockWrap.replaceChildren()
    if (r.build) {
      const pct = Math.min(100, (r.build.progress / Math.max(0.01, r.build.months)) * 100)
      unlockWrap.append(
        el('div', { class: 'research-unlock-head' }, el('span', { text: `第 ${r.build.target} 个槽建造中` }), el('span', { text: `${r.build.months} 个月` })),
        el('div', { class: 'research-slot-note', text: `${r.build.progress.toFixed(1)} / ${r.build.months} 个月 · 已付 ${money(r.build.cost)}` }),
        meter(pct, 'build'),
      )
    } else {
      const offer = slotUnlockOffer(r)
      if (!offer) {
        unlockWrap.append(el('div', { class: 'research-unlock-max', text: `${MAX_RESEARCH_SLOTS} / ${MAX_RESEARCH_SLOTS} 槽全部打开` }))
      } else {
        const btn = el('button', {
          class: 'research-unlock-btn',
          type: 'button',
          'data-slot-unlock': '1',
          disabled: state.cash < offer.cost ? 'disabled' : undefined,
        })
        btn.append(
          el('span', { text: `打开第 ${offer.target} 个科研槽` }),
          el('span', { class: 'research-slot-cost', text: `${money(offer.cost)} · ${offer.months} 月` }),
        )
        unlockWrap.append(btn)
      }
    }
    unlockWrap.append(
      el('p', {
        class: 'research-slot-foot',
        text: '占位经济：解锁与升级费用/工期等经济系统统一设计后再调。升级期间该槽不可用。',
      }),
    )
  }

  function renderCards(): void {
    const state = opts.getState()
    const year = dateOf(state.day).year
    for (const [id, card] of cards) {
      const tech = TECH_BY_ID.get(id)
      if (!tech) continue
      const s = techStateOf(state, tech)
      const mult = effortMult(tech.year, year)
      card.className = `tech-card is-${s}${mult > 1.001 ? ' is-early' : mult < 0.999 ? ' is-catchup' : ''}${isHorizon(tech) ? ' is-horizon' : ''}`
      const name = tech.name
      const yearText = String(tech.year)
      const badge = mult > 1.001 ? `×${mult.toFixed(1)}` : mult < 0.999 ? `−${Math.round((1 - mult) * 100)}%` : ''
      card.replaceChildren(
        el('span', { class: 'tech-card-name', text: name }),
        el('span', { class: 'tech-card-year', text: yearText }),
      )
      if (badge) {
        card.append(el('span', { class: 'tech-card-badge', text: badge }))
        card.title = `${tech.effect}（当前系数 ${mult.toFixed(2)}）`
      }
    }
    const pct = posOf(year)
    nowLine.style.left = `calc(${pct.toFixed(3)}% + ${(150 * (1 - pct / 100)).toFixed(2)}px)`
    nowLabel.textContent = String(year)
  }

  function renderTreeHead(): void {
    const state = opts.getState()
    const done = TECH.filter((t) => isMastered(state, t.id)).length
    const open = TECH.filter((t) => techStateOf(state, t) === 'open').length
    treeHead.replaceChildren(
      el(
        'div',
        { class: 'tech-tree-title' },
        el('span', { class: 'research-kicker', text: 'TECH TREE / 1912—2020' }),
        el('h2', { text: '科技树' }),
      ),
      el(
        'div',
        { class: 'tech-tree-stats' },
        el('span', { text: `已掌握 ${done}` }),
        el('span', { text: `可开工 ${open}` }),
        el('span', { text: `${TECH.length} 项` }),
      ),
      el(
        'div',
        { class: 'tech-legend' },
        el('span', { class: 'tech-legend-item is-done', text: '已掌握' }),
        el('span', { class: 'tech-legend-item is-open', text: '可开工' }),
        el('span', { class: 'tech-legend-item is-locked', text: '未解锁' }),
        el('span', { class: 'tech-legend-item is-early', text: '超前 ×' }),
        el('span', { class: 'tech-legend-item is-catchup', text: '扩散 −%' }),
      ),
    )
  }

  function drawLinks(): void {
    if (linksFrame) cancelAnimationFrame(linksFrame)
    linksFrame = requestAnimationFrame(() => {
      linksFrame = 0
      if (!canvas.isConnected) return
      const canvasRect = canvas.getBoundingClientRect()
      const width = Math.max(1, canvas.scrollWidth)
      const height = Math.max(1, canvas.scrollHeight)
      links.setAttribute('viewBox', `0 0 ${width} ${height}`)
      links.setAttribute('width', String(width))
      links.setAttribute('height', String(height))
      links.replaceChildren()
      const pos = (id: string): { x: number; y: number; w: number; h: number } | null => {
        const card = cards.get(id)
        if (!card) return null
        const r = card.getBoundingClientRect()
        return { x: r.left - canvasRect.left, y: r.top - canvasRect.top, w: r.width, h: r.height }
      }
      for (const tech of TECH) {
        const target = pos(tech.id)
        if (!target) continue
        for (const needId of tech.needs) {
          const source = pos(needId)
          if (!source) continue
          const x1 = source.x + source.w / 2
          const y1 = source.y + source.h
          const x2 = target.x + target.w / 2
          const y2 = target.y
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          const bend = Math.max(12, Math.min(80, (y2 - y1) / 2))
          path.setAttribute('d', `M${x1.toFixed(1)},${y1.toFixed(1)} C${x1.toFixed(1)},${(y1 + bend).toFixed(1)} ${x2.toFixed(1)},${(y2 - bend).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`)
          path.setAttribute('class', `tech-link${isMastered(opts.getState(), needId) ? ' is-lit' : ''}`)
          links.append(path)
        }
      }
    })
  }

  function renderModal(): void {
    if (!selected) return
    const state = opts.getState()
    const tech = selected
    const year = dateOf(state.day).year
    const s = techStateOf(state, tech)
    const effort = effortForTier(state, tech)
    const freeSlot = state.research.slots.findIndex((_, i) => slotIsFree(state.research, i))
    const slowest = freeSlot >= 0 ? freeSlot : 0
    const slotSpeed = slotSpeedOf(state.research, slowest)
    const intensity = intensityAt(year)
    const actual = effort.months / Math.max(0.01, slotSpeed * intensity)
    const finish = dateOf(Math.min(state.day + Math.round(actual * DAYS_PER_MONTH), 28_124))
    const missing = missingNeeds(state, tech)
    const canStart = s === 'open' && freeSlot >= 0 && state.cash >= effort.cost && !state.over

    const multText =
      effort.mult > 1.001
        ? `超前惩罚 ×${effort.mult.toFixed(2)}`
        : effort.mult < 0.999
          ? `扩散补偿 ×${effort.mult.toFixed(2)}`
          : '无时间修正'

    modalCard.replaceChildren(
      el('button', { class: 'tech-modal-close', type: 'button', 'data-modal-close': '1', text: '×' }),
      el('span', { class: 'tech-modal-kicker', text: `${BOARD_NAMES[tech.board]} / ${LADDER_NAMES[tech.ladder] ?? tech.ladder}` }),
      el('h2', { text: tech.name }),
      el('div', { class: 'tech-modal-meta' }, el('span', { text: `${tech.year} 年` }), el('span', { text: `第 ${tech.tier} 代` }), el('span', { class: `tech-state is-${s}`, text: statusLabel(s) })),
      el('p', { class: 'tech-modal-effect', text: tech.effect }),
      el(
        'div',
        { class: 'tech-modal-calc' },
        calcRow('基础工期', monthsLabel(tech.months)),
        calcRow('时间修正', `${multText} · ${monthsLabel(effort.months)}`),
        calcRow('槽位速度', freeSlot >= 0 ? `第 ${slowest + 1} ×${slotSpeed.toFixed(2)}` : '没有空闲槽位'),
        calcRow('时代强度', `×${intensity.toFixed(2)}`),
        calcRow('预计研发', `${actual.toFixed(1)} 个月`, 'is-highlight'),
        calcRow('预计完成', `${finish.year}年${finish.month}月${finish.day}日`),
        calcRow('研发费用', money(effort.cost), 'is-highlight'),
      ),
      missing.length > 0
        ? el('div', { class: 'tech-modal-prereq' }, el('span', { text: '还缺前置：' }), el('span', { text: missing.map((t) => t.name).join('、') }))
        : el('div', { class: 'tech-modal-prereq is-ok', text: '前置全部满足。' }),
      el('div', { class: 'tech-modal-actions' }, startButton(tech, canStart, s, freeSlot, effort.cost, state.cash)),
    )
    modal.hidden = false
  }

  function calcRow(label: string, value: string, extra = ''): HTMLElement {
    return el('div', { class: `tech-calc-row ${extra}` }, el('span', { text: label }), el('strong', { text: value }))
  }

  function startButton(
    tech: TechTier,
    canStart: boolean,
    s: TechState,
    freeSlot: number,
    cost: number,
    cash: number,
  ): HTMLButtonElement {
    const label = s === 'done' ? '已掌握' : s === 'researching' ? '这条梯子已经在研' : freeSlot < 0 ? '没有空闲科研槽' : cash < cost ? '现金不足' : '开始研发'
    const btn = el('button', {
      class: 'tech-modal-start',
      type: 'button',
      'data-tech-start': tech.id,
      disabled: canStart ? undefined : 'disabled',
      text: label,
    })
    return btn
  }

  function meter(pct: number, kind: 'project' | 'upgrade' | 'build'): HTMLElement {
    const fill = el('div', { class: 'research-meter-fill' })
    fill.style.width = `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`
    return el('div', { class: `research-meter is-${kind}` }, fill)
  }

  function openTech(id: string): void {
    const tech = TECH_BY_ID.get(id)
    if (!tech) return
    selected = tech
    renderModal()
  }

  function closeModal(): void {
    selected = null
    modal.hidden = true
  }

  treeScroll.addEventListener('click', (event) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('.tech-card')
    const id = card?.dataset.techId
    if (id) openTech(id)
  })

  slotsPanel.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    const upgrade = target.closest<HTMLElement>('[data-slot-upgrade]')
    if (upgrade) {
      const index = Number(upgrade.dataset.slotUpgrade)
      const res = startSlotUpgrade(opts.getState(), index)
      if (!res.ok) opts.onError(res.msg)
      else opts.onChange()
      return
    }
    const unlock = target.closest<HTMLElement>('[data-slot-unlock]')
    if (unlock) {
      const res = startSlotUnlock(opts.getState())
      if (!res.ok) opts.onError(res.msg)
      else opts.onChange()
    }
  })

  modal.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    if (target === modal || target.closest('[data-modal-close]')) {
      closeModal()
      return
    }
    const start = target.closest<HTMLElement>('[data-tech-start]')
    if (start) {
      const id = start.dataset.techStart
      if (!id) return
      const res = startResearch(opts.getState(), id)
      if (!res.ok) {
        opts.onError(res.msg)
        return
      }
      closeModal()
      opts.onChange()
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) closeModal()
  })

  const onResize = (): void => drawLinks()
  window.addEventListener('resize', onResize)

  buildTree()

  function render(): void {
    renderTreeHead()
    renderSlots()
    renderCards()
    if (selected) renderModal()
    if (!linksDrawn) {
      linksDrawn = true
      drawLinks()
    }
  }

  return {
    root,
    render,
  }
}


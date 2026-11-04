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
import { NATIONS, NATION_BY_ID } from '../data/nations'
import { PLAYABLE_NATION_IDS, flagSvg, type PlayableNationId } from '../data/nation-profiles'
import { worldAt, type WorldTank } from '../data/world'
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
import { readAdopted, writeDraft, clearDraft } from '../../platform/design-handoff'
import { COMPANY_KEY, COMPANY_NAME_MAX, readCompany, writeCompany, type Company } from '../../platform/company'
import { LEGACY_SAVE_KEYS, SAVE_KEY } from '../../platform/save-keys'
import { writeTech } from '../../platform/tech-handoff'
import type { SaveStore } from '../../platform/storage'

const SPEEDS = [1, 3, 10, 30] as const
const RENDER_INTERVAL_MS = 70
const FEED_LIMIT = 60

type PauseReason = 'manual' | 'event' | 'contract' | 'research' | 'cash' | 'deadline' | 'ended'

export interface GameOptions {
  storage: SaveStore
  seed?: () => number
  /** 测试 / 截图时可以关掉首次建厂登记；正式入口默认开启。 */
  founder?: boolean
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
  const params = new URLSearchParams(location.search)
  const dayParam = params.get('day')
  const forced =
    dayParam === null ? null : Math.max(0, Math.min(TOTAL_DAYS - 1, Math.floor(Number(dayParam)) || 0))
  const viewParam = params.get('view')
  // 新游戏从国家选择页带 ?home=usa 进来；只影响新开局，不覆盖已有存档里的国家。
  const homeParam = params.get('home')
  const home = homeParam && NATION_BY_ID.has(homeParam as never) ? homeParam : 'fra'
  const saved =
    storage.read(SAVE_KEY) ??
    LEGACY_SAVE_KEYS.map((k) => storage.read(k)).find((v): v is string => typeof v === 'string') ??
    null
  let state: GameState = (forced === null ? decodeSave(saved) : null) ?? createGame(seed(), home)
  if (forced !== null && forced > 0) advanceDays(state, forced)
  // 老存档 / 新开局都可能没有标；没有在手订单就按当前时代补一批。
  refreshOffers(state)

  let company: Company | null = readCompany(storage)
  type DashboardView = 'home' | 'research' | 'manufacture' | 'trade'
  let view: DashboardView = 'home'
  let selectedCountry: PlayableNationId | null = null
  let countrySig = ''
  let companySig = ''
  let founderOpen = false
  let founderEditing = false

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
  const reportBtn = el('button', { class: 'chip chip-report', text: '报告' })
  reportBtn.hidden = true

  const topbar = el(
    'header',
    { class: 'topbar' },
    el('div', { class: 'clock' }, dateText, eraText),
    el('div', { class: 'clock-right' }, clockMeta),
    el('div', { class: 'speed' }, pauseBtn, ...speedButtons, reportBtn, jumpBtn),
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
  const designBtn = el('button', { class: 'chip chip-design', type: 'button' }, '设计本厂车 →')
  designBtn.addEventListener('click', openDesigner)
  const designRow = el('div', { class: 'design-row' }, designBtn)

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

  const factoryPanel = el(
    'section',
    { class: 'panel factory-panel' },
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
    designRow,
    adoptRow,
  )
  const ordersPanel = el('section', { class: 'panel orders-panel' }, el('h2', { text: '订单' }), offersWrap, contractWrap)
  const situationPanel = el(
    'section',
    { class: 'panel' },
    el('h2', { text: '局势' }),
    el('div', { class: 'bar-row' }, threatWrap, threatWord),
    eraBlurb,
  )

  // ── 主界面：厂牌、四个局、世界态势、国家编制、事件记录 ─────────

  const companyLogo = el('button', {
    class: 'company-logo',
    type: 'button',
    'aria-label': '修改厂牌',
  })
  const companyName = el('h1', { class: 'company-name' })
  const companyMeta = el('span', { class: 'company-meta' })
  const companyEdit = el('button', { class: 'company-edit', type: 'button', text: '改名 / 换 logo' })
  companyLogo.addEventListener('click', () => openFounder(true))
  companyEdit.addEventListener('click', () => openFounder(true))
  const companyBrand = el(
    'div',
    { class: 'company-brand' },
    companyLogo,
    el(
      'div',
      { class: 'company-text' },
      el('span', { class: 'company-kicker', text: 'YOUR WORKS / 本厂' }),
      companyName,
      companyMeta,
    ),
    companyEdit,
  )

  const dashCash = el('strong', { class: 'dash-value dash-cash' })
  const dashRep = el('strong', { class: 'dash-value' })
  const dashDebt = el('strong', { class: 'dash-value' })
  const dashProduct = el('strong', { class: 'dash-value' })
  const dashStat = (key: string, value: HTMLElement): HTMLElement =>
    el('div', { class: 'dash-stat' }, el('span', { class: 'dash-key', text: key }), value)
  const dashTop = el(
    'div',
    { class: 'dash-top' },
    companyBrand,
    el('div', { class: 'dash-stats' }, dashStat('现金', dashCash), dashStat('信誉', dashRep), dashStat('债务', dashDebt), dashStat('产品', dashProduct)),
  )

  const researchMeta = el('span', { class: 'bureau-meta' })
  const designMeta = el('span', { class: 'bureau-meta' })
  const manufactureMeta = el('span', { class: 'bureau-meta' })
  const tradeMeta = el('span', { class: 'bureau-meta' })
  const bureauCard = (
    id: string,
    index: string,
    title: string,
    en: string,
    glyph: string,
    meta: HTMLElement,
    onOpen: () => void,
  ): HTMLElement => {
    const btn = el(
      'button',
      { class: `bureau-card bureau-${id}`, type: 'button', 'data-bureau': id },
      el('span', { class: 'bureau-index', text: index }),
      el('span', { class: 'bureau-glyph', text: glyph }),
      el('span', { class: 'bureau-title', text: title }),
      el('span', { class: 'bureau-en', text: en }),
      meta,
      el('span', { class: 'bureau-arrow', text: '→' }),
    )
    btn.addEventListener('click', onOpen)
    return btn
  }
  const bureauGrid = el(
    'div',
    { class: 'bureau-grid' },
    bureauCard('research', '01', '研发局', 'RESEARCH', 'R', researchMeta, () => setView('research')),
    bureauCard('design', '02', '设计局', 'DESIGN', 'D', designMeta, openDesigner),
    bureauCard('manufacture', '03', '制造局', 'MANUFACTURE', 'M', manufactureMeta, () => setView('manufacture')),
    bureauCard('trade', '04', '贸易局', 'TRADE', 'T', tradeMeta, () => setView('trade')),
  )

  const countryList = el('div', { class: 'country-scroll' })
  const countryColumn = el(
    'aside',
    { class: 'country-column' },
    el(
      'div',
      { class: 'column-head' },
      el('span', { class: 'column-kicker', text: 'ARMORED INVENTORY' }),
      el('strong', { class: 'column-title', text: '国家编制' }),
      el('span', { class: 'column-count', text: '9' }),
    ),
    countryList,
    el('p', { class: 'column-foot', text: '数量与四维为占位估算，待接真实编制档案。' }),
  )

  const mapYear = el('strong', { class: 'map-year' })
  const mapEra = el('span', { class: 'map-era' })
  const mapPanel = el(
    'section',
    { class: 'map-column' },
    el(
      'div',
      { class: 'map-head' },
      el('div', { class: 'map-head-left' }, el('span', { class: 'column-kicker', text: 'WORLD THEATER' }), el('strong', { class: 'column-title', text: '世界态势' })),
      el('div', { class: 'map-head-right' }, mapYear, mapEra),
    ),
    el(
      'div',
      { class: 'map-frame' },
      el('div', { class: 'map-grid' }),
      el('div', { class: 'map-scan' }),
      el('span', { class: 'map-corner tl' }),
      el('span', { class: 'map-corner tr' }),
      el('span', { class: 'map-corner bl' }),
      el('span', { class: 'map-corner br' }),
      el(
        'div',
        { class: 'map-center' },
        el('span', { class: 'map-center-kicker', text: 'STRATEGIC MAP / OFFLINE' }),
        el('strong', { class: 'map-center-title', text: '动态世界地图' }),
        el('span', { class: 'map-center-note', text: '国界轮廓 / 阵营色块 / 战线推移' }),
        el('span', { class: 'map-center-tag', text: '位置已预留 · 地图逻辑后续接入' }),
      ),
      el('span', { class: 'map-coord', text: 'LAT 35°N · LON 20°E · GRID 24' }),
    ),
    el(
      'div',
      { class: 'map-legend' },
      el('span', { class: 'legend-title', text: '图例' }),
      el('span', { class: 'legend-item' }, el('i', { class: 'legend-dot amber' }), '同盟'),
      el('span', { class: 'legend-item' }, el('i', { class: 'legend-dot red' }), '轴心'),
      el('span', { class: 'legend-item' }, el('i', { class: 'legend-dot cyan' }), '中立'),
      el('span', { class: 'legend-note', text: '待历史节点驱动' }),
    ),
  )

  const eventCount = el('span', { class: 'column-count' })
  const feedList = el('ol', { class: 'feed-list event-list' })
  const eventColumn = el(
    'aside',
    { class: 'event-column' },
    el(
      'div',
      { class: 'column-head' },
      el('span', { class: 'column-kicker', text: 'FIELD LOG' }),
      el('strong', { class: 'column-title', text: '事件记录' }),
      eventCount,
    ),
    el(
      'div',
      { class: 'event-legend' },
      el('span', { class: 'event-key' }, el('i', { class: 'legend-dot amber' }), '历史大事件'),
      el('span', { class: 'event-key' }, el('i', { class: 'legend-dot pale' }), '厂内事件'),
    ),
    feedList,
  )

  const dashboard = el(
    'section',
    { class: 'dashboard' },
    dashTop,
    bureauGrid,
    el('div', { class: 'dashboard-grid' }, countryColumn, mapPanel, eventColumn),
  )

  function bureauPage(id: string, title: string, en: string, sub: string, ...content: Node[]): HTMLElement {
    const back = el('button', { class: 'bureau-back', type: 'button', text: '← 返回主界面' })
    back.addEventListener('click', () => setView('home'))
    return el(
      'section',
      { class: `bureau-page bureau-page-${id} hidden`, 'data-view': id },
      el(
        'div',
        { class: 'bureau-head' },
        back,
        el(
          'div',
          { class: 'bureau-head-text' },
          el('span', { class: 'bureau-en', text: en }),
          el('h1', { text: title }),
          el('p', { text: sub }),
        ),
        el('span', { class: 'bureau-head-index', text: id === 'research' ? '01' : id === 'manufacture' ? '03' : '04' }),
      ),
      el('div', { class: 'bureau-body' }, ...content),
    )
  }

  function bureauAside(kicker: string, title: string, body: string, lines: readonly string[]): HTMLElement {
    return el(
      'aside',
      { class: 'bureau-aside' },
      el('span', { class: 'bureau-aside-kicker', text: kicker }),
      el('h3', { text: title }),
      el('p', { class: 'bureau-aside-body', text: body }),
      el('ul', { class: 'bureau-aside-list' }, ...lines.map((line) => el('li', { text: line }))),
    )
  }

  const researchPage = bureauPage(
    'research',
    '研发局',
    'RESEARCH BUREAU',
    '把时间换成技术。项目在跑的时候，槽位才收月维持费。',
    el(
      'div',
      { class: 'bureau-with-aside' },
      researchPanel,
      bureauAside('RESEARCH NOTES', '研究纪律', '技术是唯一会自己长大的资产，但它只在你付钱的时候长大。', [
        '项目在跑才收槽位月维持费；空槽不扣。',
        '超前研究更贵，落后研究有折扣。',
        '先补材料与火炮，再碰超前项目。',
      ]),
    ),
  )
  const manufacturePage = bureauPage(
    'manufacture',
    '制造局',
    'MANUFACTURE BUREAU',
    '产品、产线、人力与料价。接单之后，这里决定几天出一台车。',
    el('div', { class: 'bureau-grid-inner' }, factoryPanel, el('div', { class: 'bureau-stack' }, linesPanel, situationPanel)),
  )
  const tradePage = bureauPage(
    'trade',
    '贸易局',
    'TRADE BUREAU',
    '招标、竞品、压价、贿赂与回款。订单不是等来的，是抢来的。',
    el(
      'div',
      { class: 'bureau-with-aside' },
      ordersPanel,
      bureauAside('TRADE NOTES', '成交纪律', '标只按指标验收，不看车名。你的车够不够格，数字说了算。', [
        '竞品会逐年成长、换届发车，每标都竞价。',
        '压价需要分数优势；贿赂付合同额 8%。',
        '信誉影响报价与授信；未消账会被年度审计。',
      ]),
    ),
  )

  const pageHost = el('div', { class: 'page-host' }, dashboard, researchPage, manufacturePage, tradePage)
  const stage = el('main', { class: 'stage' }, pageHost)

  // ── 首次建厂登记：厂名 + 白板手绘 logo ─────────────────────

  const founderName = el('input', {
    class: 'founder-name',
    type: 'text',
    maxlength: String(COMPANY_NAME_MAX),
    placeholder: '例如：江北机车厂',
    autocomplete: 'off',
    spellcheck: 'false',
  })
  const founderPad = el('canvas', { class: 'founder-pad', width: '560', height: '260' })
  const founderHint = el('p', { class: 'founder-hint', text: '名字必填；logo 可以稍后再补。' })
  const founderClear = el('button', { class: 'founder-tool', type: 'button', text: '清空白板' })
  const founderCancel = el('button', { class: 'founder-cancel', type: 'button', text: '取消' })
  const founderSubmit = el('button', { class: 'founder-submit', type: 'button', text: '完成，开工' })
  const founderOverlay = el(
    'div',
    { class: 'founder-overlay' },
    el(
      'div',
      { class: 'founder-card' },
      el(
        'div',
        { class: 'founder-head' },
        el('span', { class: 'founder-kicker', text: 'FOUNDING PAPERS / 建厂登记' }),
        el('h2', { text: '给你的坦克厂起个名字' }),
        el('p', { text: '这块牌子会挂在主界面左上角。logo 用白板手绘，画歪了也算你的。' }),
      ),
      el(
        'div',
        { class: 'founder-grid' },
        el(
          'label',
          { class: 'founder-field' },
          el('span', { class: 'founder-label', text: '厂名' }),
          founderName,
        ),
        el(
          'div',
          { class: 'founder-pad-wrap' },
          el('div', { class: 'founder-pad-head' }, el('span', { class: 'founder-label', text: '手绘 logo' }), founderClear),
          founderPad,
          el('span', { class: 'founder-pad-note', text: '白板 · 直接画' }),
        ),
      ),
      founderHint,
      el('div', { class: 'founder-actions' }, founderCancel, founderSubmit),
    ),
  )

  let founderCtx: CanvasRenderingContext2D | null = null
  let founderDirty = false
  let founderDrawing = false
  let lastX = 0
  let lastY = 0

  function paintPad(): void {
    if (!founderCtx) return
    founderCtx.fillStyle = '#f3f0e7'
    founderCtx.fillRect(0, 0, founderPad.width, founderPad.height)
    founderDirty = false
  }

  try {
    founderCtx = founderPad.getContext('2d')
  } catch {
    founderCtx = null
  }
  if (founderCtx) {
    paintPad()
    founderCtx.lineWidth = 6
    founderCtx.lineCap = 'round'
    founderCtx.lineJoin = 'round'
    founderCtx.strokeStyle = '#15181d'
    const point = (e: PointerEvent): [number, number] => {
      const r = founderPad.getBoundingClientRect()
      const x = ((e.clientX - r.left) / Math.max(1, r.width)) * founderPad.width
      const y = ((e.clientY - r.top) / Math.max(1, r.height)) * founderPad.height
      return [x, y]
    }
    founderPad.addEventListener('pointerdown', (e) => {
      if (!founderCtx) return
      e.preventDefault()
      founderDrawing = true
      founderDirty = true
      const [x, y] = point(e)
      lastX = x
      lastY = y
      founderCtx.beginPath()
      founderCtx.moveTo(x, y)
      founderCtx.lineTo(x + 0.1, y + 0.1)
      founderCtx.stroke()
      try {
        founderPad.setPointerCapture(e.pointerId)
      } catch {
        /* 某些环境没有指针捕获 */
      }
    })
    founderPad.addEventListener('pointermove', (e) => {
      if (!founderDrawing || !founderCtx) return
      e.preventDefault()
      const [x, y] = point(e)
      founderCtx.beginPath()
      founderCtx.moveTo(lastX, lastY)
      founderCtx.lineTo(x, y)
      founderCtx.stroke()
      lastX = x
      lastY = y
    })
    const stop = (): void => {
      founderDrawing = false
    }
    founderPad.addEventListener('pointerup', stop)
    founderPad.addEventListener('pointerleave', stop)
    founderPad.addEventListener('pointercancel', stop)
  } else {
    founderPad.classList.add('no-canvas')
    founderHint.textContent = '这个浏览器不支持白板手绘；先起名字，logo 可以以后再补。'
  }

  founderClear.addEventListener('click', () => {
    if (!founderCtx) return
    paintPad()
    founderHint.textContent = founderEditing ? '白板已清空；不画的话保留原 logo。' : '白板已清空。'
  })

  founderName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') founderSubmit.click()
  })

  function closeFounder(): void {
    founderOpen = false
    founderOverlay.classList.remove('show')
  }

  function openFounder(editing: boolean): void {
    if (state.over) return
    founderEditing = editing
    founderOpen = true
    founderName.value = company?.name ?? ''
    founderCancel.hidden = !editing
    founderHint.textContent = editing
      ? '改名或重画 logo；不画的话保留原来的 logo。'
      : '名字必填；logo 可以稍后再补。'
    if (founderCtx) paintPad()
    founderOverlay.classList.add('show')
    window.setTimeout(() => founderName.focus(), 30)
  }

  founderSubmit.addEventListener('click', () => {
    const name = founderName.value.trim()
    if (!name) {
      founderHint.textContent = '先给厂子起个名字，哪怕叫「无名坦克厂」。'
      founderName.focus()
      return
    }
    const logo = founderDirty && founderCtx ? founderPad.toDataURL('image/png') : (company?.logo ?? '')
    const next: Company = { name: name.slice(0, COMPANY_NAME_MAX), logo }
    if (!writeCompany(storage, next)) {
      founderHint.textContent = '浏览器不允许写本地存储，厂牌存不下来。'
      return
    }
    company = next
    founderDirty = false
    companySig = ''
    closeFounder()
    renderCompany()
    render()
  })

  founderCancel.addEventListener('click', () => {
    if (founderEditing) closeFounder()
  })
  founderOverlay.addEventListener('click', (e) => {
    if (e.target === founderOverlay && founderEditing) closeFounder()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && founderOpen && founderEditing) closeFounder()
  })

  const flash = el('div', { class: 'flash' })
  const banner = el('div', { class: 'banner' })
  const pausedTag = el('div', { class: 'paused-tag', text: '已暂停' })
  const endTitle = el('h2', { class: 'end-title' })
  const endBody = el('div', { class: 'end-body' })
  const endCloseBtn = el('button', { class: 'end-btn', type: 'button', text: '查看厂子' })
  const endRestartBtn = el('button', { class: 'end-btn end-btn-primary', type: 'button', text: '重新开一局' })
  const endActions = el('div', { class: 'end-actions' }, endCloseBtn, endRestartBtn)
  const endOverlay = el(
    'div',
    { class: 'end-overlay' },
    el('div', { class: 'end-card' }, endTitle, endBody, endActions),
  )
  let endDismissed = false

  endCloseBtn.addEventListener('click', () => {
    endDismissed = true
    endOverlay.classList.remove('show')
  })
  endRestartBtn.addEventListener('click', () => {
    try {
      storage.remove(SAVE_KEY)
      for (const key of LEGACY_SAVE_KEYS) storage.remove(key)
      storage.remove('tank-works.tech.v1')
      storage.remove('tank-works.design.v1')
    } catch {
      /* 存储不可用也照样刷新，至少能回到新局 */
    }
    try {
      location.reload()
    } catch {
      /* happy-dom 等环境没有 reload；测试不点这个按钮 */
    }
  })
  reportBtn.addEventListener('click', () => {
    endDismissed = false
    renderEnd()
  })

  root.append(
    el(
      'div',
      { class: 'game' },
      topbar,
      timeline,
      banner,
      stage,
      flash,
      pausedTag,
      founderOverlay,
      endOverlay,
    ),
  )

  // ── 交互 ─────────────────────────────────────────────────

  function setView(next: DashboardView): void {
    view = next
    dashboard.classList.toggle('hidden', view !== 'home')
    researchPage.classList.toggle('hidden', view !== 'research')
    manufacturePage.classList.toggle('hidden', view !== 'manufacture')
    tradePage.classList.toggle('hidden', view !== 'trade')
    if (view === 'home') renderDashboard()
  }

  function renderCompany(): void {
    const name = company?.name || '未命名坦克厂'
    const sig = `${name}:${company?.logo.length ?? 0}`
    if (sig === companySig) return
    companySig = sig
    companyName.textContent = name
    const nation = NATIONS.find((n) => n.id === state.home)?.name ?? state.home
    companyMeta.textContent = `${nation} · ${company ? (company.logo ? '手绘厂牌' : '厂牌已登记') : '等待建厂登记'}`
    companyLogo.replaceChildren()
    if (company?.logo) {
      const img = el('img', { class: 'company-logo-img', src: company.logo, alt: '' })
      companyLogo.append(img)
    } else {
      companyLogo.append(el('span', { class: 'company-logo-fallback', text: Array.from(name)[0] ?? '?' }))
    }
    companyLogo.classList.toggle('has-logo', Boolean(company?.logo))
  }

  function countryCard(id: PlayableNationId, total: number, tanks: WorldTank[], year: number): HTMLElement {
    const nation = NATION_BY_ID.get(id)
    const flag = el('span', { class: 'country-flag' })
    flag.innerHTML = flagSvg(id)
    const expanded = selectedCountry === id
    const card = el(
      'button',
      {
        class: `country-card${expanded ? ' open' : ''}`,
        type: 'button',
        'data-country': id,
        'aria-expanded': expanded ? 'true' : 'false',
      },
      flag,
      el(
        'span',
        { class: 'country-main' },
        el('span', { class: 'country-name', text: nation?.name ?? id }),
        el('span', { class: 'country-en', text: nation?.id.toUpperCase() ?? id.toUpperCase() }),
      ),
      el(
        'span',
        { class: 'country-total' },
        el('strong', { text: num(total) }),
        el('em', { text: '台' }),
      ),
    )
    card.addEventListener('click', () => {
      selectedCountry = selectedCountry === id ? null : id
      countrySig = ''
      renderCountries()
    })

    const item = el('div', { class: `country-item${expanded ? ' open' : ''}` }, card)
    if (!expanded) return item

    const detail = el(
      'div',
      { class: 'country-detail' },
      el('div', { class: 'country-detail-head' }, el('span', { text: `现役编制 · ${year}` }), el('span', { text: `${tanks.length} 型` })),
    )
    if (tanks.length === 0) {
      detail.append(el('p', { class: 'country-empty', text: '尚未列装坦克。' }))
    } else {
      for (const t of tanks) {
        detail.append(
          el(
            'div',
            { class: 'tank-row' },
            el(
              'div',
              { class: 'tank-row-top' },
              el('span', { class: 'tank-name' }, t.name, t.estimated ? el('i', { class: 'tank-est', text: '估' }) : ''),
              el('span', { class: 'tank-qty', text: `× ${num(t.qty)}` }),
            ),
            el(
              'div',
              { class: 'tank-dims' },
              el('span', {}, '装 ', el('b', { text: num(t.armor) })),
              el('span', {}, '火 ', el('b', { text: num(t.pen) })),
              el('span', {}, '机 ', el('b', { text: num(t.offroad) })),
              el('span', {}, '适 ', el('b', { text: num(t.adapt) })),
              el('span', { class: 'tank-score' }, '总分 ', el('b', { text: num(t.total) })),
            ),
          ),
        )
      }
    }
    item.append(detail)
    return item
  }

  function renderCountries(): void {
    const year = dateOf(state.day).year
    const sig = `${year}:${selectedCountry ?? ''}`
    if (sig === countrySig) return
    countrySig = sig
    countryList.replaceChildren()
    for (const id of PLAYABLE_NATION_IDS) {
      const inv = worldAt(id, year)
      countryList.append(countryCard(id, inv.total, inv.tanks, year))
    }
  }

  function renderDashboard(): void {
    renderCompany()
    dashCash.textContent = money(state.cash)
    dashRep.textContent = `${state.rep} / 100`
    dashDebt.textContent = state.debt > 0 ? money(state.debt) : '无'
    dashProduct.textContent = state.design.name

    const projects = state.research.projects.length
    researchMeta.textContent = `${projects} 项在研 · ${slotsOf(state.research)} 槽`
    try {
      designMeta.textContent = `${state.design.name} · ${buildTank(state.design).score.total} 分`
    } catch {
      designMeta.textContent = state.design.name
    }
    const lines = state.factory?.lines.length ?? 0
    manufactureMeta.textContent = `${lines} 条产线 · 累计 ${num(state.stats.produced)} 台`
    tradeMeta.textContent = `${state.offers.length} 份标 · ${state.contract ? '在手 1 单' : '空闲'}`

    mapYear.textContent = String(dateOf(state.day).year)
    mapEra.textContent = ERAS[state.era]?.name ?? ''
    eventCount.textContent = `${state.log.length} 条`
    renderCountries()
  }

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

  function openDesigner(): void {
    if (state.contract) {
      showFlash({ d: state.day, k: 'note', t: '订单执行中，交完再改产品设计。' })
      return
    }
    if (state.over) return
    if (!writeDraft(state.design)) {
      showFlash({ d: state.day, k: 'note', t: '浏览器不允许写本地存储，设计局打不开。' })
      return
    }

    const closeBtn = el('button', { class: 'design-close', type: 'button', text: '× 关闭' })
    const frame = el('iframe', {
      class: 'design-frame',
      title: '设计本厂车',
      src: './tank.html?embedded=1',
    })
    const overlay = el(
      'div',
      { class: 'design-overlay' },
      el(
        'div',
        { class: 'design-bar' },
        el('div', { class: 'design-title' }, el('strong', { text: '设计本厂车' }), el('span', { text: '改完点「应用到本局」' })),
        closeBtn,
      ),
      frame,
    )

    let onMessage: ((e: MessageEvent) => void) | null = null
    const close = (): void => {
      if (onMessage) window.removeEventListener('message', onMessage)
      overlay.remove()
      clearDraft()
    }
    closeBtn.addEventListener('click', close)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close()
    })

    onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin) return
      const data = e.data as { type?: string; design?: GameState['design'] } | null
      if (!data || data.type !== 'tank-works:design' || !data.design) return
      const next = data.design
      try {
        buildTank(next)
      } catch {
        showFlash({ d: state.day, k: 'note', t: '这份设计的数据不完整，检查一下六个槽位。' })
        return
      }
      const gate = designCheck(next, state.research)
      if (!gate.ok) {
        showFlash({ d: state.day, k: 'note', t: `这辆车现在造不出来：${gate.reason}` })
        return
      }
      state.design = JSON.parse(JSON.stringify(next)) as typeof state.design
      pushLog(state, { d: state.day, k: 'note', t: `设计本厂车：改为「${next.name}」。` })
      close()
      candidateSig = ''
      offerSig = ''
      dirty = true
      render()
      save()
      showFlash({ d: state.day, k: 'note', t: `产品改成「${next.name}」；下次接单时换型。` })
    }
    window.addEventListener('message', onMessage)
    root.append(overlay)
  }

  function importAdopted(): void {
    if (state.contract) {
      showFlash({ d: state.day, k: 'note', t: '订单执行中，交完再换产品。' })
      return
    }
    const a = readAdopted()
    if (!a) {
      showFlash({ d: state.day, k: 'note', t: '还没有采用的设计；也可以直接点「设计本厂车」在本局设计。' })
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
    designBtn.disabled = state.contract !== null || state.over
    designBtn.title = state.contract ? '订单执行中不能改产品' : '打开设计局，改完直接应用到本局'

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
            el('span', { class: 'offer-ref', text: `${o.nation} · 招标` }),
            el('span', { class: 'offer-qty', text: `${o.qty} 台` }),
          ),
          el('div', { class: 'offer-need', text: needText(o) }),
          el('div', { class: 'offer-force', text: `需求 ${o.qty} 台 · 只按指标验收` }),
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
        el('span', { class: 'contract-ref', text: `${c.nation} · ${c.qty} 台` }),
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
    reportBtn.hidden = !state.over
    if (!state.over || endDismissed) {
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
    homeSelect.title = homeSelect.disabled ? '开工之后不能改国籍' : '换国家会重新招标'
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

    renderDashboard()
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

    if (!paused && !state.over && !founderOpen) {
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
  if (!company && opts.founder !== false) openFounder(false)
  if (viewParam === 'research' || viewParam === 'manufacture' || viewParam === 'trade') setView(viewParam)
  if (new URLSearchParams(location.search).get('design') === '1') window.setTimeout(openDesigner, 80)
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

/**
 * 制造局界面。
 *
 * 这一页回答三个问题，按从上到下的顺序：
 *   1. 我这条线现在在干什么？（进度、缺不缺料、几天出一台）
 *   2. 仓里还有几天料？（分材质、在途、容量）
 *   3. 按下去之后会怎样？（推 30 天 / 90 天 / 一年，看产量与单台成本）
 *
 * 资金是「试算资金」：整个游戏的钱还没有统一重定尺度，
 * 所以这里先按一个够用的数给，避免玩家连一台虎王都造不起。
 * 等设计局、游说局都齐了再统一。
 */

import { HISTORICAL } from '../data/historical'
import { MATERIAL_BY_ID } from '../data/parts'
import { buildTank } from '../model/build'
import type { ArmorMaterialId, Tank } from '../types'
import {
  LEAD_DAYS,
  addLine,
  advanceFactory,
  createFactory,
  expandWarehouse,
  inTransitKg,
  lineDailyHours,
  lineDailyUpkeep,
  lineDailyWage,
  lineUnitHours,
  orderMaterial,
  retoolLine,
  setStaff,
  specOf,
  startLine,
  stockOf,
  stopLine,
  totalStockKg,
  unitHoursAt,
} from '../sim/factory'
import type { FactoryState, ProductionLine } from '../sim/factory'

const START_CASH = 60_000_000
const START_YEAR = 1944
const START_MONTH = 1

interface Sample {
  day: number
  produced: number
  spent: number
  units: number
}

const SAMPLE_CACHE = new Map<string, Tank>()
function tankByName(name: string): Tank {
  const hit = SAMPLE_CACHE.get(name)
  if (hit) return hit
  const h = HISTORICAL.find((x) => x.name === name || x.design.name === name) ?? HISTORICAL[0]!
  const t = buildTank(h.design)
  SAMPLE_CACHE.set(name, t)
  return t
}

const OPTIONS = HISTORICAL.map((h) => ({ name: h.name, year: h.year }))

const money = (n: number): string =>
  (n < 0 ? '−¥' : '¥') + Math.abs(Math.round(n)).toLocaleString('en-US')
const tonnes = (kg: number): string => (kg / 1000).toFixed(kg >= 100_000 ? 0 : 1) + ' t'

/** 占位交付价：边际成本（材料 + 工时费）× 1.35。等游说局接上就换成订单价。 */
function placeholderPrice(line: ProductionLine | undefined): number {
  if (!line) return 0
  const material = line.spec.unitKg * line.spec.yuanPerKg
  const labor = lineUnitHours(line) * 18
  return Math.round((material + labor) * 1.35)
}

/** day 0 = START_YEAR-01-01 */
function dateOf(day: number): string {
  const d = new Date(Date.UTC(START_YEAR, START_MONTH - 1, 1) + day * 86_400_000)
  return `${d.getUTCFullYear()} 年 ${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日`
}

function h(tag: string, cls?: string, text?: string): HTMLElement {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  if (text !== undefined) el.textContent = text
  return el
}

function btn(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.className = cls
  b.textContent = label
  b.addEventListener('click', onClick)
  return b
}

export function mountManufacture(root: HTMLElement): void {
  const factory: FactoryState = createFactory()
  let cash = START_CASH
  let day = 0
  let produced = 0
  let spent = 0
  let revenue = 0
  let autoRestock = true
  const samples: Sample[] = []
  const log: string[] = []

  function say(text: string): void {
    log.unshift(`第 ${day} 天 · ${text}`)
    if (log.length > 60) log.pop()
  }

  // ── 开局：一条虎王线，仓里先有 4 台的料 ──
  {
    const tiger = tankByName('虎王 (Tiger II)')
    const spec = specOf(tiger)
    const line = addLine(factory, spec, 400, 2)
    const boot = startLine(line)
    cash -= boot.cost
    const kg = spec.unitKg * 4
    factory.stock[spec.material] = kg
    const stockCost = Math.round(kg * spec.yuanPerKg)
    factory.materialSpend += stockCost
    cash -= stockCost
    say(`开工。一条 ${spec.tank} 线，400 人两班；仓里备了 4 台的料，${money(stockCost)}。`)
  }

  // ── 推进 ──

  /** 自动补料：够 45 天用，钱不够就少买。 */
  function autoBuy(): void {
    if (!autoRestock) return
    for (const line of factory.lines) {
      if (line.state !== 'running') continue
      const perUnit = line.spec.unitKg
      const perDay = lineDailyHours(line) / lineUnitHours(line)
      const target = perUnit * perDay * 45
      const have = stockOf(factory, line.spec.material) + inTransitKgOf(line.spec.material)
      const need = target - have
      if (need <= 0) continue
      const affordable = Math.max(0, Math.floor(cash / line.spec.yuanPerKg))
      const kg = Math.min(need, affordable)
      if (kg < perUnit) continue
      const r = orderMaterial(factory, line.spec.material, Math.ceil(kg), line.spec.yuanPerKg, day)
      cash -= r.cost
    }
  }

  function inTransitKgOf(material: ArmorMaterialId): number {
    return factory.orders.filter((o) => o.material === material).reduce((s, o) => s + o.kg, 0)
  }

  function advance(days: number): void {
    const before = factory.produced
    let cursor = 0
    while (cursor < days) {
      const step = Math.min(7, days - cursor)
      autoBuy()
      const t = advanceFactory(factory, day, step)
      cash -= t.spent
      spent += t.spent
      day += step
      cursor += step
      if (t.produced > 0) {
        // 占位回款：1.35 × 边际成本。真正的价格由游说局的订单决定。
        const price = placeholderPrice(factory.lines[0])
        const income = Math.round(t.produced * price)
        cash += income
        revenue += income
      }
      if (t.starved.length) {
        const names = t.starved.map((id) => factory.lines.find((l) => l.id === id)?.spec.tank ?? '?')
        say(`缺料停工：${[...new Set(names)].join('、')}`)
      }
      if (t.overflowKg > 0) say(`仓库装不下，丢掉了 ${tonnes(t.overflowKg)} 的料`)
      if (cursor % 30 === 0) samples.push({ day, produced: factory.produced, spent, units: factory.produced })
    }
    produced = factory.produced
    if (factory.produced > before) {
      const n = factory.produced - before
      const avg = spent / Math.max(1, factory.produced)
      say(`下线 ${n} 台，累计 ${factory.produced} 台，摊到每台 ${money(avg)}`)
    }
    samples.push({ day, produced: factory.produced, spent, units: factory.produced })
    while (samples.length > 48) samples.shift()
    render()
  }

  // ── 渲染 ──

  root.textContent = ''

  const head = h('header', 'mf-head')
  const title = h('div', 'mf-title')
  title.append(
    h('h1', undefined, '制造局'),
    h('p', 'mf-sub', '一条线一种车。工时决定几天出一台，学习曲线让它越来越快。成品先入库，卖价等游说局。'),
  )

  const status = h('div', 'mf-status')
  const dateEl = h('div', 'mf-date')
  const cashEl = h('div', 'mf-cash')
  dateEl.append(h('span', 'mf-k', '今天'), h('strong', 'mf-v', ''))
  cashEl.append(h('span', 'mf-k', '试算资金'), h('strong', 'mf-v', ''))
  status.append(dateEl, cashEl)

  const controls = h('div', 'mf-controls')
  controls.append(
    btn('+7 天', 'mf-btn', () => advance(7)),
    btn('+30 天', 'mf-btn', () => advance(30)),
    btn('+90 天', 'mf-btn', () => advance(90)),
    btn('+1 年', 'mf-btn mf-btn-primary', () => advance(365)),
  )
  head.append(title, status, controls)

  const layout = h('div', 'mf-layout')
  const linesCol = h('section', 'mf-col')
  const sideCol = h('section', 'mf-col')

  const linesHead = h('div', 'mf-colhead')
  const addSelect = document.createElement('select')
  addSelect.className = 'mf-select'
  for (const o of OPTIONS) {
    const opt = document.createElement('option')
    opt.value = o.name
    opt.textContent = `${o.year}  ${o.name}`
    addSelect.append(opt)
  }
  addSelect.value = 'T-34/76'
  linesHead.append(h('h2', undefined, '产线'), addSelect)
  linesHead.append(
    btn('新建产线', 'mf-btn mf-btn-sm', () => {
      const t = tankByName(addSelect.value)
      const line = addLine(factory, specOf(t), 400, 2)
      const cost = lineDailyWage(line) * 25
      cash -= cost
      say(`新建 ${line.spec.tank} 产线，招工与设备 ${money(cost)}`)
      render()
    }),
  )

  const linesBody = h('div', 'mf-lines')
  const warehouseCard = h('div', 'mf-card')
  const learnCard = h('div', 'mf-card')
  const curveCard = h('div', 'mf-card')
  const logCard = h('div', 'mf-card')
  sideCol.append(warehouseCard, learnCard, curveCard, logCard)

  linesCol.append(linesHead, linesBody)
  layout.append(linesCol, sideCol)
  root.append(head, layout)

  // ── 产线卡 ──
  function lineCard(line: ProductionLine): HTMLElement {
    const card = h('div', 'mf-line is-' + line.state)
    const top = h('div', 'mf-line-top')
    const nameBox = h('div', 'mf-line-name')
    nameBox.append(h('strong', undefined, line.spec.tank))
    const stateText =
      line.state === 'running' ? '生产中' : line.state === 'idle' ? '停工' : `换型中 · 还剩 ${line.retoolDays} 天`
    nameBox.append(h('span', 'mf-pill', stateText))
    top.append(nameBox)

    const btns = h('div', 'mf-line-btns')
    if (line.state === 'running') {
      btns.append(
        btn('停工', 'mf-btn mf-btn-sm', () => {
          const r = stopLine(line)
          if (r.ok) say(r.msg)
          render()
        }),
      )
    } else if (line.state === 'idle') {
      btns.append(
        btn(`开工 · ${money(lineDailyWage(line) * 25)}`, 'mf-btn mf-btn-sm mf-btn-primary', () => {
          const r = startLine(line)
          cash -= r.cost
          say(r.msg)
          render()
        }),
      )
    }
    top.append(btns)
    card.append(top)

    // 进度：这台已经做了多少
    const need = lineUnitHours(line)
    const pct = Math.min(100, (line.progress / need) * 100)
    const track = h('div', 'mf-track')
    const fill = h('div', 'mf-fill')
    fill.style.width = `${pct}%`
    track.append(fill)
    card.append(track)

    const grid = h('div', 'mf-grid')
    const cell = (k: string, v: string, warn = false): HTMLElement => {
      const c = h('div', 'mf-cell')
      c.append(h('span', 'mf-k', k), h('span', warn ? 'mf-v mf-warn' : 'mf-v', v))
      return c
    }
    const perDay = lineDailyHours(line) / need
    grid.append(
      cell('这台还剩', `${Math.max(0, need - line.progress).toLocaleString('en-US')} 工时`),
      cell('日产工时', lineDailyHours(line).toLocaleString('en-US')),
      cell('出车节奏', perDay >= 1 ? `${perDay.toFixed(1)} 台/天` : `${(1 / perDay).toFixed(1)} 天/台`),
      cell('已造', `${line.built} 台`),
      cell(
        '料够',
        `${Math.floor(stockOf(factory, line.spec.material) / line.spec.unitKg)} 台`,
        stockOf(factory, line.spec.material) < line.spec.unitKg,
      ),
      cell('日成本', money(lineDailyWage(line) + lineDailyUpkeep(line))),
    )
    card.append(grid)

    if (line.starved > 0) {
      card.append(h('div', 'mf-alarm', `缺料已停 ${line.starved} 天。仓库里 ${tonnes(stockOf(factory, line.spec.material))}，这台要 ${tonnes(line.spec.unitKg)}。`))
    }

    // 人员
    const staff = h('div', 'mf-staff')
    const slider = document.createElement('input')
    slider.type = 'range'
    slider.min = '50'
    slider.max = '2000'
    slider.step = '25'
    slider.value = String(line.workers)
    slider.className = 'mf-range'
    const val = h('span', 'mf-rangeval', `${line.workers} 人/班`)
    slider.addEventListener('input', () => {
      val.textContent = `${slider.value} 人/班`
    })
    slider.addEventListener('change', () => {
      const r = setStaff(line, Number(slider.value), line.shifts)
      if (r.ok) {
        cash -= r.cost
        say(r.msg)
      }
      render()
    })
    const shifts = document.createElement('select')
    shifts.className = 'mf-select mf-select-sm'
    for (const s of [1, 2, 3]) {
      const o = document.createElement('option')
      o.value = String(s)
      o.textContent = `${s} 班`
      shifts.append(o)
    }
    shifts.value = String(line.shifts)
    shifts.addEventListener('change', () => {
      const r = setStaff(line, line.workers, Number(shifts.value))
      if (r.ok) {
        cash -= r.cost
        say(r.msg)
      }
      render()
    })
    staff.append(slider, val, shifts)
    card.append(staff)

    // 换型
    const retool = h('div', 'mf-retool')
    const pick = document.createElement('select')
    pick.className = 'mf-select mf-select-sm'
    for (const o of OPTIONS) {
      const opt = document.createElement('option')
      opt.value = o.name
      opt.textContent = o.name
      pick.append(opt)
    }
    pick.value =
      HISTORICAL.find((x) => x.name === line.spec.tank || x.design.name === line.spec.tank)?.name ??
      OPTIONS[0]!.name
    retool.append(
      pick,
      btn('换型', 'mf-btn mf-btn-sm', () => {
        const t = tankByName(pick.value)
        const r = retoolLine(line, specOf(t))
        if (r.ok) {
          cash -= r.cost
          say(r.msg)
        }
        render()
      }),
    )
    card.append(retool)

    return card
  }

  // ── 仓库卡 ──
  function renderWarehouse(): void {
    warehouseCard.textContent = ''
    const used = totalStockKg(factory)
    const pct = Math.min(100, (used / factory.warehouseKg) * 100)
    const headRow = h('div', 'mf-cardhead')
    headRow.append(h('h2', undefined, '仓库'))
    headRow.append(
      btn(`扩建 · ${money(150_000)}`, 'mf-btn mf-btn-sm', () => {
        const r = expandWarehouse(factory)
        cash -= r.cost
        say(r.msg)
        render()
      }),
    )
    warehouseCard.append(headRow)

    const cap = h('div', 'mf-capsum')
    cap.append(
      h('span', 'mf-k', '占用'),
      h('strong', 'mf-v', `${tonnes(used)} / ${tonnes(factory.warehouseKg)}`),
    )
    warehouseCard.append(cap)
    const track = h('div', 'mf-track mf-track-lg')
    const fill = h('div', pct > 92 ? 'mf-fill mf-fill-hot' : 'mf-fill')
    fill.style.width = `${pct}%`
    track.append(fill)
    warehouseCard.append(track)

    const mats = [...new Set(factory.lines.map((l) => l.spec.material))]
    if (!mats.length) warehouseCard.append(h('p', 'mf-empty', '还没有产线。'))
    for (const m of mats) {
      const kg = stockOf(factory, m)
      const inTransit = inTransitKgOf(m)
      const line = factory.lines.find((l) => l.spec.material === m)!
      const perDayKg = (lineDailyHours(line) / lineUnitHours(line)) * line.spec.unitKg
      const daysLeft = perDayKg > 0 ? kg / perDayKg : Infinity
      const row = h('div', 'mf-mat')
      const label = h('div', 'mf-mat-label')
      label.append(h('strong', undefined, MATERIAL_BY_ID.get(m)?.name ?? m))
      label.append(h('span', 'mf-dim', `够 ${daysLeft === Infinity ? '∞' : daysLeft.toFixed(1)} 天`))
      const amt = h('div', 'mf-mat-amt')
      amt.append(h('strong', undefined, tonnes(kg)))
      if (inTransit > 0) amt.append(h('span', 'mf-dim', `在途 ${tonnes(inTransit)}`))
      row.append(label, amt)
      const buyRow = h('div', 'mf-buyrow')
      const days = 30
      const needKg = Math.ceil(perDayKg * days)
      const cost = money(needKg * line.spec.yuanPerKg)
      buyRow.append(
        h('span', 'mf-dim', `${LEAD_DAYS} 天到货`),
        btn(`补 ${days} 天 · ${cost}`, 'mf-btn mf-btn-sm', () => {
          const r = orderMaterial(factory, m, needKg, line.spec.yuanPerKg, day)
          cash -= r.cost
          say(`${MATERIAL_BY_ID.get(m)?.name ?? m}：${r.msg}`)
          render()
        }),
      )
      row.append(buyRow)
      warehouseCard.append(row)
    }
  }

  // ── 学习曲线卡 ──
  function renderLearn(): void {
    learnCard.textContent = ''
    learnCard.append(h('h2', undefined, '学习曲线'))
    const line = factory.lines[0]
    if (!line) {
      learnCard.append(h('p', 'mf-empty', '还没有产线。'))
      return
    }
    const base = line.spec.baseHours
    const N = 120
    const pts: number[] = []
    for (let k = 1; k <= N; k++) pts.push(unitHoursAt(base, k))
    const maxH = pts[0]!
    const minH = pts[N - 1]!
    const now = line.built

    const chart = h('div', 'mf-lc')
    for (const v of pts) {
      const bar = h('div', 'mf-lcbar')
      bar.style.height = `${Math.max(3, (v / maxH) * 100)}%`
      chart.append(bar)
    }
    // 当前位置竖线
    if (now > 0 && now <= N) {
      const mark = h('div', 'mf-lcmark')
      mark.style.left = `${((now - 0.5) / N) * 100}%`
      mark.title = `第 ${now} 台`
      chart.append(mark)
    }
    learnCard.append(chart)

    const grid = h('div', 'mf-grid')
    const cell = (k: string, v: string): HTMLElement => {
      const c = h('div', 'mf-cell')
      c.append(h('span', 'mf-k', k), h('span', 'mf-v', v))
      return c
    }
    grid.append(
      cell('第 1 台', `${Math.round(base).toLocaleString('en-US')} h`),
      cell('第 100 台', `${Math.round(unitHoursAt(base, 100)).toLocaleString('en-US')} h`),
      cell(`第 ${N} 台`, `${Math.round(minH).toLocaleString('en-US')} h`),
    )
    learnCard.append(grid)
    learnCard.append(
      h(
        'p',
        'mf-note',
        `Wright 曲线，每翻一倍产量省 ${((1 - Math.pow(2, Math.log2(0.85))) * 100).toFixed(0)}% 工时；现在第 ${now + 1} 台。`,
      ),
    )
  }

  // ── 曲线卡 ──
  function renderCurve(): void {
    curveCard.textContent = ''
    curveCard.append(h('h2', undefined, '产量'))
    if (samples.length < 2) {
      curveCard.append(h('p', 'mf-empty', '推进一段时间，这里会画出累计产量。'))
      return
    }
    const maxUnits = Math.max(1, ...samples.map((s) => s.units))
    const chart = h('div', 'mf-chart')
    for (const s of samples.slice(-24)) {
      const col = h('div', 'mf-bar')
      const bar = h('div', 'mf-barfill')
      bar.style.height = `${Math.max(2, (s.units / maxUnits) * 100)}%`
      col.append(bar)
      col.title = `第 ${s.day} 天 · ${s.units} 台`
      chart.append(col)
    }
    curveCard.append(chart)

    const stats = h('div', 'mf-grid')
    const cell = (k: string, v: string): HTMLElement => {
      const c = h('div', 'mf-cell')
      c.append(h('span', 'mf-k', k), h('span', 'mf-v', v))
      return c
    }
    stats.append(
      cell('累计下线', `${produced} 台`),
      cell('回款（占位）', money(revenue)),
      cell('累计支出', money(spent)),
      cell('摊到每台', produced > 0 ? money(spent / produced) : '—'),
      cell('占位单价', money(placeholderPrice(factory.lines[0]))),
      cell('毛利率', revenue > 0 ? `${(((revenue - spent) / revenue) * 100).toFixed(1)}%` : '—'),
    )
    curveCard.append(stats)
  }

  // ── 日志卡 ──
  function renderLog(): void {
    logCard.textContent = ''
    logCard.append(h('h2', undefined, '记录'))
    if (!log.length) {
      logCard.append(h('p', 'mf-empty', '还没有发生什么。'))
      return
    }
    const list = h('div', 'mf-log')
    for (const t of log.slice(0, 14)) list.append(h('div', 'mf-logrow', t))
    logCard.append(list)
  }

  function render(): void {
    ;(dateEl.querySelector('.mf-v') as HTMLElement).textContent = dateOf(day)
    ;(cashEl.querySelector('.mf-v') as HTMLElement).textContent = money(cash)
    cashEl.classList.toggle('is-bad', cash < 0)
    cashEl.classList.toggle('is-warn', cash >= 0 && cash < 5_000_000)

    const topup = controls.querySelector('.mf-topup')
    if (cash < 0 && !topup) {
      controls.append(
        btn('补充试算资金', 'mf-btn mf-btn-sm mf-topup', () => {
          cash += 30_000_000
          say('追加 3,000 万的试算资金。')
          render()
        }),
      )
    } else if (cash >= 0 && topup) {
      topup.remove()
    }

    linesBody.textContent = ''
    if (!factory.lines.length) linesBody.append(h('p', 'mf-empty', '还没有产线。选一个型号建一条。'))
    for (const line of factory.lines) linesBody.append(lineCard(line))

    renderWarehouse()
    renderLearn()
    renderCurve()
    renderLog()
  }

  render()
  samples.push({ day: 0, produced: 0, spent: 0, units: 0 })
  renderCurve()

  // 调试：?days=120 直接跳过去，方便看跑起来的样子
  const search = typeof location === 'undefined' ? '' : location.search
  const jump = Number(new URLSearchParams(search).get('days'))
  if (Number.isFinite(jump) && jump > 0) advance(Math.min(2000, jump))

  // 调试用
  ;(window as unknown as Record<string, unknown>).__mf = {
    advance,
    factory,
    get cash() {
      return cash
    },
    get day() {
      return day
    },
  }
}

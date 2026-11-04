/**
 * 科技树的「槽月预算」检查台。
 *
 * 研发节奏不该一个个拍脑袋定。这里把它变成一个会计问题：
 *
 *   每段时代能提供的槽月 = 科研槽数 × 月数 × 研发速度
 *   每段时代要花掉的槽月 = 这段时代新出现的科技工期之和
 *
 * 两者之比就是**余量**。运营好的玩家把余量吃满、基本能跟上当前时代；
 * 运营差的（不升级、不开新室）必然在某几条线上掉队。这个工具就是用来确认这件事成不成立。
 *
 * 跑法：npm run tech
 */

import {
  BOARD_NAMES,
  SLOT_UPGRADES,
  SLOT_UPKEEP_BASE,
  SPEED_UPGRADES,
  TECH,
  HORIZON_FROM,
  TECH_BY_ID,
  effortFor,
  isHorizon,
  intensityAt,
  upkeepIndex,
  type TechBoard,
  type TechTier,
} from '../src/tank/data/tech'

const START_YEAR = 1915
const END_YEAR = 1991
const MONTHS = (END_YEAR - START_YEAR + 1) * 12

interface Era {
  name: string
  from: number
  to: number
}

const ERAS: Era[] = [
  { name: '一战', from: 1915, to: 1918 },
  { name: '战后裁军', from: 1919, to: 1932 },
  { name: '重新武装', from: 1933, to: 1939 },
  { name: '二战', from: 1940, to: 1945 },
  { name: '冷战对峙', from: 1946, to: 1962 },
  { name: '缓和与代理战争', from: 1963, to: 1979 },
  { name: '第二次冷战', from: 1980, to: 1988 },
  { name: '落幕', from: 1989, to: 1991 },
]

function eraOf(year: number): number {
  for (let i = 0; i < ERAS.length; i++) if (year <= ERAS[i]!.to) return i
  return ERAS.length - 1
}

// ── 中文对齐 ──────────────────────────────────────────────────

function width(s: string): number {
  let w = 0
  for (const ch of s) w += /[\u3400-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1
  return w
}

function pad(s: string, n: number, align: 'l' | 'r' = 'l'): string {
  const gap = Math.max(0, n - width(s))
  return align === 'l' ? s + ' '.repeat(gap) : ' '.repeat(gap) + s
}

function row(cells: [string, number, 'l' | 'r'][]): string {
  return cells.map(([s, n, a]) => pad(s, n, a)).join(' ')
}

// ── 数据自检 ──────────────────────────────────────────────────

const missing: string[] = []
for (const t of TECH) {
  for (const need of t.needs) if (!TECH_BY_ID.has(need)) missing.push(`${t.id} → ${need}`)
}

// ── 模拟 ─────────────────────────────────────────────────────

interface Policy {
  name: string
  slots: number
  speed: number
  /** 允许超前几年开工（0 = 只做当年及以前的） */
  early: number
  /** 从这个年份才开始干活（用来验证「躺平到后面靠追赶系数抄底」是不是漏洞） */
  from?: number
}

interface SimResult {
  done: Set<string>
  /** 每条泳道完成到的最高年份 */
  finishedYear: Record<TechBoard, number>
  /** 每段时代的可用槽月 / 新增需求槽月 */
  capacity: number[]
  demand: number[]
  /** 1992 年以后的内容，只有超前研发才够得到 */
  future: number
  spend: number
  /** 有多少条是靠超前研发拿到的 */
  earlyPicks: number
  /** 每个月结束时已完成的数量，用来画进度 */
  doneAtMonth: number[]
}

function simulate(policy: Policy): SimResult {
  const done = new Set<string>()
  const boardYear: Record<TechBoard, number> = { armor: 0, gun: 0, ammo: 0, power: 0, run: 0, aux: 0, ind: 0 }
  const capacity = new Array(ERAS.length).fill(0) as number[]
  const demand = new Array(ERAS.length).fill(0) as number[]
  const doneAtMonth: number[] = []
  let spend = 0
  let earlyPicks = 0
  let future = 0
  let activeSlots = 1
  let speed = policy.speed >= 0 ? 1 : 1

  // 开局自带的
  for (const t of TECH) {
    if (t.year <= START_YEAR && t.months === 0 && t.needs.every((n) => TECH_BY_ID.get(n)!.year <= START_YEAR)) {
      done.add(t.id)
      boardYear[t.board] = Math.max(boardYear[t.board], t.year)
    }
  }

  // 需求：每段时代新出现的科技（1992 年以后的单独算，那是「超前研发才够得到」的部分）
  for (const t of TECH) {
    if (done.has(t.id)) continue
    if (t.year > END_YEAR) future += t.months
    else demand[eraOf(t.year)]! += t.months
  }
  const active: { t: TechTier; p: number; months: number; cost: number; early: number }[] = []

  for (let m = 0; m < MONTHS; m++) {
    const year = START_YEAR + Math.floor(m / 12)
    const era = eraOf(year)

    // 升级：到年份就买（这里假设钱够 —— 钱的问题见文末）
    activeSlots = 1
    for (const u of SLOT_UPGRADES) if (year >= u.year) activeSlots++
    speed = 1
    for (const u of SPEED_UPGRADES) if (year >= u.year) speed *= Number(u.effect.match(/×([\d.]+)/)![1])

    const slots = Math.min(policy.slots, activeSlots)
    const spd = Math.min(policy.speed, speed)

    capacity[era]! += slots * spd * intensityAt(year)
    spend += SLOT_UPKEEP_BASE * upkeepIndex(year) * slots

    // 推进
    const work = spd * intensityAt(year)
    for (const a of active) a.p += work
    for (let i = active.length - 1; i >= 0; i--) {
      const a = active[i]!
      if (a.p >= a.months) {
        done.add(a.t.id)
        boardYear[a.t.board] = Math.max(boardYear[a.t.board], a.t.year)
        spend += a.cost
        if (a.early > 0) earlyPicks++
        active.splice(i, 1)
      }
    }

    // 开工：先补最老的（落后时先补课），年代相同的按阶梯顺序。
    // 超前研发是允许的，但工期与费用都要乘惩罚系数 —— 只在没有更该做的事时才做。
    while (active.length < slots && year >= (policy.from ?? START_YEAR)) {
      const next = TECH.filter(
        (t) =>
          !done.has(t.id) &&
          !active.some((a) => a.t.id === t.id) &&
          t.year - year <= policy.early &&
          t.needs.every((n) => done.has(n)),
      ).sort((a, b) => a.year - b.year || a.ladder.localeCompare(b.ladder) || a.tier - b.tier)[0]
      if (!next) break
      const gap = Math.max(0, next.year - year)
      const eff = effortFor(next.months, next.cost, next.year, year)
      active.push({ t: next, p: 0, months: eff.months, cost: eff.cost, early: gap })
    }

    doneAtMonth.push(done.size)
  }

  return { done, finishedYear: boardYear, capacity, demand, future, spend, earlyPicks, doneAtMonth }
}

function lagAt(result: SimResult, year: number): Record<TechBoard, number> {
  const out = { armor: 0, gun: 0, ammo: 0, power: 0, run: 0, aux: 0, ind: 0 } as Record<TechBoard, number>
  for (const board of Object.keys(BOARD_NAMES) as TechBoard[]) {
    const tiers = TECH.filter((t) => t.board === board)
    const frontier = Math.max(...tiers.filter((t) => t.year <= year).map((t) => t.year))
    const mine = Math.max(
      ...tiers.filter((t) => result.done.has(t.id) && t.year <= year).map((t) => t.year),
      -Infinity,
    )
    out[board] = frontier - (Number.isFinite(mine) ? mine : 0)
  }
  return out
}

// ── 输出 ─────────────────────────────────────────────────────

const inGame = TECH.filter((t) => t.months > 0)
const starting = TECH.length - inGame.length

console.log('\n研发局 · 槽月预算\n')
console.log(`科技总数 ${TECH.length} 条（开局自带 ${starting}，需要研发 ${inGame.length}）`)
console.log(`日历 ${MONTHS} 个月（${START_YEAR}–${END_YEAR}）`)

if (missing.length) {
  console.log(`\n⚠ 前置引用不存在：${missing.slice(0, 5).join('、')}${missing.length > 5 ? ` 等 ${missing.length} 处` : ''}`)
}

const full = simulate({ name: '满配', slots: 5, speed: 2, early: 5 })
const totalDemand = full.demand.reduce((a, b) => a + b, 0)
const totalCapacity = full.capacity.reduce((a, b) => a + b, 0)

console.log('\n每段时代：能开多少工 vs 有多少活')
console.log(
  row([
    ['时代', 18, 'l'],
    ['月数', 6, 'r'],
    ['槽位', 6, 'r'],
    ['速度', 6, 'r'],
    ['可用槽月', 10, 'r'],
    ['新增需求', 10, 'r'],
    ['余量', 10, 'r'],
    ['利用率', 8, 'r'],
  ]),
)
console.log('─'.repeat(80))
for (let i = 0; i < ERAS.length; i++) {
  const era = ERAS[i]!
  const cap = full.capacity[i]!
  const dem = full.demand[i]!
  const ratio = cap > 0 ? dem / cap : 0
  console.log(
    row([
      [era.name, 18, 'l'],
      [String((era.to - era.from + 1) * 12), 6, 'r'],
      [String(1 + SLOT_UPGRADES.filter((u) => era.to >= u.year).length), 6, 'r'],
      [SPEED_UPGRADES.filter((u) => era.to >= u.year).length === 0 ? '1.00' : SPEED_UPGRADES.filter((u) => era.to >= u.year).length === 1 ? '1.15' : '1.30', 6, 'r'],
      [cap.toFixed(0), 10, 'r'],
      [dem.toFixed(0), 10, 'r'],
      [(cap - dem >= 0 ? '+' : '') + (cap - dem).toFixed(0), 10, 'r'],
      [`${(ratio * 100).toFixed(0)}%`, 8, 'r'],
    ]),
  )
}
console.log('─'.repeat(80))
console.log(
  row([
    ['合计', 18, 'l'],
    [String(MONTHS), 6, 'r'],
    ['', 6, 'r'],
    ['', 6, 'r'],
    [totalCapacity.toFixed(0), 10, 'r'],
    [totalDemand.toFixed(0), 10, 'r'],
    [`${(totalCapacity - totalDemand >= 0 ? '+' : '')}${(totalCapacity - totalDemand).toFixed(0)}`, 10, 'r'],
    [`${((totalDemand / totalCapacity) * 100).toFixed(0)}%`, 8, 'r'],
  ]),
)

// ── 四种运营策略 ─────────────────────────────────────────────

const POLICIES: Policy[] = [
  { name: '节俭（1 槽，不超前）', slots: 1, speed: 1, early: 0 },
  { name: '只加槽（4 槽，不超前）', slots: 4, speed: 1, early: 0 },
  { name: '只提速（1 槽，×1.30）', slots: 1, speed: 2, early: 0 },
  { name: '稳健（3 槽 + ×1.30）', slots: 3, speed: 2, early: 0 },
  { name: '稳健+赌未来（超前 3 年）', slots: 3, speed: 2, early: 3 },
  { name: '均衡（4 槽 + ×1.30）', slots: 4, speed: 2, early: 0 },
  { name: '均衡+赌未来（超前 5 年）', slots: 4, speed: 2, early: 5 },
  { name: '满配+赌未来（5 槽，超前 5 年）', slots: 5, speed: 2, early: 5 },
  { name: '躺平三十年（1945 才开工）', slots: 5, speed: 2, early: 0, from: 1945 },
]

console.log('\n九种运营策略：到 1991 年能研完多少')
console.log(
  row([
    ['策略', 26, 'l'],
    ['完成/总计', 12, 'r'],
    ['1991 最大滞后', 14, 'r'],
    ['超前拿到', 10, 'r'],
    ['研发总支出', 14, 'r'],
  ]),
)
console.log('─'.repeat(76))
const results: SimResult[] = []
for (const p of POLICIES) {
  const r = simulate(p)
  results.push(r)
  const lag = lagAt(r, END_YEAR)
  const worst = Math.max(...(Object.values(lag) as number[]))
  console.log(
    row([
      [p.name, 26, 'l'],
      [`${r.done.size}/${TECH.length}`, 12, 'r'],
      [`${worst} 年`, 14, 'r'],
      [`${r.earlyPicks} 条`, 10, 'r'],
      [`¥${(r.spend / 1e6).toFixed(1)}M`, 14, 'r'],
    ]),
  )
}

// ── 买「抄底」这个漏洞吗 ─────────────────────────────────────

const lazy = results[POLICIES.findIndex((p) => p.from !== undefined)]!
console.log(`\n⚠ 躺平三十年（1945 才开工）：仍然拿到 ${lazy.done.size} 条，只比满配少 ${full.done.size - lazy.done.size} 条。`)
console.log('  单看研发，前 30 年躺平几乎不亏 —— 因为 1945 年之后的产能本身就接近整棵树的工作量，')
console.log('  再加上追赶系数，欠的课补得回来。真正的闸门必须是现金流：')
console.log('  30 年拿不出能卖的车 = 没有订单 = 早就破产。等制造局和贸易局接上再复核这一条。')

// ── 满配还有什么是没拿到的 ───────────────────────────────────

const missed91 = TECH.filter((t) => t.months > 0 && t.year <= END_YEAR && !full.done.has(t.id))
console.log(`\n满配到 ${END_YEAR} 年没拿到的（${missed91.length} 条）：`)
if (missed91.length === 0) console.log('  （一条不剩）')
for (const t of missed91) console.log(`  ${t.year}  ${t.id.padEnd(18)} ${t.name}  需要 ${t.needs.join('、') || '无'}`)

const futureAll = TECH.filter(isHorizon)
const futureGot = futureAll.filter((t) => full.done.has(t.id))
console.log(`\n终局清单（${HORIZON_FROM} 年以后，${futureAll.length} 条）：日历停在 ${END_YEAR}，满配拿到 ${futureGot.length} 条`)
for (const t of futureAll) console.log(`  ${futureGot.some((g) => g.id === t.id) ? '✓' : '·'} ${t.year}  ${t.id.padEnd(18)} ${t.name}`)
console.log('  这批不参与验收：日历延长或做 DLC 时直接接上。')

// ── 各泳道的掉队情况 ─────────────────────────────────────────

const CHECKPOINTS = [1945, 1962, 1979, END_YEAR]
for (let pi = 0; pi < POLICIES.length; pi++) {
  console.log(`\n${POLICIES[pi]!.name} · 各泳道落后几年`)
  console.log(row([['年份', 8, 'l'], ...(Object.keys(BOARD_NAMES) as TechBoard[]).map((b) => [BOARD_NAMES[b], 8, 'r'] as [string, number, 'r'])]))
  console.log('─'.repeat(8 + 9 * 7))
  for (const y of CHECKPOINTS) {
    const lag = lagAt(results[pi]!, y)
    console.log(
      row([
        [String(y), 8, 'l'],
        ...(Object.keys(BOARD_NAMES) as TechBoard[]).map((b) => [`${lag[b] || '✓'}`, 8, 'r'] as [string, number, 'r']),
      ]),
    )
  }
}

// ── 要按时跟上，需要几个槽 ───────────────────────────────────

const reachableAllCount = TECH.filter((t) => t.year <= END_YEAR).length
let minSlots = 0
for (let n = 1; n <= 5; n++) {
  const r = simulate({ name: `x${n}`, slots: n, speed: 2, early: 5 })
  if (r.done.size >= full.done.size) {
    minSlots = n
    break
  }
}

console.log('\n结论')
console.log(`· 满配（5 槽 + 提速）整局槽月 ${totalCapacity.toFixed(0)}，需求 ${totalDemand.toFixed(0)}，利用率 ${((totalDemand / totalCapacity) * 100).toFixed(0)}%`)
console.log(`· 想追平满配（${full.done.size} 条），最少要 ${minSlots || '>5'} 个槽（配满速度升级、允许超前 5 年）`)
console.log(`· 单槽纯手工（节俭）能完成 ${results[0]!.done.size} 条，占 ${((results[0]!.done.size / TECH.length) * 100).toFixed(0)}%`)
console.log(`· 槽位和速度不能互相替代：只加槽完成 ${results[1]!.done.size} 条，只提速完成 ${results[2]!.done.size} 条`)
console.log('\n待办：钱。上面的支出是「假设买得起」算出来的，真实的闸门在现金流，')
console.log('      等制造局和贸易局接上之后，用同一张表核对「3 槽全开 = 多少台坦克的利润」。')

// ── 节奏的回归门限 ───────────────────────────────────────────

const ERA_LIMIT = 1.05
let failed = 0
for (let i = 0; i < ERAS.length; i++) {
  const ratio = full.demand[i]! / Math.max(1, full.capacity[i]!)
  if (ratio > ERA_LIMIT) {
    console.error(`✗ ${ERAS[i]!.name} 供不应求：需求是产能的 ${(ratio * 100).toFixed(0)}%（上限 ${(ERA_LIMIT * 100).toFixed(0)}%）`)
    failed++
  }
}
const reachable = TECH.filter((t) => !isHorizon(t))
const coverage = full.done.size / reachable.length
if (coverage < 0.95) {
  console.error(`✗ 满配到 ${END_YEAR} 年只拿到 ${(coverage * 100).toFixed(0)}% 的当代科技（下限 95%）`)
  failed++
}

// 追赶系数不能把「落后」变成无关紧要：节俭玩家必须仍然明显掉队。
const frugalLag = Math.max(...(Object.values(lagAt(results[0]!, END_YEAR)) as number[]))
const MIN_FRUGAL_LAG = 15
if (frugalLag < MIN_FRUGAL_LAG) {
  console.error(`✗ 追赶系数太强：节俭玩家到 ${END_YEAR} 年只落后 ${frugalLag} 年（至少要 ${MIN_FRUGAL_LAG} 年，否则落后不再有代价）`)
  failed++
}

if (failed > 0) process.exitCode = 1
else
  console.log(
    `\n节奏检查通过：每段时代需求都不超过产能的 ${(ERA_LIMIT * 100).toFixed(0)}%，满配能拿到当代科技的 ${(coverage * 100).toFixed(0)}%，节俭仍落后 ${frugalLag} 年`,
  )

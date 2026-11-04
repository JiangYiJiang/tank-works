/**
 * 游戏外壳的冒烟测试。
 *
 * 时钟本身由 clock-bench 验；经济闭环由 economy-bench 验。
 * 这里验的是「装到 DOM 上之后，按钮真的连着线、状态真的会变」。
 * 同步执行，不给 rAF 机会跑 —— 否则断言会被动画帧搅乱。
 */

import { Window } from 'happy-dom'

const win = new Window({ url: 'http://localhost/game.html' })
const doc = win.document as unknown as Document

Object.assign(globalThis, {
  window: win as unknown as Window,
  document: doc,
  location: win.location,
  performance: win.performance,
  requestAnimationFrame: win.requestAnimationFrame.bind(win),
  cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
})

const { mountGame } = await import('../src/tank/game/shell')
const { createMemoryStorage } = await import('../src/platform/storage')
const { HISTORICAL } = await import('../src/tank/data/historical')

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? `  ${detail}` : ''}`)
  }
}

const q = <T extends Element = Element>(root: HTMLElement, sel: string): T | null => root.querySelector(sel) as T | null
const all = (root: HTMLElement, sel: string): Element[] => [...root.querySelectorAll(sel)]
const txt = (root: HTMLElement, sel: string): string => q(root, sel)?.textContent?.trim() ?? ''
const cashOf = (root: HTMLElement): number => Number(txt(root, '.cash-value').replace(/[^\d-]/g, ''))
const mount = (store: ReturnType<typeof createMemoryStorage>, seed = 42): HTMLElement => {
  const root = doc.createElement('div') as unknown as HTMLElement
  doc.body.appendChild(root as never)
  mountGame(root, { storage: store, seed: () => seed, founder: false })
  return root
}

console.log('\n游戏外壳 · 冒烟测试\n')

// ── 1. 时钟与布局 ─────────────────────────────────────────
const store = createMemoryStorage()
const root = mount(store)

check('开局日期是 1915年1月1日', txt(root, '.date') === '1915年1月1日', txt(root, '.date'))
check('开局时代是一战', txt(root, '.era') === '第一次世界大战', txt(root, '.era'))
check('时间轴有 8 段', all(root, '.seg').length === 8, `实际 ${all(root, '.seg').length}`)
check('速度档有 4 个', all(root, '.chip[data-speed]').length === 4)
check('默认 3× 高亮', all(root, '.chip.on').length === 1)
check('开局现金 200 万', cashOf(root) === 2_000_000, txt(root, '.cash-value'))
check('剩余天数 28,123', root.textContent!.includes('28,123 天'))
check('日志里有开张那条', root.textContent!.includes('开工'))

// 产品与招标
check('默认产品是 FT-17', (q(root, '.product-select') as HTMLSelectElement | null)?.value === 'FT-17')
check('开局有三份标', all(root, '.offer').length === 3, `实际 ${all(root, '.offer').length}`)
check('标上写了四维门槛', all(root, '.offer-need').every((e) => e.textContent!.includes('总分')))
check('小单是 4 台', txt(root, '.offer-qty').includes('4 台'), txt(root, '.offer-qty'))
check('每份标都有竞品', all(root, '.offer-rival').length === 3, `实际 ${all(root, '.offer-rival').length}`)
check('有压价与贿赂按钮', all(root, '.chip-undercut').length === 3 && all(root, '.chip-bribe').length === 3)
check('厂子面板显示信誉', root.textContent!.includes('信誉'))
check('标上不显示车名', all(root, '.offer').every((o) => !o.textContent!.includes('雷诺') && !o.textContent!.includes('FT-17')))
check('标上仍有四维指标', root.textContent!.includes('装 12 · 火 10'))
check('游戏内有设计本厂车按钮', (q(root, '.chip-design') as HTMLButtonElement).disabled === false)
check('开局国家是法国', (q(root, '.home-select') as HTMLSelectElement).value === 'fra')
check('开局国家可选', (q(root, '.home-select') as HTMLSelectElement).disabled === false)

// 变速 / 暂停
const b30 = all(root, '.chip[data-speed]').find((b) => b.getAttribute('data-speed') === '30')!
b30.dispatchEvent(new win.Event('click') as unknown as Event)
check('点 30× 后它高亮', b30.classList.contains('on'))

const pauseBtn = q(root, '.chip-pause')!
pauseBtn.dispatchEvent(new win.Event('click') as unknown as Event)
check('点暂停后暂停键点亮', pauseBtn.classList.contains('on'))
check('暂停标签出现', q(root, '.paused-tag')?.classList.contains('show') === true)
pauseBtn.dispatchEvent(new win.Event('click') as unknown as Event)
check('再点一次取消暂停', !pauseBtn.classList.contains('on'))

// ── 2. 时钟：跳到下一条快讯（索姆河） ─────────────────────
const jump = q(root, '.chip-jump')!
jump.dispatchEvent(new win.Event('click') as unknown as Event)
check('跳到下一条快讯（索姆河）', txt(root, '.date') === '1916年9月15日', txt(root, '.date'))
check('日志里出现索姆河那条', root.textContent!.includes('索姆河'))
check('跳完之后自动暂停', q(root, '.paused-tag')?.classList.contains('show') === true)
check('暂停原因显示为「世界变了」', txt(root, '.paused-tag').includes('世界变了'), txt(root, '.paused-tag'))
check('开工后国家锁定', (q(root, '.home-select') as HTMLSelectElement).disabled === true)

// 存档
const raw = store.read('tank-works.save.v7')
const saved = raw ? JSON.parse(raw) : null
check('存档已写入 v7', typeof raw === 'string' && raw.length > 0 && saved?.v === 7)
check('存档里是 1916-09-15 那天', saved?.day === 623, String(saved?.day))
check('存档里没有 era 字段（由天数重算）', saved !== null && !('era' in saved))
check('存档里有产品与招标', saved?.design?.name === 'FT-17' && Array.isArray(saved?.offers) && saved.offers.length === 3)

// 再跳一次应该到下一件大事
jump.dispatchEvent(new win.Event('click') as unknown as Event)
check('第二次跳转把日期推得更远', txt(root, '.date') !== '1916年9月15日', txt(root, '.date'))

// 读档
const store2 = createMemoryStorage()
store2.write('tank-works.save.v7', raw as string)
const root2 = mount(store2, 1)
check('重开页面能从存档恢复到 1916-09-15', txt(root2, '.date') === '1916年9月15日', txt(root2, '.date'))

// ── 2b. 研发：开工 → 推进 → 完成 ───────────────────────────
const store7 = createMemoryStorage()
const root7 = mount(store7, 11)
q(root7, '.bureau-card[data-bureau="research"]')!.dispatchEvent(new win.Event('click') as unknown as Event)
check('有研发面板', all(root7, '.research-slot').length === 1, `实际 ${all(root7, '.research-slot').length}`)
check('科技树有卡片', all(root7, '.tech-card').length > 100, `实际 ${all(root7, '.tech-card').length}`)
const doneBeforeTech = all(root7, '.tech-card.is-done').length
const openCard7 = q(root7, '.tech-card.is-open') as HTMLElement | null
check('开局有可开工的技术', Boolean(openCard7))
const cashBeforeTech = cashOf(root7)
openCard7!.click();
check('点卡片会弹出科技详情', (q(root7, '.tech-modal') as HTMLElement).hidden === false)
;(q(root7, '.tech-modal-start') as HTMLElement).click();
check('开工后扣了研发费', cashOf(root7) < cashBeforeTech, `${cashBeforeTech} → ${cashOf(root7)}`)
check('开工后出现在研项目', all(root7, '.research-slot.is-busy').length === 1, `实际 ${all(root7, '.research-slot.is-busy').length}`)
check('开工写进日志', root7.textContent!.includes('开工：'))
q(root7, '.chip-jump')!.dispatchEvent(new win.Event('click') as unknown as Event)
check('跳完之后科技完成', root7.textContent!.includes('研发完成'))
check('科技完成会自动暂停', txt(root7, '.paused-tag').includes('科技完成'), txt(root7, '.paused-tag'))
check('完成后没有在研项目', all(root7, '.research-slot.is-busy').length === 0, `实际 ${all(root7, '.research-slot.is-busy').length}`)
check('完成后科技卡变已掌握', all(root7, '.tech-card.is-done').length > doneBeforeTech, `${doneBeforeTech} → ${all(root7, '.tech-card.is-done').length}`)
const raw7 = store7.read('tank-works.save.v7')
check('存档里带研发状态', raw7 ? Array.isArray(JSON.parse(raw7).research?.projects) : false)
const techRaw = win.localStorage.getItem('tank-works.tech.v1')
const techSnap = techRaw ? (JSON.parse(techRaw) as { parts?: { hull?: string[] }; limits?: { slopeMax?: number } }) : null
check(
  '主循环发布了科技快照',
  Array.isArray(techSnap?.parts?.hull) && techSnap.parts.hull.includes('ft') && typeof techSnap.limits?.slopeMax === 'number',
  techRaw ? '快照存在' : '没有快照',
)

// v3 老存档：没有 research 字段，读回来应当补成开局研发
const store8 = createMemoryStorage()
store8.write(
  'tank-works.save.v3',
  JSON.stringify({
    v: 3,
    seed: 1,
    day: 623,
    cash: 500000,
    over: false,
    log: [],
    design: {
      name: 'FT-17',
      hull: 'ft',
      armor: { material: 'rha', front: 16, frontSlope: 20, side: 16, turretFront: 16, turretSlope: 15 },
      gun: 'sa18',
      engine: 'ft_eng',
      suspension: 'ft_susp',
      aux: 'bare',
    },
    factory: null,
    contract: null,
    offers: [],
  }),
)
const root8 = mount(store8, 1)
check('v3 存档能恢复日期', txt(root8, '.date') === '1916年9月15日', txt(root8, '.date'))
check('v3 存档补上研发', all(root8, '.research-slot').length === 1, `实际 ${all(root8, '.research-slot').length}`)
check('v3 存档补上国家', (q(root8, '.home-select') as HTMLSelectElement).value === 'fra')

const store11 = createMemoryStorage()
const root11 = mount(store11, 31)
const home11 = q(root11, '.home-select') as HTMLSelectElement
home11.value = 'ger'
home11.dispatchEvent(new win.Event('change') as unknown as Event)
check('能改国家到德国', home11.value === 'ger')
check('改国家后仍有标', all(root11, '.offer').length === 3)
const saved11 = JSON.parse(store11.read('tank-works.save.v7')!)
check('国家写进存档', saved11.home === 'ger')

// ── 2d. 银行与关厂报告 ───────────────────────────────────
const store13 = createMemoryStorage()
const root13 = mount(store13, 41)
const cash13 = cashOf(root13)
q(root13, '.chip-bank')!.dispatchEvent(new win.Event('click') as unknown as Event)
check('借钱进现金', cashOf(root13) === cash13 + 500_000, `${cash13} → ${cashOf(root13)}`)
check('债务显示出来了', txt(root13, '.debt-value').startsWith('¥500,000'), txt(root13, '.debt-value'))
const banks = all(root13, '.chip-bank')
banks[1]!.dispatchEvent(new win.Event('click') as unknown as Event)
check('还款后债务归零', txt(root13, '.debt-value').startsWith('¥0'), txt(root13, '.debt-value'))

const store14 = createMemoryStorage()
store14.write(
  'tank-works.save.v7',
  JSON.stringify({
    v: 7,
    seed: 1,
    day: 28123,
    cash: 800000,
    over: true,
    log: [],
    design: {
      name: 'FT-17',
      hull: 'ft',
      armor: { material: 'rha', front: 16, frontSlope: 20, side: 16, turretFront: 16, turretSlope: 15 },
      gun: 'sa18',
      engine: 'ft_eng',
      suspension: 'ft_susp',
      aux: 'bare',
    },
    factory: null,
    contract: null,
    offers: [],
    rep: 50,
    bribes: 0,
    home: 'fra',
    debt: 500000,
    stats: { revenue: 9000000, material: 3000000, wages: 2000000, research: 1000000, bribes: 0, fines: 0, interest: 200000, contracts: 6, produced: 42 },
  }),
)
const root14 = mount(store14, 1)
check('关厂报告自动出现', q(root14, '.end-overlay')?.classList.contains('show') === true)
check('报告里有关厂标题', txt(root14, '.end-title').includes('关厂报告'), txt(root14, '.end-title'))
check('报告里有净资产 / 回款', root14.textContent!.includes('净资产') && root14.textContent!.includes('累计回款'))
check('报告有两个出口', all(root14, '.end-btn').length === 2)
q(root14, '.end-btn')!.dispatchEvent(new win.Event('click') as unknown as Event)
check('点「查看厂子」能关掉报告', q(root14, '.end-overlay')?.classList.contains('show') === false)
check('关闭后顶栏能重新打开报告', (q(root14, '.chip-report') as HTMLButtonElement).hidden === false)
q(root14, '.chip-report')!.dispatchEvent(new win.Event('click') as unknown as Event)
check('报告能重新打开', q(root14, '.end-overlay')?.classList.contains('show') === true)

// ── 2e. 多产线 / 扩编 / 料价 ─────────────────────────────
const store15 = createMemoryStorage()
const root15 = mount(store15, 51)
check('开局没有产线', all(root15, '.line-card').length === 0)
check('料价提示在', txt(root15, '.material-note').includes('料价'), txt(root15, '.material-note'))
const cash15 = cashOf(root15)
q(root15, '.chip-addline')!.dispatchEvent(new win.Event('click') as unknown as Event)
check('加线后出现 1 条产线', all(root15, '.line-card').length === 1, `实际 ${all(root15, '.line-card').length}`)
check('加线扣了 30 万', cashOf(root15) <= cash15 - 300_000, `${cash15} → ${cashOf(root15)}`)
q(root15, '.chip-line')!.dispatchEvent(new win.Event('click') as unknown as Event)
check('扩编后是 200 人', root15.textContent!.includes('200 人 × 1 班'), txt(root15, '.line-card'))

// ── 2c. 贸易：贿赂 / 压价 ────────────────────────────────
const store9 = createMemoryStorage()
const root9 = mount(store9, 21)
const cash9 = cashOf(root9)
q(root9, '.chip-bribe')!.dispatchEvent(new win.Event('click') as unknown as Event)
check('贿赂后现金变少', cashOf(root9) < cash9, `${cash9} → ${cashOf(root9)}`)
check('贿赂写进日志', root9.textContent!.includes('贿赂'))
check('信誉面板显示未消账', txt(root9, '.factory-panel').includes('未消账 1'), txt(root9, '.factory-panel'))

const store10 = createMemoryStorage()
const root10 = mount(store10, 23)
q(root10, '.chip-undercut')!.dispatchEvent(new win.Event('click') as unknown as Event)
check('压价写进日志', root10.textContent!.includes('压价 5%'))
check('压价后订单在手上', root10.textContent!.includes('已交付'))

// ── 3. 经济闭环：接单 → 交付 → 回款 ───────────────────────
const store3 = createMemoryStorage()
const root3 = mount(store3, 7)
const cash0 = cashOf(root3)
const acceptBtn = q(root3, '.chip-accept') as HTMLButtonElement | null
check('第一份标可以接', acceptBtn !== null && !acceptBtn.disabled)
acceptBtn!.dispatchEvent(new win.Event('click') as unknown as Event)

check('接单后出现订单面板', (q(root3, '.contract')?.textContent ?? '').includes('已交付 0 / 4 台'))
check('接单后招标列表清空', all(root3, '.offer').length === 0)
check('接单后备料花钱', cashOf(root3) < cash0, `${cash0} → ${cashOf(root3)}`)
check('订单执行中不能换产品', (q(root3, '.product-select') as HTMLSelectElement).disabled === true)
check('产线在运转', root3.textContent!.includes('产线 1 条 · 运转中'), txt(root3, '.contract-line'))
const designBtn3 = q(root3, '.chip-design') as HTMLButtonElement
check('订单执行中也能进设计局', designBtn3.disabled === false)
check('设计按钮提示新产品下一单生效', designBtn3.title.includes('下一单'), designBtn3.title)

designBtn3.dispatchEvent(new win.Event('click') as unknown as Event)
check('设计局覆盖层打开', q(root3, '.design-overlay') !== null)
check('设计局显示锁定时间', txt(root3, '.design-title').includes('1 天 / 秒'), txt(root3, '.design-title'))
check('设计局里 1× 生效', q(root3, '.chip[data-speed="1"]')?.classList.contains('on') === true)
const speed10 = all(root3, '.chip[data-speed]').find((b) => b.getAttribute('data-speed') === '10')!
speed10.dispatchEvent(new win.Event('click') as unknown as Event)
check('设计局里不能调速', q(root3, '.chip[data-speed="1"]')?.classList.contains('on') === true)
const pause3 = q(root3, '.chip-pause')!
pause3.dispatchEvent(new win.Event('click') as unknown as Event)
check('设计局里不能暂停', !pause3.classList.contains('on'))
;(q(root3, '.design-close') as HTMLButtonElement).dispatchEvent(new win.Event('click') as unknown as Event)
check('关闭设计局恢复覆盖层', q(root3, '.design-overlay') === null)
check('关闭设计局恢复原速度', q(root3, '.chip[data-speed="3"]')?.classList.contains('on') === true)

const raw3 = store3.read('tank-works.save.v7')
const saved3 = raw3 ? JSON.parse(raw3) : null
check('接单后存档里有订单', saved3?.contract?.qty === 4 && saved3?.contract?.delivered === 0)
check('接单后存档里有产线', Array.isArray(saved3?.factory?.lines) && saved3.factory.lines.length === 1)

// 重开：订单与产线都还在
const store4 = createMemoryStorage()
store4.write('tank-works.save.v7', raw3 as string)
const root4 = mount(store4, 1)
check('重开后订单还在', (q(root4, '.contract')?.textContent ?? '').includes('已交付 0 / 4 台'))
check('重开后产品仍是 FT-17', (q(root4, '.product-select') as HTMLSelectElement).value === 'FT-17')

// 跳到下一件事：订单应该在这期间交完，自动回到招标
const jump4 = q(root4, '.chip-jump')!
jump4.dispatchEvent(new win.Event('click') as unknown as Event)
check('跳到 1916 年', txt(root4, '.date') === '1916年9月15日', txt(root4, '.date'))
check('订单已经交完', all(root4, '.contract').length === 0 || !root4.textContent!.includes('已交付 0 / 4'))
check('交完后回到招标列表', all(root4, '.offer').length === 3, `实际 ${all(root4, '.offer').length}`)
check('交完后现金超过开局', cashOf(root4) > 2_000_000, txt(root4, '.cash-value'))
check('日志里有订单完成', root4.textContent!.includes('订单完成'))
check('暂停标签显示订单完成', txt(root4, '.paused-tag').includes('订单完成'), txt(root4, '.paused-tag'))
check('交完后可以换产品', (q(root4, '.product-select') as HTMLSelectElement).disabled === false)

// ── 4. 旧存档（v2）可以直接读 ─────────────────────────────
const store5 = createMemoryStorage()
store5.write('tank-works.save.v2', JSON.stringify({ v: 2, seed: 1, day: 623, cash: 500000, over: false, log: [] }))
const root5 = mount(store5, 1)
check('v2 存档能恢复日期', txt(root5, '.date') === '1916年9月15日', txt(root5, '.date'))
check('v2 存档现金照旧', cashOf(root5) === 500_000, txt(root5, '.cash-value'))
check('v2 存档默认产品 FT-17', (q(root5, '.product-select') as HTMLSelectElement).value === 'FT-17')
check('v2 存档读回来有招标', all(root5, '.offer').length === 3, `实际 ${all(root5, '.offer').length}`)

// ── 5. 设计局 → 主循环：导入本厂设计 ─────────────────────
const ft = HISTORICAL.find((h) => h.name.includes('FT-17'))!
const custom = JSON.parse(JSON.stringify(ft.design)) as typeof ft.design
custom.name = 'FT-17 改'
custom.armor.front = 18
win.localStorage.setItem('tank-works.design.v1', JSON.stringify({ at: Date.now(), design: custom }))

const store6 = createMemoryStorage()
const root6 = mount(store6, 7)
check(
  '产品面板出现设计局的车',
  q(root6, '.adopt-row')?.classList.contains('show') === true && root6.textContent!.includes('FT-17 改'),
  txt(root6, '.adopt-note'),
)
const adoptBtn6 = q(root6, '.chip-adopt') as HTMLButtonElement
adoptBtn6.dispatchEvent(new win.Event('click') as unknown as Event)
const sel6 = q(root6, '.product-select') as HTMLSelectElement
const selectedText6 = (): string => sel6.options[sel6.selectedIndex]?.textContent ?? ''
check('导入后产品变成 FT-17 改', selectedText6().includes('FT-17 改'), selectedText6())
check('导入后下拉有本厂选项', root6.textContent!.includes('本厂 · FT-17 改'))
check('导入写进日志', root6.textContent!.includes('导入本厂设计'))
const raw6 = store6.read('tank-works.save.v7')
check('导入的设计进了存档', raw6 ? JSON.parse(raw6).design.name === 'FT-17 改' : false)
check('导入后仍可接单', (q(root6, '.chip-accept') as HTMLButtonElement).disabled === false)

// 超前设计：1915 年不能卖 1944 年的车
const tiger = HISTORICAL.find((h) => h.name.includes('虎王'))!
win.localStorage.setItem('tank-works.design.v1', JSON.stringify({ at: Date.now(), design: tiger.design }))
;(win as unknown as { dispatchEvent: (e: unknown) => boolean }).dispatchEvent(new win.Event('focus'))
check('焦点回来后刷新了接车行', txt(root6, '.adopt-note').includes('Tiger II'), txt(root6, '.adopt-note'))
adoptBtn6.dispatchEvent(new win.Event('click') as unknown as Event)
check('超前设计被拒绝', selectedText6().includes('FT-17 改'), selectedText6())
check('拒绝时说明了年代', txt(root6, '.flash-text').includes('1944') || txt(root6, '.flash-text').includes('造不出来'), txt(root6, '.flash-text'))

// ── 6. 新游戏从国家选择页带 ?home= 进来 ─────────────────────
win.history.replaceState({}, '', '/game.html?day=0&home=ger')
const storeHome = createMemoryStorage()
const rootHome = mount(storeHome, 3)
check('URL 的 home 决定开局国家', (q(rootHome, '.home-select') as HTMLSelectElement).value === 'ger')
;(win as unknown as { dispatchEvent: (e: unknown) => boolean }).dispatchEvent(new win.Event('beforeunload'))
check('新局存档保留所选国家', JSON.parse(storeHome.read('tank-works.save.v7') ?? '{}').home === 'ger')
win.history.replaceState({}, '', '/game.html')

console.log(`\n${pass} 通过 / ${fail} 失败\n`)
// rAF 循环会真的挂住事件循环，测完必须硬退
process.exit(fail > 0 ? 1 : 0)

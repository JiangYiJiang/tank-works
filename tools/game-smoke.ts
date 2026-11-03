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
  mountGame(root, { storage: store, seed: () => seed })
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
check('默认产品是 FT-17', (q(root, '.sel') as HTMLSelectElement | null)?.value === 'FT-17')
check('开局有三份标', all(root, '.offer').length === 3, `实际 ${all(root, '.offer').length}`)
check('标上写了四维门槛', all(root, '.offer-need').every((e) => e.textContent!.includes('总分')))
check('小单是 4 台', txt(root, '.offer-qty').includes('4 台'), txt(root, '.offer-qty'))

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

// 存档
const raw = store.read('tank-works.save.v3')
const saved = raw ? JSON.parse(raw) : null
check('存档已写入 v3', typeof raw === 'string' && raw.length > 0 && saved?.v === 3)
check('存档里是 1916-09-15 那天', saved?.day === 623, String(saved?.day))
check('存档里没有 era 字段（由天数重算）', saved !== null && !('era' in saved))
check('存档里有产品与招标', saved?.design?.name === 'FT-17' && Array.isArray(saved?.offers) && saved.offers.length === 3)

// 再跳一次应该到下一件大事
jump.dispatchEvent(new win.Event('click') as unknown as Event)
check('第二次跳转把日期推得更远', txt(root, '.date') !== '1916年9月15日', txt(root, '.date'))

// 读档
const store2 = createMemoryStorage()
store2.write('tank-works.save.v3', raw as string)
const root2 = mount(store2, 1)
check('重开页面能从存档恢复到 1916-09-15', txt(root2, '.date') === '1916年9月15日', txt(root2, '.date'))

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
check('订单执行中不能换产品', (q(root3, '.sel') as HTMLSelectElement).disabled === true)
check('产线在运转', root3.textContent!.includes('产线 运转中'))

const raw3 = store3.read('tank-works.save.v3')
const saved3 = raw3 ? JSON.parse(raw3) : null
check('接单后存档里有订单', saved3?.contract?.qty === 4 && saved3?.contract?.delivered === 0)
check('接单后存档里有产线', Array.isArray(saved3?.factory?.lines) && saved3.factory.lines.length === 1)

// 重开：订单与产线都还在
const store4 = createMemoryStorage()
store4.write('tank-works.save.v3', raw3 as string)
const root4 = mount(store4, 1)
check('重开后订单还在', (q(root4, '.contract')?.textContent ?? '').includes('已交付 0 / 4 台'))
check('重开后产品仍是 FT-17', (q(root4, '.sel') as HTMLSelectElement).value === 'FT-17')

// 跳到下一件事：订单应该在这期间交完，自动回到招标
const jump4 = q(root4, '.chip-jump')!
jump4.dispatchEvent(new win.Event('click') as unknown as Event)
check('跳到 1916 年', txt(root4, '.date') === '1916年9月15日', txt(root4, '.date'))
check('订单已经交完', all(root4, '.contract').length === 0 || !root4.textContent!.includes('已交付 0 / 4'))
check('交完后回到招标列表', all(root4, '.offer').length === 3, `实际 ${all(root4, '.offer').length}`)
check('交完后现金超过开局', cashOf(root4) > 2_000_000, txt(root4, '.cash-value'))
check('日志里有订单完成', root4.textContent!.includes('订单完成'))
check('暂停标签显示订单完成', txt(root4, '.paused-tag').includes('订单完成'), txt(root4, '.paused-tag'))
check('交完后可以换产品', (q(root4, '.sel') as HTMLSelectElement).disabled === false)

// ── 4. 旧存档（v2）可以直接读 ─────────────────────────────
const store5 = createMemoryStorage()
store5.write('tank-works.save.v2', JSON.stringify({ v: 2, seed: 1, day: 623, cash: 500000, over: false, log: [] }))
const root5 = mount(store5, 1)
check('v2 存档能恢复日期', txt(root5, '.date') === '1916年9月15日', txt(root5, '.date'))
check('v2 存档现金照旧', cashOf(root5) === 500_000, txt(root5, '.cash-value'))
check('v2 存档默认产品 FT-17', (q(root5, '.sel') as HTMLSelectElement).value === 'FT-17')
check('v2 存档读回来有招标', all(root5, '.offer').length === 3, `实际 ${all(root5, '.offer').length}`)

console.log(`\n${pass} 通过 / ${fail} 失败\n`)
// rAF 循环会真的挂住事件循环，测完必须硬退
process.exit(fail > 0 ? 1 : 0)

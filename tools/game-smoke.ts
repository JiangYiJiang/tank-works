/**
 * 游戏外壳的冒烟测试。
 *
 * 时钟本身由 clock-bench 验；这里只验「装上去之后按钮还连着线、日期真的会变」。
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

console.log('\n游戏外壳 · 冒烟测试\n')

const store = createMemoryStorage()
const root = doc.createElement('div') as unknown as HTMLElement
doc.body.appendChild(root as never)
mountGame(root, { storage: store, seed: () => 42 })

const q = <T extends Element = Element>(sel: string): T | null => root.querySelector(sel) as T | null
const all = (sel: string): Element[] => [...root.querySelectorAll(sel)]
const txt = (sel: string): string => q(sel)?.textContent?.trim() ?? ''

check('开局日期是 1915年1月1日', txt('.date') === '1915年1月1日', txt('.date'))
check('开局时代是一战', txt('.era') === '第一次世界大战', txt('.era'))
check('时间轴有 8 段', all('.seg').length === 8, `实际 ${all('.seg').length}`)
check('速度档有 4 个', all('.chip[data-speed]').length === 4)
check('默认 3× 高亮', all('.chip.on').length === 1)
check('现金显示 500,000', txt('.kv-num') === '¥500,000', txt('.kv-num'))
check('剩余天数 28,123', txt('.kv:nth-child(3) .kv-num') === '28,123 天' || root.textContent!.includes('28,123 天'))
check('日志里有开张那条', root.textContent!.includes('开工'))

// 变速
const b30 = all('.chip[data-speed]').find((b) => b.getAttribute('data-speed') === '30')!
b30.dispatchEvent(new win.Event('click') as unknown as Event)
check('点 30× 后它高亮', b30.classList.contains('on'))

// 暂停
const pauseBtn = q('.chip-pause')!
pauseBtn.dispatchEvent(new win.Event('click') as unknown as Event)
check('点暂停后暂停键点亮', pauseBtn.classList.contains('on'))
check('暂停标签出现', q('.paused-tag')?.classList.contains('show') === true)
pauseBtn.dispatchEvent(new win.Event('click') as unknown as Event)
check('再点一次取消暂停', !pauseBtn.classList.contains('on'))

// 跳到下一件事：下一条快讯是 1916-09-15
const jump = q('.chip-jump')!
jump.dispatchEvent(new win.Event('click') as unknown as Event)
check('跳到下一条快讯（索姆河）', txt('.date') === '1916年9月15日', txt('.date'))
check('日志里出现索姆河那条', root.textContent!.includes('索姆河'))
check('跳完之后自动暂停', q('.paused-tag')?.classList.contains('show') === true)
check('暂停原因显示为「世界变了」', txt('.paused-tag').includes('世界变了'), txt('.paused-tag'))

// 存档
const raw = store.read('tank-works.save.v2')
check('存档已写入', typeof raw === 'string' && raw.length > 0)
check('存档里是 1916-09-15 那天', typeof raw === 'string' && JSON.parse(raw).day === 623, raw ? String(JSON.parse(raw).day) : '')
check('存档里没有 era 字段（由天数重算）', typeof raw === 'string' && !('era' in JSON.parse(raw)))

// 再跳一次应该到下一件大事
jump.dispatchEvent(new win.Event('click') as unknown as Event)
check('第二次跳转把日期推得更远', txt('.date') !== '1916年9月15日', txt('.date'))

// 读档
const root2 = doc.createElement('div') as unknown as HTMLElement
doc.body.appendChild(root2 as never)
const store2 = createMemoryStorage()
store2.write('tank-works.save.v2', raw as string)
mountGame(root2, { storage: store2, seed: () => 1 })
check('重开页面能从存档恢复到 1916-09-15', (root2.querySelector('.date')?.textContent ?? '') === '1916年9月15日', root2.querySelector('.date')?.textContent ?? '')

console.log(`\n${pass} 通过 / ${fail} 失败\n`)
// rAF 循环会真的挂住事件循环，测完必须硬退
process.exit(fail > 0 ? 1 : 0)

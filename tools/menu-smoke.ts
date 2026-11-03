/**
 * 主菜单冒烟测试：存档有无、继续/新游戏、四个入口。
 */

import { Window } from 'happy-dom'

const win = new Window({ url: 'http://localhost/' })
const doc = win.document as unknown as Document

Object.assign(globalThis, {
  window: win as unknown as Window,
  document: doc,
  location: win.location,
})

const { mountMenu } = await import('../src/tank/menu-main')
const { createMemoryStorage } = await import('../src/platform/storage')
const { createGame } = await import('../src/tank/sim/state')
const { encodeSave } = await import('../src/tank/sim/save')
const { SAVE_KEY } = await import('../src/platform/save-keys')

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

console.log('\n主菜单 · 冒烟测试\n')

// ── 1. 没有存档 ───────────────────────────────────────────
const emptyStore = createMemoryStorage()
const emptyRoot = doc.createElement('div') as unknown as HTMLElement
let nav = ''
mountMenu(emptyRoot, { storage: emptyStore, navigate: (url) => (nav = url) })

check('没有存档时继续按钮禁用', (q(emptyRoot, '.menu-continue') as HTMLButtonElement).disabled === true)
check('没有存档时按钮写「还没有存档」', txt(emptyRoot, '.menu-continue').includes('还没有存档'))
check('没有存档时新游戏是主按钮', txt(emptyRoot, '.menu-new').includes('开始新游戏'))
check('四个入口都在', all(emptyRoot, '.module-card').length === 4, `实际 ${all(emptyRoot, '.module-card').length}`)
const linked = all(emptyRoot, 'a.module-card').map((a) => a.getAttribute('href'))
check('只有主循环是链接', linked.join(',') === './game.html', linked.join(','))
check('三个局标成游戏内', all(emptyRoot, 'div.module-card').length === 3)

// ── 2. 有存档 ─────────────────────────────────────────────
const store = createMemoryStorage()
const game = createGame(9)
game.day = 623
game.cash = 1_234_567
game.rep = 66
store.write(SAVE_KEY, encodeSave(game))

const root = doc.createElement('div') as unknown as HTMLElement
mountMenu(root, { storage: store, navigate: (url) => (nav = url) })
check('有存档时继续按钮可用', (q(root, '.menu-continue') as HTMLButtonElement).disabled === false)
check('存档卡显示日期', txt(root, '.save-date') === '1916年9月15日', txt(root, '.save-date'))
check('存档卡显示现金', txt(root, '.save-grid').includes('1,234,567'), txt(root, '.save-grid'))
check('存档卡显示信誉', txt(root, '.save-grid').includes('66 / 100'), txt(root, '.save-grid'))
check('存档卡显示产品', txt(root, '.save-grid').includes('FT-17'), txt(root, '.save-grid'))

// 新游戏需要点两次，第一次只进入确认态
const newBtn = q(root, '.menu-new') as HTMLButtonElement
newBtn.dispatchEvent(new win.Event('click') as unknown as Event)
check('第一次点新游戏进入确认态', newBtn.textContent!.includes('再点一次'))
check('确认态不清存档', store.read(SAVE_KEY) !== null)
newBtn.dispatchEvent(new win.Event('click') as unknown as Event)
check('第二次点新游戏清掉存档', store.read(SAVE_KEY) === null)
check('第二次点新游戏带 ?day=0', nav === './game.html?day=0', nav)

// 继续按钮导航到主循环
const store2 = createMemoryStorage()
store2.write(SAVE_KEY, encodeSave(game))
const root2 = doc.createElement('div') as unknown as HTMLElement
mountMenu(root2, { storage: store2, navigate: (url) => (nav = url) })
q(root2, '.menu-continue')!.dispatchEvent(new win.Event('click') as unknown as Event)
check('继续按钮进主循环', nav === './game.html', nav)

console.log(`\n${pass} 通过 / ${fail} 失败\n`)
if (fail > 0) process.exitCode = 1

/**
 * 主菜单冒烟测试：四个按钮、logo、存档摘要、设置与退出覆盖层。
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
const click = (root: HTMLElement, sel: string): void => {
  q(root, sel)!.dispatchEvent(new win.Event('click') as unknown as Event)
}

console.log('\n主菜单 · 冒烟测试\n')

// ── 1. 没有存档 ───────────────────────────────────────────
const emptyStore = createMemoryStorage()
const emptyRoot = doc.createElement('div') as unknown as HTMLElement
let nav = ''
mountMenu(emptyRoot, { storage: emptyStore, navigate: (url) => (nav = url) })

check('四个主按钮都在', all(emptyRoot, '.menu-nav .menu-btn').length === 4, `实际 ${all(emptyRoot, '.menu-nav .menu-btn').length}`)
check('按钮顺序：加载 / 新游戏 / 设置 / 退出', all(emptyRoot, '.menu-nav .btn-label').map((n) => n.textContent).join(',') === '加载游戏,新游戏,设置,退出游戏')
check('没有存档时加载按钮禁用', (q(emptyRoot, '.menu-load') as HTMLButtonElement).disabled === true)
check('加载按钮仍然写「加载游戏」', txt(emptyRoot, '.menu-load .btn-label') === '加载游戏')
check('没有存档时新游戏是主按钮', (q(emptyRoot, '.menu-new') as HTMLButtonElement).classList.contains('menu-btn-primary'))
check('左侧有 logo', txt(emptyRoot, '.brand-copy h1') === 'TANK WORKS')
check('右侧背景区留空', (q(emptyRoot, '.menu-art') as HTMLElement).children.length === 0)
check('没有入口卡', all(emptyRoot, '.module-card').length === 0)
check('存档条说明没有存档', txt(emptyRoot, '.menu-save-line').includes('没有可加载的存档'))

// 设置
click(emptyRoot, '.menu-settings')
check('设置覆盖层打开', (q(emptyRoot, '.menu-settings-overlay') as HTMLElement).hidden === false)
check('设置里有减少动画', txt(emptyRoot, '.settings-panel').includes('减少界面动画'))
const motion = q(emptyRoot, '.switch-input') as HTMLInputElement
motion.checked = true
motion.dispatchEvent(new win.Event('change') as unknown as Event)
check('减少动画写入本地设置', emptyStore.read('tank-works.settings.v1')?.includes('true') === true)
check('减少动画作用到根节点', doc.documentElement.classList.contains('reduce-motion'))
click(emptyRoot, '.settings-close')
check('设置覆盖层关闭', (q(emptyRoot, '.menu-settings-overlay') as HTMLElement).hidden === true)

// 退出
click(emptyRoot, '.menu-exit')
check('退出覆盖层打开', (q(emptyRoot, '.menu-exit-overlay') as HTMLElement).hidden === false)
check('退出页说明已退出', txt(emptyRoot, '.exit-panel').includes('游戏已退出'))
click(emptyRoot, '.exit-back')
check('退出页可以返回', (q(emptyRoot, '.menu-exit-overlay') as HTMLElement).hidden === true)

// 没有存档时，新游戏一次点击就进入
click(emptyRoot, '.menu-new')
check('没有存档时新游戏直接开局', nav === './game.html?day=0', nav)

// ── 2. 有存档 ─────────────────────────────────────────────
const store = createMemoryStorage()
const game = createGame(9)
game.day = 623
game.cash = 1_234_567
game.rep = 66
store.write(SAVE_KEY, encodeSave(game))

const root = doc.createElement('div') as unknown as HTMLElement
mountMenu(root, { storage: store, navigate: (url) => (nav = url) })
check('有存档时加载按钮可用', (q(root, '.menu-load') as HTMLButtonElement).disabled === false)
check('有存档时加载是主按钮', (q(root, '.menu-load') as HTMLButtonElement).classList.contains('menu-btn-primary'))
check('存档条显示日期', txt(root, '.menu-save-line').includes('1916年9月15日'), txt(root, '.menu-save-line'))
check('存档条显示现金', txt(root, '.menu-save-line').includes('¥1,234,567'), txt(root, '.menu-save-line'))
check('存档条显示信誉', txt(root, '.menu-save-line').includes('66 / 100') || txt(root, '.menu-save-line').includes('66'), txt(root, '.menu-save-line'))
check('存档条显示科技', txt(root, '.menu-save-line').includes('条科技'), txt(root, '.menu-save-line'))

// 加载按钮导航到主循环
click(root, '.menu-load')
check('加载按钮进主循环', nav === './game.html', nav)

// 新游戏需要点两次，第一次只进入确认态
const newBtn = q(root, '.menu-new') as HTMLButtonElement
newBtn.dispatchEvent(new win.Event('click') as unknown as Event)
check('第一次点新游戏进入确认态', (q(root, '.menu-new .btn-label')?.textContent ?? '').includes('再点一次'))
check('确认态不清存档', store.read(SAVE_KEY) !== null)
newBtn.dispatchEvent(new win.Event('click') as unknown as Event)
check('第二次点新游戏清掉存档', store.read(SAVE_KEY) === null)
check('第二次点新游戏带 ?day=0', nav === './game.html?day=0', nav)

// ── 3. 设置里清除存档 ─────────────────────────────────────
const store2 = createMemoryStorage()
store2.write(SAVE_KEY, encodeSave(game))
const root2 = doc.createElement('div') as unknown as HTMLElement
mountMenu(root2, { storage: store2, navigate: (url) => (nav = url) })
click(root2, '.menu-settings')
const clearBtn = q(root2, '.settings-clear') as HTMLButtonElement
check('设置里清除存档按钮可用', clearBtn.disabled === false)
clearBtn.dispatchEvent(new win.Event('click') as unknown as Event)
check('第一次点清除进入确认态', clearBtn.textContent === '确认清除')
check('确认态不清存档', store2.read(SAVE_KEY) !== null)
clearBtn.dispatchEvent(new win.Event('click') as unknown as Event)
check('第二次点清除清掉存档', store2.read(SAVE_KEY) === null)
check('清除后加载按钮禁用', (q(root2, '.menu-load') as HTMLButtonElement).disabled === true)
check('清除后设置覆盖层关闭', (q(root2, '.menu-settings-overlay') as HTMLElement).hidden === true)
check('清除后提示重新开始', txt(root2, '.menu-hint').includes('可以从 1915 年重新开始'))

console.log(`\n${pass} 通过 / ${fail} 失败\n`)
if (fail > 0) process.exitCode = 1

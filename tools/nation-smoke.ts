/**
 * 国家选择页冒烟测试：九张卡、选中高亮、开始按钮的灰色 / 亮起、清档与导航。
 */

import { Window } from 'happy-dom'

const win = new Window({ url: 'http://localhost/nations.html' })
const doc = win.document as unknown as Document

Object.assign(globalThis, {
  window: win as unknown as Window,
  document: doc,
  location: win.location,
})

const { mountNationSelect } = await import('../src/tank/nation-main')
const { createMemoryStorage } = await import('../src/platform/storage')
const { createGame } = await import('../src/tank/sim/state')
const { encodeSave } = await import('../src/tank/sim/save')
const { SAVE_KEY, RUN_KEYS } = await import('../src/platform/save-keys')
const { NATION_PROFILES, PLAYABLE_NATION_IDS, flagSvg } = await import('../src/tank/data/nation-profiles')

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
const click = (node: Element): void => {
  node.dispatchEvent(new win.Event('click') as unknown as Event)
}

console.log('\n国家选择 · 冒烟测试\n')

// ── 1. 空存档：九张卡、初始禁用 ───────────────────────────
const emptyStore = createMemoryStorage()
const emptyRoot = doc.createElement('div') as unknown as HTMLElement
let nav = ''
mountNationSelect(emptyRoot, { storage: emptyStore, navigate: (url) => (nav = url) })

const cards = all(emptyRoot, '.nation-card')
check('正好九张国家卡', cards.length === 9, `实际 ${cards.length}`)
check(
  '国家顺序：美英法德意捷瑞典苏日',
  all(emptyRoot, '.nation-name').map((n) => n.textContent).join(',') ===
    '美国,英国,法国,德国,意大利,捷克斯洛伐克,瑞典,苏联,日本',
)
check('每张卡都有国旗 SVG', all(emptyRoot, '.nation-flag svg').length === 9)
check('每张卡都有历史介绍', all(emptyRoot, '.nation-history').every((n) => (n.textContent?.length ?? 0) >= 40))
check('每张卡都有代表坦克', all(emptyRoot, '.nation-tanks').every((n) => (n.textContent?.includes('·') ?? false)))
check('没有开局时开始按钮禁用', (q(emptyRoot, '.nation-start') as HTMLButtonElement).disabled === true)
check('没有开局时按钮是灰色状态', !(q(emptyRoot, '.nation-start') as HTMLButtonElement).classList.contains('ready'))
check('底部提示先选国家', txt(emptyRoot, '.nation-choice').includes('先选一个国家'))
check('返回主菜单链接是 ./', (q(emptyRoot, '.nation-back') as HTMLAnchorElement).getAttribute('href') === './')
check('空存档提示从 1915 年开局', txt(emptyRoot, '.nation-note').includes('1915 年 1 月 1 日'))

// 没选国家时点开始不会导航
click(q(emptyRoot, '.nation-start')!)
check('没选国家时开始无效', nav === '', nav)

// ── 2. 选国家：高亮、按钮亮起 ─────────────────────────────
click(q(emptyRoot, '[data-id="ger"]')!)
const ger = q(emptyRoot, '[data-id="ger"]') as HTMLButtonElement
check('点德国后卡片高亮', ger.classList.contains('selected'))
check('高亮卡 aria-pressed=true', ger.getAttribute('aria-pressed') === 'true')
check('高亮卡标记「已选择」', txt(emptyRoot, '[data-id="ger"] .nation-mark') === '已选择')
check('选中后开始按钮可用', (q(emptyRoot, '.nation-start') as HTMLButtonElement).disabled === false)
check('选中后按钮亮起', q(emptyRoot, '.nation-start')?.getAttribute('class')?.includes('nation-start') === true)
check('底部显示所选国家', txt(emptyRoot, '.nation-choice').includes('德国'))
check('底部显示英文名', txt(emptyRoot, '.nation-choice').includes('GERMANY'))

// 再点美国：德国取消，美国高亮
click(q(emptyRoot, '[data-id="usa"]')!)
check('再点美国后德国取消', !(q(emptyRoot, '[data-id="ger"]') as HTMLElement).classList.contains('selected'))
check('再点美国后美国高亮', (q(emptyRoot, '[data-id="usa"]') as HTMLElement).classList.contains('selected'))
check('只保留一个选中', all(emptyRoot, '.nation-card.selected').length === 1)
check('底部切到美国', txt(emptyRoot, '.nation-choice').includes('美国'))

// ── 3. 开始游戏：清档、带国家导航 ─────────────────────────
const store = createMemoryStorage()
store.write(SAVE_KEY, encodeSave(createGame(5)))
store.write('tank-works.tech.v1', '{"mastered":{}}')
store.write('tank-works.design.v1', '{"design":{}}')
const root = doc.createElement('div') as unknown as HTMLElement
mountNationSelect(root, { storage: store, navigate: (url) => (nav = url) })
check('有存档时提示会覆盖', txt(root, '.nation-note').includes('覆盖当前存档'))
click(q(root, '[data-id="sov"]')!)
check('选苏联后按钮可用', (q(root, '.nation-start') as HTMLButtonElement).disabled === false)
click(q(root, '.nation-start')!)
check('开始游戏清掉存档', store.read(SAVE_KEY) === null)
check('开始游戏清掉科技快照', store.read('tank-works.tech.v1') === null)
check('开始游戏清掉设计草稿', store.read('tank-works.design.v1') === null)
check('开始游戏带国家和 day=0', nav === './game.html?day=0&home=sov', nav)

// ── 4. 数据与开局状态 ─────────────────────────────────────
check('九个可玩国家', PLAYABLE_NATION_IDS.length === 9)
check('九份国家资料', NATION_PROFILES.length === 9)
check('美国旗有蓝色星区', flagSvg('usa').includes('#3c3b6e'))
check('苏联旗是红色', flagSvg('sov').includes('#cc0000'))
check('模型接受国家参数', createGame(1, 'ger').home === 'ger')
check('模型默认国家是法国', createGame(1).home === 'fra')

console.log(`\n${pass} 通过 / ${fail} 失败\n`)
process.exit(fail > 0 ? 1 : 0)

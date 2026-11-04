/**
 * 主界面冒烟测试：五局入口、9 国编制、地图占位、事件记录、首次建厂登记。
 * 时钟/经济/任务由别的台验；这里只验「新主界面装上去之后，线还接着」。
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
const { createGame } = await import('../src/tank/sim/state')
const { encodeSave } = await import('../src/tank/sim/save')
const { SAVE_KEY } = await import('../src/platform/save-keys')
const { COMPANY_KEY, readCompany } = await import('../src/platform/company')

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
  const node = q(root, sel)
  if (!node) throw new Error(`找不到 ${sel}`)
  node.dispatchEvent(new win.Event('click') as unknown as Event)
}

console.log('\n游戏主界面 · 冒烟测试\n')

// 1916-09-15：英国有 Mark I，法国还没列装；用存档把日期钉住。
const store = createMemoryStorage()
const game = createGame(1)
game.day = 623
store.write(SAVE_KEY, encodeSave(game))

const root = doc.createElement('div') as unknown as HTMLElement
doc.body.appendChild(root as never)
mountGame(root, { storage: store, seed: () => 1, founder: false })

check('主界面停在 1916年9月15日', txt(root, '.date') === '1916年9月15日', txt(root, '.date'))
check('五个局入口都在', all(root, '.bureau-card').length === 5, `实际 ${all(root, '.bureau-card').length}`)
check(
  '五卡顺序是外交/研发/设计/制造/贸易',
  all(root, '.bureau-card').map((c) => c.getAttribute('data-bureau')).join(',') === 'diplomacy,research,design,manufacture,trade',
)
check('进入游戏默认外交局', q(root, '.bureau-diplomacy')?.classList.contains('active') === true)
check('默认显示外交局内容', q(root, '.dashboard')?.classList.contains('hidden') === false)
check('贸易局已改名', txt(root, '.bureau-trade .bureau-title') === '贸易局', txt(root, '.bureau-trade .bureau-title'))
check('没有旧游说局卡片', !root.textContent!.includes('游说局'))
check('地图占位框在', q(root, '.map-frame') !== null)
check('地图标题是动态世界地图', txt(root, '.map-center-title').includes('动态世界地图'))
check('事件记录列在', q(root, '.event-column') !== null)
check('事件里有历史大事件样式', all(root, '.event-list .k-era').length > 0)
check('事件列表非空', all(root, '.event-list li').length > 0)

// 国家卡：9 个、顺序、总数、展开
const cards = all(root, '.country-card')
check('国家卡有 9 张', cards.length === 9, `实际 ${cards.length}`)
check(
  '国家卡顺序与选国家页一致',
  cards.map((c) => c.getAttribute('data-country')).join(',') === 'usa,gbr,fra,ger,ita,csk,swe,sov,jpn',
  cards.map((c) => c.getAttribute('data-country')).join(','),
)
check('英国卡显示 53 台', txt(root, '.country-card[data-country="gbr"] .country-total').includes('53'), txt(root, '.country-card[data-country="gbr"] .country-total'))

click(root, '.country-card[data-country="gbr"]')
check('点开英国卡出现编制详情', q(root, '.country-card[data-country="gbr"]')?.classList.contains('open') === true)
check('展开后显示 Mark I', root.textContent!.includes('Mark I'))
check('展开后显示坦克数量', txt(root, '.country-detail').includes('× 53'), txt(root, '.country-detail'))
check('展开后显示四维与总分', txt(root, '.tank-dims').includes('装') && txt(root, '.tank-dims').includes('总分'))

click(root, '.country-card[data-country="fra"]')
check('切到法国后英国详情收起', q(root, '.country-card[data-country="gbr"]')?.classList.contains('open') === false)
check('1916 法国显示尚未列装', root.textContent!.includes('尚未列装坦克'))

// 五局页面切换：卡片一直在，只换下面内容
click(root, '.bureau-research')
check('研发局页打开', q(root, '.bureau-page-research')?.classList.contains('hidden') === false)
check('外交局内容隐藏', q(root, '.dashboard')?.classList.contains('hidden') === true)
check('研发页打开时五卡仍在', q(root, '.bureau-grid')?.classList.contains('hidden') === false)
check('研发卡高亮', q(root, '.bureau-research')?.classList.contains('active') === true)
check('研发页有研究纪律侧栏', txt(root, '.bureau-page-research').includes('研究纪律'))
click(root, '.bureau-page-research .bureau-back')
check('从研发局返回外交局', q(root, '.dashboard')?.classList.contains('hidden') === false)
check('外交卡恢复高亮', q(root, '.bureau-diplomacy')?.classList.contains('active') === true)

click(root, '.bureau-manufacture')
check('制造局页打开', q(root, '.bureau-page-manufacture')?.classList.contains('hidden') === false)
check('制造页有厂子面板', q(root, '.bureau-page-manufacture .factory-panel') !== null)
check('制造页有产线面板', txt(root, '.bureau-page-manufacture').includes('产线'))
check('制造页有局势面板', txt(root, '.bureau-page-manufacture').includes('局势'))
click(root, '.bureau-page-manufacture .bureau-back')

click(root, '.bureau-trade')
check('贸易局页打开', q(root, '.bureau-page-trade')?.classList.contains('hidden') === false)
check('贸易页有三份标', all(root, '.bureau-page-trade .offer').length === 3, `实际 ${all(root, '.bureau-page-trade .offer').length}`)
check('贸易页有成交纪律侧栏', txt(root, '.bureau-page-trade').includes('成交纪律'))
click(root, '.bureau-page-trade .bureau-back')
check('从贸易局返回主界面', q(root, '.dashboard')?.classList.contains('hidden') === false)

// 首次建厂登记
const founderStore = createMemoryStorage()
const founderRoot = doc.createElement('div') as unknown as HTMLElement
doc.body.appendChild(founderRoot as never)
mountGame(founderRoot, { storage: founderStore, seed: () => 2 })

check('首次进入弹出建厂登记', q(founderRoot, '.founder-overlay')?.classList.contains('show') === true)
check('登记卡有厂名输入', q(founderRoot, '.founder-name') !== null)
check('登记卡有白板', q(founderRoot, '.founder-pad') !== null)
click(founderRoot, '.founder-submit')
check('空厂名不能提交', q(founderRoot, '.founder-overlay')?.classList.contains('show') === true)
check('空厂名有提示', txt(founderRoot, '.founder-hint').includes('名字'), txt(founderRoot, '.founder-hint'))
const nameInput = q(founderRoot, '.founder-name') as HTMLInputElement
nameInput.value = '江北机车厂'
click(founderRoot, '.founder-submit')
check('填名字后登记关闭', q(founderRoot, '.founder-overlay')?.classList.contains('show') === false)
check('厂牌写进本地存储', readCompany(founderStore)?.name === '江北机车厂', String(readCompany(founderStore)?.name))
check('主界面显示厂名', txt(founderRoot, '.company-name') === '江北机车厂', txt(founderRoot, '.company-name'))
check('主界面显示厂牌已登记', txt(founderRoot, '.company-meta').includes('厂牌已登记'), txt(founderRoot, '.company-meta'))
check('公司键不是空值', typeof founderStore.read(COMPANY_KEY) === 'string' && founderStore.read(COMPANY_KEY)!.length > 0)

console.log(`\n${pass} 通过 / ${fail} 失败\n`)
process.exit(fail > 0 ? 1 : 0)

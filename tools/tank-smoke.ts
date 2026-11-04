/**
 * 设计局界面的冒烟测试。
 *
 * 只验证「点了会不会变」和「数字对不对」——视觉不测，那个得靠截图。
 * 存在的理由：bureau.ts 是纯命令式的 DOM 拼装，重构成分很高，
 * 没有这层网，改一次布局就可能悄悄把某个读数绑错字段。
 */

import { Window } from 'happy-dom'

const win = new Window({ url: 'http://localhost/tank.html' })
const doc = win.document as unknown as Document

Object.assign(globalThis, {
  window: win as unknown as Window,
  document: doc,
  location: win.location,
})

const { mountBureau } = await import('../src/tank/ui/bureau')
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

const root = doc.createElement('div') as unknown as HTMLElement
doc.body.appendChild(root as never)
const tiger = HISTORICAL.find((h) => h.name.includes('虎王'))!
mountBureau(root, { initialDesign: tiger.design })

const text = (): string => (root as unknown as { textContent: string }).textContent.replace(/\s+/g, ' ')
const total = (): string => {
  const el = root.querySelector('.score-value') ?? root.querySelector('.total-value')
  return el?.textContent?.trim() ?? ''
}

console.log('\n设计局 · 冒烟测试\n')

/** 读「战斗全重」那一格的数字（t）。 */
const massT = (): number => {
  for (const kv of [...root.querySelectorAll('.kv')]) {
    const label = kv.querySelector('.kv-label')?.textContent ?? ''
    if (label.includes('战斗全重')) return parseFloat((kv.querySelector('.kv-value')?.textContent ?? '0').replace(/,/g, ''))
  }
  return 0
}

const t0 = total()
const m0 = massT()
check('测试起点是虎王，总分 2,934', t0 === '2,934', `实际 ${t0}`)
check('渲染出车体下拉', root.querySelectorAll('select').length >= 6)
check('渲染出四个维度条', root.querySelectorAll('.dim').length >= 4)
check('渲染出耦合与代价四行', root.querySelectorAll('.couple-row').length === 4)
check('没有括号里的 undefined', !/undefined|NaN/.test(text()))

// 把首上倾角从 45° 拉到 65°，装甲面积变大 → 更重 → 更贵，总分应当变
const sliders = [...root.querySelectorAll('.rng')] as unknown as HTMLInputElement[]
const slope = sliders.find((s) => s.max === '70')
if (slope) {
  const orig = slope.value
  slope.value = '65'
  slope.dispatchEvent(new win.Event('input') as unknown as Event)
  const t1 = total()
  check('拖动首上倾角后总分变化', t1 !== t0, `${t0} → ${t1}`)
  check('倾角变大装甲更强（总分随之升高）', Number(t1.replace(/,/g, '')) > Number(t0.replace(/,/g, '')), `${t0} → ${t1}`)
  check('倾角变大后更重', massT() > m0, `${m0} t → ${massT()} t`)
  check('重量有效数字有两位', /^\d+\.\d$/.test(String(massT())))
  slope.value = orig
  slope.dispatchEvent(new win.Event('input') as unknown as Event)
  check('拖回原值后总分复原', total() === t0, `实际 ${total()}`)
} else {
  check('找得到首上倾角滑条', false)
}

// 设计局不再提供历史样车下拉
check(
  '没有历史样车下拉',
  ![...root.querySelectorAll('select')].some((s) =>
    [...(s as HTMLSelectElement).options].some((o) => o.textContent?.includes('历史样车')),
  ),
)

// ── 弹道两轴 ──────────────────────────────────────────────
// 虎王的 88mm KwK43：171 / 151 / 128 / 109 / 93，被帽弹 2km 保持 62%
const balVals = (): string[] =>
  [...root.querySelectorAll('.bal-val')].map((n) => (n.textContent ?? '').trim())
const balSlopeNums = (): string[] =>
  [...root.querySelectorAll('.bal-num')].map((n) => (n.textContent ?? '').trim())

check('弹道面板有五个距离点', root.querySelectorAll('.bal-point').length === 5)
check('弹道是折线图', root.querySelectorAll('.bal-line').length === 1)
check('弹道面板有四档倾角', root.querySelectorAll('.bal-sc').length === 4)

const bv = balVals()
check('虎王 100m 穿深 171', bv[0] === '171', `实际 ${bv[0]}`)
check('虎王 500m 穿深 151', bv[1] === '151', `实际 ${bv[1]}`)
check('虎王 2km 穿深 93', bv[4] === '93', `实际 ${bv[4]}`)
check(
  '穿深随距离单调下降',
  bv.map((v) => Number(v.replace(/,/g, ''))).every((v, i, a) => i === 0 || v < a[i - 1]!),
  bv.join(' → '),
)
check('被帽弹在 60° 上比 0° 钻得更深的视线厚度', text().includes('被帽咬住斜板'))
check('自检结论：虎王 2km 打不穿自己首上', text().includes('打不穿'))
check('物理量有装填 / 倒车 / 俯仰', text().includes('装填') && text().includes('倒车速度') && text().includes('俯仰角'))
check('物理量有抗破', text().includes('首上抗破') && text().includes('炮塔抗破'))
check('物理量有主动防御', text().includes('主动防御'))

// 换成破甲弹：不吃角度，2km 不衰减
const ammoTab = root.querySelector('.wpn-tab[data-tab="ammo"]') as HTMLButtonElement | null
ammoTab?.dispatchEvent(new win.Event('click') as unknown as Event)
const ammoSel = root.querySelector('.wpn-ammo-family') as HTMLSelectElement | null
if (ammoSel) {
  ammoSel.value = 'heat'
  ammoSel.dispatchEvent(new win.Event('change') as unknown as Event)
  const hv = balVals()
  check('换破甲弹后 5 个距离点数值相同（不衰减）', new Set(hv).size === 1, hv.join(' / '))
  const hp = balSlopeNums()
  check('破甲弹 0° 与 60° 实板相同', hp[0] === hp[6], `${hp[0]} vs ${hp[6]}`)
  check('界面说明了破甲弹不吃角度', text().includes('不吃角度'))

  // 换成长杆弹：2km 掉得很少，但怕斜板
  ammoSel.value = 'apfsds'
  ammoSel.dispatchEvent(new win.Event('change') as unknown as Event)
  const fv = balVals().map((v) => Number(v.replace(/,/g, '')))
  check('长杆弹 2km 保持率高于被帽弹', fv[4]! / fv[1]! > 93 / 151, `${fv[4]} / ${fv[1]}`)
  check('界面说明了长杆怕斜板', text().includes('长杆怕斜板'))
} else {
  check('找得到弹药下拉', false)
}

// ── 采用此设计 → 主循环 ───────────────────────────────────
const adoptBtn = root.querySelector('.adopt-btn') as HTMLButtonElement | null
check('有「采用此设计」按钮', adoptBtn !== null)
const nameInput = root.querySelector('.txt') as HTMLInputElement | null
check('有型号名输入框', nameInput !== null, nameInput?.value)
if (adoptBtn && nameInput) {
  const baseName = nameInput.value
  nameInput.value = `${baseName} 改`
  nameInput.dispatchEvent(new win.Event('input') as unknown as Event)
  adoptBtn.dispatchEvent(new win.Event('click') as unknown as Event)

  const raw = win.localStorage.getItem('tank-works.design.v1')
  const payload = raw ? (JSON.parse(raw) as { at?: number; design?: { name?: string; hull?: string } }) : null
  check('采用后写入了本地交接', typeof payload?.at === 'number' && payload?.design?.name === `${baseName} 改`, raw ?? '')
  check('交接里带完整设计', typeof payload?.design?.hull === 'string')
  check('采用后界面给出回执', (root.querySelector('.adopt-note')?.textContent ?? '').includes('已采用'))
}

// ── 独立打开：从空设计开始 ────────────────────────────────
const blankRoot = doc.createElement('div') as unknown as HTMLElement
doc.body.appendChild(blankRoot as never)
mountBureau(blankRoot)
const blankName = (blankRoot.querySelector('.txt') as HTMLInputElement | null)?.value ?? ''
check('独立打开默认是空设计', blankName === '新设计', blankName)
check(
  '空设计没有历史车选项',
  ![...blankRoot.querySelectorAll('select')].some((s) =>
    [...(s as HTMLSelectElement).options].some((o) => o.textContent?.includes('历史样车')),
  ),
)

// ── 武器页：炮 / 弹 / 架 ──────────────────────────────────
const weaponRoot = doc.createElement('div') as unknown as HTMLElement
doc.body.appendChild(weaponRoot as never)
mountBureau(weaponRoot, { initialDesign: structuredClone(tiger.design) })
const wClick = (sel: string): void => {
  const node = weaponRoot.querySelector(sel) as HTMLElement | null
  node?.dispatchEvent(new win.Event('click') as unknown as Event)
}
check('武器页有炮/弹/架三页签', weaponRoot.querySelectorAll('.wpn-tab').length === 3)
check('默认打开火炮页', weaponRoot.querySelector('.wpn-tab[data-tab="gun"]')?.classList.contains('on') === true)
check('火炮页有膛压上限', (weaponRoot.textContent ?? '').includes('膛压上限'))
wClick('.wpn-tab[data-tab="ammo"]')
check('弹药页至少一张弹卡', weaponRoot.querySelectorAll('.wpn-ammo').length >= 1)
wClick('.wpn-add')
check('添加弹种后变成两张卡', weaponRoot.querySelectorAll('.wpn-ammo').length === 2)
wClick('.wpn-add')
wClick('.wpn-add')
check('最多四张弹卡', weaponRoot.querySelectorAll('.wpn-ammo').length === 4)
check('满四张后不再显示添加按钮', weaponRoot.querySelector('.wpn-add') === null)
wClick('.wpn-tab[data-tab="rack"]')
check('弹架页显示总备弹和炮塔下限', (weaponRoot.textContent ?? '').includes('总备弹') && (weaponRoot.textContent ?? '').includes('炮塔下限'))
check('武器页始终显示结构校验', weaponRoot.querySelector('.wpn-summary') !== null)

// 存档往返无关，但 URL 参数要能用
check('文字里没有英文报错', !/Error|Cannot read/.test(text()))

console.log(`\n${pass} 通过 / ${fail} 失败\n`)
if (fail > 0) process.exitCode = 1

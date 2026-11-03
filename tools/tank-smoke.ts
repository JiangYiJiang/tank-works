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
mountBureau(root)

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
check('默认载入 T-34/76，总分 2,092', t0 === '2,092', `实际 ${t0}`)
check('渲染出车体下拉', root.querySelectorAll('select').length >= 6)
check('渲染出四个维度条', root.querySelectorAll('.dim').length >= 4)
check('渲染出耦合与代价四行', root.querySelectorAll('.couple-row').length === 4)
check('没有括号里的 undefined', !/undefined|NaN/.test(text()))

// 把首上倾角从 45° 拉到 65°，装甲面积变大 → 更重 → 更贵，总分应当变
const sliders = [...root.querySelectorAll('input[type=range]')] as unknown as HTMLInputElement[]
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

// 载入虎王样车
const presets = [...root.querySelectorAll('select')][0] as unknown as HTMLSelectElement
const tiger = [...presets.options].find((o) => o.textContent?.includes('虎王'))
if (tiger) {
  presets.value = tiger.value
  presets.dispatchEvent(new win.Event('change') as unknown as Event)
  check('载入虎王后总分 2,934', total() === '2,934', `实际 ${total()}`)
  check('虎王报出接地压力缺陷', text().includes('接地压力过大'))
  check('虎王吨功率 8.9 hp/t', text().includes('8.9'))
} else {
  check('样车下拉里能找到虎王', false)
}

// ── 弹道两轴 ──────────────────────────────────────────────
// 虎王的 88mm KwK43：171 / 151 / 128 / 109 / 93，被帽弹 2km 保持 62%
const balVals = (): string[] =>
  [...root.querySelectorAll('.bal-val')].map((n) => (n.textContent ?? '').trim())
const balSlopeNums = (): string[] =>
  [...root.querySelectorAll('.bal-num')].map((n) => (n.textContent ?? '').trim())

check('弹道面板有五个距离点', root.querySelectorAll('.bal-col').length === 5)
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

// 换成破甲弹：不吃角度，2km 不衰减
const ammoSel = [...root.querySelectorAll('select')].find((s) =>
  [...(s as unknown as HTMLSelectElement).options].some((o) => o.textContent?.includes('破甲弹')),
) as unknown as HTMLSelectElement | undefined
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

  ammoSel.value = ''
  ammoSel.dispatchEvent(new win.Event('change') as unknown as Event)
  check('切回原配后穿深复原', balVals()[1] === '151', `实际 ${balVals()[1]}`)
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

// 存档往返无关，但 URL 参数要能用
check('文字里没有英文报错', !/Error|Cannot read/.test(text()))

console.log(`\n${pass} 通过 / ${fail} 失败\n`)
if (fail > 0) process.exitCode = 1

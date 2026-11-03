/**
 * 研发局界面的冒烟测试。
 *
 * 这个页面全是从同一份 TECH 数据里推导出来的 —— 没有存档、没有随机，
 * 所以测的是三件事：
 *   1. 布局数学有没有错（方块数量、子行不重叠、竖线位置）；
 *   2. 换成不同年份，读数会不会跟着变；
 *   3. 点「已掌握」之后，泳道的落后年数会不会真的跳。
 *
 * 末尾必须 process.exit —— happy-dom 会留下真的定时器，不退出会挂住事件循环。
 */

import { Window } from 'happy-dom'

const win = new Window({ url: 'http://localhost/research.html?year=1939' })
const doc = win.document as unknown as Document

Object.assign(globalThis, {
  window: win as unknown as Window,
  document: doc,
  location: win.location,
})

const { mountResearch } = await import('../src/tank/ui/research')
const { TECH, isHorizon } = await import('../src/tank/data/tech')

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
mountResearch(root)

const all = (sel: string): HTMLElement[] => Array.from(root.querySelectorAll(sel)) as unknown as HTMLElement[]
const one = (sel: string): HTMLElement | null => root.querySelector(sel) as unknown as HTMLElement | null
const txt = (sel: string): string => one(sel)?.textContent?.trim() ?? ''
const flat = (): string => (root as unknown as { textContent: string }).textContent.replace(/\s+/g, ' ')

console.log('\n研发局 · 冒烟测试\n')

// ── 布局 ──────────────────────────────────────────────────

const reachable = TECH.filter((t) => !isHorizon(t))
const horizonCount = TECH.length - reachable.length

check('渲染出七个板块', all('.rs-board').length === 8, `实际 ${all('.rs-board').length}（7 + 终局清单）`)
check('方块数 = 1991 前全部技术', all('.rs-chip').length === reachable.length, `实际 ${all('.rs-chip').length}`)
check('终局清单条数对', all('.rs-hzchip').length === horizonCount, `实际 ${all('.rs-hzchip').length}`)
check('时间轴有 16 个刻度', all('.rs-tick').length === 16, `实际 ${all('.rs-tick').length}`)

const line = one('.rs-today')
check('有「今天」竖线', line !== null)
const lineT = Number(/\* ([\d.]+)\)/.exec(line?.getAttribute('style') ?? '')?.[1] ?? 'NaN')
check('竖线位置对应 1939 年', Math.abs(lineT - (1939 - 1912) / (1991 - 1912)) < 1e-6, String(lineT))

// 同一个泳道里的方块不能压在一起：按 track 分组，同子行必须错开
let overlapping = 0
for (const track of all('.rs-lanetrack')) {
  const boxes = (Array.from(track.querySelectorAll('.rs-chip')) as unknown as HTMLElement[]).map((c) => {
    const style = c.getAttribute('style') ?? ''
    return {
      left: Number(/left: min\(([\d.]+)%/.exec(style)?.[1] ?? '0'),
      top: Number(/top: (-?[\d.]+)px/.exec(style)?.[1] ?? '0'),
    }
  })
  boxes.forEach((b, i) => {
    if (boxes.some((o, j) => j > i && Math.abs(o.top - b.top) < 1 && Math.abs(o.left - b.left) < 9)) overlapping++
  })
}
check('同一子行里没有重叠的方块', overlapping === 0, `重叠 ${overlapping} 处`)

// ── 读数 ──────────────────────────────────────────────────

check('打开就是 1939 年', txt('.rs-yearv') === '1939 年', txt('.rs-yearv'))
check('时代显示「重新武装」', txt('.rs-era') === '重新武装', txt('.rs-era'))
check('概览里科研槽是 2 个', flat().includes('2 个'))
check('概览里月开销 ¥9,800', flat().includes('¥9,800'), flat().slice(0, 260))

const available1939 = reachable.filter((t) => t.year <= 1939).length
check('默认基线 = 按部就班掌握', flat().includes(`${available1939} / ${available1939} 条`), `应为 ${available1939}`)

// ── 点一个方块 ────────────────────────────────────────────

const els = all('.rs-chip')
const target = els.find((c) => (c.textContent ?? '').includes('电渣重熔'))
check('能找到「电渣重熔」方块', target !== undefined)
target?.click()
check('点完弹到检视器', txt('.rs-d-name') === '电渣重熔', txt('.rs-d-name'))
check('检视器标出超前惩罚', txt('.rs-tc-m').includes('超前 19 年'), txt('.rs-tc-m'))
check('惩罚系数是 ×13.04', txt('.rs-tc-m').includes('×13.04'), txt('.rs-tc-m'))

// ── 清空 / 回到按部就班 ───────────────────────────────────

const buttons = all('.rs-preset')
const clear = buttons.find((b) => (b.textContent ?? '').includes('清空重来'))
const restore = buttons.find((b) => (b.textContent ?? '').includes('回到按部就班'))
check('有「清空重来」按钮', clear !== undefined)
check('有「回到按部就班」按钮', restore !== undefined)

clear?.click()
check('清空后一条都没掌握', flat().includes('0 / 58 条'), flat().slice(0, 300))
check('清空后最大落后变成在线上之外的值', flat().includes('最大落后 27 年') || !flat().includes('最大落后 在线上'))

restore?.click()
check('恢复后回到 58 / 58', flat().includes('58 / 58 条'), flat().slice(0, 300))

// ── 换年份 ────────────────────────────────────────────────

const slider = one('.rs-slider') as unknown as HTMLInputElement | null
check('有年份滑条', slider !== null)
if (slider) {
  slider.value = '1943'
  slider.dispatchEvent(new win.Event('input') as unknown as Event)
  check('拖到 1943 年', txt('.rs-yearv') === '1943 年', txt('.rs-yearv'))
  check('时代变成「第二次世界大战」', txt('.rs-era') === '第二次世界大战', txt('.rs-era'))
  const available1943 = reachable.filter((t) => t.year <= 1943).length
  check('应有数量跟着涨', flat().includes(`${available1943} / ${available1943} 条`), `应为 ${available1943}`)
  check('科研槽 1934 年后变成 2 个', flat().includes('2 个'))
}

// ── 脏数据 ────────────────────────────────────────────────

const dirty = /NaN|undefined|Infinity/
check('页面上没有 NaN / undefined', !dirty.test(flat()))

console.log(`\n${pass} 通过 / ${fail} 失败\n`)
process.exit(fail > 0 ? 1 : 0)

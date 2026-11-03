/**
 * 制造局冒烟：把真实界面挂起来，推进时间，看数字对不对。
 */

import { Window } from 'happy-dom'

const win = new Window({ url: 'http://127.0.0.1:5273/manufacture.html' })
const doc = win.document as unknown as Document

Object.assign(globalThis, {
  window: win,
  document: doc,
  HTMLElement: win.HTMLElement,
  Node: win.Node,
  Event: win.Event,
  MouseEvent: win.MouseEvent,
})

const root = doc.createElement('div')
doc.body.append(root as unknown as Node)

const { mountManufacture } = await import('../src/tank/ui/manufacture')

let fail = 0
let pass = 0

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`)
  }
}

function text(sel: string): string {
  return (doc.querySelector(sel)?.textContent ?? '').trim()
}
function all(sel: string): HTMLElement[] {
  return [...doc.querySelectorAll(sel)] as unknown as HTMLElement[]
}

mountManufacture(root)
;(globalThis as unknown as { document: Document }).document = doc

console.log('\n制造局')

check('页面不是空的', root.textContent!.length > 200)
check('标题是制造局', text('h1') === '制造局')
check('开局日期 1944 年 1 月 1 日', text('.mf-date .mf-v') === '1944 年 1 月 1 日', text('.mf-date .mf-v'))
check('开局现金', text('.mf-cash .mf-v') === '¥53,383,959', text('.mf-cash .mf-v'))
check('一条产线', all('.mf-line').length === 1)
check('产线是虎王', text('.mf-line-name strong') === 'Tiger II', text('.mf-line-name strong'))
check('状态是生产中', text('.mf-line.is-running .mf-pill') === '生产中')
check('仓里有 315 t', text('.mf-mat-amt strong') === '315 t', text('.mf-mat-amt strong'))
check('仓库占用条存在', all('.mf-track-lg').length === 1)
check('推进按钮 4 个', all('.mf-controls .mf-btn').length === 4)

// ── 推 90 天 ──
const mf = (win as unknown as { __mf: { advance: (n: number) => void; factory: { produced: number } } }).__mf
check('调试句柄已挂上', !!mf)

const cashBefore = Number(text('.mf-cash .mf-v').replace(/[^\d]/g, ''))
mf.advance(90)

const cashAfter = Number(text('.mf-cash .mf-v').replace(/[^\d]/g, ''))
const produced = mf.factory.produced

check('90 天产出了车', produced >= 25 && produced <= 40, `实际 ${produced} 台`)
check('现金减少了', cashAfter < cashBefore, `${cashBefore} → ${cashAfter}`)
check('日期变成 1944 年 3 月 31 日', text('.mf-date .mf-v') === '1944 年 3 月 31 日', text('.mf-date .mf-v'))
check('已造台数写进卡片', text('.mf-line .mf-cell:nth-child(4) .mf-v') === `${produced} 台`, text('.mf-line .mf-cell:nth-child(4) .mf-v'))
check('仓库被消耗过', text('.mf-mat-amt strong') !== '315 t', text('.mf-mat-amt strong'))
check('产量图有柱子', all('.mf-bar').length >= 2)
check('日志里有下线记录', root.textContent!.includes('下线'), '')

// 学习曲线：第一台的工时应大于第三台的
check('日志记录了摊到每台的成本', text('.mf-logrow:first-child').includes('摊到每台'), text('.mf-logrow:first-child'))
check('页面没有 NaN', !root.textContent!.includes('NaN'))
check('页面没有 undefined', !root.textContent!.includes('undefined'))

console.log(`\n${pass} 通过 / ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)

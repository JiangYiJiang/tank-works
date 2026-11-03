/**
 * 产线扩张：加线、加人、加班。
 *
 * 制造局模型本来就支持多条线共享仓库和成品池，主循环以前只用第一条。
 * 这里把「扩张」做成玩家动作，并让它有明确代价：
 *   加线：一次性建设费 + 每天多一份工资；
 *   加人：一次性扩编费 + 工资按人数线性上涨；
 *   加班：一次性费用 + 工资按班次上涨，产出也按班次上涨。
 */

import { addLine, createFactory, specOf, setStaff } from './factory'
import { buildTank } from '../model/build'
import { materialFactor } from './market'
import { techMods } from './research'
import { pushLog, type GameState } from './state'

export const MAX_LINES = 3
export const LINE_COST = 300_000
export const STAFF_STEP = 100
export const STAFF_MAX = 400
export const STAFF_COST = 80_000
export const SHIFT_COST = 120_000

export interface LineActionResult {
  ok: boolean
  msg: string
}

/** 当前产品在「今天」的制造参数：料价按市场系数浮动。 */
export function specForGame(state: GameState): ReturnType<typeof specOf> {
  const spec = specOf(buildTank(state.design, techMods(state.research)))
  spec.yuanPerKg *= materialFactor(spec.material, state.day)
  return spec
}

export function addProductionLine(state: GameState): LineActionResult {
  if (state.over) return { ok: false, msg: '这一局已经结束' }
  if (!state.factory) state.factory = createFactory()
  if (state.factory.lines.length >= MAX_LINES) return { ok: false, msg: `最多 ${MAX_LINES} 条产线` }
  if (state.cash < LINE_COST) return { ok: false, msg: `现金不够（需要 ¥${LINE_COST.toLocaleString('en-US')}）` }
  state.cash -= LINE_COST
  const line = addLine(state.factory, specForGame(state), STAFF_STEP, 1)
  // 手上有订单时，新线立刻并进生产；空档期先停着，等接单再开。
  if (state.contract) line.state = 'running'
  pushLog(state, {
    d: state.day,
    k: 'build',
    t: `新建 ${line.id} 号产线：${STAFF_STEP} 人 × 1 班，建设费 ¥${LINE_COST.toLocaleString('en-US')}。`,
  })
  return { ok: true, msg: `建了 ${line.id} 号产线` }
}

export function upgradeLine(state: GameState, lineId: number, kind: 'staff' | 'shift'): LineActionResult {
  if (state.over) return { ok: false, msg: '这一局已经结束' }
  const line = state.factory?.lines.find((l) => l.id === lineId)
  if (!line) return { ok: false, msg: '没有这条产线' }

  if (kind === 'staff') {
    if (line.workers + STAFF_STEP > STAFF_MAX) return { ok: false, msg: `单线最多 ${STAFF_MAX} 人` }
    if (state.cash < STAFF_COST) return { ok: false, msg: `现金不够（需要 ¥${STAFF_COST.toLocaleString('en-US')}）` }
    state.cash -= STAFF_COST
    setStaff(line, line.workers + STAFF_STEP, line.shifts)
    pushLog(state, {
      d: state.day,
      k: 'build',
      t: `${line.id} 号产线扩编到 ${line.workers} 人，扩编费 ¥${STAFF_COST.toLocaleString('en-US')}。`,
    })
    return { ok: true, msg: `${line.id} 号线扩编到 ${line.workers} 人` }
  }

  if (line.shifts >= 3) return { ok: false, msg: '已经三班倒' }
  if (state.cash < SHIFT_COST) return { ok: false, msg: `现金不够（需要 ¥${SHIFT_COST.toLocaleString('en-US')}）` }
  state.cash -= SHIFT_COST
  setStaff(line, line.workers, line.shifts + 1)
  pushLog(state, {
    d: state.day,
    k: 'build',
    t: `${line.id} 号产线加到 ${line.shifts} 班，加班改造费 ¥${SHIFT_COST.toLocaleString('en-US')}。`,
  })
  return { ok: true, msg: `${line.id} 号线加到 ${line.shifts} 班` }
}

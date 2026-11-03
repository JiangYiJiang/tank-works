/**
 * 银行：授信、借款、还款、日计息。
 *
 * 设计上只做三件事：
 *   1. 授信 = f(信誉, 年份)。信誉越好，能借的越多；
 *   2. 利息按日单利滚进本金，不占现金 —— 所以「借钱扩张」不会当天就破产；
 *   3. 现金见底时先自动透支，透支额度也不够才真的破产。
 */

import { dateOf } from './calendar'
import { pushLog, type GameState } from './state'

/** 年化 8%，按日单利。 */
export const LOAN_RATE = 0.08
/** 界面上的借款 / 还款步长。 */
export const LOAN_STEP = 500_000

/** 授信额度：基础 100 万 + 信誉 × 2 万，再按年份通胀放大。 */
export function creditLimit(state: GameState): number {
  const year = dateOf(state.day).year
  const inflation = 1 + Math.max(0, year - 1915) * 0.02
  return Math.round((1_000_000 + state.rep * 20_000) * inflation)
}

export function availableCredit(state: GameState): number {
  return Math.max(0, creditLimit(state) - state.debt)
}

export interface LoanResult {
  ok: boolean
  msg: string
}

/** 借一笔。钱进现金，债进余额。 */
export function borrow(state: GameState, amount = LOAN_STEP): LoanResult {
  if (state.over) return { ok: false, msg: '这一局已经结束' }
  if (amount <= 0) return { ok: false, msg: '借款金额不对' }
  if (amount > availableCredit(state)) {
    return { ok: false, msg: `授信不够：还能借 ¥${availableCredit(state).toLocaleString('en-US')}` }
  }
  state.cash += amount
  state.debt += amount
  pushLog(state, {
    d: state.day,
    k: 'money',
    t: `向银行借入 ¥${amount.toLocaleString('en-US')}，余额 ¥${Math.round(state.debt).toLocaleString('en-US')}。`,
  })
  return { ok: true, msg: `借入 ¥${amount.toLocaleString('en-US')}` }
}

/** 还一笔。还不起就拒绝，不搞负现金。 */
export function repay(state: GameState, amount = LOAN_STEP): LoanResult {
  if (state.over) return { ok: false, msg: '这一局已经结束' }
  if (state.debt <= 0) return { ok: false, msg: '没有欠款' }
  const pay = Math.min(amount, Math.round(state.debt))
  if (state.cash < pay) return { ok: false, msg: `现金不够还 ¥${pay.toLocaleString('en-US')}` }
  state.cash -= pay
  state.debt = Math.max(0, state.debt - pay)
  pushLog(state, {
    d: state.day,
    k: 'money',
    t: `还银行 ¥${pay.toLocaleString('en-US')}，余额 ¥${Math.round(state.debt).toLocaleString('en-US')}。`,
  })
  return { ok: true, msg: `还款 ¥${pay.toLocaleString('en-US')}` }
}

/** 按天计息，滚进本金。返回这期间新增的利息。 */
export function accrueInterest(state: GameState, days: number): number {
  if (state.debt <= 0 || days <= 0) return 0
  const interest = (state.debt * LOAN_RATE * days) / 365
  state.debt += interest
  state.stats.interest += interest
  return interest
}

/**
 * 自动透支：现金为负时，先借到刚好不缺钱；借不到就返回 false。
 * 不走 `borrow()` 的 50 万步长，因为这里要的是精确补洞。
 */
export function autoBorrow(state: GameState): boolean {
  if (state.cash >= 0) return true
  const need = Math.ceil(-state.cash)
  if (need > availableCredit(state)) return false
  state.cash += need
  state.debt += need
  pushLog(state, {
    d: state.day,
    k: 'money',
    t: `现金见底，银行自动透支 ¥${need.toLocaleString('en-US')}。`,
  })
  return true
}

/**
 * 让时间往前走。
 *
 * 这是整个游戏里唯一一个「热循环」：一次快进可能要走两万八千圈，
 * 所以每一圈只做三件事 —— 时代边界、历史快讯、以及（有订单时）经济结算。
 * 没有事件队列、没有遍历、没有分配。
 */

import { ERAS, NEWS, TOTAL_DAYS } from './calendar'
import { economyDay, refreshOffers } from './contract'
import { daysToNextEvent, pushLog, type GameState } from './state'

export interface AdvanceResult {
  /** 实际走了几天（到结尾会被截断） */
  days: number
  eraChanged: boolean
  newsCount: number
  /** 这一跳里有没有订单完成 */
  contractDone: boolean
  /** 这一跳之后，游戏是不是结束了 */
  ended: boolean
}

/**
 * 推进 n 天，**就地改写** state。
 *
 * 为什么不是纯函数：一次快进要改 28,000 次状态，每次复制一份等于把一个数组复制两万八千遍。
 * 纯函数的好处这里用不上，因为调用方（主循环）本来就只持有这一份 state。
 */
export function advanceDays(state: GameState, days: number): AdvanceResult {
  const target = Math.min(TOTAL_DAYS - 1, state.day + Math.max(0, Math.floor(days)))
  const start = state.day
  let eraChanged = false
  let newsCount = 0
  let contractDone = false

  if (target === start) {
    return { days: 0, eraChanged: false, newsCount: 0, contractDone: false, ended: state.over }
  }

  for (let d = start + 1; d <= target; d++) {
    // 时代边界：8 段，绝大多数日子里这个 while 的条件第一次就为假。
    while (state.era + 1 < ERAS.length && ERAS[state.era + 1]!.from <= d) {
      state.era++
      eraChanged = true
      const e = ERAS[state.era]!
      pushLog(state, { d, k: 'era', t: `${e.name}：${e.blurb}` })
      // 换时代＝换客户：没有在手订单就重新招标。
      if (!state.contract) refreshOffers(state, false, d)
    }

    // 历史快讯：游标扫过静态表，一天最多一条。
    const n = NEWS[state.newsCursor]
    while (n && n.day <= d) {
      pushLog(state, { d: n.day, k: 'news', t: `${n.title} —— ${n.detail}` })
      state.newsCursor++
      newsCount++
      break
    }

    // 桌上的标全过期了：按当天重新招标（同一时代，交期顺延）。
    if (!state.contract && state.offers.length > 0 && state.offers.every((o) => o.deadline <= d)) {
      refreshOffers(state, true, d)
    }

    // 经济：只有手上有订单时才转产线。空档期冻结（M1 简化）。
    if (state.contract && !state.over) {
      const e = economyDay(state, d)
      if (e.contractDone) contractDone = true
      if (e.bankrupt) {
        state.day = d
        return { days: d - start, eraChanged, newsCount, contractDone, ended: true }
      }
    }
  }

  state.day = target

  if (!state.over && state.day >= TOTAL_DAYS - 1) {
    state.over = true
    pushLog(state, { d: state.day, k: 'note', t: '1991 年 12 月 31 日。这一局结束了。' })
    return { days: target - start, eraChanged, newsCount, contractDone, ended: true }
  }

  return { days: target - start, eraChanged, newsCount, contractDone, ended: state.over }
}

/**
 * 跳到下一个事件。
 *
 * 不推进时钟的话返回 0 —— 调用方拿到 0 就该知道「今天有东西要你处理」。
 */
export function skipToNextEvent(state: GameState): AdvanceResult {
  return advanceDays(state, daysToNextEvent(state))
}

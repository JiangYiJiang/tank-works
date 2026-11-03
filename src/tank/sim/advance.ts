/**
 * 让时间往前走。
 *
 * 这是整个游戏里唯一一个「热循环」：一次快进可能要走两万八千圈，
 * 所以每一圈只做两件事 —— 看时代边界过没过、看快讯到没到。
 * 没有事件队列、没有遍历、没有分配。
 */

import { ERAS, NEWS, TOTAL_DAYS } from './calendar'
import { daysToNextEvent, pushLog, type GameState } from './state'

export interface AdvanceResult {
  /** 实际走了几天（到结尾会被截断） */
  days: number
  eraChanged: boolean
  newsCount: number
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

  if (target === start) {
    return { days: 0, eraChanged: false, newsCount: 0, ended: state.over }
  }

  for (let d = start + 1; d <= target; d++) {
    // 时代边界：8 段，绝大多数日子里这个 while 的条件第一次就为假。
    while (state.era + 1 < ERAS.length && ERAS[state.era + 1]!.from <= d) {
      state.era++
      eraChanged = true
      const e = ERAS[state.era]!
      pushLog(state, { d, k: 'era', t: `${e.name}：${e.blurb}` })
    }

    // 历史快讯：游标扫过静态表，一天最多一条。
    const n = NEWS[state.newsCursor]
    while (n && n.day <= d) {
      pushLog(state, { d: n.day, k: 'news', t: `${n.title} —— ${n.detail}` })
      state.newsCursor++
      newsCount++
      break
    }
  }

  state.day = target

  if (!state.over && state.day >= TOTAL_DAYS - 1) {
    state.over = true
    pushLog(state, { d: state.day, k: 'note', t: '1991 年 12 月 31 日。这一局结束了。' })
    return { days: target - start, eraChanged, newsCount, ended: true }
  }

  return { days: target - start, eraChanged, newsCount, ended: state.over }
}

/**
 * 跳到下一个事件。
 *
 * 不推进时钟的话返回 0 —— 调用方拿到 0 就该知道「今天有东西要你处理」。
 */
export function skipToNextEvent(state: GameState): AdvanceResult {
  return advanceDays(state, daysToNextEvent(state))
}

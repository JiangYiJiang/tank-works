/**
 * 时钟的验收测试。
 *
 * 三条硬指标：
 *   1. 跑完 1915–1991 全部日子，**不到 1 秒**
 *   2. 存档在第一天和第两万天**一样大**（不随游戏时间膨胀）
 *   3. 同样的种子跑两遍，**存档逐字节相同**
 */

import { ERAS, NEWS, TOTAL_DAYS, eraIndexAt, formatDate, threatAt } from '../src/tank/sim/calendar'
import { advanceDays } from '../src/tank/sim/advance'
import { createGame } from '../src/tank/sim/state'
import { decodeSave, encodeSave } from '../src/tank/sim/save'

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

console.log('\n时钟 · 验收\n')
console.log(`  时间轴：1915-01-01 → 1991-12-31，共 ${TOTAL_DAYS.toLocaleString('en-US')} 天`)
console.log(`  最后一个天序号：${TOTAL_DAYS - 1}（${formatDate(TOTAL_DAYS - 1)}）\n`)

// ── 1. 速度 ───────────────────────────────────────────────
const g = createGame(20260101)
const t0 = performance.now()
const res = advanceDays(g, TOTAL_DAYS)
const elapsed = performance.now() - t0
console.log(`  快进整局：${elapsed.toFixed(1)} ms（${((TOTAL_DAYS / elapsed) * 1000).toFixed(0)} 天/秒）`)
check('整局不到 1 秒', elapsed < 1000, `${elapsed.toFixed(1)} ms`)

// ── 2. 状态正确 ───────────────────────────────────────────
check('走到最后一天', g.day === TOTAL_DAYS - 1, `实际 ${g.day}`)
check('标记为结束', g.over && res.ended)
check('时代推进到最后一个', g.era === ERAS.length - 1, `实际 ${g.era}`)
check('快讯游标扫完', g.newsCursor === NEWS.length, `实际 ${g.newsCursor}`)
check('日志没爆', g.log.length <= 160, `实际 ${g.log.length} 条`)

// ── 3. 存档大小不随游戏时间涨 ──────────────────────────────
const early = createGame(7)
advanceDays(early, 10)
const late = createGame(7)
advanceDays(late, 20_000)
const a = encodeSave(early).length
const b = encodeSave(late).length
console.log(`\n  存档：第 10 天 ${a} 字节 / 第 20000 天 ${b} 字节`)
check('存档大小基本不涨（差 < 2KB）', Math.abs(a - b) < 2000, `${a} vs ${b}`)

// ── 4. 确定性 ─────────────────────────────────────────────
const r1 = createGame(12345)
advanceDays(r1, TOTAL_DAYS)
const r2 = createGame(12345)
advanceDays(r2, TOTAL_DAYS)
check('同种子两次跑出同一个存档', encodeSave(r1) === encodeSave(r2))

// ── 5. 读档 ───────────────────────────────────────────────
const mid = createGame(99)
advanceDays(mid, 9000)
const loaded = decodeSave(encodeSave(mid))
check('读档成功', loaded !== null)
if (loaded) {
  check('天数一致', loaded.day === mid.day, `${loaded.day} vs ${mid.day}`)
  check('时代由天数重算正确', loaded.era === eraIndexAt(loaded.day))
  check('快讯游标由天数重算正确', loaded.newsCursor === NEWS.filter((n) => n.day <= loaded.day).length)
  const again = encodeSave(loaded)
  check('存档往返稳定', again === encodeSave(mid))
}

// ── 6. 坏存档 ─────────────────────────────────────────────
check('空存档返回 null', decodeSave('') === null)
check('乱码返回 null', decodeSave('{not json') === null)
check('版本过新返回 null', decodeSave('{"v":999,"day":0}') === null)
const clamped = decodeSave('{"v":2,"day":999999,"cash":"x","log":[{"d":-5,"k":"??","t":"hello"}]}')
check('超范围天数被夹住', clamped?.day === TOTAL_DAYS - 1, `实际 ${clamped?.day}`)
check('坏字段被清成 0', clamped?.cash === 0)
check('坏日志条目保留文字、改成 note', clamped?.log[0]?.k === 'note' && clamped?.log[0]?.t === 'hello')

// ── 7. 时间轴本身 ─────────────────────────────────────────
let monotonic = true
let prev = -1
for (let i = 0; i < ERAS.length; i++) {
  if (ERAS[i]!.from <= prev) monotonic = false
  prev = ERAS[i]!.from
}
check('时代边界严格递增', monotonic)
check('一战开局威胁高', threatAt(0) > 0.8)
check('裁军期威胁低', threatAt(1927 * 365) < 0.2)
check('1944 年威胁最高', threatAt(ERP(1944, 6, 6)) > 0.85)

function ERP(y: number, m: number, d: number): number {
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1915, 0, 1)) / 86400000)
}

// ── 8. 每条快讯都在时间轴内且有序 ──────────────────────────
let ordered = true
for (let i = 1; i < NEWS.length; i++) {
  if (NEWS[i]!.day <= NEWS[i - 1]!.day) ordered = false
}
check('快讯按日期有序', ordered)
check('快讯都在时间轴内', NEWS.every((n) => n.day >= 0 && n.day < TOTAL_DAYS))

// ── 9. 分段推进与一次推进等价 ──────────────────────────────
const step = createGame(4242)
for (let i = 0; i < 400; i++) advanceDays(step, 7)
const once = createGame(4242)
advanceDays(once, 2800)
check('分成 400 次推进和一次推进结果相同', encodeSave(step) === encodeSave(once))

console.log(`\n${pass} 通过 / ${fail} 失败\n`)
if (fail > 0) process.exitCode = 1

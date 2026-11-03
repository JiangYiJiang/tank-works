/**
 * 弹道两轴检查台：把 19 辆历史车的穿深摊成一条曲线。
 *
 * 这里要看三件事：
 *   1. 500m 那一列必须和改之前一模一样（两轴改造不能动标定基准）；
 *   2. 100m 到 2000m 的下滑幅度要和史料对得上（虎王 165@100 → 100@2000）；
 *   3. 60° 那一列要能解释「为什么长杆弹打不穿大倾角首上」。
 *
 * 用法：npm run ballistics [-- --detail 虎王]
 */

import { GUN_BY_ID, need } from '../src/tank/data/parts'
import { HISTORICAL } from '../src/tank/data/historical'
import { buildTank } from '../src/tank/model/build'
import { keep2kOf, losPenetrated as LosPenetrated, plateDefeated, slopeExpOf } from '../src/tank/model/ballistics'
import { TUNING } from '../src/tank/model/tuning'
import type { ShellType } from '../src/tank/types'

const SHELLS: ShellType[] = ['ap', 'aphe', 'apcbc', 'apcr', 'apds', 'apfsds', 'apfsds2', 'heat']

function width(s: string): number {
  let n = 0
  for (const ch of s) n += ch.charCodeAt(0) > 0x2e80 ? 2 : 1
  return n
}

function pad(s: string, n: number): string {
  return s + ' '.repeat(Math.max(0, n - width(s)))
}

function rpad(s: string, n: number): string {
  return ' '.repeat(Math.max(0, n - width(s))) + s
}

/** 一条用字符画出来的衰减曲线：横轴 0→2500m。 */
function curve(pen500: number, k2k: number, shell: ShellType): string {
  const cols = 40
  const maxD = 2500
  const rows: number[] = []
  for (let i = 0; i <= cols; i++) {
    const d = (i / cols) * maxD
    const g = TUNING.gun
    const keep = Math.pow(k2k, (d - g.penRefM) / (g.keepRefM - g.penRefM))
    rows.push(pen500 * keep)
  }
  const top = rows[0]!
  const blocks = '▁▂▃▄▅▆▇█'
  return rows
    .map((v) => blocks[Math.min(7, Math.floor((v / top) * 7.99))]!)
    .join('')
    .concat(`  ${shell === 'heat' ? '不衰减' : `${Math.round(k2k * 100)}% @2km`}`)
}

const detail = process.argv.indexOf('--detail')
const wanted = detail >= 0 ? process.argv[detail + 1] : undefined

const rows = HISTORICAL.map((h) => {
  const tank = buildTank(h.design)
  const b = tank.ballistics
  return { h, tank, b }
})

if (wanted) {
  const hit = rows.find((r) => r.h.name.includes(wanted) || r.h.design.name.includes(wanted))
  if (!hit) {
    console.log(`没找到「${wanted}」`)
    process.exit(1)
  }
  const { h, tank, b } = hit
  const gun = need(GUN_BY_ID, h.design.gun, '火炮')
  console.log(`\n${h.name} · ${h.year} · ${gun.name}`)
  console.log(`弹种 ${b.shell}  2km 保持 ${(b.keep2k * 100).toFixed(0)}%  斜板指数 s=${b.slopeExp}`)
  console.log(`初速 ${b.v0.toFixed(0)} m/s → 2km 存速 ${b.v2000.toFixed(0)} m/s`)
  console.log(`穿深 100m ${b.pen100.toFixed(0)} / 500m ${b.pen500.toFixed(0)} / 1km ${b.pen1000.toFixed(0)} / 2km ${b.pen2000.toFixed(0)} mm`)
  console.log(`可击穿板厚 0° ${b.plate0.toFixed(0)} / 30° ${b.plate30.toFixed(0)} / 60° ${b.plate60.toFixed(0)} mm`)
  console.log(`曲线 ${curve(b.pen500, b.keep2k, b.shell)}`)
  console.log(`\n对照：本车首上等效 ${tank.physical.armorFront.toFixed(0)} mm RHAe`)
  process.exit(0)
}

console.log('\n弹道两轴检查台 · 19 辆历史车\n')
console.log(
  pad('型号', 14) +
    pad('年', 6) +
    pad('弹种', 10) +
    rpad('100m', 8) +
    rpad('500m', 8) +
    rpad('2km', 8) +
    rpad('保持', 8) +
    rpad('s', 6) +
    rpad('60°实板', 10) +
    rpad('60°视线', 10) +
    rpad('打T-34首上', 12),
)
console.log('─'.repeat(102))
const T34_GLACIS_LOS = 90 // 45mm @ 60°
for (const { h, b } of rows) {
  console.log(
    pad(h.name, 14) +
      pad(String(h.year), 6) +
      pad(b.shell, 10) +
      rpad(b.pen100.toFixed(0), 8) +
      rpad(b.pen500.toFixed(0), 8) +
      rpad(b.pen2000.toFixed(0), 8) +
      rpad(`${Math.round(b.keep2k * 100)}%`, 8) +
      rpad(b.slopeExp.toFixed(2), 6) +
      rpad(b.plate60.toFixed(0), 10) +
      rpad(b.los60.toFixed(0), 10) +
      rpad(b.los60 >= T34_GLACIS_LOS ? '✓' : '✗', 12),
  )
}

console.log('\n各弹种的衰减曲线（横轴 0 → 2500m，纵轴同刻度）\n')
for (const shell of SHELLS) {
  const k = keep2kOf(shell)
  const tone = shell === 'heat' ? 100 : 150
  console.log(pad(shell, 10) + rpad(`${Math.round(k * 100)}%`, 6) + '  ' + curve(tone, k, shell))
}

console.log('\n斜板响应：同样 150mm 的 0° 穿深，能钻多厚的实际板\n')
console.log(
  pad('弹种', 10) +
    rpad('s', 6) +
    rpad('0°', 8) +
    rpad('30°', 8) +
    rpad('45°', 8) +
    rpad('60°', 8) +
    rpad('60°视线', 10),
)
console.log('─'.repeat(58))
for (const shell of SHELLS) {
  const s = slopeExpOf(shell)
  const cells = [0, 30, 45, 60].map((a) => rpad(plateDefeated(150, a, s).toFixed(0), 8)).join('')
  const los = LosPenetrated(150, 60, s)
  console.log(pad(shell, 10) + rpad(s.toFixed(2), 6) + cells + rpad(los.toFixed(0), 10))
}

console.log('\n注：「实板」= 对倾斜钢板能击穿的实际板厚，跟车体图纸上的毫米数一个口径。')
console.log('    「视线」= 换算成垂直等效厚度，跟 physical.armorFront 一个口径，判击穿用这个。')
console.log('    两者差一个 cos θ —— 混用就会把倾角算两遍。\n')

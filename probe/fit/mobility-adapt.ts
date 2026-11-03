/**
 * 机动与适应性的标定：坐标下降，最小化「最差那一辆」的误差。
 *
 *   npm run fit:mobility
 *
 * 为什么用「最差」而不是平均：平均值好看但某一辆离谱，玩家一眼就看得见。
 * 两个维度都只有 5 个左右的自由参数对 19 个数据点，属于轻微过约束，
 * 所以接受 20% 上下的残差 —— 再往下就是拿参数去记数据了。
 */

import { buildTank } from '../../src/tank/model/build'
import { TUNING } from '../../src/tank/model/tuning'
import { HISTORICAL } from '../../src/tank/data/historical'

type Target = 'offroad' | 'adapt'

interface Sample {
  name: string
  got: number
  want: number
}

function collect(target: Target): Sample[] {
  return HISTORICAL.map((h) => ({
    name: h.name,
    got: buildTank(h.design).raw[target],
    want: h.ref[target],
  }))
}

function score(target: Target): { worst: number; mean: number } {
  const s = collect(target)
  const errs = s.map((x) => Math.abs(Math.log(Math.max(1e-6, x.got) / x.want)))
  return {
    worst: Math.max(...errs),
    mean: errs.reduce((a, b) => a + b, 0) / errs.length,
  }
}

/** 一组参数名 + 每个参数的候选缩放/取值。additive 的参数直接在原值附近取值。 */
interface Knob {
  table: Record<string, number>
  key: string
  mode: 'mul' | 'abs'
  values?: number[]
}

function descend(target: Target, knobs: Knob[], passes = 6): void {
  let best = score(target)
  console.log(`\n[${target}] 起始 最差 ${(Math.exp(best.worst) - 1) * 100 > 0 ? ((Math.exp(best.worst) - 1) * 100).toFixed(0) : '0'}%  平均 ${((Math.exp(best.mean) - 1) * 100).toFixed(0)}%`)

  for (let p = 0; p < passes; p++) {
    let improved = false
    for (const knob of knobs) {
      const orig = knob.table[knob.key] as number
      let bestVal = orig
      const candidates =
        knob.mode === 'abs'
          ? (knob.values as number[])
          : [0.5, 0.7, 0.85, 1.0, 1.2, 1.45, 1.75, 2.2].map((m) => orig * m)
      for (const v of candidates) {
        knob.table[knob.key] = v
        const r = score(target)
        if (r.worst < best.worst - 1e-9) {
          best = r
          bestVal = v
          improved = true
        }
      }
      knob.table[knob.key] = bestVal
    }
    if (!improved) break
  }

  const s = collect(target)
  console.log(`[${target}] 标定后 最差 ±${((Math.exp(best.worst) - 1) * 100).toFixed(0)}%  平均 ${((Math.exp(best.mean) - 1) * 100).toFixed(0)}%`)
  for (const x of [...s].sort((a, b) => Math.abs(Math.log(b.got / b.want)) - Math.abs(Math.log(a.got / a.want)))) {
    const e = (x.got / x.want - 1) * 100
    console.log(`   ${x.name.padEnd(20)} ${x.got.toFixed(0).padStart(6)} / ${String(x.want).padStart(6)}  ${e.toFixed(1).padStart(7)}%`)
  }
  for (const knob of knobs) console.log(`   ${knob.key.padEnd(20)} = ${(knob.table[knob.key] as number).toFixed(4)}`)
}

function main(): void {
  const mob = TUNING.mobility as unknown as Record<string, number>
  const ad = TUNING.adapt as unknown as Record<string, number>

  descend('offroad', [
    { table: mob, key: 'offroadBase', mode: 'abs', values: [0.2, 0.28, 0.34, 0.4, 0.46, 0.52, 0.58] },
    { table: mob, key: 'offroadQualitySpan', mode: 'abs', values: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8] },
    { table: mob, key: 'groundPressureRef', mode: 'abs', values: [40, 48, 55, 65, 75, 90] },
    { table: mob, key: 'gpFloor', mode: 'abs', values: [0.6, 0.7, 0.75, 0.82, 0.9, 1.0] },
    { table: mob, key: 'gpCeil', mode: 'abs', values: [1.0, 1.1, 1.2, 1.35] },
    { table: mob, key: 'vmaxK', mode: 'mul' },
    { table: mob, key: 'vmaxExp', mode: 'abs', values: [0.3, 0.35, 0.4, 0.45, 0.5, 0.55] },
  ])

  descend('adapt', [
    { table: ad, key: 'base', mode: 'abs', values: [0, 40, 80, 150, 200, 300, 450] },
    { table: ad, key: 'elecScale', mode: 'abs', values: [0.8, 1.0, 1.2, 1.45, 1.7, 2.0, 2.4] },
    { table: ad, key: 'ergoScale', mode: 'abs', values: [0.1, 0.2, 0.3, 0.4, 0.55, 0.75, 1.0] },
    { table: ad, key: 'crossScale', mode: 'abs', values: [0.08, 0.15, 0.25, 0.4, 0.6, 0.85, 1.0] },
    { table: ad, key: 'relScale', mode: 'abs', values: [0.1, 0.2, 0.3, 0.45, 0.65, 0.85, 1.0] },
    { table: ad, key: 'ergoCap', mode: 'mul' },
    { table: ad, key: 'crossCap', mode: 'mul' },
  ])
}

main()

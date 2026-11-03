/**
 * 弹道模型的形状标定：不只是每组的 K，还要问「指数对不对」。
 *
 *   npm run fit:pen
 *
 * 思路：
 *   pen = C · v^a · m^b / d^c · f(口径)
 * 每组弹的 K 都有闭式最优解（对数几何平均），所以真正需要搜的只有指数 a/b/c
 * 和口径修正的形状。搜索目标是**让组内残差的最大值最小**——平均值好看没用，
 * 玩家一眼就能看出某辆车不对。
 *
 * 坐标下降，几轮就收敛。只打印，不改文件。
 */

import { GUN_BY_ID } from '../../src/tank/data/parts'
import { buildTank } from '../../src/tank/model/build'
import { TUNING } from '../../src/tank/model/tuning'
import { HISTORICAL } from '../../src/tank/data/historical'

interface Sample {
  name: string
  shell: string
  pen: number
  ref: number
}

const KEYS = ['vExp', 'mExp', 'dExp', 'caliberExp'] as const
type Key = (typeof KEYS)[number]

function evaluate(): { worst: number; mean: number; perTank: Array<{ name: string; err: number }> } {
  const samples: Sample[] = HISTORICAL.map((h) => ({
    name: h.name,
    shell: GUN_BY_ID.get(h.design.gun)?.shell ?? 'ap',
    pen: buildTank(h.design).raw.pen,
    ref: h.ref.pen,
  }))

  // 每组 K 的闭式最优解：K = geomean(pen_i / ref_i)，等价于把组内误差的中位点挪到 0
  const groups = new Map<string, Sample[]>()
  for (const s of samples) {
    const arr = groups.get(s.shell) ?? []
    arr.push(s)
    groups.set(s.shell, arr)
  }

  const scale = new Map<string, number>()
  for (const [shell, arr] of groups) {
    const g = Math.exp(arr.reduce((sum, s) => sum + Math.log(s.pen / s.ref), 0) / arr.length)
    scale.set(shell, g)
  }

  const perTank = samples.map((s) => ({ name: s.name, err: (s.pen / (scale.get(s.shell) as number)) / s.ref - 1 }))
  const worst = Math.max(...perTank.map((t) => Math.abs(t.err)))
  const mean = perTank.reduce((a, t) => a + Math.abs(t.err), 0) / perTank.length
  return { worst, mean, perTank }
}

function main(): void {
  const gun = TUNING.gun as unknown as Record<string, number>
  const originals: Record<string, number> = {}
  for (const k of KEYS) originals[k] = gun[k] as number
  const origMin = gun.caliberMin as number
  const origMax = gun.caliberMax as number
  gun.caliberMin = 0.2
  gun.caliberMax = 1.7

  let best = evaluate()
  console.log(`起始：最大误差 ${(best.worst * 100).toFixed(1)}%  平均 ${(best.mean * 100).toFixed(1)}%`)

  const grid: Record<Key, number[]> = {
    vExp: [0.7, 0.85, 1.0, 1.15, 1.3, 1.43, 1.6, 1.8],
    mExp: [0.3, 0.4, 0.5, 0.6, 0.71, 0.8, 0.9],
    dExp: [0.9, 1.0, 1.07, 1.2, 1.35, 1.5, 1.7],
    caliberExp: [-0.6, -0.3, 0, 0.3, 0.6, 0.9, 1.2],
  }

  for (let pass = 0; pass < 4; pass++) {
    let improved = false
    for (const key of KEYS) {
      let bestVal = gun[key] as number
      for (const v of grid[key]) {
        gun[key] = v
        const r = evaluate()
        if (r.worst < best.worst - 1e-9) {
          best = r
          bestVal = v
          improved = true
        }
      }
      gun[key] = bestVal
    }
    if (!improved) break
  }

  console.log(`\n标定后：最大误差 ${(best.worst * 100).toFixed(1)}%  平均 ${(best.mean * 100).toFixed(1)}%`)
  console.log('\n指数：')
  for (const k of KEYS) console.log(`  ${k.padEnd(12)} ${originals[k]}  →  ${gun[k]}`)

  // 细化：把组内离散也报出来，判断是「整体偏」还是「形状不对」
  const samples: Sample[] = HISTORICAL.map((h) => ({
    name: h.name,
    shell: GUN_BY_ID.get(h.design.gun)?.shell ?? 'ap',
    pen: buildTank(h.design).raw.pen,
    ref: h.ref.pen,
  }))
  const groups = new Map<string, Sample[]>()
  for (const s of samples) {
    const arr = groups.get(s.shell) ?? []
    arr.push(s)
    groups.set(s.shell, arr)
  }
  console.log('\n标定后各弹种的 K 与组内离散：')
  const kOut: Record<string, number> = {}
  for (const [shell, arr] of groups) {
    const ratios = arr.map((s) => s.pen / s.ref)
    const g = Math.exp(ratios.reduce((a, r) => a + Math.log(r), 0) / ratios.length)
    kOut[shell] = (TUNING.gun.deMarreK[shell] ?? 1) * g
    const worst = Math.max(...ratios.map((r) => Math.max(r / g, g / r)))
    console.log(`  ${shell.padEnd(9)} n=${String(arr.length).padStart(2)}  K=${kOut[shell].toFixed(2)}  ±${((worst - 1) * 100).toFixed(0)}%`)
  }

  console.log('\n逐辆车（按误差排序）：')
  for (const t of [...best.perTank].sort((a, b) => Math.abs(b.err) - Math.abs(a.err))) {
    console.log(`  ${t.name.padEnd(20)} ${(t.err * 100).toFixed(1).padStart(7)}%`)
  }

  console.log('\n抄回 tuning.ts：')
  const out: Record<string, unknown> = {}
  for (const k of KEYS) out[k] = gun[k]
  out.deMarreK = kOut
  console.log(JSON.stringify(out, null, 2))

  // 还原，避免污染后续调用
  for (const k of KEYS) gun[k] = originals[k] as number
  gun.caliberMin = origMin as number
  gun.caliberMax = origMax as number
}

main()

/**
 * 校准台：拿 19 辆真实坦克去撞设计局模型。
 *
 *   npm run design
 *   npm run design -- --detail "虎王"
 *
 * 判据是**逐维度**的，不是一个笼统的 ±10%。原因各不相同：
 *
 *   装甲 ±12%  物理关系最干净（厚度 × 倾角 × 材料系数），实测平均误差 1.7%。
 *              唯一的自由度是「等效厚度」这个口径本身，所以这一项该严。
 *   穿深 ±25%  德马尔公式能算对「初速 → 穿深」，但算不对**弹药冶金学**：
 *              同样是 APCBC，1942 年的美国弹和 1944 年的德国弹差两成，
 *              贫铀弹芯比钨芯再高一截。这一块模型故意不建模（它属于科技树），
 *              所以残差留在 ±25%。要收紧就得给每门炮配弹药数据，那就成了查表。
 *   越野 ±30%  基准数据本身就最脏：不同来源对「越野速度」的定义能差一倍
 *              （平均越野 / 良好土路 / 极限通过）。模型平均误差 12.6%，
 *              剩下的大半是基准值的不确定性，不是模型错。
 *   适应 ——     没有外部真值。它是「看得见吗 / 打得准吗 / 车组累不累」的合集，
 *              历史书里没有「M4A1 适应性 = 2600」这种东西。把它塞进数值回归
 *              等于自己给自己出题。所以这里只做**报告**，不参与通过判定。
 *
 * 换句话说：能验证的验证到 12%，验证不了的说明为什么验证不了。
 */

import { buildTank } from '../src/tank/model/build'
import type { Tank } from '../src/tank/types'
import { HISTORICAL } from '../src/tank/data/historical'

type Dim = 'armor' | 'pen' | 'offroad' | 'adapt'

const TOLERANCE: Record<Dim, number> = {
  armor: 0.12,
  pen: 0.25,
  offroad: 0.3,
  adapt: Infinity, // 只报告，不判死
}

const RATIONALE: Record<Dim, string> = {
  armor: '物理关系最干净',
  pen: '弹药冶金学不建模',
  offroad: '基准定义分歧大',
  adapt: '无外部真值，仅报告',
}

function width(s: string): number {
  let w = 0
  for (const ch of s) w += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1
  return w
}

function pad(s: string, n: number, align: 'l' | 'r' = 'l'): string {
  const gap = Math.max(0, n - width(s))
  return align === 'l' ? s + ' '.repeat(gap) : ' '.repeat(gap) + s
}

function errPct(model: number, ref: number): number {
  if (ref === 0) return model === 0 ? 0 : Infinity
  return (model - ref) / ref
}

interface Row {
  name: string
  year: number
  tank: Tank
  ref: { armor: number; pen: number; offroad: number; adapt: number }
  errs: Record<Dim, number>
}

function collect(): Row[] {
  return HISTORICAL.map((h) => {
    const tank = buildTank(h.design)
    const errs: Record<Dim, number> = {
      armor: errPct(tank.raw.armor, h.ref.armor),
      pen: errPct(tank.raw.pen, h.ref.pen),
      offroad: errPct(tank.raw.offroad, h.ref.offroad),
      adapt: errPct(tank.raw.adapt, h.ref.adapt),
    }
    return { name: h.name, year: h.year, tank, ref: h.ref, errs }
  })
}

function fmt(model: number, ref: number, e: number, d: Dim): string {
  const mark = Math.abs(e) > TOLERANCE[d] ? '!' : ' '
  return `${model.toFixed(0)}/${ref}${mark}${(e * 100).toFixed(0)}%`
}

function printTable(rows: Row[]): void {
  const head =
    pad('型号', 22) +
    pad('年', 5, 'r') +
    pad('装甲 mm', 14, 'r') +
    pad('穿深 mm', 14, 'r') +
    pad('越野 km/h', 15, 'r') +
    pad('适应', 15, 'r') +
    pad('总分', 7, 'r')
  console.log(head)
  console.log('─'.repeat(width(head)))
  for (const r of rows) {
    const t = r.tank
    console.log(
      pad(r.name, 22) +
        pad(String(r.year), 5, 'r') +
        pad(fmt(t.raw.armor, r.ref.armor, r.errs.armor, 'armor'), 14, 'r') +
        pad(fmt(t.raw.pen, r.ref.pen, r.errs.pen, 'pen'), 14, 'r') +
        pad(fmt(t.raw.offroad, r.ref.offroad, r.errs.offroad, 'offroad'), 15, 'r') +
        pad(fmt(t.raw.adapt, r.ref.adapt, r.errs.adapt, 'adapt'), 15, 'r') +
        pad(String(t.score.total), 7, 'r'),
    )
  }
}

function printDetail(row: Row): void {
  const t = row.tank
  const p = t.physical
  console.log(`\n${row.name}（${row.year}）`)
  console.log('─'.repeat(64))
  console.log(`车重      ${(p.mass / 1000).toFixed(1)} t`)
  console.log(`尺寸      ${p.length.toFixed(2)} × ${p.width.toFixed(2)} × ${p.height.toFixed(2)} m`)
  console.log(`座圈      ${p.ring.toFixed(2)} m   乘员 ${p.crew} 人`)
  console.log(`吨功率    ${p.hpPerTon.toFixed(1)} hp/t   接地压力 ${p.groundPressure.toFixed(0)} kPa`)
  console.log(`速度      公路 ${p.vMax.toFixed(0)} / 越野 ${p.vOffroad.toFixed(0)} km/h`)
  console.log(
    `防护      首上 ${p.armorFront.toFixed(0)} / 炮塔 ${p.armorTurret.toFixed(0)} / 侧面 ${p.armorSide.toFixed(0)} mm`,
  )
  console.log(`火力      ${p.caliber}mm，500m 穿深 ${p.pen.toFixed(0)} mm，备弹 ${p.rounds} 发`)
  console.log(
    `成本      材料 ¥${t.cost.material.toLocaleString()} + 工时 ${t.cost.hours.toLocaleString()}h ¥${t.cost.labor.toLocaleString()} = ¥${t.cost.total.toLocaleString()}`,
  )
  console.log(
    `原始值    装甲 ${t.raw.armor.toFixed(0)}  穿深 ${t.raw.pen.toFixed(0)}  越野 ${t.raw.offroad.toFixed(0)}  适应 ${t.raw.adapt.toFixed(0)}`,
  )
  console.log(
    `四维分    装 ${t.score.armor}  火 ${t.score.pen}  机 ${t.score.offroad}  适 ${t.score.adapt}  →  总分 ${t.score.total}`,
  )
  if (t.flaws.length) console.log(`缺陷      ${t.flaws.join('；')}`)
}

function main(): void {
  const argv = process.argv.slice(2)
  const detailIdx = argv.indexOf('--detail')
  const detailName = detailIdx >= 0 ? argv[detailIdx + 1] : undefined
  const rows = collect()

  if (detailName) {
    const row = rows.find((r) => r.name.includes(detailName) || r.tank.design.name.includes(detailName))
    if (!row) {
      console.error(`找不到「${detailName}」`)
      process.exitCode = 1
      return
    }
    printDetail(row)
    return
  }

  console.log('\n设计局校准台 · 19 辆历史坦克回归\n')
  printTable(rows)

  const dims: Dim[] = ['armor', 'pen', 'offroad', 'adapt']
  const meanAbs = (d: Dim): number => rows.reduce((s, r) => s + Math.abs(r.errs[d]), 0) / rows.length
  const worst = (d: Dim): number => Math.max(...rows.map((r) => Math.abs(r.errs[d])))

  console.log('\n维度      平均误差  最差一辆   门限      说明')
  console.log('─'.repeat(76))
  for (const d of dims) {
    const gated = TOLERANCE[d] !== Infinity
    const ok = !gated || worst(d) <= TOLERANCE[d]
    const gate = gated ? `±${(TOLERANCE[d] * 100).toFixed(0)}%` : '仅报告'
    console.log(
      pad(d, 10) +
        pad(`${(meanAbs(d) * 100).toFixed(1)}%`, 10, 'r') +
        pad(`${(worst(d) * 100).toFixed(1)}%`, 11, 'r') +
        pad(gate, 9, 'r') +
        '   ' +
        RATIONALE[d] +
        (ok ? '' : '  ✗'),
    )
  }

  const failed = rows.filter((r) => dims.some((d) => Math.abs(r.errs[d]) > TOLERANCE[d]))
  if (failed.length) {
    console.log('\n未通过：')
    for (const r of failed.sort((a, b) => a.year - b.year)) {
      const bad = dims
        .filter((d) => Math.abs(r.errs[d]) > TOLERANCE[d])
        .map((d) => `${d} ${(r.errs[d] * 100).toFixed(0)}%（门限 ${(TOLERANCE[d] * 100).toFixed(0)}%）`)
      console.log(`  ${pad(r.name, 22)} ${bad.join('   ')}`)
    }
    console.log('')
    process.exitCode = 1
  } else {
    console.log(`\n全部 ${rows.length} 辆通过\n`)
  }
}

main()

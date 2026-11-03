/**
 * 生成 docs/DESIGN.md 附录 C 的科技表（1991 年前的 148 条）。
 *
 *   npm run tech:table > tech.md
 *
 * 只打印 markdown，不写文件 —— 因为附录 C 是设计文档的一部分，
 * 什么时候同步进文档由人决定（数据改了但不想动文档，是合理状态）。
 */
import { BOARD_NAMES, TECH, isHorizon } from '../src/tank/data/tech'

const boards: Array<keyof typeof BOARD_NAMES> = ['armor', 'ammo', 'gun', 'power', 'run', 'aux', 'ind']
const out: string[] = []

for (const b of boards) {
  const list = TECH.filter((t) => t.board === b && !isHorizon(t)).sort((x, y) => x.year - y.year || x.ladder.localeCompare(y.ladder))
  out.push(`#### ${BOARD_NAMES[b]}（${list.length} 条）\n`)
  out.push('| 年 | 工期 | 费用 | 技术 | 梯子 | 第几代 | 改了什么 |')
  out.push('|---|---|---|---|---|---|---|')
  for (const t of list) {
    // 「开局」的判据必须和 STARTING_TECH 一致：year<=1915 且 months===0。
    // 只看 months===0 会把 ammo.pen.1（year=1941、工期未填）误标成开局。
    const starting = t.year <= 1915 && t.months === 0
    const y = starting ? '开局' : String(t.year)
    const m = t.months === 0 ? '—' : `${t.months} 月`
    const c = t.cost === 0 ? '—' : `¥${(t.cost / 1000).toFixed(0)}k`
    out.push(`| ${y} | ${m} | ${c} | ${t.name} | ${t.ladder.split('.')[1]} | ${t.tier} | ${t.effect} |`)
  }
  out.push('')
}

console.log(out.join('\n'))

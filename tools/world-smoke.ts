/**
 * 世界编制的冒烟测试：9 国、年份过滤、数量爬坡、四维来源。
 * 这部分数据是占位，但界面已经依赖它；表一改，这里要跟着响。
 */

const { worldAt, worldCountries } = await import('../src/tank/data/world')
const { PLAYABLE_NATION_IDS } = await import('../src/tank/data/nation-profiles')

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

console.log('\n世界编制 · 冒烟测试\n')

const countries = worldCountries(1916)
check('编制表覆盖 9 个主要国家', countries.length === 9, `实际 ${countries.length}`)
check(
  '国家顺序与选国家页一致',
  countries.map((c) => c.id).join(',') === PLAYABLE_NATION_IDS.join(','),
  countries.map((c) => c.id).join(','),
)

const gbr1916 = worldAt('gbr', 1916)
check('1916 英国有 Mark I', gbr1916.tanks.some((t) => t.name === 'Mark I'), gbr1916.tanks.map((t) => t.name).join(','))
check('1916 英国总数 53 台', gbr1916.total === 53, String(gbr1916.total))
check('总数等于各型号数量之和', gbr1916.total === gbr1916.tanks.reduce((sum, t) => sum + t.qty, 0))

const fra1916 = worldAt('fra', 1916)
const fra1917 = worldAt('fra', 1917)
check('1916 法国尚未列装', fra1916.tanks.length === 0 && fra1916.total === 0)
check('1917 法国列装 FT-17', fra1917.tanks.some((t) => t.name === '雷诺 FT-17'))

const ger1918 = worldAt('ger', 1918)
const ger1920 = worldAt('ger', 1920)
check('1918 德国有 A7V', ger1918.tanks.some((t) => t.name === 'A7V'))
check('1920 德国 A7V 已退役', !ger1920.tanks.some((t) => t.name === 'A7V'))

const usa1942 = worldAt('usa', 1942)
check('1942 美国有谢尔曼', usa1942.tanks.some((t) => t.name.includes('谢尔曼')))
const usa1991 = worldAt('usa', 1991)
const abrams = usa1991.tanks.find((t) => t.name.includes('艾布拉姆斯'))
check('1991 美国有艾布拉姆斯', abrams !== undefined)
check('真实 fixture 的四维不是估算值', abrams?.estimated === false)
check('估算型号会标 estimated', worldAt('ita', 1940).tanks.every((t) => t.estimated))

const sov1991 = worldAt('sov', 1991)
check('1991 苏联有 T-72A', sov1991.tanks.some((t) => t.name === 'T-72A'))
check('1991 苏联总数大于 0', sov1991.total > 0, String(sov1991.total))
check('每型数量都为正整数', countries.every((c) => worldAt(c.id, 1960).tanks.every((t) => Number.isInteger(t.qty) && t.qty > 0)))

console.log(`\n${pass} 通过 / ${fail} 失败\n`)
process.exit(fail > 0 ? 1 : 0)

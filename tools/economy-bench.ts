/**
 * 经济闭环 · 验收。
 *
 * 验的是「一局游戏能不能真的转起来」：
 *   接单 → 备料 → 产线出车 → 交付 → 回款 → 下一单
 * 以及失败路径（逾期、破产）、存档往返、v2 迁移。
 */

import { TOTAL_DAYS, dayOf } from '../src/tank/sim/calendar'
import { advanceDays } from '../src/tank/sim/advance'
import { START_CASH, createGame, type GameState } from '../src/tank/sim/state'
import { acceptOffer, auditBribes, bidPrice, productCandidates, productMeets, refreshOffers } from '../src/tank/sim/contract'
import { buildTank } from '../src/tank/model/build'
import { designYear } from '../src/tank/model/era'
import { HISTORICAL } from '../src/tank/data/historical'
import { blocOf, customerAllowed } from '../src/tank/data/nations'
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

console.log('\n经济闭环 · 验收\n')

// ── 1. 开局 ────────────────────────────────────────────────
const g = createGame(7)
check('开局现金 200 万', g.cash === START_CASH, `实际 ${g.cash}`)
check('开局产品是 FT-17', g.design.name === 'FT-17', g.design.name)
check('开局没有产线', g.factory === null)
check('开局没有订单', g.contract === null)
check('开局信誉 50', g.rep === 50, String(g.rep))

refreshOffers(g)
check('开局有三份标', g.offers.length === 3, `实际 ${g.offers.length}`)
check('标里有四维门槛', g.offers.every((o) => o.need.armor > 0 && o.totalMin > 0))
check('每份标都有竞品与贿赂价', g.offers.every((o) => o.rival.score > 0 && o.bribeCost > 0))
check('信誉 50 按原价', bidPrice(g.offers[0]!, 50, 'normal') === g.offers[0]!.unitPrice)
check('信誉 100 能溢价', bidPrice(g.offers[0]!, 100, 'normal') > g.offers[0]!.unitPrice)
check('压价 5% 更便宜', bidPrice(g.offers[0]!, 50, 'undercut') < bidPrice(g.offers[0]!, 50, 'normal'))
check('FT-17 满足第一份标', productMeets(buildTank(g.design), g.offers[0]!))

// ── 2. 接单 ────────────────────────────────────────────────
const cashBefore = g.cash
const offer = g.offers[0]!
const accepted = acceptOffer(g, offer.id)
check('接单成功', accepted.ok, accepted.msg)
check('产线已建且运转', g.factory?.lines.length === 1 && g.factory.lines[0]!.state === 'running')
check('订单在手上', g.contract?.qty === offer.qty && g.contract?.delivered === 0)
check('首批备料花了钱', g.cash < cashBefore, `${cashBefore} → ${g.cash}`)
check('首批料进了仓', (g.factory?.stock[g.factory.lines[0]!.spec.material] ?? 0) > 0)

// ── 3. 跑 200 天：应该交完、回款、自动招标 ─────────────────
const adv = advanceDays(g, 200)
check('订单已交完', g.contract === null, g.contract ? `${g.contract.delivered}/${g.contract.qty}` : '')
check('产线生产过', (g.factory?.produced ?? 0) >= offer.qty, `实际 ${g.factory?.produced}`)
check('现金为正', g.cash > 0, `实际 ${g.cash}`)
check('回款进了账', g.log.some((l) => l.t.includes('订单完成')))
check('advanceDays 报告订单完成', adv.contractDone)
check('交完后有新标', g.offers.length === 3, `实际 ${g.offers.length}`)
check('交完后产线停工（不烧工资）', g.factory?.lines[0]?.state === 'idle', g.factory?.lines[0]?.state)
check('按期交付信誉上涨', g.rep > 50, String(g.rep))

// ── 3b. 阵营与出口限制 ────────────────────────────────────
check('1941 法国属同盟', blocOf('fra', 1941) === 'allies')
check('1941 德国属轴心', blocOf('ger', 1941) === 'axis')
check('1950 苏联属东方', blocOf('sov', 1950) === 'east')
check('1950 法国属西方', blocOf('fra', 1950) === 'west')
check('1941 德国买不到苏联车', !customerAllowed('ger', 'sov', 1941))
check('1941 德国能买意大利车', customerAllowed('ger', 'ita', 1941))
check('中立国谁都能卖', customerAllowed('swe', 'sov', 1941))

const axis = createGame(61)
axis.era = 3
axis.day = dayOf(1941, 6, 1)
axis.home = 'ger'
refreshOffers(axis, true)
const axisNations = axis.offers.map((o) => o.nation)
check('轴心客户里没有苏联', !axisNations.includes('苏联'), axisNations.join(','))
check('轴心客户全是轴心或中立', axisNations.every((n) => ['意大利', '日本', '瑞典', '瑞士'].includes(n)), axisNations.join(','))

const allied = createGame(63)
allied.era = 3
allied.day = dayOf(1941, 6, 1)
allied.home = 'sov'
refreshOffers(allied, true)
const alliedNations = allied.offers.map((o) => o.nation)
check('同盟客户里没有德国', !alliedNations.includes('德国'), alliedNations.join(','))
check('同盟客户里有英国或美国', alliedNations.some((n) => n === '英国' || n === '美国'), alliedNations.join(','))

// ── 4. 存档往返 ────────────────────────────────────────────
const json = encodeSave(g)
const loaded = decodeSave(json)
check('读档成功', loaded !== null)
check('产品保留', loaded?.design.name === g.design.name, loaded?.design.name)
check('国家保留在存档里', loaded?.home === g.home)
check('产线保留', loaded?.factory?.produced === g.factory?.produced)
check('存档往返稳定', loaded ? encodeSave(loaded) === json : false)

// ── 5. 逾期：同样一局，逾期结算拿得更少 ────────────────────
function runOrder(seed: number, lateBy: number): GameState {
  const s = createGame(seed)
  refreshOffers(s)
  acceptOffer(s, s.offers[0]!.id)
  if (lateBy > 0) s.contract!.deadline = s.day - lateBy
  advanceDays(s, 200)
  return s
}
const onTime = runOrder(21, 0)
const late = runOrder(21, 1)
check('逾期有日志', late.log.some((l) => l.t.includes('逾期')), late.log.at(-1)?.t)
check('逾期收的钱更少', late.cash < onTime.cash, `${late.cash} vs ${onTime.cash}`)

// ── 6. 破产 ────────────────────────────────────────────────
const broke = createGame(13)
refreshOffers(broke)
acceptOffer(broke, broke.offers[0]!.id)
broke.cash = 1
const brokeRes = advanceDays(broke, 10)
check('现金见底会破产', broke.over && brokeRes.ended && broke.log.some((l) => l.t.includes('破产')))

// ── 7. 不达标不能接 ────────────────────────────────────────
const weak = createGame(17)
refreshOffers(weak)
weak.design.armor.front = 0
weak.design.armor.side = 0
weak.design.armor.turretFront = 0
const refused = acceptOffer(weak, weak.offers[0]!.id)
check('四维不达标被拒', !refused.ok, refused.msg)
check('被拒后没有订单', weak.contract === null)

// ── 8. 产品年代闸门 ────────────────────────────────────────
const early = productCandidates(0).map((h) => h.name)
check('1915 年能选 FT-17', early.some((n) => n.includes('FT-17')))
check('1915 年选不到 A7V（1918）', !early.some((n) => n.includes('A7V')))
const ww2 = productCandidates(dayOf(1944, 6, 6)).map((h) => h.name)
check('1944 年能选 T-34/85', ww2.some((n) => n.includes('T-34/85')))

// ── 9. 时代决定客户与门槛 ──────────────────────────────────
const era3 = createGame(31)
era3.era = 3
refreshOffers(era3, true)
check('二战标参照 T-34/76', era3.offers[0]?.ref.includes('T-34/76') === true, era3.offers[0]?.ref)

// ── 9b. 竞品 / 贿赂 / 审计 ───────────────────────────────
const rivalGame = createGame(41)
refreshOffers(rivalGame)
const rivalOffer = rivalGame.offers[0]!
rivalOffer.rival.score = 99_999
const lose = acceptOffer(rivalGame, rivalOffer.id)
check('竞品分太高时 normal 被拒', !lose.ok && lose.msg.includes('竞品'), lose.msg)
const bribed = acceptOffer(rivalGame, rivalOffer.id, 'bribe')
check('贿赂能拿下标', bribed.ok, bribed.msg)
check('贿赂次数记 1', rivalGame.bribes === 1, String(rivalGame.bribes))
check('贿赂写进日志', rivalGame.log.some((l) => l.t.includes('贿赂')))

const under = createGame(43)
refreshOffers(under)
const underOffer = under.offers[0]!
const underTank = buildTank(under.design)
underOffer.rival.score = Math.floor(underTank.score.total / 0.95)
check('竞品刚好压过原价', !acceptOffer(under, underOffer.id).ok)
const undercut = acceptOffer(under, underOffer.id, 'undercut')
check('压价 5% 能拿下', undercut.ok, undercut.msg)
check('压价合同单价更低', (under.contract?.unitPrice ?? 0) < bidPrice(underOffer, 50, 'normal'))
check('压价写进日志', under.log.some((l) => l.t.includes('压价')))

let auditCaught = false
for (let y = 1916; y <= 1991 && !auditCaught; y++) {
  const a = createGame(1)
  a.bribes = 1
  a.cash = 1_000_000
  a.rep = 50
  a.day = dayOf(y, 1, 1)
  if (auditBribes(a, a.day)) {
    auditCaught = true
    check('审计罚款并扣信誉', a.cash < 1_000_000 && a.rep === 35, `${a.cash} / ${a.rep}`)
    check('审计后旧账清零', a.bribes === 0)
  }
}
check('审计最终会查出贿赂', auditCaught)

// ── 10. 确定性与规模 ───────────────────────────────────────
check('同种子同操作结果逐字节相同', encodeSave(runOrder(99, 0)) === encodeSave(runOrder(99, 0)))

const clock = createGame(5)
const t0 = performance.now()
advanceDays(clock, TOTAL_DAYS)
const ms = performance.now() - t0
check('没有订单时跑完 77 年仍然很快', ms < 500, `${ms.toFixed(1)} ms`)

// ── 11. v1 / v2 迁移 ──────────────────────────────────────
const v2 = decodeSave('{"v":2,"seed":1,"day":100,"cash":500000,"over":false,"log":[]}')
check('v2 存档可读', v2 !== null && v2.day === 100)
check('v2 默认 FT-17', v2?.design.name === 'FT-17')
check('v2 没有产线 / 订单', v2?.factory === null && v2?.contract === null)
check('v2 读回来有标（界面会补）', v2?.offers.length === 0)

// ── 12. 设计年代闸门 ──────────────────────────────────────
const byName = (n: string): GameState['design'] => {
  const h = HISTORICAL.find((x) => x.name.includes(n))
  if (!h) throw new Error(`没找到 ${n}`)
  return JSON.parse(JSON.stringify(h.design)) as GameState['design']
}
check('FT-17 的设计年代是 1917', designYear(byName('FT-17')) === 1917, String(designYear(byName('FT-17'))))
check('T-34/76 的设计年代是 1941', designYear(byName('T-34/76')) === 1941, String(designYear(byName('T-34/76'))))
check('虎王的设计年代是 1944', designYear(byName('虎王')) === 1944, String(designYear(byName('虎王'))))

const future = createGame(53)
refreshOffers(future)
future.design = byName('虎王')
const futureRes = acceptOffer(future, future.offers[0]!.id)
check('1915 年接不了 1944 年的车', !futureRes.ok && futureRes.msg.includes('1944'), futureRes.msg)

console.log(`\n${pass} 通过 / ${fail} 失败\n`)
if (fail > 0) process.exitCode = 1

/**
 * 研发局的科技树。
 *
 * 四条规矩，写在最前面，因为它们决定了后面每一条数据长什么样：
 *
 * 1. **树上挂的是技术，不是产品。** 没有「虎王」，只有「重装甲 + 长身管 + 高膛压」。
 *    所以任何一条都能被玩家在 1935 年或 1960 年用来设计别的车。
 * 2. **一条 ladder 是同一门技术的世代序列。** 破甲弹 I/II/III/IV 是一行，不是四棵子树。
 *    世代之间必须**换函数**（改系数、改形状、开新选项），不能只是 +5%。
 * 3. **year 是最早可开工年。** 钱再多也提前不了 —— 这是「领先时代不可能、落后完全可能」的地基。
 * 4. **每一代都得让至少一个看得见的数字变 ≥8%，或者开一个新选项。**
 *    不到这个量的世代不该写进树里：玩家感觉不到的研发等于没有研发。
 *
 * 时长和造价的排法见 probe/tech-budget.ts 的「槽月预算」：
 * 不是一个个拍脑袋定的，是先算每段时代有多少槽月可用，再倒推每一代能吃多少。
 */

export type TechBoard = 'armor' | 'gun' | 'ammo' | 'power' | 'run' | 'aux' | 'ind'

export const BOARD_NAMES: Record<TechBoard, string> = {
  armor: '装甲',
  gun: '火炮',
  ammo: '炮弹',
  power: '动力',
  run: '行走',
  aux: '辅助',
  ind: '制造',
}

export interface TechTier {
  /** `${ladder}.${tier}` */
  id: string
  board: TechBoard
  /** 同一门技术的世代序列共用这个键 */
  ladder: string
  tier: number
  /** 技术名 */
  name: string
  /** 最早可开工年 */
  year: number
  /** 工期（月）；0 表示开局就有 */
  months: number
  /** 研发费（元）；开工时一次性付 */
  cost: number
  /** 前置：这些 id 全部完成后才能开工 */
  needs: string[]
  /** 这一代到底改了什么。写给玩家看，也写给将来的数值接线看。 */
  effect: string
  /** 函数类科技的系数改动（还没接进 tuning，先当数据存着） */
  fn?: Record<string, number>
}

function T(
  ladder: string,
  tier: number,
  name: string,
  year: number,
  months: number,
  cost: number,
  needs: string[],
  effect: string,
  fn?: Record<string, number>,
): TechTier {
  const board = ladder.split('.')[0] as TechBoard
  return { id: `${ladder}.${tier}`, board, ladder, tier, name, year, months, cost, needs, effect, fn }
}

// ────────────────────────────────────────────────────────────
// 装甲
// ────────────────────────────────────────────────────────────

const ARMOR: TechTier[] = [
  T('armor.steel', 1, '商用钢', 1912, 0, 0, [], 'ke 0.78：锅炉钢焊出来的铁盒子'),
  T('armor.steel', 2, '轧制均质钢', 1916, 6, 30_000, ['armor.steel.1'], 'ke 1.00：厚度第一次等于等效厚度', { ke: 1.0 }),
  T('armor.steel', 3, '改进轧制', 1930, 17, 60_000, ['armor.steel.2'], 'ke 1.04：晶粒度控制，同样的板更扛打', { ke: 1.04 }),
  T('armor.steel', 4, '电渣重熔', 1958, 32, 240_000, ['armor.steel.3'], 'ke 1.08：杂质少了，厚板不再脆', { ke: 1.08 }),

  T('armor.face', 1, '渗碳表面硬化', 1917, 8, 50_000, ['armor.steel.2'], 'ke 1.12，但遇到超口径弹反而掉到 0.95', { ke: 1.12 }),
  T('armor.face', 2, '中硬度装甲', 1943, 16, 180_000, ['armor.face.1'], 'ke 1.06，取消脆性：不再怕大口径', { ke: 1.06 }),

  T('armor.form', 1, '铆接车体', 1912, 0, 0, [], '工时 ×1.15：铆钉既漏弹又费工'),
  T('armor.form', 2, '焊接车体', 1934, 16, 120_000, ['armor.steel.2'], '工时 ×0.85，并解锁大倾角（铆接做不出斜板）', { labor: 0.85 }),
  T('armor.form', 3, '铸造车体', 1940, 12, 150_000, ['armor.form.2'], '成本 ×0.90、形状自由，但 ke ×0.95', { labor: 0.9, ke: 0.95 }),
  T('armor.form', 4, '精密铸造', 1962, 29, 220_000, ['armor.form.3'], '铸件的 ke 回到 0.98', { ke: 0.98 }),

  T('armor.slope', 1, '垂直装甲', 1912, 0, 0, [], '倾角滑条上限 15°'),
  T('armor.slope', 2, '大倾角设计', 1938, 12, 90_000, ['armor.form.2'], '倾角上限 15° → 70°，内部容积惩罚减半', { slopeMax: 70 }),
  T('armor.slope', 3, '双斜面尖头', 1944, 14, 160_000, ['armor.slope.2'], 'pike 下界 1.12：水平垂直同时借角', { pike: 1.12 }),

  T('armor.composite', 1, '间隙装甲', 1953, 26, 200_000, ['armor.form.4'], 'ce 1.30：第一层专门对付破甲弹的东西', { ce: 1.3 }),
  T('armor.composite', 2, '玻璃纤维夹层', 1963, 63, 420_000, ['armor.composite.1'], 'ke 1.35 / ce 1.90，密度降到 3.2', { ke: 1.35, ce: 1.9 }),
  T('armor.composite', 3, '陶瓷夹层', 1975, 72, 700_000, ['armor.composite.2'], 'ke 1.95 / ce 2.40：换掉整条曲线，不吃倾角', { ke: 1.95, ce: 2.4 }),
  T('armor.composite', 4, '非爆炸反应装甲', 1985, 76, 900_000, ['armor.composite.3'], 'ke 2.10 / ce 2.80，密度 4.0', { ke: 2.1, ce: 2.8 }),

  T('armor.era', 1, '爆炸反应装甲', 1982, 40, 300_000, ['armor.composite.2'], '外加模块：化学能 +400mm，动能 +40mm'),
  T('armor.era', 2, '串联战斗部对抗', 1990, 40, 450_000, ['armor.era.1', 'ammo.heat.3'], '对方的串联弹对你不再生效'),
]

// ────────────────────────────────────────────────────────────
// 炮弹
// ────────────────────────────────────────────────────────────

const AMMO: TechTier[] = [
  T('ammo.ap', 1, '普通穿甲弹', 1912, 0, 0, [], '全口径钢弹，碰斜板就跳'),
  T('ammo.ap', 2, '被帽穿甲弹', 1941, 12, 90_000, ['ammo.ap.1'], '斜板响应 s 1.00 → 0.85：被帽会「咬住」斜板', { slopeExp: 0.85 }),
  T('ammo.ap', 3, '风帽被帽弹', 1944, 10, 120_000, ['ammo.ap.2'], '远距保持 0.60 → 0.75：风帽拉直弹道', { rangeKeep: 0.75 }),

  T('ammo.apcr', 1, '钨芯硬芯弹', 1941, 10, 140_000, ['ammo.ap.2'], '高初速、近距离王者；远距 0.45、斜板 s 1.15 —— 分叉不是升级', { slopeExp: 1.15, rangeKeep: 0.45 }),

  T('ammo.apds', 1, '旋转稳定脱壳弹', 1944, 14, 160_000, ['ammo.apcr.1'], '弹芯/口径 0.60：轻弹芯终于有用了'),
  T('ammo.apds', 2, '尾翼稳定脱壳弹', 1957, 29, 260_000, ['ammo.apds.1'], '弹芯/口径 0.42，初速再上一档'),

  T('ammo.apfsds', 1, '钢芯长杆弹', 1961, 35, 340_000, ['ammo.apds.2', 'gun.rifling.2'], '长杆：中远距衰减极小，但 s 1.20 怕斜板', { slopeExp: 1.2, rangeKeep: 0.92 }),
  T('ammo.apfsds', 2, '钨芯长杆弹', 1974, 63, 520_000, ['ammo.apfsds.1'], '密度 18：同样杆径多穿四成', { density: 18 }),
  T('ammo.apfsds', 3, '贫铀长杆弹', 1984, 68, 700_000, ['ammo.apfsds.2', 'ammo.pen.3'], '密度 19 且自锐：打穿后不塌头', { density: 19 }),

  T('ammo.heat', 1, '破甲弹 · 早期', 1936, 12, 70_000, [], '1.0 × 口径：刚能用，还不如穿甲弹', { heatPerCaliber: 1.0 }),
  T('ammo.heat', 2, '破甲弹 · 药型罩', 1943, 12, 110_000, ['ammo.heat.1'], '1.8 × 口径：紫铜药型罩是关键', { heatPerCaliber: 1.8 }),
  T('ammo.heat', 3, '破甲弹 · 精密装药', 1959, 29, 260_000, ['ammo.heat.2'], '2.8 × 口径：炸高与同心度控制', { heatPerCaliber: 2.8 }),
  T('ammo.heat', 4, '串联破甲战斗部', 1989, 68, 620_000, ['ammo.heat.3'], '3.4 × 口径，且无视反应装甲', { heatPerCaliber: 3.4 }),

  T('ammo.prop', 1, '单基发射药', 1912, 0, 0, [], '基准能量'),
  T('ammo.prop', 2, '双基发射药', 1937, 10, 80_000, ['ammo.prop.1'], '能量 +8%：同样的炮打出更高初速', { charge: 1.08 }),
  T('ammo.prop', 3, '低烧蚀三基药', 1961, 26, 200_000, ['ammo.prop.2'], '能量 +6%，炮管寿命 ×1.5（维护费降）', { charge: 1.06, barrelLife: 1.5 }),

  T('ammo.pen', 1, '钨合金弹芯', 1941, 0, 0, [], '随硬芯弹一起到手'),
  T('ammo.pen', 2, '高密度钨合金', 1968, 48, 300_000, ['ammo.pen.1'], '密度 18：弹芯更短更重', { density: 18 }),
  T('ammo.pen', 3, '贫铀自锐弹芯', 1982, 63, 650_000, ['ammo.pen.2'], '密度 19 + 自锐效应，杆体穿透效率 ×1.08', { density: 19 }),
]

// ────────────────────────────────────────────────────────────
// 火炮
// ────────────────────────────────────────────────────────────

const GUN: TechTier[] = [
  T('gun.caliber', 1, '小口径炮', 1912, 0, 0, [], '口径上限 57mm'),
  T('gun.caliber', 2, '中口径炮', 1916, 6, 40_000, ['gun.caliber.1'], '口径上限 76mm', { caliberMax: 76 }),
  T('gun.caliber', 3, '大口径炮', 1937, 14, 130_000, ['gun.caliber.2'], '口径上限 88mm', { caliberMax: 88 }),
  T('gun.caliber', 4, '超大口径炮', 1943, 14, 220_000, ['gun.caliber.3'], '口径上限 122mm', { caliberMax: 122 }),
  T('gun.caliber', 5, '现代口径炮', 1961, 32, 420_000, ['gun.caliber.4'], '口径上限 125mm', { caliberMax: 125 }),

  T('gun.barrel', 1, '短身管', 1912, 0, 0, [], '倍径上限 30'),
  T('gun.barrel', 2, '中身管', 1936, 12, 90_000, ['gun.barrel.1'], '倍径上限 48', { barrelMax: 48 }),
  T('gun.barrel', 3, '长身管', 1943, 12, 150_000, ['gun.barrel.2'], '倍径上限 60', { barrelMax: 60 }),
  T('gun.barrel', 4, '超长身管', 1958, 29, 260_000, ['gun.barrel.3'], '倍径上限 70', { barrelMax: 70 }),

  T('gun.breech', 1, '低膛压炮尾', 1912, 0, 0, [], '装药系数上限 0.60'),
  T('gun.breech', 2, '中膛压炮尾', 1936, 14, 110_000, ['gun.breech.1'], '装药上限 1.00', { chargeMax: 1.0 }),
  T('gun.breech', 3, '高膛压炮尾', 1942, 14, 190_000, ['gun.breech.2'], '装药上限 1.15', { chargeMax: 1.15 }),
  T('gun.breech', 4, '自紧身管', 1955, 32, 340_000, ['gun.breech.3'], '装药上限 1.40：预应力让管壁吃得住', { chargeMax: 1.4 }),
  T('gun.breech', 5, '超高膛压', 1970, 63, 520_000, ['gun.breech.4'], '装药上限 1.55', { chargeMax: 1.55 }),

  T('gun.rifling', 1, '线膛炮', 1912, 0, 0, [], '旋转稳定，打不了长杆'),
  T('gun.rifling', 2, '滑膛炮', 1961, 29, 380_000, ['gun.barrel.4'], '解锁长杆弹；破甲弹不再被自转削弱'),

  T('gun.loading', 1, '人工装填', 1912, 0, 0, [], '基准射速'),
  T('gun.loading', 2, '半自动炮闩', 1944, 12, 130_000, ['gun.loading.1'], '射速 ×1.3'),
  T('gun.loading', 3, '自动装弹机', 1962, 35, 380_000, ['gun.loading.2'], '乘员 -1，射速 ×1.6，但炮塔体积 +'),

  T('gun.muzzle', 1, '无炮口装置', 1912, 0, 0, [], '基准后坐'),
  T('gun.muzzle', 2, '炮口制退器', 1940, 8, 60_000, ['gun.muzzle.1'], '后坐 -30%：大炮能装进小炮塔'),
  T('gun.muzzle', 3, '抽气装置', 1964, 17, 110_000, ['gun.muzzle.2'], '炮塔内不再灌硝烟，乘员效率 +'),
]

// ────────────────────────────────────────────────────────────
// 动力
// ────────────────────────────────────────────────────────────

const POWER: TechTier[] = [
  T('power.type', 1, '汽油机', 1912, 0, 0, [], '轻，但油耗高、易起火'),
  T('power.type', 2, '柴油机', 1932, 24, 160_000, ['power.type.1'], '油耗 ×0.65，但体积 ×1.25 —— 车体要加长'),
  T('power.type', 3, '燃气轮机', 1965, 72, 620_000, ['power.boost.3'], '功重比 ×1.8，油耗 ×2.2：换来的车体更短'),

  T('power.boost', 1, '自然吸气', 1912, 0, 0, [], '基准比功率'),
  T('power.boost', 2, '机械增压', 1935, 14, 130_000, ['power.boost.1'], '同排量功率 +25%'),
  T('power.boost', 3, '涡轮增压', 1948, 26, 280_000, ['power.boost.2'], '同排量功率 +45%'),
  T('power.boost', 4, '中冷', 1960, 23, 240_000, ['power.boost.3'], '再 +15%，且高负荷不掉功率'),

  T('power.trans', 1, '机械传动', 1912, 0, 0, [], '基准传动损失 22%'),
  T('power.trans', 2, '行星传动', 1940, 14, 170_000, ['power.trans.1'], '传动损失 15%，倒车速度翻倍'),
  T('power.trans', 3, '液力传动', 1955, 32, 300_000, ['power.trans.2'], '损失 12%，起步不打滑'),
  T('power.trans', 4, '电传动', 1983, 68, 600_000, ['power.trans.3'], '损失 10%，布局自由（发动机可横置）'),

  T('power.cool', 1, '水冷', 1912, 0, 0, [], '基准持续功率'),
  T('power.cool', 2, '高压冷却', 1943, 14, 150_000, ['power.cool.1'], '持续功率 +10%'),
  T('power.cool', 3, '高温合金', 1970, 57, 380_000, ['power.cool.2'], '持续功率 +20%，燃机才可能实用'),

  T('power.fuel', 1, '化油器供油', 1912, 0, 0, [], '基准耗油'),
  T('power.fuel', 2, '直喷供油', 1938, 12, 90_000, ['power.fuel.1'], '耗油 -8%，冷启动可靠'),
  T('power.fuel', 3, '多燃料适应', 1962, 26, 220_000, ['power.fuel.2'], '出口时不受油品限制（接国际订单加分）'),
]

// ────────────────────────────────────────────────────────────
// 行走
// ────────────────────────────────────────────────────────────

const RUN: TechTier[] = [
  T('run.susp', 1, '叶片弹簧悬挂', 1912, 0, 0, [], '极速上限 26 km/h'),
  T('run.susp', 2, '克里斯蒂悬挂', 1931, 20, 110_000, ['run.susp.1'], '极速上限 56，品质 0.55', { vCap: 56 }),
  T('run.susp', 3, '扭杆悬挂', 1938, 16, 160_000, ['run.susp.2'], '品质 0.70，行程更长', { vCap: 58 }),
  T('run.susp', 4, '液压悬挂', 1970, 57, 380_000, ['run.susp.3'], '品质 0.80，可调车姿（俯仰角 +）', { vCap: 65 }),
  T('run.susp', 5, '主动悬挂', 1985, 68, 620_000, ['run.susp.4'], '品质 0.90：越野速度逼近公路速度', { vCap: 70 }),

  T('run.track', 1, '窄履带', 1912, 0, 0, [], '履带宽 0.45m'),
  T('run.track', 2, '宽履带', 1940, 10, 90_000, ['run.track.1'], '履带宽上限 0.75m：接地压力直接降四成'),
  T('run.track', 3, '挂胶履带', 1960, 23, 180_000, ['run.track.2'], '寿命 ×2，维护费降'),

  T('run.wheel', 1, '简单负重轮', 1912, 0, 0, [], '基准'),
  T('run.wheel', 2, '大直径负重轮', 1939, 12, 80_000, ['run.wheel.1'], '簧下质量小，越野品质 +0.08'),
  T('run.wheel', 3, '小直径多轮', 1963, 17, 130_000, ['run.susp.3'], '车高 -0.15m：被弹面积更小'),

  T('run.drive', 1, '后置主动轮', 1912, 0, 0, [], '基准'),
  T('run.drive', 2, '前置主动轮', 1925, 14, 60_000, ['run.drive.1'], '车体前部更紧凑，但首上要开孔'),
]

// ────────────────────────────────────────────────────────────
// 辅助
// ────────────────────────────────────────────────────────────

const AUX: TechTier[] = [
  T('aux.radio', 1, '旗语联络', 1912, 0, 0, [], '电台分 0'),
  T('aux.radio', 2, '车载电台', 1918, 6, 50_000, ['aux.radio.1'], '电台分 1：单车能被指挥了'),
  T('aux.radio', 3, '高频电台', 1942, 10, 100_000, ['aux.radio.2'], '电台分 2'),
  T('aux.radio', 4, '跳频电台', 1972, 44, 260_000, ['aux.radio.3'], '电台分 3，且抗干扰'),

  T('aux.optics', 1, '简单瞄准镜', 1912, 0, 0, [], '火控分 0'),
  T('aux.optics', 2, '光学瞄准镜', 1935, 9, 70_000, ['aux.optics.1'], '火控分 1'),
  T('aux.optics', 3, '高倍率瞄准镜', 1963, 17, 140_000, ['aux.optics.2'], '火控分 2'),

  T('aux.rangefinder', 1, '无测距', 1912, 0, 0, [], '只能靠估'),
  T('aux.rangefinder', 2, '体视测距仪', 1939, 14, 160_000, ['aux.optics.2'], '火控分 +1，但昂贵且难维护'),
  T('aux.rangefinder', 3, '激光测距仪', 1975, 48, 320_000, ['aux.rangefinder.2'], '火控分 +2：首发命中率翻倍'),

  T('aux.night', 1, '无夜视', 1912, 0, 0, [], '夜间不可战'),
  T('aux.night', 2, '主动红外', 1959, 23, 260_000, ['aux.optics.2'], '能打夜战，但开灯就暴露'),
  T('aux.night', 3, '微光夜视', 1970, 44, 300_000, ['aux.night.2'], '被动夜视，不再暴露'),
  T('aux.night', 4, '热成像', 1983, 58, 560_000, ['aux.night.3'], '烟雾里也能看见'),

  T('aux.stab', 1, '无稳定器', 1912, 0, 0, [], '行进间不能射击'),
  T('aux.stab', 2, '单向稳定器', 1952, 23, 240_000, ['aux.optics.3'], '行进间可打，但只稳一个方向'),
  T('aux.stab', 3, '双向稳定器', 1970, 52, 400_000, ['aux.stab.2'], '真正的行进间射击'),

  T('aux.nbc', 1, '无三防', 1912, 0, 0, [], '核战场上就是靶子'),
  T('aux.nbc', 2, '集体三防', 1963, 44, 260_000, ['aux.radio.3'], '超压式，可穿防护服作战'),

  T('aux.fcs', 1, '无火控', 1912, 0, 0, [], '全靠炮手眼力'),
  T('aux.fcs', 2, '模拟弹道计算机', 1962, 26, 280_000, ['aux.rangefinder.2'], '自动装表：反应时间减半'),
  T('aux.fcs', 3, '数字火控', 1989, 44, 520_000, ['aux.fcs.2', 'aux.night.4'], '动对动射击成为可能'),
]

// ────────────────────────────────────────────────────────────
// 制造
// ────────────────────────────────────────────────────────────

const IND: TechTier[] = [
  T('ind.assembly', 1, '手工装配', 1912, 0, 0, [], '工时基准'),
  T('ind.assembly', 2, '流水线', 1935, 14, 140_000, ['ind.assembly.1'], '单台工时 ×0.75'),
  T('ind.assembly', 3, '柔性产线', 1975, 52, 400_000, ['ind.assembly.2'], '换型成本 ×0.4：能小批量多品种'),

  T('ind.mat', 1, '通用钢材', 1912, 0, 0, [], '材料费基准'),
  T('ind.mat', 2, '标准件互换', 1930, 17, 100_000, ['ind.mat.1'], '材料费 ×0.92'),
  T('ind.mat', 3, '精密切割套裁', 1960, 23, 240_000, ['ind.mat.2'], '材料费 ×0.88'),

  T('ind.qc', 1, '目视检验', 1912, 0, 0, [], '缺陷率基准'),
  T('ind.qc', 2, '抽检制度', 1940, 10, 110_000, ['ind.qc.1'], '返工率 ×0.7'),
  T('ind.qc', 3, '统计过程控制', 1965, 44, 260_000, ['ind.qc.2'], '返工率 ×0.5，可承诺交付日期'),

  T('ind.log', 1, '厂内仓储', 1912, 0, 0, [], '仓库容量基准'),
  T('ind.log', 2, '供应链管理', 1970, 48, 340_000, ['ind.log.1'], '采购价 ×0.9，缺料停工减半'),

  T('ind.tool', 1, '通用机床', 1912, 0, 0, [], '工装基准'),
  T('ind.tool', 2, '专用工装', 1938, 14, 150_000, ['ind.tool.1'], '工时 ×0.9'),
  T('ind.tool', 3, '数控机床', 1980, 58, 500_000, ['ind.tool.2'], '工时 ×0.8，精度提升（缺陷率降）'),
]

/** 全部科技，按 id 排序稳定 —— 模拟器的行为必须可复现。 */
// ────────────────────────────────────────────────────────────
// 冷战后期到 21 世纪：让玩家的最后二十年仍然有东西可研
// ────────────────────────────────────────────────────────────

const LATE: TechTier[] = [
  // 装甲
  T('armor.spall', 1, '防崩落内衬', 1966, 30, 260_000, ['armor.composite.1'], '被击穿不等于全车完蛋：乘员能活着开回去'),
  T('armor.spall', 2, '双层复合内衬', 1986, 45, 520_000, ['armor.spall.1'], '内衬兼作隔热与降噪，人待得住'),
  T('armor.layout', 1, '有人炮塔', 1915, 0, 0, [], '三个人挤在炮塔里，这是所有车的起点'),
  T('armor.layout', 2, '无人炮塔', 1989, 54, 900_000, ['armor.layout.1', 'armor.composite.3'], '乘员全下到车体：炮塔可以做得又小又扁'),
  T('armor.aps', 1, '主动防护系统', 1996, 60, 1_100_000, ['armor.era.1', 'aux.warn.1'], '来袭弹在命中之前就被打掉'),
  T('armor.aps', 2, '硬杀伤拦截', 2008, 72, 1_800_000, ['armor.aps.1'], '连动能弹也拦：装甲第一次不再是唯一答案'),

  // 火炮
  T('gun.thermal', 1, '身管热护套', 1972, 36, 300_000, ['gun.barrel.3'], '受热不弯：连打十发精度也不崩'),
  T('gun.feed', 1, '分装弹', 1915, 0, 0, [], '弹头与药包分开搬，装填慢但药室小'),
  T('gun.feed', 2, '整装弹', 1943, 18, 120_000, ['gun.feed.1'], '一发到位，装填手少一道动作'),
  T('gun.feed', 3, '双路供弹', 1978, 40, 560_000, ['gun.feed.2', 'gun.loading.2'], '两种弹随时切：先打穿甲，再打高爆'),
  T('gun.etc', 1, '电热化学炮', 2015, 84, 2_400_000, ['gun.breech.5', 'power.hybrid.1'], '化学能的天花板被顶开一截'),

  // 炮弹
  T('ammo.sabot', 1, '轻合金弹托', 1952, 24, 150_000, ['ammo.apds.1'], '弹托更轻，初速再涨一截'),
  T('ammo.sabot', 2, '复合材料弹托', 1982, 45, 480_000, ['ammo.sabot.1'], '脱壳更干净：远距离不再掉速'),
  T('ammo.mp', 1, '多用途弹', 1982, 42, 420_000, ['ammo.heat.3'], '一发兼顾破甲与杀伤：备弹种类减半'),
  T('ammo.guided', 1, '制导炮弹', 2000, 70, 1_500_000, ['aux.nav.1', 'ammo.heat.4'], '炮射导弹：射程不再受直瞄限制'),
  T('ammo.prog', 1, '可编程引信', 2006, 70, 1_400_000, ['ammo.mp.1'], '空爆：打掩体后面的步兵'),

  // 动力
  T('power.apu', 1, '辅助动力单元', 1962, 30, 260_000, ['power.type.2'], '熄火也能供电：伏击时不用烧油'),
  T('power.exhaust', 1, '红外抑制排气', 1978, 36, 380_000, ['power.cool.2'], '排气混冷空气：热像仪不容易找到你'),
  T('power.hybrid', 1, '混合电传动', 1995, 60, 1_000_000, ['power.trans.4'], '损失降到 8%，还能原地发电'),
  T('power.fuelcell', 1, '燃料电池', 2012, 80, 2_000_000, ['power.hybrid.1'], '静默待机：热信号几乎为零'),

  // 行走
  T('run.damper', 1, '液压减震', 1970, 34, 320_000, ['run.susp.3'], '越野极速上限再抬一档'),
  T('run.damper', 2, '自适应阻尼', 1988, 50, 700_000, ['run.damper.1', 'aux.fcs.2'], '悬挂自己判断地形，人只管开'),
  T('run.active', 2, '主动悬挂 II', 2002, 70, 1_600_000, ['run.susp.5'], 'vCap 80：越野跑得比公路还稳'),

  // 辅助
  T('aux.warn', 1, '激光告警', 1982, 40, 380_000, ['aux.night.2'], '被照射就知道被瞄准了'),
  T('aux.nav', 1, '惯性导航', 1985, 44, 460_000, ['aux.radio.3'], '没有地标也知道自己在哪'),
  T('aux.bms', 1, '车际信息系统', 1990, 40, 780_000, ['aux.radio.4', 'aux.nav.1'], '一辆看见，全连开火'),
  T('aux.bms', 2, '战场网络', 1998, 66, 1_200_000, ['aux.bms.1'], '不只是连排：接进整个战区'),
  T('aux.crew', 1, '车长独立热像', 1988, 48, 720_000, ['aux.night.4'], '猎歼式射击：车长找目标，炮长打'),
  T('aux.ai', 1, 'AI 辅助火控', 2018, 90, 2_600_000, ['aux.fcs.3', 'aux.bms.2'], '自动识别与分配目标'),

  // 制造
  T('ind.robot', 1, '焊接机器人', 1980, 44, 560_000, ['ind.assembly.2'], '工时 ×0.85，焊缝一致性还更好'),
  T('ind.cad', 1, '计算机辅助设计', 1985, 48, 640_000, ['ind.tool.3'], '研发速度 ×1.10：改一版图纸不用重画'),
  T('ind.lean', 1, '精益生产', 1988, 50, 720_000, ['ind.qc.3'], '材料 ×0.90：省下的是浪费掉的那部分'),
  T('ind.additive', 1, '增材制造', 2010, 78, 1_900_000, ['ind.robot.1'], '工时 ×0.80：复杂件不再受模具限制'),
]

export const TECH: readonly TechTier[] = [...ARMOR, ...AMMO, ...GUN, ...POWER, ...RUN, ...AUX, ...IND, ...LATE]

export const TECH_BY_ID: ReadonlyMap<string, TechTier> = new Map(TECH.map((t) => [t.id, t]))

/** 开局就有的：1915 年之前就已成熟的那些。 */
export const STARTING_TECH: readonly TechTier[] = TECH.filter((t) => t.year <= 1915 && t.months === 0)

/** 日历停在 1991 年，所以这一年的技术是「看得见、够不到」的终局清单。 */
export const HORIZON_FROM = 1992

/**
 * 是不是「终局清单」上的技术 —— 也就是本作主线够不到的那批。
 *
 * 它们留在数据里的理由有三个：
 * ① 日历一旦延长（DLC / 自由模式）直接就能用，不用重做；
 * ② 科技树 UI 上它们是可见的下一格，玩家的「前沿」有画面感；
 * ③ 结算报表可以列出「你差一点就摸到的东西」。
 * 所以它们不参与节奏验收，但也不能删。
 */
export function isHorizon(t: TechTier): boolean {
  return t.year >= HORIZON_FROM
}

export function tiersOf(board: TechBoard): TechTier[] {
  return TECH.filter((t) => t.board === board)
}

export function ladderOf(ladder: string): TechTier[] {
  return TECH.filter((t) => t.ladder === ladder).sort((a, b) => a.tier - b.tier)
}

// ────────────────────────────────────────────────────────────
// 研发局本身：槽位、速度、开销
// ────────────────────────────────────────────────────────────

export interface ResearchUpgrade {
  /** 从哪一年起可以买 */
  year: number
  /** 一次性的建设费 */
  cost: number
  /** 建成后每月新增的维持费 */
  upkeep: number
  name: string
  effect: string
}

/**
 * 科研槽：从一开始的 1 个，最多 5 个。
 * 买槽不只是花钱，还会把每月的固定开销永久抬高 —— 这是「扩张是有代价的」的第一道闸。
 */
export const SLOT_UPGRADES: readonly ResearchUpgrade[] = [
  { year: 1934, cost: 180_000, upkeep: 6_000, name: '第二设计室', effect: '科研槽 2' },
  { year: 1955, cost: 420_000, upkeep: 11_000, name: '第三设计室', effect: '科研槽 3' },
  { year: 1972, cost: 900_000, upkeep: 20_000, name: '试制中心', effect: '科研槽 4' },
  { year: 1980, cost: 640_000, upkeep: 17_000, name: '并行设计台', effect: '科研槽 5' },
]

/**
 * 研发速度：同样的槽，干活更快。
 * 注意它和加槽的区别 —— 加槽能并行，提速只能让单线更快。两者不能互相替代。
 */
export const SPEED_UPGRADES: readonly ResearchUpgrade[] = [
  { year: 1934, cost: 150_000, upkeep: 4_000, name: '绘图室扩建', effect: '研发速度 ×1.15' },
  { year: 1958, cost: 600_000, upkeep: 14_000, name: '计算中心', effect: '研发速度 ×1.30' },
]

/** 每个科研槽每月的基础开销（元）。随年代上浮，因为工程师也要涨工资。 */
export const SLOT_UPKEEP_BASE = 3_500

/**
 * 时代强度：战争和军备竞赛会让同一个人干出更多的活。
 * 这跟「战时吞吐 ×2.5」是同一件事，只是作用在研发而不是产线上 ——
 * 所以时钟不走快，是同样的月份里产出更多。
 */
export const ERA_INTENSITY: readonly { year: number; mult: number }[] = [
  { year: 1915, mult: 1.30 },
  { year: 1919, mult: 1.00 },
  { year: 1933, mult: 1.05 },
  { year: 1939, mult: 1.55 },
  { year: 1945, mult: 1.08 },
  { year: 1962, mult: 1.25 },
  { year: 1980, mult: 1.28 },
]

export function intensityAt(year: number): number {
  let mult = 1
  for (const row of ERA_INTENSITY) if (year >= row.year) mult = row.mult
  return mult
}

/**
 * 超前研发惩罚：年份不是闸门，是价格标签。
 *
 * 1915 年也能开工 1960 年的技术，只是慢得多、也贵得多 ——
 * 这比「没到年份就不许点」既更符合历史，也更好玩：
 * 玩家可以赌一把未来的技术，代价是吞掉好几倍的工期和钱。
 *
 * 基准点：超前 3 年 = 时长与费用各 ×1.5（这是提需求时给的锚点），
 * 之后每多超前 3 年再乘 1.5。所以超前 10 年约 ×3.9，超前 20 年约 ×15，
 * 超前 30 年约 ×57 —— 大致是「想都别想」。
 */
export function earlyPenalty(yearsEarly: number): number {
  if (yearsEarly <= 0) return 1
  return Math.pow(1.5, yearsEarly / 3)
}

/**
 * 追赶系数：研发已经过时的技术更便宜。
 *
 * 现实里这是两件事 —— 技术外溢（论文、专利、拆过的样车）和产业扩散
 * （上下游supplier已经把工装、材料、标准件都做成了货架商品），
 * 所以「补一门 1930 年的课」比「赌一门 1990 年的课」轻松得多。
 *
 * 但它**故意不是**超前惩罚的镜像：镜像写法（1.5^(-落后年数/3)）在落后 6 年时
 * 就打五折，等于把「落后会复利」这个核心教训抹掉了。
 * 这里用 6 年为一个 1.5 倍台阶，并且下限锁在 0.5：
 * 外溢只送图纸，不送工程师 —— 活还是要人干的。
 *
 *   落后 1 年 ×0.93 ／ 3 年 ×0.82 ／ 6 年 ×0.67 ／ 10 年 ×0.52 ／ 15 年以上 ×0.50
 */
export const CATCH_UP_FLOOR = 0.5

export function catchUpDiscount(yearsLate: number): number {
  if (yearsLate <= 0) return 1
  return Math.max(CATCH_UP_FLOOR, Math.pow(1.5, -yearsLate / 6))
}

/**
 * 一门技术今天开工要花多少：把超前惩罚和追赶折扣合成一个系数。
 *
 * 两个方向共用同一个入口，因为它俩本来就该互相抵消一部分 ——
 * 一个落后 20 年的厂，靠补课是能追回来的，只是追回来的时候别人又往前走了。
 */
export function effortMult(techYear: number, currentYear: number): number {
  const gap = techYear - currentYear
  return gap > 0 ? earlyPenalty(gap) : catchUpDiscount(-gap)
}

/** 把系数落到具体的月数和钱上（月数向上取整，钱取整到百）。 */
export function effortFor(
  months: number,
  cost: number,
  techYear: number,
  currentYear: number,
): { months: number; cost: number; mult: number } {
  const mult = effortMult(techYear, currentYear)
  return {
    months: Math.max(1, Math.ceil(months * mult)),
    cost: Math.round((cost * mult) / 100) * 100,
    mult,
  }
}
export const UPKEEP_INDEX: readonly { year: number; mult: number }[] = [
  { year: 1915, mult: 1.0 },
  { year: 1930, mult: 1.4 },
  { year: 1945, mult: 2.2 },
  { year: 1960, mult: 3.4 },
  { year: 1975, mult: 5.0 },
  { year: 1985, mult: 6.5 },
]

export function upkeepIndex(year: number): number {
  let m = 1
  for (const row of UPKEEP_INDEX) if (year >= row.year) m = row.mult
  return m
}

export function slotsAt(year: number, bought: number): number {
  return 1 + SLOT_UPGRADES.filter((u, i) => i < bought && year >= u.year).length
}

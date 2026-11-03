/**
 * 日历：把「第几天」变成「某年某月某日」。
 *
 * 整个游戏只有一条时间轴：1915-01-01 是第 0 天，1991-12-31 是最后一天。
 * 所有系统都只认 day 这一个整数，日期只在显示时才算 —— 这样存档里永远只有一个数字。
 */

const MS_PER_DAY = 86_400_000
const EPOCH_MS = Date.UTC(1915, 0, 1)
const END_MS = Date.UTC(1992, 0, 1)

/** 一局的长度。1915-01-01 到 1991-12-31，含首尾。 */
export const TOTAL_DAYS = Math.round((END_MS - EPOCH_MS) / MS_PER_DAY)

export interface SimDate {
  year: number
  /** 1–12 */
  month: number
  /** 1–31 */
  day: number
}

/** 年月日 → 天序号。month 用 1–12，跟人说话的顺序一致。 */
export function dayOf(year: number, month: number, day: number): number {
  return Math.round((Date.UTC(year, month - 1, day) - EPOCH_MS) / MS_PER_DAY)
}

export function dateOf(day: number): SimDate {
  const d = new Date(EPOCH_MS + day * MS_PER_DAY)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

/** 1939年9月1日 */
export function formatDate(day: number): string {
  const d = dateOf(day)
  return `${d.year}年${d.month}月${d.day}日`
}

/** 39.09.01 —— 给窄格子用 */
export function formatShort(day: number): string {
  const d = dateOf(day)
  const m = String(d.month).padStart(2, '0')
  const dd = String(d.day).padStart(2, '0')
  return `${String(d.year).slice(2)}.${m}.${dd}`
}

/** 只留年月：1939年9月 */
export function formatMonth(day: number): string {
  const d = dateOf(day)
  return `${d.year}年${d.month}月`
}

/** 一段时期。时期是静态表，不是存档内容 —— 存档里只存一个下标。 */
export interface Era {
  id: string
  name: string
  /** 时间轴上用的短名 */
  short: string
  /** 含 */
  from: number
  /** 含 */
  to: number
  /** 这一段的威胁水位：0 和平，1 全面战争 */
  threat: number
  blurb: string
}

function era(id: string, name: string, short: string, fromY: number, fromM: number, fromD: number, toY: number, toM: number, toD: number, threat: number, blurb: string): Era {
  return { id, name, short, from: dayOf(fromY, fromM, fromD), to: dayOf(toY, toM, toD), threat, blurb }
}

/**
 * 时代分界遵循一件对经营最重要的事：**政府什么时候在大量买车，什么时候不买**。
 * 所以「战间期」被拆成两段 —— 1920 年代的裁军和 1930 年代的重新武装，
 * 对一家坦克厂来说是两个完全不同的生意。
 */
export const ERAS: readonly Era[] = [
  era('ww1', '第一次世界大战', '一战', 1915, 1, 1, 1918, 11, 11, 0.92, '堑壕僵局，各国都在抢着造能过铁丝网的车。'),
  era('interwar-1', '战后裁军', '裁军', 1918, 11, 12, 1933, 1, 29, 0.12, '军队缩编，坦克被当成一次性的战争玩具。'),
  era('interwar-2', '重新武装', '扩军', 1933, 1, 30, 1939, 8, 31, 0.38, '条约被撕开，订单开始回到桌上。'),
  era('ww2', '第二次世界大战', '二战', 1939, 9, 1, 1945, 9, 2, 0.97, '产能就是国运，验收标准被一路放宽。'),
  era('cold-1', '冷战对峙', '冷战', 1945, 9, 3, 1962, 10, 28, 0.55, '核阴影下，坦克成了常规力量的筹码。'),
  era('cold-2', '缓和与代理战争', '缓和', 1962, 10, 29, 1979, 12, 24, 0.4, '大国不直接开战，但订单流向热点。'),
  era('cold-3', '第二次冷战', '二次冷战', 1979, 12, 25, 1988, 12, 7, 0.58, '中导条约前的最后十年，装备更新加速。'),
  era('late', '结束', '落幕', 1988, 12, 8, 1991, 12, 31, 0.2, '墙倒了，订单变成出口合同。'),
]

/** 二分不如线性走路快 —— 但这里只有 8 段，而且调用次数极少。 */
export function eraIndexAt(day: number): number {
  for (let i = ERAS.length - 1; i >= 0; i--) {
    if (day >= ERAS[i]!.from) return i
  }
  return 0
}

/** 威胁水位随时间的曲线。用关键帧插值，比按时代取常数更像「打仗有起伏」。 */
interface ThreatKey {
  day: number
  value: number
}

const THREAT_CURVE: readonly ThreatKey[] = [
  { day: dayOf(1915, 1, 1), value: 0.9 },
  { day: dayOf(1917, 4, 6), value: 1.0 },
  { day: dayOf(1918, 11, 11), value: 0.95 },
  { day: dayOf(1919, 6, 28), value: 0.15 },
  { day: dayOf(1933, 1, 30), value: 0.25 },
  { day: dayOf(1936, 7, 17), value: 0.4 },
  { day: dayOf(1939, 9, 1), value: 0.8 },
  { day: dayOf(1941, 12, 7), value: 1.0 },
  { day: dayOf(1944, 6, 6), value: 0.9 },
  { day: dayOf(1945, 9, 2), value: 0.45 },
  { day: dayOf(1947, 3, 12), value: 0.3 },
  { day: dayOf(1950, 6, 25), value: 0.62 },
  { day: dayOf(1953, 7, 27), value: 0.45 },
  { day: dayOf(1962, 10, 16), value: 0.55 },
  { day: dayOf(1973, 10, 6), value: 0.45 },
  { day: dayOf(1979, 12, 24), value: 0.55 },
  { day: dayOf(1989, 11, 9), value: 0.25 },
  { day: dayOf(1991, 12, 26), value: 0.1 },
]

/** 某天的威胁水位 0–1。战争不是开关，是有升有降的。 */
export function threatAt(day: number): number {
  const first = THREAT_CURVE[0]!
  if (day <= first.day) return first.value
  for (let i = 1; i < THREAT_CURVE.length; i++) {
    const b = THREAT_CURVE[i]!
    if (day <= b.day) {
      const a = THREAT_CURVE[i - 1]!
      const t = (day - a.day) / (b.day - a.day)
      return a.value + (b.value - a.value) * t
    }
  }
  return THREAT_CURVE[THREAT_CURVE.length - 1]!.value
}

export type NewsKind = 'war' | 'politics' | 'tech' | 'market'

/** 历史快讯：纯粹是给玩家一个「现在是什么年份」的锚点。 */
export interface NewsItem {
  day: number
  kind: NewsKind
  title: string
  detail: string
}

function news(day: number, kind: NewsKind, title: string, detail: string): NewsItem {
  return { day, kind, title, detail }
}

export const NEWS: readonly NewsItem[] = [
  news(dayOf(1916, 9, 15), 'war', '索姆河：第一批坦克投入战斗', 'Mark I 碾过铁丝网，一半抛锚了，但战壕里的人都记住了它。'),
  news(dayOf(1917, 11, 20), 'war', '康布雷：坦克第一次集中使用', '四百多辆车一起冲，第一天就突破了防线。'),
  news(dayOf(1918, 7, 18), 'war', '苏瓦松：轻坦克成群突击', '雷诺 FT 证明坦克不必是笨重的移动堡垒。'),
  news(dayOf(1919, 6, 28), 'politics', '凡尔赛条约签字', '德国被禁止拥有坦克 —— 但没人规定不能偷偷研究。'),
  news(dayOf(1922, 10, 28), 'politics', '墨索里尼上台', '意大利开始谈「装甲力量」这个词。'),
  news(dayOf(1933, 1, 30), 'politics', '希特勒上台', '德国重新武装只是时间问题，图纸已经开始画了。'),
  news(dayOf(1935, 10, 3), 'war', '意大利入侵埃塞俄比亚', '轻型坦克在缺乏反坦克武器的对手面前几乎无敌。'),
  news(dayOf(1936, 7, 17), 'war', '西班牙内战爆发', '这里成了各国坦克的试验场，也算是最好的广告。'),
  news(dayOf(1938, 3, 12), 'politics', '德奥合并', '捷克的边境工事一夜之间失去了意义。'),
  news(dayOf(1939, 9, 1), 'war', '第二次世界大战爆发', '波兰的骑兵撞上了装甲师。各国订单开始排队。'),
  news(dayOf(1940, 5, 10), 'war', '法国战役', '重型装甲集中突破，马奇诺防线被绕过。'),
  news(dayOf(1941, 6, 22), 'war', '巴巴罗萨行动', '东线吃掉了双方大部分的坦克产能。'),
  news(dayOf(1941, 12, 7), 'war', '珍珠港', '美国参战，全世界最大的工业机器开始转向。'),
  news(dayOf(1942, 6, 28), 'war', '蓝色方案', '夏季攻势需要新的中型坦克，验收标准被压到最低。'),
  news(dayOf(1943, 7, 5), 'war', '库尔斯克', '史上最大的装甲碰撞，也宣告了重型坦克时代的顶点。'),
  news(dayOf(1944, 6, 6), 'war', '诺曼底登陆', '西线重新开张，两栖与火力支援成了新需求。'),
  news(dayOf(1945, 5, 8), 'politics', '欧战结束', '订单没有停，只是客户换了一批。'),
  news(dayOf(1945, 8, 6), 'politics', '广岛', '一颗炸弹改变了所有关于「装甲」的讨论。'),
  news(dayOf(1947, 3, 12), 'politics', '杜鲁门主义', '冷战的第一次正式表态，军援开始流向欧洲。'),
  news(dayOf(1948, 6, 24), 'politics', '柏林封锁', '空运能撑住一座城，但撑不住一个大陆的防线。'),
  news(dayOf(1950, 6, 25), 'war', '朝鲜战争', '战后第一次真正的坦克战，也让库存车一夜之间值钱。'),
  news(dayOf(1956, 10, 29), 'war', '苏伊士危机', '英法的装甲部队最后一次以殖民者的身份出场。'),
  news(dayOf(1962, 10, 16), 'politics', '古巴导弹危机', '十三天里，所有人都在算自己有多少辆车能开动。'),
  news(dayOf(1967, 6, 5), 'war', '六日战争', '空军先动手，装甲部队只用了六天走完全程。'),
  news(dayOf(1973, 10, 6), 'war', '赎罪日战争', '反坦克导弹第一次让坦克兵开始怀疑自己。'),
  news(dayOf(1979, 12, 24), 'war', '苏联入侵阿富汗', '山地和游击战，重型装甲在这里没什么用。'),
  news(dayOf(1981, 6, 7), 'tech', '以色列空袭反应堆', '精确制导和电子设备开始压过单纯的火力。'),
  news(dayOf(1989, 11, 9), 'politics', '柏林墙倒塌', '华约的订单表开始作废。'),
  news(dayOf(1991, 12, 26), 'politics', '苏联解体', '最大的客户没了，剩下的只有出口市场。'),
]

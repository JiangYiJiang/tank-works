/**
 * 设计局：类型定义。
 *
 * 分层原则：
 *   部件数据（纯 JSON 可序列化） → 物理量 → 四维分 → 成本
 * 全部是纯函数，不碰 DOM、不碰随机数。同一个设计永远算出同一辆车。
 *
 * 单位统一约定：
 *   长度 m / 厚度 mm / 质量 kg / 功率 hp / 速度 km/h / 价格 元
 * 厚度用 mm、质量用 kg 是刻意的：装甲计算里 mm×m²×7.85 = kg 一步到位，
 * 而玩家讨论坦克时说的也是「80 毫米首上」，不是「0.08 米」。
 */

// ────────────────────────────────────────────────────────────
// 枚举
// ────────────────────────────────────────────────────────────

/** 车体族。只决定「基础尺寸」和「结构效率」，不决定性能上限。 */
export type HullClass = 'light' | 'medium' | 'heavy'

/** 装甲材料。ke/ce 是「每毫米等效多少毫米 RHA」的系数。 */
export type ArmorMaterialId =
  | 'rha' // 轧制均质钢
  | 'cast' // 铸造钢
  | 'hha' // 表面硬化
  | 'composite_early' // 早期复合（玻璃纤维/陶瓷夹层）
  | 'composite' // 复合装甲
  | 'nera' // 非爆炸反应/多层间隙

/** 弹种。决定「同样的炮能打出多少穿深」，是现代坦克代差的主要来源。 */
export type ShellType =
  | 'ap' // 普通穿甲弹
  | 'aphe' // 穿甲爆破弹
  | 'apcbc' // 被帽风帽穿甲弹
  | 'apcr' // 硬芯穿甲弹
  | 'apds' // 脱壳穿甲弹
  | 'apfsds' // 尾翼稳定脱壳穿甲弹（第一代，钨芯）
  | 'apfsds2' // 第二代尾翼稳定脱壳（长杆弹芯 / 贫铀）
  | 'heat' // 破甲弹

/** 悬挂。影响越野速度、可靠性、以及能不能扛住更大的炮。 */
export type SuspensionType = 'leaf' | 'christie' | 'torsion' | 'hydropneumatic'

/** 夜视能力。 */
export type NightVision = 'none' | 'ir' | 'thermal1' | 'thermal2'

/** 火控。 */
export type Fcs = 'none' | 'optical' | 'rangefinder' | 'laser' | 'digital'

// ────────────────────────────────────────────────────────────
// 部件定义（数据）
// ────────────────────────────────────────────────────────────

/** 车体：基础尺寸与结构效率。 */
export interface HullDef {
  id: string
  name: string
  hullClass: HullClass
  /** 车体长（不含炮管前伸），m */
  length: number
  /** 车体宽，m */
  width: number
  /** 车体高（到炮塔座圈平面），m */
  height: number
  /** 炮塔座圈直径下限，m。座圈是整车的物理瓶颈之一：它限制炮的口径与俯仰。 */
  ring: number
  /** 结构质量系数：同样的装甲，车越大越费钢。 */
  structureFactor: number
  /** 乘员下限（车组不能少于这个数才开得动） */
  crewMin: number
  era: number
}

/** 装甲材料。 */
export interface ArmorMaterialDef {
  id: ArmorMaterialId
  name: string
  /** 对动能弹的等效系数（每 mm 厚度折算多少 mm RHA） */
  ke: number
  /** 对化学能弹的等效系数 */
  ce: number
  /** 密度 kg/m²/mm。钢材 7.85，复合材料轻得多。 */
  density: number
  /** 每公斤价格 */
  costPerKg: number
  /**
   * 复合结构。
   * 复合装甲的「厚度」报的是**沿视线方向的阵列厚度**，倾角收益已经算在里面了；
   * 再乘一次倾角系数就是重复计算，会算出 1000mm 等效这种荒唐值。
   */
  compound: boolean
  era: number
}

/**
 * 装甲方案：材料 + 各处厚度 + 倾角。
 * 倾角从「垂直」量起：0° 是垂直板，60° 是躺得很平的板。
 */
export interface ArmorFit {
  material: ArmorMaterialId
  /**
   * 炮塔材料。留空则与车体相同。
   * 分开是因为真实的混血设计太多了：轧制钢车体 + 铸造炮塔（T-54、M48），
   * 复合车体 + 铸造炮塔（T-72）。用一个材料去套整车，算出来的数会离谱。
   */
  turretMaterial?: ArmorMaterialId
  /** 首上装甲厚度 mm */
  front: number
  /** 首上倾角（度，从垂直算） */
  frontSlope: number
  /** 侧面厚度 mm */
  side: number
  /** 炮塔正面厚度 mm */
  turretFront: number
  /** 炮塔正面倾角 */
  turretSlope: number
  /**
   * 双斜面（尖头首上，如 IS-3）。
   * 水平面和垂直面同时倾斜，两个方向都在「捡角度」，等效远高于单斜面同角度。
   * 这是真实的物理收益，不是数值补丁 —— IS-3 当年吓到西方就是因为这个。
   */
  pike?: boolean
}

/** 火炮。 */
export interface GunDef {
  id: string
  name: string
  /** 口径 mm */
  caliber: number
  /** 身管长度，单位「倍径」 */
  barrelCalibers: number
  /** 主用弹种 */
  shell: ShellType
  /** 备弹量 */
  rounds: number
  /** 发射药水平 / 膛压系数：由该炮的真实炮口初速反推，是数据不是拟合值 */
  charge: number
  era: number
}

/** 动力包。 */
export interface EngineDef {
  id: string
  name: string
  /** 功率 hp */
  power: number
  /** 发动机本体质量 kg */
  mass: number
  /** 占用体积 m³ —— 这个值会撑大车体，进而撑大装甲面积 */
  volume: number
  /** 百公里油耗（相对值，用来算油料质量） */
  thirst: number
  era: number
}

/** 行走系统。 */
export interface SuspensionDef {
  id: string
  name: string
  type: SuspensionType
  /** 履带宽 m */
  trackWidth: number
  /** 接地长 m */
  contactLength: number
  /** 悬挂品质 0-1：影响越野速度折减与可靠性 */
  quality: number
  /**
   * 悬挂允许的公路极速上限 km/h。
   * 这不是「这辆车能跑多快」，而是「这套行走机构不散架最多能跑多快」——
   * 装 1500 匹马力的车配上 1917 年的履带也跑不起来。想快就得先研发悬挂。
   */
  vCap: number
  era: number
}

/** 辅助设备。这一槽位是「适应性」的主要来源，也是后期拉开代差的地方。 */
export interface AuxDef {
  id: string
  name: string
  night: NightVision
  fcs: Fcs
  /** 火炮双向稳定器 */
  stabilizer: boolean
  /** 三防等级 0-3 */
  nbc: number
  /** 电台品质 0-3 */
  radio: number
  era: number
}

/**
 * 弹药/弹道层面的改动。研发局解锁的每一项炮弹技术，落到设计局就是这里的一个数。
 * 三个字段都可选：不填就用火炮自带弹种和 tuning 里的基础值。
 */
export interface AmmoMods {
  /** 换装弹种。火炮的 shell 字段是「这门炮原配的弹」，玩家可以换更好的 */
  ammo?: ShellType
  /** 2000m 处相对 500m 的穿深保持率（0-1） */
  rangeKeep?: number
  /** 斜板响应指数：能击穿的实际板厚 = 0° 穿深 × cos(θ)^s */
  slopeExp?: number
}

/** 一整套设计：玩家在设计局里要填的六个槽位。 */
export interface TankDesign {
  name: string
  hull: string
  armor: ArmorFit
  gun: string
  engine: string
  suspension: string
  aux: string
  /** 弹药改装（可选）：换弹种、换弹芯、换弹道系数 */
  mods?: AmmoMods
}

// ────────────────────────────────────────────────────────────
// 物理量与评分
// ────────────────────────────────────────────────────────────

/**
 * 弹道剖面：穿深不是一维的数，它是一条随距离下滑、随倾角打折的曲线。
 * 分数仍然只用 500m / 0° 那个点（那是标定基准），但订单验收和击穿判定要看这一整层。
 */
export interface Ballistics {
  /** 这一车实际用的弹种 */
  shell: ShellType
  /** 2000m 保持率 */
  keep2k: number
  /** 斜板响应指数 */
  slopeExp: number
  /** 500m 穿深（= physical.pen，标定基准） */
  pen500: number
  /** 100m 穿深（炮口附近，近距离交战） */
  pen100: number
  /** 1000m 穿深 */
  pen1000: number
  /** 2000m 穿深 */
  pen2000: number
  /** 炮口初速 m/s */
  v0: number
  /** 2000m 存速 m/s */
  v2000: number
  /** 对不同倾角钢板「能击穿的实际板厚」：0° = 垂直板 */
  plate0: number
  plate30: number
  plate60: number
  /** 对 60° 钢板能击穿的视线等效厚度（与 armorFront 同口径，用来判击穿） */
  los60: number
}

/** 设计局算出来的「三级指标」：这一层全是物理量，没有任何分数。 */
export interface TankPhysical {
  /** 战斗全重 kg */
  mass: number
  /** 车全长（含炮管）m */
  length: number
  /** 车宽 m */
  width: number
  /** 车高（含炮塔）m */
  height: number
  /** 炮塔座圈直径 m */
  ring: number
  /** 吨功率 hp/t */
  hpPerTon: number
  /** 接地压力 kPa */
  groundPressure: number
  /** 公路极速 km/h */
  vMax: number
  /** 越野速度 km/h */
  vOffroad: number
  /** 首上等效抗穿 mm RHAe */
  armorFront: number
  /** 炮塔正面等效抗穿 mm RHAe */
  armorTurret: number
  /** 侧面等效抗穿 mm RHAe */
  armorSide: number
  /** 首上等效抗破 mm RHAe（对化学能弹） */
  armorFrontCe: number
  /** 炮塔正面等效抗破 mm RHAe */
  armorTurretCe: number
  /** 侧面等效抗破 mm RHAe */
  armorSideCe: number
  /** 500m 穿深 mm RHAe */
  pen: number
  /** 口径 mm */
  caliber: number
  /** 乘员数 */
  crew: number
  /** 备弹量 */
  rounds: number
  /** 装填一发要多少秒（单人装填 / 双人炮塔） */
  reloadSec: number
  /** 倒车极速 km/h */
  vReverse: number
  /** 火炮俯仰角（负值，度） */
  depression: number
}

/** 成本。用户要求「材料费 + 工时费」两条线，所以分开报。 */
export interface TankCost {
  /** 原料费 */
  material: number
  /** 工时（人·小时） */
  hours: number
  /** 工时费（按统一工时单价折算） */
  labor: number
  /** 单台总成本 */
  total: number
}

/**
 * 四维的原始物理量（归一之前）。
 * 订单门槛、推销概率、报表全部用这一层，因为「抗穿 233mm」比「装甲 3329 分」更能让人做决策。
 */
export interface RawDims {
  armor: number
  pen: number
  offroad: number
  adapt: number
}

/** 四维分：0-10000 的绝对分，1991 年顶尖水平 = 10000。 */
export interface TankScore {
  armor: number
  pen: number
  offroad: number
  adapt: number
  /** 一级指标：加权总分 */
  total: number
}

/** 一辆完整的车。设计局的最终产物。 */
export interface Tank {
  design: TankDesign
  physical: TankPhysical
  /** 四维原始值：订单门槛和推销概率就是跟这一层比较的 */
  raw: RawDims
  score: TankScore
  cost: TankCost
  /** 弹道剖面：距离衰减与倾角响应 */
  ballistics: Ballistics
  /** 设计缺陷：不扣分，但会让订单验收和推销出问题 */
  flaws: string[]
}

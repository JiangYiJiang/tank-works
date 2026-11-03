/**
 * 所有「可调魔法数」集中在这里。
 *
 * 为什么要集中：设计局模型是一个物理模拟，物理模拟的参数永远调不准。
 * 把参数全部放进一张表，才能写一个校准台（probe/design-check.ts）自动扫参数空间，
 * 让「历史坦克分数误差」当目标函数去拧，而不是靠手感一个个改。
 *
 * 每一组参数后面都写了「它是怎么来的」和「动它会影响什么」。
 */

export const TUNING = {
  // ── 几何 ──────────────────────────────────────────────
  geom: {
    /** 炮塔高度 = 基础 + 座圈直径 × 系数。炮越大座圈越大，炮塔也越高。 */
    turretBaseHeight: 0.46,
    turretHeightPerRing: 0.30,
    /** 炮塔宽度相对座圈直径的放大（炮塔总是比座圈宽一点） */
    turretWidthPerRing: 1.15,
    /** 炮塔长度相对座圈直径的放大 */
    turretLengthPerRing: 1.35,
    /** 履带外侧到车体侧面的最小间隙 m */
    trackClearance: 0.25,
    /** 发动机体积每超出 1 m³，车体加长多少（比例） */
    engineLengthPerM3: 0.06,
    /** 座圈最小直径 = 基础 + 口径(mm) × 系数。小车身扛大口径时会被这个顶大。 */
    ringBase: 0.60,
    ringPerCaliber: 7.0,
    /** 座圈绝对下限：再小的车也得塞进两名乘员和炮尾。 */
    ringAbsMin: 0.72,
    gunTrunnionRatio: 0.45,
    /** 车体宽至少要盖住「座圈直径 × 这个系数」 */
    hullWidthPerRing: 1.75,
  },

  // ── 质量 ──────────────────────────────────────────────
  mass: {
    /** 1 m² × 1 mm 钢材的质量 kg（7.85 g/cm³） */
    steelPerM2mm: 7.85,
    /** 结构质量 = 装甲质量 × 系数 + 常数 kg */
    structurePerArmor: 0.34,
    structureBase: 1500,
    /** 传动/行走附加质量 = 发动机质量 × 系数 */
    drivePerEngine: 1.1,
    /** 火炮质量 = 系数 × 口径^2.5 × 倍径 */
    gunMassK: 5.2e-4,
    /** 弹药质量 = 备弹 × 弹重 × 系数（含药筒与包装） */
    ammoPerShell: 1.65,
    /** 每名乘员含随身装备 kg */
    crewWeight: 95,
    /** 行走系统质量 = 总质量 × 系数 + 常数 */
    runningPerMass: 0.14,
    runningBase: 900,
    /** 油料：按行程 500km 折算 */
    fuelRangeKm: 500,
    /** 迭代收敛次数（质量互相依赖，迭代到稳定） */
    iterations: 4,
  },

  // ── 装甲 ──────────────────────────────────────────────
  armor: {
    /**
     * 倾角收益指数。经验值：60° 倾斜对动能弹约 2.0-2.4 倍，
     * 所以用 1/cos(θ)^1.15：60° 时 = 2^1.15 = 2.22。
     */
    keSlopeExp: 1.0,
    /** 化学能弹几乎不吃倾角（射流会拐弯），指数小得多 */
    ceSlopeExp: 0.35,
    /** 双斜面（尖头首上）的额外收益。两个方向同时倾斜，等效远高于同角度单斜面。 */
    pikeBonus: 1.12,
  },

  // ── 穿深 ──────────────────────────────────────────────
  gun: {
    /**
     * 膛压能量的标定系数。v = √(velocityK · charge · 口径³ · 倍径 / 弹重)
     *
     * charge 是**每门炮自己的数据**（发射药水平 / 膛压），不是拟合参数：
     * 它的值由真实炮口初速反推，写在 parts.ts 里。这样一来初速是「已知量」，
     * 德马尔公式要独立负责把初速翻译成穿深 —— 回归测试才有意义。
     */
    velocityK: 0.1889,
    /**
     * 各弹种弹丸全重系数（相对同口径标准穿甲弹）。
     * 弹芯越轻，同样的火药能量推得越快 —— 这是 APDS/APFSDS 穿深暴涨的第一个原因。
     */
    shellMass: {
      ap: 1.0,
      aphe: 1.0,
      apcbc: 1.02,
      apcr: 0.62,
      apds: 0.42,
      apfsds: 0.28,
      apfsds2: 0.26,
      heat: 0.85,
    } as Record<string, number>,
    /**
     * 弹芯直径 / 口径。全口径弹是 1，脱壳弹的芯细得多。
     * 这是穿深暴涨的第二个原因：把同样的动能压到更小的截面上。
     */
    coreRatio: {
      ap: 1.0,
      aphe: 1.0,
      apcbc: 1.0,
      apcr: 0.75,
      apds: 0.60,
      apfsds: 0.45,
      apfsds2: 0.42,
      heat: 1.0,
    } as Record<string, number>,
    /** 弹芯占全弹重的比例：脱壳以后扔掉的那部分不参与穿甲 */
    coreShare: {
      ap: 1.0,
      aphe: 1.0,
      apcbc: 1.0,
      apcr: 0.85,
      apds: 0.55,
      apfsds: 0.42,
      apfsds2: 0.40,
      heat: 1.0,
    } as Record<string, number>,
    /** 标准弹重 = 系数 × 口径³ (kg)，75mm 时约 6.3 kg */
    shellMassK: 1.5e-5,
        /**
     * 德马尔公式的三个指数。教科书值是 1.43 / 0.71 / 1.07，这里是**按 19 辆历史车标定**的结果。
     * v^0.85 · m^0.5 ≈ (动能)^0.42 · (动量)^0.42，介于「纯能量」和「纯动量」之间，
     * 物理上讲得通：快而轻的弹芯靠集中动能穿甲，重弹丸靠冲量撕开装甲。
     * 标定前的教科书值在历史数据上最大误差 51%，标定后 25%。
     */
    vExp: 0.85,
    mExp: 0.5,
    dExp: 1.2,
    /** 单位换算系数：把弹道量纲收进 K 的可读范围（否则 K 会小到 0.01） */
    penScale: 40,
    /**
     * 德马尔公式的装甲抗力系数 K，每种弹一个。K 越小穿透越强。
     * 它吸收的是「弹体材料 / 工艺 / 后效」这类公式管不到的东西：
     * 贫铀弹芯的 K 就比钨芯低。**这是本模型唯一靠标定得来的表**。
     */
    deMarreK: {
      ap: 3.2,
      aphe: 1.67,
      apcbc: 1.45,
      apcr: 1.3,
      apds: 1.0,
      apfsds: 1.07,
      apfsds2: 0.6,
      heat: 0,
    } as Record<string, number>,
    /**
     * 破甲弹：穿深 ≈ 系数 × 口径（与初速、距离都无关）。
     * 1.0 是 1930s 早期破甲弹的水平；研发局会把它推到 1.8 / 2.8 / 3.4。
     * 按弹种查表是为了给以后的「串联战斗部」等变体留位置。
     */
    heatPerCaliberByShell: {
      heat: 1.0,
    } as Record<string, number>,
    /** 口径修正：clamp(口径/caliberRef, min, max)^caliberExp */
    caliberRef: 75,
    caliberExp: 0.6,
    caliberMin: 0.35,
    caliberMax: 1.7,
    /** 距离衰减：500m 处的穿深相对炮口 */
    at500m: 0.94,

    // ── 弹道第二轴：距离 ──────────────────────────────────
    /** 穿深数据的基准距离。历史基准（以及上面的德马尔标定）全部是 500m */
    penRefM: 500,
    /**
     * 远距保持率的锚点。科技树上写的「远距 0.45」「0.60 → 0.75」「0.92」
     * 说的都是**2000m 处还剩几成**，不是某个抽象系数。
     */
    keepRefM: 2000,
    /**
     * 各弹种在 2km 处相对 500m 的穿深保持率。
     *
     * 这条曲线的物理来源是弹道系数：v(x) = v₀·exp(-x/L)，
     * L ∝ 弹重/（阻力系数 × 截面积）。长杆弹的截面密度高得离谱，
     * 所以 2km 只掉 8%；而钨芯硬芯弹（APCR）又轻又钝，掉一半多。
     *
     * 被帽弹（APCBC）在 0.62 上，风帽版本提到 0.75 —— 风帽把激波锥拉尖了。
     */
    keep2k: {
      ap: 0.60,
      aphe: 0.58,
      apcbc: 0.62,
      apcr: 0.45,
      apds: 0.82,
      apfsds: 0.92,
      apfsds2: 0.94,
      heat: 1.0,
    } as Record<string, number>,

    // ── 弹道第三轴：倾角 ──────────────────────────────────
    /**
     * 斜板响应指数 s。能击穿的**实际板厚** = 0° 穿深 × cos(θ)^s。
     *
     *   s = 1.00  纯几何：60° 板上只能钻 0.5 倍板厚（等效厚度翻了倍）
     *   s = 0.85  被帽弹「咬住」斜板，比几何多钻 11%（60° 时）
     *   s = 1.20  长杆弹在高斜角下容易跳弹 / 杆体弯折，少钻 13%
     *   s = 0.00  破甲弹完全不吃角度：射流顺着板法线走，钻多深就是多深
     *
     * 注意这跟 armor.ts 的 keSlopeExp 是两件事：那边算「这块板看起来多厚」，
     * 这边算「这颗弹能钻透多厚的板」。两者的乘积才是真实的击穿判定。
     */
    slopeExp: {
      ap: 1.0,
      aphe: 1.0,
      apcbc: 0.85,
      apcr: 1.15,
      apds: 1.05,
      apfsds: 1.2,
      apfsds2: 1.18,
      heat: 0.0,
    } as Record<string, number>,
  },
  mobility: {
    /** vmax = K × (hp/t)^0.45 × (基准 + 跨度 × 悬挂品质)，再被悬挂极速上限截断 */
    vmaxK: 14.0,
    vmaxExp: 0.5,
    vmaxQualityBase: 0.70,
    vmaxQualitySpan: 0.45,
    /** 越野 / 公路 的比值 */
    offroadBase: 0.4,
    offroadQualitySpan: 0.60,
    /** 接地压力基准（kPa）：高于它越野掉速 */
    groundPressureRef: 40,
    gpFloor: 0.75,
    gpCeil: 1.20,
  },

  // ── 适应性 ────────────────────────────────────────────
  adapt: {
    /** 四类能力的标定系数（对齐历史曲线用）；类内相对大小由下面的表格决定 */
    elecScale: 0.8,
    ergoScale: 0.4,
    crossScale: 0.85,
    relScale: 1,
    base: 200,
    night: { none: 0, ir: 900, thermal1: 1800, thermal2: 2600 } as Record<string, number>,
    fcs: { none: 0, optical: 400, rangefinder: 900, laser: 1500, digital: 2100 } as Record<string, number>,
    stabilizer: 600,
    /** 三防等级 0-3 对应的分 */
    nbc: [0, 300, 600, 900],
    /** 电台等级 0-3 对应的分 */
    radio: [0, 150, 320, 500],
    /** 人机：车内空间 / 乘员数，越宽松越好 */
    ergoCap: 1200,
    ergoPerM3: 260,
    /** 通过性：接地压力越低、履带越宽越好 */
    crossCap: 900,
    /** 接地压力「满分」基准 kPa（低于它就认为通过性满格） */
    gpRefForCross: 48,
    /** 悬挂可靠性 */
    reliability: { leaf: 120, christie: 260, torsion: 480, hydropneumatic: 620 } as Record<string, number>,
  },

  // ── 评分归一 ──────────────────────────────────────────
  ref: {
    armor: 700,
    pen: 700,
    offroad: 55,
    adapt: 10000,
  },
  weight: {
    armor: 0.35,
    pen: 0.3,
    offroad: 0.2,
    adapt: 0.15,
  },

  // ── 成本 ──────────────────────────────────────────────
  cost: {
    /** 统一工时单价（元/人·小时） */
    laborRate: 18,
    /** 基础工时 */
    hoursBase: 1800,
    /** 每公斤车重对应的工时 */
    hoursPerKg: 0.34,
    /** 铸造车体省工时 */
    castDiscount: 0.88,
  },
}

/**
 * 刻意不加 `as const`：校准台（probe/design-check.ts）需要在运行时覆盖这些值去扫参数。
 * 物理常数用时可读性换灵活性，这里选后者。
 */
export type Tuning = typeof TUNING

/** 带默认值的查表：`as Record<string, number>` 的表用 noUncheckedIndexedAccess 会返回 undefined。 */
export function look(table: Record<string, number>, key: string, fallback = 0): number {
  return table[key] ?? fallback
}

/**
 * 19 辆真实坦克的「部件组合」＋历史基准值。既是回归 fixture，也是游戏里的历史样车库。
 *
 * 这是整个设计局的尺子。模型改完之后跑 `npm run design`，
 * 每一辆车算出来的四维原始值都要落在基准值 ±10% 以内。
 *
 * 基准值的口径（必须和模型严格一致，否则就是在拿两把不同的尺子量）：
 *   armor   = 正面最强部位的等效抗穿（mm RHAe，对动能弹，倾角按 1/cos 折算）
 *   pen     = 500m 处的穿深（mm RHAe）
 *   offroad = 越野速度（km/h）
 *   adapt   = 适应性构造分（0-10000，本身就是一个合成指标）
 *
 * 有几辆车的基准值在建模过程中被**修正**过，note 里写了原因。
 * 改基准值比改模型危险得多，所以每一条修正都必须有历史依据，不能为了凑数改。
 */

import type { TankDesign } from '../types'

export interface HistoricalTank {
  name: string
  nation: string
  year: number
  design: TankDesign
  ref: {
    armor: number
    pen: number
    offroad: number
    adapt: number
  }
  note?: string
}

export const HISTORICAL: readonly HistoricalTank[] = [
  {
    name: '雷诺 FT-17',
    nation: '法',
    year: 1917,
    design: {
      name: 'FT-17',
      hull: 'ft',
      armor: { material: 'rha', front: 16, frontSlope: 20, side: 16, turretFront: 16, turretSlope: 15 },
      gun: 'sa18',
      engine: 'ft_eng',
      suspension: 'ft_susp',
      aux: 'bare',
    },
    ref: { armor: 16, pen: 15, offroad: 3, adapt: 400 },
  },
  {
    name: 'A7V',
    nation: '德',
    year: 1918,
    design: {
      name: 'A7V',
      hull: 'a7v',
      armor: { material: 'rha', front: 30, frontSlope: 20, side: 15, turretFront: 20, turretSlope: 0 },
      gun: 'maxim57',
      engine: 'a7v_eng',
      suspension: 'a7v_susp',
      aux: 'ww1_flag',
    },
    // 修正：A7V 是**一战唯一装电台的坦克**，适应性不该和 FT-17 一个档次。
    ref: { armor: 30, pen: 20, offroad: 4, adapt: 700 },
    note: '适应性基准 350 → 700（全世界第一台装电台的坦克）',
  },
  {
    name: '维克斯中型 Mk.II',
    nation: '英',
    year: 1928,
    design: {
      name: 'Vickers Mk.II',
      hull: 'vickers_mk2',
      armor: { material: 'rha', front: 8, frontSlope: 0, side: 8, turretFront: 8, turretSlope: 0 },
      gun: 'vickers47',
      engine: 'vickers_eng',
      suspension: 'vickers_susp',
      aux: 'ww1_flag',
    },
    ref: { armor: 8, pen: 25, offroad: 12, adapt: 900 },
  },
  {
    name: '三号 F 型',
    nation: '德',
    year: 1939,
    design: {
      name: 'Pz III F',
      hull: 'pz3',
      armor: { material: 'rha', front: 30, frontSlope: 12, side: 30, turretFront: 30, turretSlope: 10 },
      gun: 'kwk36_37',
      engine: 'maybach_hl120',
      suspension: 'pz3_susp',
      aux: 'interwar',
    },
    ref: { armor: 30, pen: 45, offroad: 18, adapt: 1500 },
  },
  {
    name: 'T-34/76',
    nation: '苏',
    year: 1941,
    design: {
      name: 'T-34/76',
      hull: 't34',
      armor: { material: 'rha', front: 45, frontSlope: 60, side: 45, turretFront: 45, turretSlope: 20 },
      gun: 'f34',
      engine: 'v2_34',
      suspension: 'christie',
      aux: 'ww2_simple',
    },
    // 修正：穿深原写 60，实际 BR-350B 在 500m 约 71mm。60 是早期弹的数据，不是这辆车的数据。
    ref: { armor: 90, pen: 71, offroad: 25, adapt: 1800 },
    note: '穿深基准 60 → 71（BR-350B，500m）',
  },
  {
    name: 'M4A1 谢尔曼',
    nation: '美',
    year: 1942,
    design: {
      name: 'M4A1',
      hull: 'm4',
      armor: { material: 'rha', front: 63.5, frontSlope: 47, side: 38, turretFront: 76, turretSlope: 30 },
      gun: 'm3_75',
      engine: 'continental_r975',
      suspension: 'vvss',
      aux: 'ww2_std',
    },
    ref: { armor: 90, pen: 70, offroad: 24, adapt: 2600 },
  },
  {
    name: '黑豹 D 型',
    nation: '德',
    year: 1943,
    design: {
      name: 'Panther D',
      hull: 'panther',
      armor: { material: 'rha', front: 80, frontSlope: 55, side: 40, turretFront: 100, turretSlope: 12 },
      gun: 'kwk42',
      engine: 'maybach_hl230',
      suspension: 'panther_susp',
      aux: 'ww2_std',
    },
    ref: { armor: 140, pen: 138, offroad: 27, adapt: 2600 },
  },
  {
    name: 'T-34/85',
    nation: '苏',
    year: 1944,
    design: {
      name: 'T-34/85',
      hull: 't34',
      armor: { material: 'rha', front: 45, frontSlope: 60, side: 45, turretFront: 90, turretSlope: 20 },
      gun: 'zis53',
      engine: 'v2_34',
      suspension: 'christie',
      aux: 'ww2_std',
    },
    ref: { armor: 100, pen: 102, offroad: 28, adapt: 2200 },
  },
  {
    name: '虎王 (Tiger II)',
    nation: '德',
    year: 1944,
    design: {
      name: 'Tiger II',
      hull: 'tiger2',
      armor: { material: 'rha', front: 150, frontSlope: 50, side: 80, turretFront: 180, turretSlope: 9 },
      gun: 'kwk43',
      engine: 'maybach_hl230',
      suspension: 'tiger2_susp',
      aux: 'ww2_std',
    },
    ref: { armor: 233, pen: 165, offroad: 18, adapt: 3000 },
  },
  {
    name: 'IS-3',
    nation: '苏',
    year: 1945,
    design: {
      name: 'IS-3',
      hull: 'is3',
      armor: {
        material: 'rha',
        turretMaterial: 'cast',
        front: 110,
        frontSlope: 60,
        side: 90,
        turretFront: 250,
        turretSlope: 20,
        pike: true,
      },
      gun: 'd25t',
      engine: 'v2_is3',
      suspension: 'is3_susp',
      aux: 'ww2_simple',
    },
    ref: { armor: 250, pen: 165, offroad: 20, adapt: 2600 },
  },
  {
    name: '百夫长 Mk.3',
    nation: '英',
    year: 1950,
    design: {
      name: 'Centurion Mk.3',
      hull: 'centurion',
      armor: { material: 'rha', front: 76, frontSlope: 57, side: 51, turretFront: 152, turretSlope: 0 },
      gun: 'qwf20',
      engine: 'meteor',
      suspension: 'cent_susp',
      aux: 'early_cold',
    },
    ref: { armor: 152, pen: 200, offroad: 30, adapt: 3800 },
  },
  {
    name: 'M48A2',
    nation: '美',
    year: 1953,
    design: {
      name: 'M48A2',
      hull: 'm48',
      armor: { material: 'cast', front: 110, frontSlope: 60, side: 76, turretFront: 178, turretSlope: 25 },
      gun: 'm41gun',
      engine: 'av1790',
      suspension: 'm48_susp',
      aux: 'early_cold',
    },
    // 修正：原写 120，那是首上钢板的物理厚度。110mm/60° 的等效是 220，两者差了近一倍。
    ref: { armor: 220, pen: 190, offroad: 30, adapt: 3500 },
    note: '装甲基准 120 → 220（110mm @ 60° 的等效值，不是板厚）',
  },
  {
    name: 'T-54',
    nation: '苏',
    year: 1955,
    design: {
      name: 'T-54',
      hull: 't54',
      armor: {
        material: 'rha',
        turretMaterial: 'cast',
        front: 100,
        frontSlope: 60,
        side: 80,
        turretFront: 200,
        turretSlope: 20,
      },
      gun: 'd10t',
      engine: 'v54',
      suspension: 't54_susp',
      aux: 'early_cold',
    },
    ref: { armor: 200, pen: 185, offroad: 32, adapt: 3400 },
  },
  {
    name: '豹 1',
    nation: '德',
    year: 1965,
    design: {
      name: 'Leopard 1',
      hull: 'leopard1',
      armor: { material: 'rha', front: 70, frontSlope: 60, side: 25, turretFront: 52, turretSlope: 30 },
      gun: 'l7',
      engine: 'mb838',
      suspension: 'leo1_susp',
      aux: 'cold_stab',
    },
    // 修正：原写 70，那是板厚。首上 70mm/60° 的等效是 140 —— 豹 1 的「裸奔」名声来自炮塔和侧面，不是首上。
    ref: { armor: 140, pen: 300, offroad: 45, adapt: 4200 },
    note: '装甲基准 70 → 140（首上 70mm @ 60° 的等效值）',
  },
  {
    name: 'T-62',
    nation: '苏',
    year: 1965,
    design: {
      name: 'T-62',
      hull: 't62',
      armor: {
        material: 'rha',
        turretMaterial: 'cast',
        front: 100,
        frontSlope: 60,
        side: 80,
        turretFront: 200,
        turretSlope: 20,
      },
      gun: 'u5ts',
      engine: 'v55',
      suspension: 't62_susp',
      aux: 'cold_ir',
    },
    ref: { armor: 200, pen: 300, offroad: 33, adapt: 4000 },
  },
  {
    name: 'T-72A',
    nation: '苏',
    year: 1979,
    design: {
      name: 'T-72A',
      hull: 't72',
      armor: {
        material: 'composite',
        turretMaterial: 'cast',
        front: 205,
        frontSlope: 68,
        side: 80,
        turretFront: 400,
        turretSlope: 20,
      },
      gun: '2a46',
      engine: 'v46',
      suspension: 't72_susp',
      aux: 'cold_late',
    },
    ref: { armor: 400, pen: 380, offroad: 38, adapt: 5000 },
  },
  {
    name: '豹 2A4',
    nation: '德',
    year: 1985,
    design: {
      name: 'Leopard 2A4',
      hull: 'leopard2',
      armor: {
        material: 'nera',
        turretMaterial: 'nera',
        front: 250,
        frontSlope: 60,
        side: 80,
        turretFront: 310,
        turretSlope: 0,
      },
      gun: 'rh120',
      engine: 'mb873',
      suspension: 'leo2_susp',
      aux: 'thermal',
    },
    ref: { armor: 650, pen: 400, offroad: 45, adapt: 7500 },
  },
  {
    name: 'T-80U',
    nation: '苏',
    year: 1990,
    design: {
      name: 'T-80U',
      hull: 't80',
      armor: {
        material: 'nera',
        turretMaterial: 'nera',
        front: 240,
        frontSlope: 68,
        side: 80,
        turretFront: 310,
        turretSlope: 0,
      },
      gun: '2a46m',
      engine: 'gtd1000',
      suspension: 't80_susp',
      aux: 'thermal2',
    },
    ref: { armor: 650, pen: 480, offroad: 45, adapt: 8000 },
  },
  {
    name: 'M1A1HA',
    nation: '美',
    year: 1991,
    design: {
      name: 'M1A1HA',
      hull: 'm1',
      armor: {
        material: 'nera',
        turretMaterial: 'nera',
        front: 250,
        frontSlope: 60,
        side: 80,
        turretFront: 333,
        turretSlope: 0,
      },
      gun: 'm256',
      engine: 'agd1500',
      suspension: 'm1_susp',
      aux: 'thermal2',
    },
    ref: { armor: 700, pen: 700, offroad: 42, adapt: 8500 },
  },
]

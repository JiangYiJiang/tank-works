/**
 * 开局国家卡片：给「新游戏」的国家选择页用。
 *
 * 这里只放展示信息，不参与模拟。真正开局仍然写 GameState.home，
 * 客户池、招标与竞品都继续走 data/nations.ts 的规则。
 */

import type { NationId } from './nations'

export const PLAYABLE_NATION_IDS = [
  'usa',
  'gbr',
  'fra',
  'ger',
  'ita',
  'csk',
  'swe',
  'sov',
  'jpn',
] as const

export type PlayableNationId = (typeof PLAYABLE_NATION_IDS)[number]

export interface NationProfile {
  id: PlayableNationId
  en: string
  years: string
  tagline: string
  history: string
  tanks: string
}

export const NATION_PROFILES: readonly NationProfile[] = [
  {
    id: 'usa',
    en: 'UNITED STATES',
    years: '1917—1991',
    tagline: '工业规模',
    history:
      '1917 年参战后仿制法国 FT-17，1930 年代用 M2/M3 轻型坦克补课；二战把 M4 谢尔曼造成“民主兵工厂”的标配，冷战的 M48/M60 与 M1 艾布拉姆斯则把燃气轮机和复合装甲推上前台。',
    tanks: 'M4 Sherman · M48 Patton · M1 Abrams',
  },
  {
    id: 'gbr',
    en: 'UNITED KINGDOM',
    years: '1916—1991',
    tagline: '发明者',
    history:
      '1916 年 Mark I 第一次把“陆地战舰”开上战场；二战用玛蒂尔达、丘吉尔扛过装甲战，冷战的百夫长、酋长把 105/120 mm 线膛炮做成北约标准。',
    tanks: 'Mark I · Churchill · Centurion · Challenger',
  },
  {
    id: 'fra',
    en: 'FRANCE',
    years: '1917—1991',
    tagline: '布局奠基',
    history:
      '1917 年 FT-17 定下发动机后置、旋转炮塔的现代坦克布局；战间期 B1、S35 重装甲但指挥僵化，1940 年溃败后又在 AMX-13/30 上重新出发。',
    tanks: 'FT-17 · Char B1 · AMX-13 · AMX-30',
  },
  {
    id: 'ger',
    en: 'GERMANY',
    years: '1917—1991',
    tagline: '精工路线',
    history:
      '一战 A7V 只是起步，战间期秘密试验让 III/IV 号成为闪击战骨架；虎式、豹式把火力与装甲推到极限，冷战又用豹 1/豹 2 回到机动与火控。',
    tanks: 'Panzer IV · Tiger · Panther · Leopard 2',
  },
  {
    id: 'ita',
    en: 'ITALY',
    years: '1916—1991',
    tagline: '轻车传统',
    history:
      '一战造出 Fiat 2000，战间期把 L3 超轻型坦克铺满战场；二战 M13/40 暴露装甲与发动机短板，战后靠许可生产豹 1 与 OF-40 维持自己的装甲工业。',
    tanks: 'Fiat 2000 · M13/40 · OF-40 · Ariete',
  },
  {
    id: 'csk',
    en: 'CZECHOSLOVAKIA',
    years: '1918—1991',
    tagline: '出口强国',
    history:
      '战间期 LT-35/LT-38 是欧洲最抢手的出口坦克，被德国吞并后整条产线为德军服务；战后在 T-34、T-55、T-72 许可生产里继续当“华约兵工厂”。',
    tanks: 'LT-38 · T-34/85 · T-55 · T-72',
  },
  {
    id: 'swe',
    en: 'SWEDEN',
    years: '1920—1991',
    tagline: '中立国设计',
    history:
      '1920 年代从 Strv m/21 起步，战间期 Landsverk 把坦克卖到欧洲；冷战的 S 型无炮塔坦克与 Strv 103 用极端低矮的车体换生存性，后来转向豹 2 改型。',
    tanks: 'Strv m/21 · Strv 103 · Strv 121',
  },
  {
    id: 'sov',
    en: 'SOVIET UNION',
    years: '1922—1991',
    tagline: '数量与倾斜装甲',
    history:
      '1920 年代 MS-1 起步，1930 年代 BT 快速坦克与 T-26 铺量；T-34 把倾斜装甲、宽履带和柴油机合成二战最均衡的 Medium，冷战 T-54/55/72 则成为华约的钢铁洪流。',
    tanks: 'T-34 · KV-1 · IS-2 · T-72',
  },
  {
    id: 'jpn',
    en: 'JAPAN',
    years: '1918—1991',
    tagline: '岛国轻装',
    history:
      '一战后期引入雷诺，1920 年代开始国产化；八九式、九五式轻战车适应亚洲战场，二战后期在火力和装甲上被拉开差距，战后重建出 61/74/90 式。',
    tanks: 'Type 89 · Type 97 · Type 74 · Type 90',
  },
]

const STAR =
  'M0,-1 L0.28,-0.31 L1,-0.31 L0.45,0.12 L0.65,0.82 L0,0.42 L-0.65,0.82 L-0.45,0.12 L-1,-0.31 L-0.28,-0.31 Z'

function usFlag(): string {
  const stripes = Array.from({ length: 13 }, (_, i) => {
    const y = ((i * 40) / 13).toFixed(3)
    const h = (40 / 13).toFixed(3)
    return `<rect y="${y}" width="60" height="${h}" fill="${i % 2 === 0 ? '#b22234' : '#ffffff'}"/>`
  }).join('')
  const cantonH = (40 * 7) / 13
  const stars: string[] = []
  for (let row = 0; row < 9; row++) {
    const count = row % 2 === 0 ? 6 : 5
    const y = ((row + 1) * cantonH) / 10
    for (let i = 0; i < count; i++) {
      const x = count === 6 ? 2 + i * 4 : 4 + i * 4
      stars.push(`<path d="${STAR}" transform="translate(${x} ${y}) scale(0.72)" fill="#ffffff"/>`)
    }
  }
  return `<svg viewBox="0 0 60 40" role="img" aria-label="美国国旗">${stripes}<rect width="24" height="${cantonH}" fill="#3c3b6e"/>${stars.join('')}</svg>`
}

function ukFlag(): string {
  return `<svg viewBox="0 0 60 40" role="img" aria-label="英国国旗">
    <rect width="60" height="40" fill="#012169"/>
    <path d="M0 0 L60 40 M60 0 L0 40" stroke="#ffffff" stroke-width="8"/>
    <path d="M0 0 L60 40 M60 0 L0 40" stroke="#c8102e" stroke-width="4"/>
    <rect x="25" width="10" height="40" fill="#ffffff"/>
    <rect y="15" width="60" height="10" fill="#ffffff"/>
    <rect x="27" width="6" height="40" fill="#c8102e"/>
    <rect y="17" width="60" height="6" fill="#c8102e"/>
  </svg>`
}

function frFlag(): string {
  return `<svg viewBox="0 0 60 40" role="img" aria-label="法国国旗"><rect width="20" height="40" fill="#0055a4"/><rect x="20" width="20" height="40" fill="#ffffff"/><rect x="40" width="20" height="40" fill="#ef4135"/></svg>`
}

function deFlag(): string {
  return `<svg viewBox="0 0 60 40" role="img" aria-label="德国国旗"><rect width="60" height="13.333" fill="#000000"/><rect y="13.333" width="60" height="13.333" fill="#dd0000"/><rect y="26.666" width="60" height="13.334" fill="#ffce00"/></svg>`
}

function itFlag(): string {
  return `<svg viewBox="0 0 60 40" role="img" aria-label="意大利国旗"><rect width="20" height="40" fill="#009246"/><rect x="20" width="20" height="40" fill="#ffffff"/><rect x="40" width="20" height="40" fill="#ce2b37"/></svg>`
}

function csFlag(): string {
  return `<svg viewBox="0 0 60 40" role="img" aria-label="捷克斯洛伐克国旗"><rect width="60" height="20" fill="#ffffff"/><rect y="20" width="60" height="20" fill="#d7141a"/><path d="M0 0 L26 20 L0 40 Z" fill="#11457e"/></svg>`
}

function seFlag(): string {
  return `<svg viewBox="0 0 60 40" role="img" aria-label="瑞典国旗"><rect width="60" height="40" fill="#006aa7"/><rect x="18" width="6" height="40" fill="#fecc00"/><rect y="17" width="60" height="6" fill="#fecc00"/></svg>`
}

function suFlag(): string {
  return `<svg viewBox="0 0 60 40" role="img" aria-label="苏联国旗"><rect width="60" height="40" fill="#cc0000"/><path d="${STAR}" transform="translate(11 10) scale(3.2)" fill="#ffd700"/></svg>`
}

function jpFlag(): string {
  return `<svg viewBox="0 0 60 40" role="img" aria-label="日本国旗"><rect width="60" height="40" fill="#ffffff"/><circle cx="30" cy="20" r="9" fill="#bc002d"/></svg>`
}

export function flagSvg(id: PlayableNationId | NationId): string {
  switch (id) {
    case 'usa':
      return usFlag()
    case 'gbr':
      return ukFlag()
    case 'fra':
      return frFlag()
    case 'ger':
      return deFlag()
    case 'ita':
      return itFlag()
    case 'csk':
      return csFlag()
    case 'swe':
      return seFlag()
    case 'sov':
      return suFlag()
    case 'jpn':
      return jpFlag()
    default:
      return frFlag()
  }
}

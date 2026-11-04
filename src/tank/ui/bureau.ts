/**
 * 设计局界面。
 *
 * 这一版只做一件事：让六个槽位和四维数字之间的关系变得**可以摸**。
 * 没有时间、没有钱、没有订单 —— 那些是后面的系统。
 *
 * 两个刻意的选择：
 *   1. 控件只建一次，改数值只重画右半边。否则拖滑条的时候整个 DOM 会被重建，
 *      滑条会在手指底下消失。
 *   2. 每次改动立刻整车重算。buildTank 是纯函数、几微秒的事，没必要做增量。
 */

import {
  ARMOR_MATERIALS,
  AUXES,
  ENGINE_BY_ID,
  ENGINES,
  GUNS,
  HULL_BY_ID,
  HULLS,
  SUSPENSION_BY_ID,
  SUSPENSIONS,
} from '../data/parts'
import { HISTORICAL } from '../data/historical'
import { buildTank } from '../model/build'
import { solveGeometry } from '../model/geometry'
import { muzzleVelocity } from '../model/gun'
import { penetrationAt, losPenetrated, plateDefeated } from '../model/ballistics'
import { designYear } from '../model/era'
import { gunOfDesign, weaponFromLegacyGun } from '../model/weapon'
import { designCheck } from '../sim/research'
import { readDraft, writeAdopted } from '../../platform/design-handoff'
import { readTech } from '../../platform/tech-handoff'
import type { ArmorMaterialId, ShellType, Tank, TankDesign } from '../types'
import { mountWeaponPanel } from './weapon-panel'

/**
 * 可选弹种。火炮自带一个 shell 字段（这门炮当年配的弹），
 * 这里允许玩家换成另一颗 —— 换了以后初速会跟着弹重变，穿深从德马尔公式重新算。
 */
const SHELL_OPTIONS: ReadonlyArray<{ value: ShellType; label: string }> = [
  { value: 'ap', label: '穿甲弹（全口径钢芯）' },
  { value: 'aphe', label: '半穿甲爆破弹' },
  { value: 'apcbc', label: '被帽穿甲弹' },
  { value: 'apcr', label: '硬芯穿甲弹' },
  { value: 'apds', label: '脱壳穿甲弹' },
  { value: 'apfsds', label: '长杆脱壳穿甲弹' },
  { value: 'apfsds2', label: '贫铀长杆弹' },
  { value: 'heat', label: '破甲弹' },
]

// ────────────────────────────────────────────────────────────
// 小工具
// ────────────────────────────────────────────────────────────

type Attrs = Record<string, string | number | boolean | undefined>

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Array<string | Node>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue
    if (k === 'class') node.className = String(v)
    else if (k === 'text') node.textContent = String(v)
    else node.setAttribute(k, v === true ? '' : String(v))
  }
  for (const c of children) node.append(c)
  return node
}

const nf = (n: number, digits = 0): string =>
  n.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })

/** 每个控件都要能在「载入样车」之后自己刷新显示。 */
interface Control {
  node: HTMLElement
  sync: () => void
}

interface Option {
  value: string
  label: string
}

// ────────────────────────────────────────────────────────────
// 历史样车（启动时算一次，分数不会变）
// ────────────────────────────────────────────────────────────

const SAMPLES = HISTORICAL.map((h) => ({ ...h, tank: buildTank(h.design) }))

function eraBenchmark(year: number, total: number) {
  const window = SAMPLES.filter((s) => Math.abs(s.year - year) <= 6)
  const pool = window.length
    ? window
    : SAMPLES.slice()
        .sort((a, b) => Math.abs(a.year - year) - Math.abs(b.year - year))
        .slice(0, 3)
  const totals = pool.map((s) => s.tank.score.total).sort((a, b) => a - b)
  const avg = totals.reduce((s, v) => s + v, 0) / totals.length
  const best = totals[totals.length - 1] ?? 0
  const ratio = avg > 0 ? total / avg : 1
  const verdict = ratio >= 1.3 ? '领先同期' : ratio >= 0.9 ? '同期主流' : ratio >= 0.6 ? '落后半代' : '落后一代以上'
  return { avg, best, ratio, verdict, count: pool.length }
}

// ────────────────────────────────────────────────────────────
// 主界面
// ────────────────────────────────────────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg'

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}

export interface BureauOptions {
  /** 测试 / 嵌入时指定起点；不给就从空设计开始 */
  initialDesign?: TankDesign
}

export function mountBureau(root: HTMLElement, opts: BureauOptions = {}): void {
  const embedded = new URLSearchParams(location.search).get('embedded') === '1'
  /** 主循环发布的科技快照；没有就是沙盒模式（全部零件可选）。 */
  const tech = readTech()
  const techState = tech ? { mastered: tech.mastered, projects: [], slots: [{ level: 1, job: null }], build: null, upgrades: [] } : null
  const allowed = tech?.parts

  const hulls = allowed ? HULLS.filter((h) => allowed.hull.includes(h.id)) : HULLS
  const materials = allowed ? ARMOR_MATERIALS.filter((m) => allowed.material.includes(m.id)) : ARMOR_MATERIALS
  const guns = allowed ? GUNS.filter((g) => allowed.gun.includes(g.id)) : GUNS
  const engines = allowed ? ENGINES.filter((e) => allowed.engine.includes(e.id)) : ENGINES
  const suspensions = allowed ? SUSPENSIONS.filter((s) => allowed.suspension.includes(s.id)) : SUSPENSIONS
  const auxes = allowed ? AUXES.filter((a) => allowed.aux.includes(a.id)) : AUXES

  const blankDesign = (): TankDesign => {
    const hull = hulls[0] ?? HULLS[0]!
    const material = materials[0] ?? ARMOR_MATERIALS[0]!
    const gun = guns[0] ?? GUNS[0]!
    const engine = engines[0] ?? ENGINES[0]!
    const susp = suspensions[0] ?? SUSPENSIONS[0]!
    const aux = auxes[0] ?? AUXES[0]!
    return {
      name: '新设计',
      hull: hull.id,
      armor: {
        material: material.id,
        front: 16,
        frontSlope: 0,
        side: 16,
        turretFront: 16,
        turretSlope: 0,
      },
      gun: gun.id,
      engine: engine.id,
      suspension: susp.id,
      aux: aux.id,
    }
  }

  /**
   * 设计局不提供历史样车：从主循环打开时用当前这一局的产品做起点，
   * 独立打开时从一份空设计开始。`initialDesign` 只给测试/调试用。
   */
  const draft = embedded ? readDraft() : null
  const design: TankDesign = structuredClone(opts.initialDesign ?? draft ?? blankDesign())
  if (tech && tech.limits.pike <= 1) delete design.armor.pike
  if (!design.weapon) design.weapon = weaponFromLegacyGun(design.gun)

  const controls: Control[] = []

  // ── 控件工厂 ──────────────────────────────────────────────

  function selectRow(label: string, options: readonly Option[], get: () => string, set: (v: string) => void): Control {
    const sel = el('select', { class: 'sel' })
    const list = [...options]
    if (!list.some((o) => o.value === get())) {
      list.push({ value: get(), label: `${get()}（未解锁）` })
    }
    for (const o of list) sel.append(el('option', { value: o.value, text: o.label }))
    sel.value = get()
    sel.addEventListener('change', () => {
      set(sel.value)
      update()
    })
    const node = el('label', { class: 'row' }, el('span', { class: 'row-label', text: label }), sel)
    return {
      node,
      sync: () => {
        sel.value = get()
      },
    }
  }

  function sliderRow(
    label: string,
    min: number,
    max: number,
    step: number,
    unit: string,
    get: () => number,
    set: (v: number) => void,
  ): Control {
    const out = el('span', { class: 'row-value' })
    const input = el('input', {
      class: 'rng',
      type: 'range',
      min: String(min),
      max: String(max),
      step: String(step),
      value: String(get()),
    }) as HTMLInputElement
    const paint = (): void => {
      out.textContent = `${get()}${unit}`
      const pct = ((get() - min) / (max - min)) * 100
      input.style.setProperty('--fill', `${Math.max(0, Math.min(100, pct))}%`)
    }
    paint()
    input.addEventListener('input', () => {
      set(Number(input.value))
      paint()
      update()
    })
    const node = el(
      'label',
      { class: 'row row-stack' },
      el('span', { class: 'row-head' }, el('span', { class: 'row-label', text: label }), out),
      input,
    )
    return {
      node,
      sync: () => {
        input.value = String(get())
        paint()
      },
    }
  }

  function checkRow(label: string, get: () => boolean, set: (v: boolean) => void): Control {
    const box = el('input', { class: 'chk', type: 'checkbox' }) as HTMLInputElement
    box.checked = get()
    box.addEventListener('change', () => {
      set(box.checked)
      update()
    })
    const node = el('label', { class: 'row row-check' }, box, el('span', { class: 'row-label', text: label }))
    return {
      node,
      sync: () => {
        box.checked = get()
      },
    }
  }

  // ── 左栏：武器 + 车体 ────────────────────────────────────

  const slots = el('section', { class: 'panel slots' })

  const weaponHost = el('div', { class: 'wpn-host' })
  slots.append(weaponHost)
  mountWeaponPanel(weaponHost, {
    design,
    limits: tech
      ? {
          caliberMax: tech.limits.caliberMax,
          howitzerCaliberMax: tech.limits.howitzerCaliberMax,
          barrelMax: tech.limits.barrelMax,
          chargeMax: tech.limits.chargeMax,
        }
      : { caliberMax: 152, howitzerCaliberMax: 152, barrelMax: 70, chargeMax: 1.5 },
    mastered: tech?.mastered,
    onChange: () => {
      design.weapon!.custom = true
      update()
    },
  })

  const chassis = el('details', { class: 'wpn-chassis' })
  const chassisBody = el('div', { class: 'wpn-chassis-body' })
  chassis.append(el('summary', { class: 'wpn-chassis-head', text: '车体 / 装甲 / 动力 / 辅助' }), chassisBody)
  slots.append(chassis)

  function group(title: string): void {
    chassisBody.append(el('div', { class: 'panel-head' }, title))
  }

  function add(control: Control): void {
    controls.push(control)
    chassisBody.append(control.node)
  }

  group('型号')
  // 型号名：玩家自己起名。
  const nameInput = el('input', { class: 'txt', maxlength: '24', value: design.name }) as HTMLInputElement
  nameInput.addEventListener('input', () => {
    design.name = nameInput.value.trim().slice(0, 24) || '未命名'
    update()
  })
  add({
    node: el('label', { class: 'row' }, el('span', { class: 'row-label', text: '型号名' }), nameInput),
    sync: () => {
      nameInput.value = design.name
    },
  })

  group('车体')
  add(
    selectRow(
      '型号',
      hulls.map((h) => ({ value: h.id, label: `${h.era}  ${h.name}` })),
      () => design.hull,
      (v) => (design.hull = v),
    ),
  )

  group('装甲')
  const slopeMax = tech?.limits.slopeMax ?? 70
  add(
    selectRow(
      '材料',
      materials.map((m) => ({ value: m.id, label: `${m.era}  ${m.name}` })),
      () => design.armor.material,
      (v) => (design.armor.material = v as ArmorMaterialId),
    ),
  )
  add(
    selectRow(
      '炮塔材料',
      [
        { value: '', label: '同车体' },
        ...materials.map((m) => ({ value: m.id, label: `${m.era}  ${m.name}` })),
      ],
      () => design.armor.turretMaterial ?? '',
      (v) => {
        if (v) design.armor.turretMaterial = v as ArmorMaterialId
        else delete design.armor.turretMaterial
      },
    ),
  )
  add(sliderRow('首上厚度', 0, 350, 1, ' mm', () => design.armor.front, (v) => (design.armor.front = v)))
  add(sliderRow('首上倾角', 0, slopeMax, 1, '°', () => design.armor.frontSlope, (v) => (design.armor.frontSlope = v)))
  add(sliderRow('侧面厚度', 0, 160, 1, ' mm', () => design.armor.side, (v) => (design.armor.side = v)))
  add(sliderRow('炮塔正面', 0, 450, 1, ' mm', () => design.armor.turretFront, (v) => (design.armor.turretFront = v)))
  add(sliderRow('炮塔倾角', 0, Math.min(60, slopeMax), 1, '°', () => design.armor.turretSlope, (v) => (design.armor.turretSlope = v)))
  if (!tech || tech.limits.pike > 1) {
    add(checkRow('双斜面尖头（IS-3 式）', () => design.armor.pike === true, (v) => (design.armor.pike = v)))
  }

  group('动力与行走')
  add(
    selectRow(
      '发动机',
      engines.map((e) => ({ value: e.id, label: `${e.era}  ${e.name}` })),
      () => design.engine,
      (v) => (design.engine = v),
    ),
  )
  add(
    selectRow(
      '悬挂',
      suspensions.map((s) => ({ value: s.id, label: `${s.era}  ${s.name}` })),
      () => design.suspension,
      (v) => (design.suspension = v),
    ),
  )

  group('辅助设备')
  add(
    selectRow(
      '套件',
      auxes.map((a) => ({ value: a.id, label: `${a.era}  ${a.name}` })),
      () => design.aux,
      (v) => (design.aux = v),
    ),
  )

  // ── 右栏：读数 ────────────────────────────────────────────

  const totalValue = el('div', { class: 'total-value' })
  const totalBar = el('div', { class: 'bar-fill' })
  const scoreCard = el(
    'section',
    { class: 'panel score-card' },
    el(
      'div',
      { class: 'score-head' },
      el('div', { class: 'total-label', text: '总分' }),
      totalValue,
      el('div', { class: 'total-scale', text: '/ 10000' }),
    ),
    el('div', { class: 'bar track' }, totalBar),
  )

  const DIMS = [
    { key: 'armor', label: '装甲' },
    { key: 'pen', label: '火力' },
    { key: 'offroad', label: '机动' },
    { key: 'adapt', label: '适应' },
  ] as const

  const dimNodes = DIMS.map((d) => {
    const score = el('span', { class: 'dim-score' })
    const raw = el('span', { class: 'dim-raw' })
    const fill = el('div', { class: 'bar-fill' })
    const node = el(
      'div',
      { class: `dim dim-${d.key}` },
      el('span', { class: 'dim-label', text: d.label }),
      score,
      el('div', { class: 'bar track slim' }, fill),
      raw,
    )
    return { key: d.key, score, raw, fill, node }
  })

  const dimCard = el(
    'section',
    { class: 'panel' },
    el('div', { class: 'panel-head' }, '四维'),
    ...dimNodes.map((d) => d.node),
  )

  const PHYS: Array<{ k: string; label: string; unit: string }> = [
    { k: 'mass', label: '战斗全重', unit: 't' },
    { k: 'size', label: '尺寸 长×宽×高', unit: 'm' },
    { k: 'ring', label: '炮塔座圈', unit: 'm' },
    { k: 'crew', label: '乘员', unit: '人' },
    { k: 'hpPerTon', label: '吨功率', unit: 'hp/t' },
    { k: 'groundPressure', label: '接地压力', unit: 'kPa' },
    { k: 'vMax', label: '公路极速', unit: 'km/h' },
    { k: 'vOffroad', label: '越野速度', unit: 'km/h' },
    { k: 'vReverse', label: '倒车速度', unit: 'km/h' },
    { k: 'armorFront', label: '首上等效', unit: 'mm' },
    { k: 'armorTurret', label: '炮塔等效', unit: 'mm' },
    { k: 'armorSide', label: '侧面等效', unit: 'mm' },
    { k: 'armorFrontCe', label: '首上抗破', unit: 'mm' },
    { k: 'armorTurretCe', label: '炮塔抗破', unit: 'mm' },
    { k: 'velocity', label: '炮口初速', unit: 'm/s' },
    { k: 'pen', label: '穿深 500m', unit: 'mm' },
    { k: 'reloadSec', label: '装填', unit: 's' },
    { k: 'depression', label: '俯仰角', unit: '°' },
    { k: 'aps', label: '主动防御', unit: '' },
    { k: 'rounds', label: '备弹', unit: '发' },
  ]
  const physValues = new Map<string, HTMLElement>()
  const physRows = PHYS.map((p) => {
    const v = el('span', { class: 'kv-value' })
    physValues.set(p.k, v)
    return el(
      'div',
      { class: 'kv' },
      el('span', { class: 'kv-label', text: p.label }),
      v,
      el('span', { class: 'kv-unit', text: p.unit }),
    )
  })
  const physCard = el(
    'section',
    { class: 'panel' },
    el('div', { class: 'panel-head' }, '物理量'),
    el('div', { class: 'kv-grid' }, ...physRows),
  )

  // 「弹道」：穿深不是一维的数。这一栏故意同时给出「实板」和「视线」两个口径，
  // 因为它们差一个 cos θ，玩家一旦混用就会算错倾角带来的收益。
  const BAL_DIST = [100, 500, 1000, 1500, 2000] as const
  const balSvg = svgEl('svg', { class: 'bal-svg', viewBox: '0 0 680 200', role: 'img' })
  balSvg.append(
    svgEl('line', { class: 'bal-axis', x1: '40', y1: '162', x2: '642', y2: '162' }),
    svgEl('line', { class: 'bal-axis', x1: '40', y1: '18', x2: '40', y2: '162' }),
  )
  for (const frac of [0.25, 0.5, 0.75]) {
    balSvg.append(
      svgEl('line', {
        class: 'bal-grid',
        x1: '40',
        y1: String(18 + frac * 144),
        x2: '642',
        y2: String(18 + frac * 144),
      }),
    )
  }
  const balLine = svgEl('polyline', { class: 'bal-line' })
  balSvg.append(balLine)
  const balPoints = BAL_DIST.map((d, i) => {
    const dot = svgEl('circle', { class: 'bal-point', r: '4' })
    const val = svgEl('text', { class: 'bal-val', 'text-anchor': 'middle' })
    const xlab = svgEl('text', { class: 'bal-x', 'text-anchor': 'middle', y: '184' })
    xlab.textContent = d >= 1000 ? `${d / 1000}km` : `${d}m`
    balSvg.append(dot, val, xlab)
    return { d, i, dot, val, xlab }
  })

  const BAL_ANGLES = [0, 30, 45, 60] as const
  const balSlopes = BAL_ANGLES.map((a) => {
    const plate = el('span', { class: 'bal-num' })
    const los = el('span', { class: 'bal-num bal-dim' })
    return {
      a,
      plate,
      los,
      node: el(
        'div',
        { class: 'bal-sc' },
        el('div', { class: 'bal-sa', text: `${a}°` }),
        plate,
        los,
      ),
    }
  })

  const balMeta = el('div', { class: 'bal-meta' })
  const balTip = el('div', { class: 'bal-tip' })
  const balNote = el('div', { class: 'bal-note' })
  const balCard = el(
    'section',
    { class: 'panel bal-card' },
    el('div', { class: 'panel-head' }, '弹道'),
    el(
      'div',
      { class: 'bal-body' },
      el('div', { class: 'bal-sub', text: '距离 · 能打穿多厚的垂直板' }),
      el('div', { class: 'bal-chart' }, balSvg),
      el('div', { class: 'bal-sub', text: '倾角 · 实板厚度 / 视线等效' }),
      el('div', { class: 'bal-slopes' }, ...balSlopes.map((s) => s.node)),
      balTip,
      balMeta,
      balNote,
    ),
  )

  const COST_LABELS = ['材料费', '工时', '工时费', '单台成本'] as const
  const costValues = new Map<string, HTMLElement>()
  const costRows = COST_LABELS.map((label) => {
    const v = el('span', { class: 'kv-value' })
    costValues.set(label, v)
    return el(
      'div',
      { class: label === '单台成本' ? 'kv kv-strong' : 'kv' },
      el('span', { class: 'kv-label', text: label }),
      v,
    )
  })
  const costCard = el('section', { class: 'panel' }, el('div', { class: 'panel-head' }, '单台成本'), ...costRows)

  const flawList = el('ul', { class: 'flaws' })
  const flawCard = el('section', { class: 'panel' }, el('div', { class: 'panel-head' }, '缺陷'), flawList)

  const eraBody = el('div', { class: 'era-body' })
  const eraCard = el('section', { class: 'panel era-card' }, el('div', { class: 'panel-head' }, '同期对比'), eraBody)

  // 「耦合与代价」：这一栏是整个设计局存在的理由。
  // 玩家的每一个选择都会自己长出代价来 —— 这一栏就是把那条链**摊开给他看**，
  // 否则他只能看到总分变了一点，不知道是被谁吃掉的。
  const COUPLES = [
    { k: 'hull', label: '发动机舱 → 车体长度' },
    { k: 'ring', label: '火炮口径 → 炮塔座圈' },
    { k: 'slope', label: '首上倾角 → 装甲板面积' },
    { k: 'cap', label: '悬挂 → 公路极速上限' },
  ] as const
  const coupleValues = new Map<string, HTMLElement>()
  const coupleNotes = new Map<string, HTMLElement>()
  const coupleRows = COUPLES.map((c) => {
    const v = el('span', { class: 'kv-value' })
    const note = el('span', { class: 'couple-note' })
    coupleValues.set(c.k, v)
    coupleNotes.set(c.k, note)
    return el('div', { class: 'couple-row' }, el('span', { class: 'kv-label', text: c.label }), v, note)
  })
  const coupleCard = el(
    'section',
    { class: 'panel couple-card' },
    el('div', { class: 'panel-head' }, '耦合与代价'),
    el('div', { class: 'couple-grid' }, ...coupleRows),
  )

  const readout = el(
    'section',
    { class: 'readout' },
    scoreCard,
    dimCard,
    physCard,
    balCard,
    coupleCard,
    costCard,
    flawCard,
    eraCard,
  )

  // ── 装配 ──────────────────────────────────────────────────

  const adoptNote = el('span', { class: 'adopt-note' })
  const techNote = el('p', { class: 'tech-note' })
  const adoptBtn = el('button', { class: 'adopt-btn', type: 'button' }, embedded ? '应用到本局 →' : '采用此设计 →')
  adoptBtn.addEventListener('click', () => {
    if (!design.name.trim()) {
      design.name = '未命名'
      nameInput.value = design.name
      update()
    }
    if (techState) {
      const gate = designCheck(design, techState)
      if (!gate.ok) {
        adoptNote.textContent = `当前科技造不出这辆车：${gate.reason}`
        adoptNote.classList.add('bad')
        return
      }
    }
    if (embedded) {
      try {
        const target = location.origin === 'null' ? '*' : location.origin
        window.parent.postMessage({ type: 'tank-works:design', design }, target)
        adoptNote.textContent = `已把「${design.name}」发回本局`
        adoptNote.classList.remove('bad')
      } catch {
        adoptNote.textContent = '无法把设计发回本局'
        adoptNote.classList.add('bad')
      }
      return
    }
    const ok = writeAdopted(design)
    const year = designYear(design)
    adoptNote.textContent = ok
      ? `已采用「${design.name}」· ${year} 年 · 回主循环点「导入设计局的车」`
      : '这个浏览器不允许写本地存储'
    adoptNote.classList.toggle('bad', !ok)
  })

  const backLink = el('a', { class: 'adopt-link', href: './game.html' }, '去主循环 →')
  if (embedded) backLink.hidden = true
  const header = el(
    'header',
    { class: 'topbar' },
    el(
      'div',
      { class: 'brand' },
      el('h1', { text: embedded ? '设计本厂车' : '设计局' }),
      el('p', {
        class: 'sub',
        text: embedded
          ? '当前这一局的产品 · 改完直接应用，不用两个页面来回倒'
          : '炮、弹、架与底盘一起决定这辆车 · 每改一处，都能看到代价落在谁身上',
      }),
    ),
    el(
      'div',
      { class: 'top-side' },
      el('div', { class: 'top-actions' }, adoptBtn, backLink),
      adoptNote,
      techNote,
      el(
        'p',
        { class: 'hint', text: '提示：先把首上倾角拉到 60°，再把厚度翻倍 —— 看看吨位和工时谁涨得快。' },
      ),
    ),
  )

  root.append(el('div', { class: 'bureau' }, header, el('main', { class: 'layout' }, slots, readout)))

  if (!embedded) {
    window.addEventListener('focus', () => {
      const latest = readTech()
      if (latest && (!tech || latest.at !== tech.at)) {
        techNote.textContent = '科技状态已更新：刷新页面后零件表才会跟着变。'
      }
    })
  }

  update()

  // ── 刷新读数 ──────────────────────────────────────────────

  function update(): void {
    const tank = buildTank(design, tech?.mods)
    const s = tank.score
    const p = tank.physical

    totalValue.textContent = nf(s.total)
    totalBar.style.width = `${Math.min(100, (s.total / 10000) * 100)}%`

    const rawText: Record<(typeof DIMS)[number]['key'], string> = {
      armor: `${nf(p.armorFront)} mm 等效`,
      pen: `${nf(p.pen)} mm / 500m`,
      offroad: `${nf(p.vOffroad)} km/h 越野`,
      adapt: `${nf(tank.raw.adapt)} 构造分`,
    }

    for (const d of dimNodes) {
      const v = s[d.key]
      d.score.textContent = nf(v)
      d.raw.textContent = rawText[d.key]
      d.fill.style.width = `${Math.min(100, (v / 10000) * 100)}%`
    }

    const set = (k: string, text: string): void => {
      const node = physValues.get(k)
      if (node) node.textContent = text
    }
    set('mass', nf(p.mass / 1000, 1))
    set('size', `${p.length.toFixed(2)}×${p.width.toFixed(2)}×${p.height.toFixed(2)}`)
    set('ring', p.ring.toFixed(2))
    set('crew', nf(p.crew))
    set('hpPerTon', p.hpPerTon.toFixed(1))
    set('groundPressure', nf(p.groundPressure))
    set('vMax', nf(p.vMax))
    set('vOffroad', nf(p.vOffroad))
    set('vReverse', nf(p.vReverse))
    set('armorFront', nf(p.armorFront))
    set('armorTurret', nf(p.armorTurret))
    set('armorSide', nf(p.armorSide))
    set('armorFrontCe', nf(p.armorFrontCe))
    set('armorTurretCe', nf(p.armorTurretCe))
    const gun = gunOfDesign(design)
    set('velocity', nf(tank.ballistics.v0))
    set('pen', nf(p.pen))
    set('reloadSec', p.reloadSec.toFixed(1))
    set('depression', `-${p.depression.toFixed(1)}`)
    set('aps', p.aps ? '有' : '无')
    set('rounds', nf(p.rounds))

    // ── 弹道两轴 ──
    const b = tank.ballistics
    const pens = BAL_DIST.map((d) =>
      d === 500
        ? b.pen500
        : d === 1000
          ? b.pen1000
          : d === 2000
            ? b.pen2000
            : penetrationAt(b.pen500, d, b.keep2k),
    )
    const maxPen = Math.max(1, ...pens) * 1.1
    const coords = pens.map((v, i) => {
      const x = 40 + (i * 602) / (BAL_DIST.length - 1)
      const y = 162 - (v / maxPen) * 144
      return { x, y }
    })
    balLine.setAttribute('points', coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' '))
    balPoints.forEach((c, i) => {
      const { x, y } = coords[i]!
      c.dot.setAttribute('cx', x.toFixed(1))
      c.dot.setAttribute('cy', y.toFixed(1))
      c.val.setAttribute('x', x.toFixed(1))
      c.val.setAttribute('y', String(Math.max(12, y - 9)))
      c.val.textContent = nf(pens[i]!)
      c.xlab.setAttribute('x', x.toFixed(1))
    })

    BAL_ANGLES.forEach((a, i) => {
      const cell = balSlopes[i]!
      cell.plate.textContent = `${nf(plateDefeated(b.pen500, a, b.slopeExp))} mm`
      cell.los.textContent = `视线 ${nf(losPenetrated(b.pen500, a, b.slopeExp))}`
    })

    const shellLabel = SHELL_OPTIONS.find((s) => s.value === b.shell)?.label ?? b.shell
    balMeta.textContent = `${shellLabel} · 2km 保持 ${Math.round(b.keep2k * 100)}% · 斜板 s=${b.slopeExp.toFixed(2)} · 2km 存速 ${nf(b.v2000)} m/s`

    const los0 = losPenetrated(b.pen500, 0, b.slopeExp)
    const los60 = losPenetrated(b.pen500, 60, b.slopeExp)
    const swing = los0 > 0 ? (los60 / los0 - 1) * 100 : 0
    balTip.textContent =
      b.shell === 'heat'
        ? `破甲弹不吃角度：60° 板上照样钻 ${nf(b.plate60)} mm 实板（视线 ${nf(los60)} mm）—— 射流顺着法线走`
        : Math.abs(swing) < 0.5
          ? `纯几何：不管板子多斜，能钻的视线厚度都是 ${nf(los0)} mm`
          : swing > 0
            ? `被帽咬住斜板：60° 时能钻的视线厚度比 0° 多 ${swing.toFixed(0)}%`
            : `长杆怕斜板：60° 时视线穿透掉到 0° 的 ${(100 + swing).toFixed(0)}%`

    const los2k = losPenetrated(b.pen2000, 60, b.slopeExp)
    const antiCe = b.shell === 'heat'
    const target = antiCe ? p.armorFrontCe : p.armorFront
    const through = los2k >= target
    balNote.textContent = antiCe
      ? `破甲弹不吃倾角：2km 处能打穿 ${nf(los2k)} mm 抗破，本车首上抗破 ${nf(target)} mm —— ${through ? '打得穿' : '打不穿'}`
      : `假设对面首上 60°：2km 处能打穿 ${nf(los2k)} mm 视线厚度，本车首上 ${nf(target)} mm —— ${through ? '打得穿' : '打不穿'}`
    balNote.classList.toggle('warn', !through)

    costValues.get('材料费')!.textContent = `¥${nf(tank.cost.material)}`
    costValues.get('工时')!.textContent = `${nf(tank.cost.hours)} h`
    costValues.get('工时费')!.textContent = `¥${nf(tank.cost.labor)}`
    costValues.get('单台成本')!.textContent = `¥${nf(tank.cost.total)}`

    // ── 耦合与代价 ──
    const hull = HULL_BY_ID.get(design.hull)
    const sus = SUSPENSION_BY_ID.get(design.suspension)
    if (hull && sus && gun) {
      const geo = solveGeometry(hull, gun, ENGINE_BY_ID.get(design.engine)!, sus, design.armor)
      const put = (k: string, value: string, note: string, warn = false): void => {
        const v = coupleValues.get(k)
        const n = coupleNotes.get(k)
        if (v) v.textContent = value
        if (n) {
          n.textContent = note
          n.classList.toggle('warn', warn)
        }
      }
      const stretch = geo.hullLength - hull.length
      put(
        'hull',
        `${hull.length.toFixed(2)} → ${geo.hullLength.toFixed(2)} m`,
        stretch > 0.005 ? `发动机舱撑长 +${stretch.toFixed(2)} m` : '发动机塞得下，车体不用拉长',
        stretch > 0.15,
      )
      const ringPush = geo.ring - hull.ring
      put(
        'ring',
        `${hull.ring.toFixed(2)} → ${geo.ring.toFixed(2)} m`,
        ringPush > 0.005 ? `炮尾顶大 +${ringPush.toFixed(2)} m` : '原来的座圈就装得下',
        ringPush > 0.05,
      )
      const gain = 1 / Math.cos((Math.max(1, design.armor.frontSlope) * Math.PI) / 180)
      put(
        'slope',
        `×${gain.toFixed(2)}`,
        `${design.armor.frontSlope}° 倾角让这块板变长 ${((gain - 1) * 100).toFixed(0)}%，重量照收`,
        gain > 1.5,
      )
      const capped = sus.vCap - p.vMax
      put(
        'cap',
        `${sus.vCap} km/h`,
        capped < 1 ? '极速被行走机构卡死，换更大发动机也白搭' : `还有 ${capped.toFixed(0)} km/h 余量`,
        capped < 1,
      )
    }

    flawList.replaceChildren()
    if (tank.flaws.length === 0) {
      flawList.append(el('li', { class: 'flaw-none', text: '没有明显缺陷' }))
    } else {
      for (const f of tank.flaws) flawList.append(el('li', { text: f }))
    }

    const era = eraBenchmark(gun?.era ?? 1940, s.total)
    const tagKind = era.ratio >= 1.3 ? 'up' : era.ratio >= 0.9 ? 'ok' : 'down'
    eraBody.replaceChildren(
      el(
        'div',
        { class: 'era-row' },
        el('div', { class: 'era-stat' }, el('span', { class: 'era-key', text: '同期平均' }), el('span', { class: 'era-val', text: nf(era.avg) })),
        el('div', { class: 'era-stat' }, el('span', { class: 'era-key', text: '同期最好' }), el('span', { class: 'era-val', text: nf(era.best) })),
      ),
      el(
        'div',
        { class: 'era-verdict' },
        el('span', { class: `tag tag-${tagKind}`, text: era.verdict }),
        el('span', { class: 'era-ratio', text: `${(era.ratio * 100).toFixed(0)}% 的同期平均水平` }),
      ),
      el('div', { class: 'era-note', text: `对比池：${era.count} 辆该年代历史车（±6 年）` }),
    )

    // 科技闸门：有主循环快照时，实时告诉玩家这辆车现在能不能造。
    if (techState) {
      const gate = designCheck(design, techState)
      adoptBtn.disabled = !gate.ok
      techNote.textContent = gate.ok
        ? `科技：${tech!.year} 年 · ${Object.values(tech!.mastered).filter((v) => v > 0).length} 条已掌握`
        : `当前科技造不出：${gate.reason}`
      techNote.classList.toggle('bad', !gate.ok)
    } else {
      adoptBtn.disabled = false
      techNote.textContent = '沙盒模式：全部零件可选；主循环会按科技闸门拒绝非法车。'
    }
  }
}

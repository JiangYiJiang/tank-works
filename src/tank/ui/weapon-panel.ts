/**
 * 武器页：火炮 / 弹药 / 弹架。
 *
 * 只负责把玩家的操作写进 TankDesign.weapon，然后通知设计局重算。
 * 所有物理量都从 model/weapon.ts 来，界面不复制公式。
 */

import {
  MAX_AMMO_TYPES,
  MAX_ROUNDS,
  MIN_CHARGE,
  MAX_CHARGE,
  MIN_PROJECTILE_LENGTH,
  MAX_PROJECTILE_LENGTH,
  ammoCoverage,
  ammoLabel,
  minTurretRounds,
  rackHull,
  totalRounds,
  validateWeapon,
  weaponMetrics,
  weaponTechGates,
} from '../model/weapon'
import type { AmmoSpec, GunSpec, ShellType, TankDesign } from '../types'

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

export interface WeaponLimits {
  caliberMax: number
  howitzerCaliberMax: number
  barrelMax: number
  chargeMax: number
}

export interface WeaponPanelOptions {
  design: TankDesign
  limits: WeaponLimits
  mastered?: Readonly<Record<string, number>>
  onChange: () => void
}

export function mountWeaponPanel(root: HTMLElement, opts: WeaponPanelOptions): { sync: () => void } {
  const { design, limits, mastered, onChange } = opts
  if (!design.weapon) throw new Error('weapon panel needs design.weapon')
  const gates = weaponTechGates(mastered)

  let tab: 'gun' | 'ammo' | 'rack' = 'gun'
  const tabs = el('div', { class: 'wpn-tabs' })
  const body = el('div', { class: 'wpn-body' })
  const tabButtons = new Map<string, HTMLButtonElement>()
  for (const [id, label] of [
    ['gun', '火炮'],
    ['ammo', '弹药'],
    ['rack', '弹架'],
  ] as const) {
    const b = el('button', { class: 'wpn-tab', type: 'button', 'data-tab': id, text: label })
    b.addEventListener('click', () => {
      tab = id
      sync()
    })
    tabs.append(b)
    tabButtons.set(id, b)
  }
  root.append(el('div', { class: 'wpn-title' }, el('strong', { text: '武器设计' }), el('span', { text: '炮 / 弹 / 架' })), tabs, body)

  const familyOptions = (): Array<{ value: GunSpec['family']; label: string }> => [
    { value: 'cannon', label: '加农炮' },
    { value: 'howitzer', label: '榴弹炮' },
  ]

  const availableAmmo = (): ShellType[] => {
    const list: ShellType[] = ['ap', 'aphe', 'apcbc', 'apcr', 'apds', 'apfsds', 'apfsds2', 'heat']
    if (!mastered) return list
    const has = (ladder: string, tier = 1): boolean => (mastered[ladder] ?? 0) >= tier
    return list.filter((f) => {
      if (f === 'ap' || f === 'aphe' || f === 'apcbc') return true
      if (f === 'apcr') return has('ammo.apcr')
      if (f === 'apds') return has('ammo.apds')
      if (f === 'apfsds') return has('ammo.apfsds')
      if (f === 'apfsds2') return has('ammo.apfsds', 3)
      if (f === 'heat') return has('ammo.heat')
      return true
    })
  }

  function row(label: string, control: HTMLElement, hint?: string): HTMLElement {
    return el(
      'label',
      { class: 'wpn-row' },
      el('span', { class: 'wpn-label', text: label }),
      control,
      hint ? el('span', { class: 'wpn-hint', text: hint }) : '',
    )
  }

  function range(
    label: string,
    min: number,
    max: number,
    step: number,
    get: () => number,
    set: (n: number) => void,
    unit: string,
  ): HTMLElement {
    const out = el('span', { class: 'wpn-value' })
    const input = el('input', {
      class: 'wpn-range',
      type: 'range',
      min: String(min),
      max: String(max),
      step: String(step),
    }) as HTMLInputElement
    const paint = (): void => {
      input.value = String(get())
      out.textContent = `${get()}${unit}`
      input.style.setProperty('--fill', `${((get() - min) / (max - min)) * 100}%`)
    }
    paint()
    input.addEventListener('input', () => {
      set(Number(input.value))
      paint()
      onChange()
    })
    return el(
      'label',
      { class: 'wpn-range-row' },
      el('span', { class: 'wpn-label', text: label }),
      el('span', { class: 'wpn-range-wrap' }, input, out),
    )
  }

  function select(
    label: string,
    options: Array<{ value: string; label: string; disabled?: boolean }>,
    get: () => string,
    set: (v: string) => void,
  ): HTMLElement {
    const s = el('select', { class: 'sel wpn-select' })
    for (const o of options) {
      const op = el('option', { value: o.value, text: o.disabled ? `${o.label}（未解锁）` : o.label })
      if (o.disabled) op.disabled = true
      s.append(op)
    }
    s.value = get()
    s.addEventListener('change', () => {
      set(s.value)
      onChange()
    })
    return row(label, s)
  }

  function checkbox(label: string, get: () => boolean, set: (v: boolean) => void, locked = false): HTMLElement {
    const box = el('input', { class: 'chk', type: 'checkbox' }) as HTMLInputElement
    box.checked = get()
    box.disabled = locked && !get()
    box.addEventListener('change', () => {
      set(box.checked)
      onChange()
    })
    return el('label', { class: 'wpn-check' }, box, el('span', { text: locked ? `${label}（未解锁）` : label }))
  }

  function gunTab(): HTMLElement {
    const g = design.weapon!.gun
    const pane = el('div', { class: 'wpn-pane' })

    const family = el('div', { class: 'wpn-seg' })
    for (const f of familyOptions()) {
      const locked = f.value === 'howitzer' && !gates.howitzer
      const b = el('button', {
        class: g.family === f.value ? 'wpn-seg-btn on' : 'wpn-seg-btn',
        type: 'button',
        text: locked ? `${f.label}（未解锁）` : f.label,
        disabled: locked && g.family !== f.value,
      })
      b.addEventListener('click', () => {
        if (locked) return
        g.family = f.value
        g.caliber = Math.min(g.caliber, f.value === 'howitzer' ? limits.howitzerCaliberMax : limits.caliberMax)
        onChange()
        sync()
      })
      family.append(b)
    }
    pane.append(row('炮族', family))

    const caliberMax = g.family === 'howitzer' ? limits.howitzerCaliberMax : limits.caliberMax
    pane.append(
      range('口径', 20, Math.max(20, caliberMax), 1, () => g.caliber, (v) => (g.caliber = v), ' mm'),
      range('身管', 8, Math.max(8, limits.barrelMax), 1, () => g.barrelCalibers, (v) => (g.barrelCalibers = v), ' 倍'),
      range(
        '膛压上限',
        MIN_CHARGE,
        Math.max(MIN_CHARGE, limits.chargeMax),
        0.01,
        () => g.pressure,
        (v) => (g.pressure = v),
        '',
      ),
      select(
        '膛线',
        [
          { value: 'rifled', label: '线膛' },
          { value: 'smoothbore', label: '滑膛', disabled: !gates.smoothbore },
        ],
        () => g.rifling,
        (v) => (g.rifling = v as GunSpec['rifling']),
      ),
      select(
        '装填',
        [
          { value: 'manual', label: '人工' },
          { value: 'semi', label: '半自动', disabled: !gates.semi },
          { value: 'bustle', label: '尾舱', disabled: !gates.bustle },
          { value: 'carousel', label: '转盘', disabled: !gates.carousel },
          { value: 'none', label: '无炮塔', disabled: !gates.turretless },
        ],
        () => g.loading,
        (v) => {
          g.loading = v as GunSpec['loading']
          if (g.loading === 'carousel' || g.loading === 'none') design.weapon!.rack.turret = 0
          onChange()
        },
      ),
      select(
        '供弹',
        [
          { value: 'single', label: '分装' },
          { value: 'ready', label: '整装', disabled: !gates.ready },
          { value: 'dual', label: '双路', disabled: !gates.dual },
        ],
        () => g.feed,
        (v) => (g.feed = v as GunSpec['feed']),
      ),
      el(
        'div',
        { class: 'wpn-checks' },
        checkbox('炮口制退器', () => g.muzzleBrake, (v) => (g.muzzleBrake = v), !gates.muzzleBrake),
        checkbox('热护套', () => g.thermalSleeve, (v) => (g.thermalSleeve = v), !gates.thermalSleeve),
      ),
      el(
        'p',
        { class: 'wpn-note' },
        `当前科技上限：${g.family === 'howitzer' ? '榴弹炮' : '加农炮'}口径 ${caliberMax}mm · 身管 ${limits.barrelMax} 倍 · 装药 ${limits.chargeMax}。未解锁项已置灰，先到研发局点对应的炮闩/供弹/炮口/热护套科技。`,
      ),
    )
    return pane
  }

  function ammoTab(): HTMLElement {
    const pane = el('div', { class: 'wpn-pane' })
    const opts = availableAmmo()
    const list = design.weapon!.ammo
    for (let i = 0; i < list.length; i++) {
      const ammo = list[i]!
      const card = el('div', { class: 'wpn-ammo' })
      const head = el(
        'div',
        { class: 'wpn-ammo-head' },
        el('span', { class: 'wpn-ammo-no', text: `弹 ${i + 1}` }),
        el(
          'select',
          { class: 'sel wpn-ammo-family' },
          ...opts.map((f) => el('option', { value: f, text: ammoLabel(f), selected: f === ammo.family })),
        ),
      )
      const fam = head.querySelector('select') as HTMLSelectElement
      fam.value = ammo.family
      fam.addEventListener('change', () => {
        ammo.family = fam.value as ShellType
        onChange()
        sync()
      })
      if (list.length > 1) {
        const del = el('button', { class: 'wpn-del', type: 'button', text: '删' })
        del.addEventListener('click', () => {
          list.splice(i, 1)
          onChange()
          sync()
        })
        head.append(del)
      }
      card.append(
        head,
        select(
          '弹壳',
          [
            { value: 'fixed', label: '整装' },
            { value: 'separate', label: '分装' },
          ],
          () => ammo.cartridge,
          (v) => (ammo.cartridge = v as AmmoSpec['cartridge']),
        ),
      )
      card.append(
        ammoRange('弹长', MIN_PROJECTILE_LENGTH, MAX_PROJECTILE_LENGTH, 0.1, () => ammo.projectileLength, (v) => (ammo.projectileLength = v), ' cal'),
        ammoRange('装药', MIN_CHARGE, Math.max(MIN_CHARGE, limits.chargeMax), 0.01, () => ammo.charge, (v) => (ammo.charge = v), ''),
        ammoRange('数量', 1, MAX_ROUNDS, 1, () => ammo.count, (v) => (ammo.count = v), ' 发'),
      )
      pane.append(card)
    }

    if (list.length < MAX_AMMO_TYPES) {
      const add = el('button', { class: 'wpn-add', type: 'button', text: '+ 添加弹种' })
      add.addEventListener('click', () => {
        const used = new Set(list.map((a) => a.family))
        const next = opts.find((f) => !used.has(f)) ?? opts[0]
        if (!next) return
        list.push({ family: next, cartridge: 'fixed', projectileLength: 3.2, charge: 0.55, count: 8 })
        onChange()
        sync()
      })
      pane.append(add)
    }
    pane.append(
      el(
        'p',
        { class: 'wpn-note' },
        '至少 1 种，最多 4 种；同一弹种只能出现一次。数量会占用弹架体积和车重。',
      ),
    )
    return pane
  }

  function ammoRange(
    label: string,
    min: number,
    max: number,
    step: number,
    get: () => number,
    set: (n: number) => void,
    unit: string,
  ): HTMLElement {
    const out = el('span', { class: 'wpn-value' })
    const input = el('input', { class: 'wpn-range', type: 'range', min: String(min), max: String(max), step: String(step) }) as HTMLInputElement
    const paint = (): void => {
      input.value = String(get())
      out.textContent = `${get().toFixed(step < 1 ? 2 : 0)}${unit}`
      input.style.setProperty('--fill', `${((get() - min) / (max - min)) * 100}%`)
    }
    paint()
    input.addEventListener('input', () => {
      set(Number(input.value))
      paint()
      onChange()
    })
    return el('label', { class: 'wpn-range-row' }, el('span', { class: 'wpn-label', text: label }), el('span', { class: 'wpn-range-wrap' }, input, out))
  }

  function rackTab(): HTMLElement {
    const pane = el('div', { class: 'wpn-pane' })
    const w = design.weapon!
    const total = totalRounds(w)
    const min = minTurretRounds(w)
    const bar = el('div', { class: 'wpn-bar' })
    for (const ammo of w.ammo) {
      bar.append(
        el('span', {
          class: 'wpn-bar-seg',
          style: `width:${total > 0 ? (Math.max(0, ammo.count) / total) * 100 : 0}%`,
          title: `${ammoLabel(ammo.family)} ${ammo.count} 发`,
        }),
      )
    }
    pane.append(
      el('div', { class: 'wpn-rack-total' }, el('span', { text: '总备弹' }), el('strong', { text: `${total} 发` })),
      bar,
      range('炮塔备弹', 0, Math.max(1, total), 1, () => w.rack.turret, (v) => {
        w.rack.turret = Math.min(total, v)
      }, ' 发'),
      el('div', { class: 'wpn-rack-line' }, el('span', { text: '车体备弹' }), el('strong', { text: `${rackHull(w)} 发` })),
      el('div', { class: 'wpn-rack-line' }, el('span', { text: '炮塔下限' }), el('strong', { text: `${min} 发` })),
    )
    for (const ammo of w.ammo) {
      pane.append(
        el('div', { class: 'wpn-rack-line wpn-rack-ammo' }, el('span', { text: ammoLabel(ammo.family) }), el('strong', { text: `${ammo.count} 发` })),
      )
    }
    return pane
  }

  function sync(): void {
    body.replaceChildren()
    for (const [id, b] of tabButtons) b.classList.toggle('on', id === tab)
    body.append(tab === 'gun' ? gunTab() : tab === 'ammo' ? ammoTab() : rackTab())

    const check = validateWeapon(design.weapon!)
    const m = weaponMetrics(design.weapon!)
    const summary = el(
      'div',
      { class: 'wpn-summary' },
      el('span', { text: `口径 ${design.weapon!.gun.caliber}mm · 弹架 ${m.rackVolumeL.toFixed(0)}L · 弹药 ${m.ammoMassKg.toFixed(0)}kg · 炮全长 ${m.gunLengthM.toFixed(2)}m · 弹药覆盖 +${ammoCoverage(design.weapon!).bonus}` }),
      el('span', { class: check.ok ? 'wpn-ok' : 'wpn-bad', text: check.ok ? '结构合法' : check.reason }),
    )
    body.append(summary)
  }

  sync()
  return { sync }
}

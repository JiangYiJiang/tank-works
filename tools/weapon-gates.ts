/**
 * 武器页的科技闸门。
 *
 * 用户实际会看到的下拉/复选必须跟 designCheck 一致：
 * 没研发半自动炮闩，就不能在 1916 年选「半自动」。
 */

import { Window } from 'happy-dom'
import type { TankDesign } from '../src/tank/types'

const win = new Window({ url: 'http://localhost/tank.html' })
const doc = win.document as unknown as Document

Object.assign(globalThis, {
  window: win as unknown as Window,
  document: doc,
  location: win.location,
})

const { mountWeaponPanel } = await import('../src/tank/ui/weapon-panel')
const { weaponFromLegacyGun } = await import('../src/tank/model/weapon')

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

function panel(mastered: Record<string, number> | undefined): HTMLElement {
  const root = doc.createElement('div') as unknown as HTMLElement
  doc.body.appendChild(root as never)
  const design: TankDesign = {
    name: 'gate test',
    hull: 'ft',
    armor: { material: 'rha', front: 16, frontSlope: 0, side: 16, turretFront: 16, turretSlope: 0 },
    gun: 'sa18',
    engine: 'ft_eng',
    suspension: 'ft_susp',
    aux: 'bare',
    weapon: weaponFromLegacyGun('sa18'),
  }
  mountWeaponPanel(root, {
    design,
    limits: { caliberMax: 57, howitzerCaliberMax: 0, barrelMax: 30, chargeMax: 0.6 },
    mastered,
    onChange: () => undefined,
  })
  return root
}

function selectByLabel(root: HTMLElement, label: string): HTMLSelectElement | null {
  for (const row of [...root.querySelectorAll('.wpn-row')]) {
    if (row.querySelector('.wpn-label')?.textContent === label) {
      return row.querySelector('select')
    }
  }
  return null
}

function option(root: HTMLElement, label: string, value: string): HTMLOptionElement | null {
  return selectByLabel(root, label)?.querySelector(`option[value="${value}"]`) ?? null
}

console.log('\n武器页 · 科技闸门\n')

const early = panel({
  'gun.howitzer': 1,
  'gun.loading': 1,
  'gun.feed': 1,
  'gun.rifling': 1,
  'gun.muzzle': 1,
  'gun.thermal': 0,
})
check('1916 人工装填可用', option(early, '装填', 'manual')?.disabled === false)
check('1916 半自动被禁用', option(early, '装填', 'semi')?.disabled === true)
check('1916 尾舱/转盘被禁用', option(early, '装填', 'bustle')?.disabled === true && option(early, '装填', 'carousel')?.disabled === true)
check('1916 整装弹被禁用', option(early, '供弹', 'ready')?.disabled === true)
check('1916 滑膛被禁用', option(early, '膛线', 'smoothbore')?.disabled === true)
check('1916 炮口制退器被禁用', (early.querySelector('.wpn-check input') as HTMLInputElement | null)?.disabled === true)

const late = panel({
  'gun.howitzer': 2,
  'gun.loading': 3,
  'gun.feed': 3,
  'gun.rifling': 2,
  'gun.muzzle': 2,
  'gun.thermal': 1,
})
check('后期半自动/尾舱可用', option(late, '装填', 'semi')?.disabled === false && option(late, '装填', 'bustle')?.disabled === false)
check('后期整装/双路可用', option(late, '供弹', 'ready')?.disabled === false && option(late, '供弹', 'dual')?.disabled === false)
check('后期滑膛可用', option(late, '膛线', 'smoothbore')?.disabled === false)

console.log(`\n${pass} 通过 / ${fail} 失败\n`)
if (fail > 0) process.exitCode = 1

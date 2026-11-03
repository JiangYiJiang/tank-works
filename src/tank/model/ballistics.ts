/**
 * 弹道两轴：**距离**和**倾角**。
 *
 * 为什么必须有这两轴：如果穿深只是一个数，那么「被帽弹 → 硬芯弹 → 脱壳弹 →
 * 长杆弹」这四种东西除了德马尔系数 K 不同之外没有任何区别，玩家看不出
 * 「硬芯弹近距离很猛但两百米外就泄气」，也看不出「长杆弹中远距几乎不掉，
 * 可是一碰到 60° 首上就跳」。科技树上那条「被帽弹 / 风帽被帽弹 / 钨芯硬芯弹」
 * 的分叉，本质上就是**在距离轴和倾角轴上选不同的斜率**。
 *
 * ── 距离轴 ─────────────────────────────────────────────
 *
 * 用「保持率」而不是绝对速度来建模，是因为数据本来就是这个形式：
 * 每门炮的 500m 穿深已经由德马尔公式给出，我们只需要知道它在 2km 还剩几成。
 *
 *   keep(d) = k2k ^ ((d - 500) / (2000 - 500))
 *
 * 这条式子在 d=500 时恒等于 1（不破坏已有的标定），在 d=2000 时等于 k2k。
 * 它等价的物理形式是速度的指数衰减 v(x) = v₀·e^(-x/L)，而 L 正比于
 * 弹重 /（阻力系数 × 截面积）—— 也就是**截面密度**。长杆弹之所以 2km 只掉 8%，
 * 就是因为它的截面密度高到离谱：1 米长的钨杆，直径才 25mm。
 *
 * 反过来，存速也能反推出来：pen ∝ v^0.85，所以 v(d)/v₀ = keep(d)^(1/0.85)。
 * 这是同一份物理，不是第二套参数。
 *
 * ── 倾角轴 ─────────────────────────────────────────────
 *
 *   能击穿的**实际板厚** = 0° 穿深 × cos(θ)^s
 *
 * s=1 是纯几何（视线厚度翻倍就少钻一半），s<1 是「被帽咬住斜板」，
 * s>1 是长杆弹在高斜角下跳弹/弯杆，s=0 是破甲弹（射流顺着法线走，完全不吃角度）。
 *
 * 注意这跟 armor.ts 的 keSlopeExp 是两件事：那边算「这块板看起来多厚」
 * （45mm@60° 看起来像 90mm），这边算「这颗弹能钻透多厚的板」。
 * 两个数乘起来才是真实的击穿判定 —— 而且它们都是**独立可解释**的物理量，
 * 不是同一个系数在两边各写一遍。
 */

import type { Ballistics, GunDef, ShellType, AmmoMods } from '../types'
import { TUNING, look } from './tuning'
import { muzzleVelocity, penetration, projectileMass, penetratorMass } from './gun'

/** 把弹药改装应用到火炮定义上：换弹种只影响弹道，不影响这门炮本身。 */
export function resolveGun(gun: GunDef, mods?: AmmoMods): GunDef {
  const ammo = mods?.ammo
  if (!ammo || ammo === gun.shell) return gun
  return { ...gun, shell: ammo }
}

/** 某弹种在 2km 处的保持率，可被改装覆盖。 */
export function keep2kOf(shell: ShellType, mods?: AmmoMods): number {
  return mods?.rangeKeep ?? look(TUNING.gun.keep2k, shell, 0.7)
}

/** 某弹种的斜板响应指数，可被改装覆盖。 */
export function slopeExpOf(shell: ShellType, mods?: AmmoMods): number {
  return mods?.slopeExp ?? look(TUNING.gun.slopeExp, shell, 1)
}

/**
 * 距离 d（米）处的保持率，相对 500m。
 * d < 500 时大于 1（炮口更猛），d > 500 时小于 1。
 */
export function keepAt(d: number, k2k: number): number {
  const g = TUNING.gun
  const span = g.keepRefM - g.penRefM
  return Math.pow(k2k, (d - g.penRefM) / span)
}

/** 距离 d 处的穿深。pen500 是德马尔公式算出来的标定基准值。 */
export function penetrationAt(pen500: number, d: number, k2k: number): number {
  return pen500 * keepAt(d, k2k)
}

/** 距离 d 处的存速。pen ∝ v^vExp ⇒ 速度比 = 保持率^(1/vExp)。 */
export function velocityAt(v0: number, d: number, k2k: number, shell: ShellType): number {
  if (shell === 'heat') return v0
  const exp = TUNING.gun.vExp
  return v0 * Math.pow(keepAt(d, k2k), 1 / exp)
}

/**
 * 面对倾角 θ（度，相对垂直面）的钢板时，能击穿的**实际板厚** mm。
 * θ=0 就是垂直板，结果为 0° 穿深。
 *
 * 注意这一层是「实板厚度」。要比的对象也是实板厚度（45mm 的首上就是 45mm），
 * 不能拿它去比 armor.ts 那套「视线等效厚度」（那已经是 90mm 了）。
 * 要比视线厚度就用下面的 losPenetrated —— 把两个口径混用，倾角就被算了两次。
 */
export function plateDefeated(pen0: number, angleDeg: number, sExp: number): number {
  const rad = (Math.min(89, Math.max(0, angleDeg)) * Math.PI) / 180
  return pen0 * Math.pow(Math.cos(rad), sExp)
}

/**
 * 同一个能力，换算成**视线厚度**口径：能打穿多少毫米的等效 RHAe。
 *
 *   losPen = pen0 × (1/cos θ)^(1-s)
 *
 * s=1 时恒等于 pen0（打穿多厚的视线厚度跟角度无关，纯几何）；
 * s<1（被帽）时大于 pen0，因为被帽会在斜板上「转向」；
 * s>1（长杆）时小于 pen0，高斜角下杆体会弯、会跳。
 *
 * 这一版才是跟 physical.armorFront / armorTurret 同一个口径的数，
 * 订单验收和击穿判定用这个。
 */
export function losPenetrated(pen0: number, angleDeg: number, sExp: number): number {
  const rad = (Math.min(89, Math.max(0, angleDeg)) * Math.PI) / 180
  return pen0 * Math.pow(1 / Math.cos(rad), 1 - sExp)
}

/** 反过来：给定一块板厚 t、倾角 θ，它相当于多少毫米的视线厚度。 */
export function lineOfSight(t: number, angleDeg: number): number {
  const rad = (Math.min(89, Math.max(0, angleDeg)) * Math.PI) / 180
  return t / Math.cos(rad)
}

/** 一门炮 + 一套弹药改装 → 完整弹道剖面。 */
export function solveBallistics(gun: GunDef, mods?: AmmoMods): Ballistics {
  const real = resolveGun(gun, mods)
  const shell = real.shell
  const k2k = keep2kOf(shell, mods)
  const sExp = slopeExpOf(shell, mods)
  const pen500 = penetration(real)
  const v0 = muzzleVelocity(real)
  const v2000 = velocityAt(v0, TUNING.gun.keepRefM, k2k, shell)
  return {
    shell,
    keep2k: k2k,
    slopeExp: sExp,
    pen500,
    pen100: penetrationAt(pen500, 100, k2k),
    pen1000: penetrationAt(pen500, 1000, k2k),
    pen2000: penetrationAt(pen500, TUNING.gun.keepRefM, k2k),
    v0,
    v2000,
    plate0: plateDefeated(pen500, 0, sExp),
    plate30: plateDefeated(pen500, 30, sExp),
    plate60: plateDefeated(pen500, 60, sExp),
    los60: losPenetrated(pen500, 60, sExp),
  }
}

/**
 * 一发弹能不能打穿某块板。
 *
 * 传进来的是装甲的**视线等效厚度**（physical.armorFront 那个口径），
 * 所以这里用 losPenetrated 换算后再比。两边口径一致，倾角只算一次。
 */
export function canDefeat(
  pen0: number,
  angleDeg: number,
  sExp: number,
  armorLosMm: number,
): boolean {
  return losPenetrated(pen0, angleDeg, sExp) >= armorLosMm
}

/** 弹丸截面密度 kg/m²：只用来在界面上解释「为什么这发弹掉得慢」。 */
export function sectionalDensity(gun: GunDef): number {
  const d = gun.caliber / 1000
  return penetratorMass(gun) / (Math.PI * (d / 2) * (d / 2))
}

/** 弹丸全重，界面用 */
export { projectileMass }

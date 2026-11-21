// src/components/pocket-dice/roll-choreography.ts
/**
 * Pure animation maths for the Pocket Dice board. No React, no DOM.
 *
 * The board is a tilted table seen from the front: dice live on a ground
 * plane (screen x/y) and lift off it by a height `z` that is drawn as an
 * upward screen offset, a slight scale and a fading shadow. Every roll is
 * deterministic given its plan, so the demo and a future server-driven match
 * play the exact same choreography; only the face values differ.
 *
 *   rest → lift → shake → tip → dice leave the mouth → bounce ×3 → settle
 */
import type { PocketDiceValues } from '@/lib/pocket-dice/rules'

export type Vec = { x: number; y: number }
export type CupPose = { x: number; y: number; angle: number }

/** SVG viewBox of the hexagon plate and the hexagon's own bounds inside it. */
export const PLATE_VIEW = { w: 560, h: 470 } as const
export const PLATE_HEX = { w: 524, h: 434 } as const

/** Cup artwork geometry (SVG units, see dice-cup.tsx). */
export const CUP_ART = { w: 200, h: 280, centerY: 142, mouthY: 40, length: 248 } as const

export const ROLL_TIMING = {
  /** Cup rises from its resting spot to the shaking spot. */
  liftEnd: 700,
  shakeEnd: 1900,
  /** Cup tips over so the mouth points at the table. */
  tipEnd: 2350,
  releaseFirst: 2230,
  releaseSecond: 2320,
  /** Cup stays tipped, then returns to rest. */
  pourEnd: 2800,
  returnEnd: 3650,
  /** Time from release until a die is at rest. */
  flight: 1150,
} as const

/** The roll is visually finished (both dice at rest). */
export const ROLL_SETTLED_MS = ROLL_TIMING.releaseSecond + ROLL_TIMING.flight
/** The cup is back at rest too. */
export const ROLL_TOTAL_MS = ROLL_TIMING.returnEnd

const SHAKE_HZ = 8.5
const POUR_ANGLE = -118
const REST_ANGLE = -52

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpVec(a: Vec, b: Vec, t: number): Vec {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

function easeOutBack(t: number): number {
  const c1 = 1.4
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/* ── Layout ─────────────────────────────────────────────────────────────── */

export type StageLayout = {
  width: number
  height: number
  /** Plate centre. */
  cx: number
  cy: number
  /** Pixels per plate SVG unit. */
  plateScale: number
  /** Hexagon size in pixels. */
  plateW: number
  plateH: number
  /** Die edge in pixels. */
  die: number
  /** Visual cup length (mouth to base) in pixels, and pixels per art unit. */
  cupLen: number
  cupK: number
  rest: CupPose
  hold: CupPose
  pour: CupPose
  /** Where the dice leave the cup, in screen space. */
  pourMouth: Vec
  /** Height the dice start from, in pixels. */
  drop: number
  /** How much the table opens up (vertical stretch) once the camera looks down. */
  viewScaleY: number
  /** Final resting spot (die centre) for each seat. */
  targets: readonly [Vec, Vec]
}

export function mouthPoint(pose: CupPose, k: number): Vec {
  const angle = (pose.angle * Math.PI) / 180
  const offset = (CUP_ART.centerY - CUP_ART.mouthY) * k
  return { x: pose.x + Math.sin(angle) * offset, y: pose.y - Math.cos(angle) * offset }
}

function cupCenterForMouth(mouth: Vec, angleDeg: number, k: number): Vec {
  const angle = (angleDeg * Math.PI) / 180
  const offset = (CUP_ART.centerY - CUP_ART.mouthY) * k
  return { x: mouth.x - Math.sin(angle) * offset, y: mouth.y + Math.cos(angle) * offset }
}

export function computeLayout(width: number, height: number): StageLayout {
  const wide = width >= 700
  const plateScale = Math.min((width * 0.86) / PLATE_VIEW.w, (height * 0.84) / PLATE_VIEW.h)
  const plateW = PLATE_HEX.w * plateScale
  const plateH = PLATE_HEX.h * plateScale
  const cx = width / 2
  const cy = height / 2

  const die = clamp(plateW * 0.155, 44, 98)
  const cupLen = clamp(plateW * (wide ? 0.5 : 0.44), 110, 310)
  const cupK = cupLen / CUP_ART.length

  const restX = Math.min(cx + plateW * 0.55, width - cupLen * 0.6 - 8)
  const rest: CupPose = { x: restX, y: cy + plateH * 0.1, angle: REST_ANGLE }
  const hold: CupPose = { x: cx + plateW * 0.1, y: cy - plateH * 0.2, angle: 0 }

  const pourMouth: Vec = { x: cx - plateW * 0.02, y: cy - plateH * 0.22 }
  const pourCenter = cupCenterForMouth(pourMouth, POUR_ANGLE, cupK)
  const pour: CupPose = { x: pourCenter.x, y: pourCenter.y, angle: POUR_ANGLE }

  return {
    width,
    height,
    cx,
    cy,
    plateScale,
    plateW,
    plateH,
    die,
    cupLen,
    cupK,
    rest,
    hold,
    pour,
    pourMouth,
    drop: plateH * 0.17,
    viewScaleY: clamp((height * 0.92) / plateH, 1, 1.2),
    // Narrow stages park the cup over the plate, so the dice land further left.
    targets: [
      { x: cx - plateW * (wide ? 0.2 : 0.24), y: cy + plateH * 0.05 },
      { x: cx + plateW * (wide ? 0.12 : 0.04), y: cy + plateH * 0.09 },
    ],
  }
}

/* ── Cup ────────────────────────────────────────────────────────────────── */

export function cupPoseAt(timeMs: number, layout: StageLayout): CupPose {
  const { rest, hold, pour, height } = layout
  const t = timeMs

  if (t <= 0) return rest

  if (t < ROLL_TIMING.liftEnd) {
    const p = easeInOutCubic(t / ROLL_TIMING.liftEnd)
    const swing = Math.sin(Math.PI * p) * height * 0.04
    return {
      x: lerp(rest.x, hold.x, p),
      y: lerp(rest.y, hold.y, p) - swing,
      angle: lerp(rest.angle, hold.angle, p),
    }
  }

  if (t < ROLL_TIMING.shakeEnd) {
    const u = (t - ROLL_TIMING.liftEnd) / (ROLL_TIMING.shakeEnd - ROLL_TIMING.liftEnd)
    const envelope = smoothstep(0, 0.14, u) * (1 - smoothstep(0.86, 1, u))
    const phase = 2 * Math.PI * SHAKE_HZ * ((t - ROLL_TIMING.liftEnd) / 1000)
    return {
      x: hold.x + layout.plateW * 0.014 * envelope * Math.sin(phase),
      y: hold.y - layout.plateH * 0.022 * envelope * Math.abs(Math.sin(phase * 0.5 + 0.6)) * 2,
      angle: hold.angle + 6.5 * envelope * Math.sin(phase + 1.2),
    }
  }

  if (t < ROLL_TIMING.tipEnd) {
    const p = easeOutBack((t - ROLL_TIMING.shakeEnd) / (ROLL_TIMING.tipEnd - ROLL_TIMING.shakeEnd))
    return {
      x: lerp(hold.x, pour.x, p),
      y: lerp(hold.y, pour.y, p),
      angle: lerp(hold.angle, pour.angle, p),
    }
  }

  if (t < ROLL_TIMING.pourEnd) {
    // A last tremor so the cup visibly empties itself.
    const tremor = Math.sin(((t - ROLL_TIMING.tipEnd) / 1000) * 2 * Math.PI * 11)
    const fade = 1 - (t - ROLL_TIMING.tipEnd) / (ROLL_TIMING.pourEnd - ROLL_TIMING.tipEnd)
    return { x: pour.x, y: pour.y, angle: pour.angle + 1.8 * tremor * fade }
  }

  if (t < ROLL_TIMING.returnEnd) {
    const p = easeInOutCubic(
      (t - ROLL_TIMING.pourEnd) / (ROLL_TIMING.returnEnd - ROLL_TIMING.pourEnd),
    )
    return {
      x: lerp(pour.x, rest.x, p),
      y: lerp(pour.y, rest.y, p) - Math.sin(Math.PI * p) * height * 0.03,
      angle: lerp(pour.angle, rest.angle, p),
    }
  }

  return rest
}

/* ── Dice ───────────────────────────────────────────────────────────────── */

export type Spin = { x: number; y: number; z: number }

export type DicePlan = {
  values: PocketDiceValues
  /** Starting tumble in degrees, per die. It decays to zero at rest. */
  spin: readonly [Spin, Spin]
  /** Final yaw on the table, per die. */
  yaw: readonly [number, number]
  /** Sideways wobble of the first bounce, in pixels, per die. */
  lateral: readonly [number, number]
}

export function makeDicePlan(
  values: PocketDiceValues,
  random: () => number = Math.random,
): DicePlan {
  const sign = () => (random() < 0.5 ? -1 : 1)
  const turns = (min: number, max: number) => sign() * (min + random() * (max - min)) * 360
  const spin = (): Spin => ({ x: turns(1.2, 2.2), y: turns(1.2, 2.4), z: turns(0.4, 1) })
  return {
    values,
    spin: [spin(), spin()],
    yaw: [-14 + random() * 12, 4 + random() * 12],
    lateral: [(random() - 0.5) * 36, (random() - 0.5) * 36],
  }
}

/** Orientation that brings each face to the front of the cube. */
const FACE_FRONT: Record<number, string> = {
  1: '',
  2: 'rotateX(-90deg)',
  3: 'rotateY(-90deg)',
  4: 'rotateY(90deg)',
  5: 'rotateX(90deg)',
  6: 'rotateY(180deg)',
}

/** How far a resting die leans so the top and right edges stay visible. */
const REST_TILT = { x: -24, y: -30 }

/** How much bigger the dice look once the camera is above the table. */
export const TOP_VIEW_DIE_SCALE = 1.1

/** Screen y for a ground point as the camera rises (`view` 0 = angled, 1 = top-down). */
export function viewY(y: number, layout: StageLayout, view: number): number {
  return layout.cy + (y - layout.cy) * (1 + (layout.viewScaleY - 1) * view)
}

/**
 * `view` blends the resting lean away: at 1 the camera looks straight down, so
 * the face that is up (the rolled value) faces the viewer flat.
 */
export function cubeTransform(
  value: number,
  yaw: number,
  spin: Spin,
  die: number,
  view = 0,
): string {
  const lean = 1 - view
  return [
    `perspective(${Math.round(die * 7)}px)`,
    `rotateZ(${spin.z.toFixed(1)}deg)`,
    `rotateX(${spin.x.toFixed(1)}deg)`,
    `rotateY(${spin.y.toFixed(1)}deg)`,
    `rotateZ(${yaw.toFixed(1)}deg)`,
    `rotateX(${(REST_TILT.x * lean).toFixed(1)}deg)`,
    `rotateY(${(REST_TILT.y * lean).toFixed(1)}deg)`,
    FACE_FRONT[value] ?? '',
  ]
    .filter(Boolean)
    .join(' ')
}

export type DieSample = {
  visible: boolean
  /** Die centre on the ground plane. */
  ground: Vec
  /** Height above the plane in pixels. */
  z: number
  /** 0..1 for the pop-in; used as opacity and part of the scale. */
  appear: number
  spin: Spin
  atRest: boolean
}

const ARC = { first: 380, second: 300, third: 230 } as const

export function dieSampleAt(
  timeMs: number,
  index: 0 | 1,
  layout: StageLayout,
  plan: DicePlan,
): DieSample {
  const release = index === 0 ? ROLL_TIMING.releaseFirst : ROLL_TIMING.releaseSecond
  const rel = timeMs - release
  const target = layout.targets[index]

  if (rel < 0) {
    return {
      visible: false,
      ground: target,
      z: 0,
      appear: 0,
      spin: plan.spin[index],
      atRest: false,
    }
  }

  const start: Vec = {
    x: layout.pourMouth.x + (index === 0 ? -1 : 1) * layout.die * 0.12,
    y: layout.pourMouth.y + layout.drop,
  }
  const first = {
    ...lerpVec(start, target, 0.6),
    x: lerp(start.x, target.x, 0.6) + plan.lateral[index],
  }
  const second = lerpVec(start, target, 0.88)

  const { drop } = layout
  let ground: Vec
  let z: number

  if (rel < ARC.first) {
    const u = rel / ARC.first
    ground = lerpVec(start, first, u)
    z = drop * (1 - u * u)
  } else if (rel < ARC.first + ARC.second) {
    const u = (rel - ARC.first) / ARC.second
    ground = lerpVec(first, second, u)
    z = 4 * drop * 0.3 * u * (1 - u)
  } else if (rel < ARC.first + ARC.second + ARC.third) {
    const u = (rel - ARC.first - ARC.second) / ARC.third
    ground = lerpVec(second, target, easeOutCubic(u))
    z = 4 * drop * 0.11 * u * (1 - u)
  } else {
    ground = target
    z = 0
  }

  const decay = Math.pow(1 - clamp(rel / (ROLL_TIMING.flight - 80), 0, 1), 3)
  const spin = plan.spin[index]

  return {
    visible: true,
    ground,
    z,
    appear: clamp(rel / 90, 0, 1),
    spin: { x: spin.x * decay, y: spin.y * decay, z: spin.z * decay },
    atRest: rel >= ROLL_TIMING.flight,
  }
}

/** Final, perfectly still sample, used for reduced motion and resizes. */
export function restingSample(index: 0 | 1, layout: StageLayout): DieSample {
  return {
    visible: true,
    ground: layout.targets[index],
    z: 0,
    appear: 1,
    spin: { x: 0, y: 0, z: 0 },
    atRest: true,
  }
}
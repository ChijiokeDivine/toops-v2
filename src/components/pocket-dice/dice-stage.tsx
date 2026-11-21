// src/components/pocket-dice/dice-stage.tsx
'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { resolveDuel, type PocketDiceValues } from '@/lib/pocket-dice/rules'
import { playGameSound, type GameSound } from '@/components/sound/game-sfx'
import { DiceCup } from './dice-cup'
import { DicePlate } from './dice-plate'
import { Die } from './die'
import {
  CUP_ART,
  ROLL_SETTLED_MS,
  ROLL_TIMING,
  ROLL_TOTAL_MS,
  TOP_VIEW_DIE_SCALE,
  computeLayout,
  cubeTransform,
  cupPoseAt,
  dieSampleAt,
  makeDicePlan,
  restingSample,
  viewY,
  type CupPose,
  type DicePlan,
  type DieSample,
  type StageLayout,
} from './roll-choreography'

/** One cup roll. A new `id` plays the whole choreography again. */
export type DiceRoll = {
  id: string | number
  /** `[seat 0 die, seat 1 die]`, already decided (demo: random, live: server). */
  values: PocketDiceValues
}

type DiceStageProps = {
  /** `null` parks the cup and hides the dice. */
  roll: DiceRoll | null
  /** Names shown under the dice once they settle. */
  seatLabels?: readonly [string, string]
  /** Winner chip, halo and dimming once the dice settle. The ambient demo turns this off. */
  showResult?: boolean
  /** Raise the camera over the table once the dice settle, so the top faces read flat. */
  topViewOnSettle?: boolean
  /** Tints the viewer's chip. */
  selfSeat?: 0 | 1 | null
  /** Fires once both dice are at rest. */
  onSettled?: (roll: DiceRoll) => void
  className?: string
  /** Overlays (status tag, recent results). Rendered above the board. */
  children?: ReactNode
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}

function applyCup(element: HTMLDivElement, pose: CupPose, layout: StageLayout, view: number) {
  const k = layout.cupK
  const y = viewY(pose.y, layout, view)
  element.style.width = `${CUP_ART.w * k}px`
  element.style.height = `${CUP_ART.h * k}px`
  element.style.transformOrigin = `${100 * k}px ${CUP_ART.centerY * k}px`
  element.style.transform = `translate3d(${(pose.x - 100 * k).toFixed(2)}px, ${(
    y -
    CUP_ART.centerY * k
  ).toFixed(2)}px, 0) rotate(${pose.angle.toFixed(2)}deg)`
  element.classList.add('is-ready')
}

type DieNodes = {
  wrapper: HTMLDivElement | null
  cube: HTMLDivElement | null
  shadow: HTMLDivElement | null
}

function applyDie(
  nodes: DieNodes,
  sample: DieSample,
  layout: StageLayout,
  value: number,
  yaw: number,
  view: number,
) {
  const { wrapper, cube, shadow } = nodes
  if (!wrapper || !cube || !shadow) return

  if (!sample.visible) {
    wrapper.style.opacity = '0'
    shadow.style.opacity = '0'
    return
  }

  const die = layout.die
  const half = die / 2
  const height = Math.min(1, sample.z / Math.max(1, layout.drop * 1.05))
  const scale =
    (1 + sample.z / (die * 5)) *
    (0.72 + 0.28 * sample.appear) *
    (1 + (TOP_VIEW_DIE_SCALE - 1) * view)
  const groundY = viewY(sample.ground.y, layout, view)

  wrapper.style.opacity = String(sample.appear)
  wrapper.style.transform = `translate3d(${(sample.ground.x - half).toFixed(2)}px, ${(
    groundY -
    sample.z -
    half
  ).toFixed(2)}px, 0) scale(${scale.toFixed(3)})`
  cube.style.transform = cubeTransform(value, yaw, sample.spin, die, view)

  const shadowW = die * (1.02 - 0.22 * height)
  const shadowH = die * (0.36 - 0.08 * height)
  shadow.style.width = `${shadowW}px`
  shadow.style.height = `${shadowH}px`
  shadow.style.opacity = String(0.9 * (1 - height * 0.75) * sample.appear)
  shadow.style.transform = `translate3d(${(sample.ground.x - shadowW / 2).toFixed(2)}px, ${(
    groundY +
    die * 0.36 * (1 + (TOP_VIEW_DIE_SCALE - 1) * view) -
    shadowH / 2
  ).toFixed(2)}px, 0)`
}

/**
 * The Pocket Dice board: hexagon table, one cup and two dice. Give it a `roll`
 * and it plays rest → shake → pour → bounce → settle, then reports back.
 * It owns no game rules: the lobby demo feeds it random values and a live match
 * will feed it the server's provably-fair ones.
 */
export function DiceStage({
  roll,
  seatLabels = ['Player 1', 'Player 2'],
  selfSeat = null,
  showResult = true,
  topViewOnSettle = true,
  onSettled,
  className = '',
  children,
}: DiceStageProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const cupRef = useRef<HTMLDivElement>(null)
  const dieRefs = useRef<(HTMLDivElement | null)[]>([null, null])
  const cubeRefs = useRef<(HTMLDivElement | null)[]>([null, null])
  const shadowRefs = useRef<(HTMLDivElement | null)[]>([null, null])
  const plateRef = useRef<HTMLDivElement>(null)

  const layoutRef = useRef<StageLayout | null>(null)
  const planRef = useRef<DicePlan | null>(null)
  const phaseRef = useRef<'idle' | 'rolling' | 'settled'>('idle')
  const frameRef = useRef(0)
  /** 0 = angled camera, 1 = looking straight down. Tweened, never React state. */
  const viewRef = useRef(0)
  const viewFrameRef = useRef(0)
  const loopRunningRef = useRef(false)
  const topViewRef = useRef(topViewOnSettle)
  topViewRef.current = topViewOnSettle
  const onSettledRef = useRef(onSettled)
  // A polling parent hands over a fresh object every tick; only a new `id` replays.
  const rollRef = useRef(roll)
  rollRef.current = roll
  const rollId = roll ? String(roll.id) : null

  const [layout, setLayout] = useState<StageLayout | null>(null)
  const [settled, setSettled] = useState<DiceRoll | null>(null)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    onSettledRef.current = onSettled
  }, [onSettled])

  const paintDice = useCallback((time: number | null) => {
    const current = layoutRef.current
    const plan = planRef.current
    if (!current || !plan) return
    ;([0, 1] as const).forEach((index) => {
      const sample =
        time == null ? restingSample(index, current) : dieSampleAt(time, index, current, plan)
      applyDie(
        {
          wrapper: dieRefs.current[index] ?? null,
          cube: cubeRefs.current[index] ?? null,
          shadow: shadowRefs.current[index] ?? null,
        },
        sample,
        current,
        plan.values[index],
        plan.yaw[index],
        viewRef.current,
      )
    })
  }, [])

  const paintCup = useCallback((time: number | null) => {
    const current = layoutRef.current
    const cup = cupRef.current
    if (!current || !cup) return
    applyCup(cup, time == null ? current.rest : cupPoseAt(time, current), current, viewRef.current)
  }, [])

  /** Static frame: cup parked, dice either gone or resting. */
  const paintStatic = useCallback(() => {
    paintCup(null)
    if (phaseRef.current === 'settled') paintDice(null)
  }, [paintCup, paintDice])

  const paintPlate = useCallback(() => {
    const plate = plateRef.current
    const current = layoutRef.current
    if (!plate || !current) return
    plate.style.transform = `scaleY(${(1 + (current.viewScaleY - 1) * viewRef.current).toFixed(4)})`
  }, [])

  /** Eases the camera towards `target` (0 angled, 1 top-down). */
  const moveCamera = useCallback(
    (target: number, durationMs: number) => {
      cancelAnimationFrame(viewFrameRef.current)
      const from = viewRef.current
      if (from === target) return
      const startedAt = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - startedAt) / durationMs)
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
        viewRef.current = from + (target - from) * eased
        paintPlate()
        // While a roll plays its own loop repaints every frame.
        if (!loopRunningRef.current) {
          paintCup(null)
          if (phaseRef.current === 'settled') paintDice(null)
        }
        if (t < 1) viewFrameRef.current = requestAnimationFrame(step)
      }
      viewFrameRef.current = requestAnimationFrame(step)
    },
    [paintCup, paintDice, paintPlate],
  )

  useEffect(() => () => cancelAnimationFrame(viewFrameRef.current), [])

  // Measure the stage and keep the layout in sync with its size.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const measure = () => {
      const { width, height } = root.getBoundingClientRect()
      if (width < 10 || height < 10) return
      const next = computeLayout(width, height)
      layoutRef.current = next
      setLayout(next)
      paintPlate()
      if (phaseRef.current !== 'rolling') paintStatic()
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [paintStatic, paintPlate])

  const ready = layout != null

  // Play a roll whenever a new one arrives.
  useEffect(() => {
    cancelAnimationFrame(frameRef.current)
    if (!ready) return

    const roll = rollRef.current
    if (!roll || rollId == null) {
      phaseRef.current = 'idle'
      loopRunningRef.current = false
      planRef.current = null
      setSettled(null)
      moveCamera(0, 450)
      paintStatic()
      return
    }

    planRef.current = makeDicePlan(roll.values)
    setSettled(null)
    // Back to the angled camera while the cup works.
    moveCamera(0, 500)

    let reported = false
    const report = () => {
      if (reported) return
      reported = true
      phaseRef.current = 'settled'
      setSettled(roll)
      if (topViewRef.current) moveCamera(1, 750)
      onSettledRef.current?.(roll)
    }

    const finish = () => {
      loopRunningRef.current = false
      report()
      paintCup(null)
      paintDice(null)
    }

    if (reducedMotion) {
      cancelAnimationFrame(viewFrameRef.current)
      viewRef.current = topViewRef.current ? 1 : 0
      paintPlate()
      playGameSound('land')
      finish()
      return
    }

    phaseRef.current = 'rolling'
    loopRunningRef.current = true
    const startedAt = performance.now()

    // Cup, toss and bounce sounds are scheduled on the same clock as the animation.
    const soundTimers: number[] = []
    const later = (delay: number, sound: GameSound, volume = 1) => {
      soundTimers.push(window.setTimeout(() => playGameSound(sound, { volume }), delay))
    }
    later(0, 'shake')
    later(ROLL_TIMING.releaseFirst, 'toss')
    later(ROLL_TIMING.releaseSecond, 'toss')
    for (const offset of [380, 680, 910]) {
      later(ROLL_TIMING.releaseFirst + offset, 'bounce')
      later(ROLL_TIMING.releaseSecond + offset, 'bounce', 0.8)
    }
    later(ROLL_SETTLED_MS, 'land')

    const tick = (now: number) => {
      const elapsed = now - startedAt
      if (elapsed >= ROLL_TOTAL_MS) {
        finish()
        return
      }
      paintCup(elapsed)
      paintDice(elapsed)
      if (elapsed >= ROLL_SETTLED_MS) report()
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frameRef.current)
      soundTimers.forEach((timer) => window.clearTimeout(timer))
      loopRunningRef.current = false
    }
  }, [rollId, ready, reducedMotion, paintCup, paintDice, paintStatic, paintPlate, moveCamera])

  const outcome = showResult && settled ? resolveDuel(settled.values) : null
  const die = layout?.die ?? 80

  const label = settled
    ? `Dice show ${settled.values[0]} and ${settled.values[1]}`
    : roll
      ? 'Rolling the dice'
      : 'Dice cup ready'

  return (
    <div
      ref={rootRef}
      role="img"
      aria-label={label}
      className={`pd-stage relative select-none overflow-hidden ${className}`}
      style={{ '--pd-die': `${die}px` } as CSSProperties}
    >
      <div ref={plateRef} className="absolute inset-0 will-change-transform">
        <DicePlate className="absolute left-1/2 top-1/2 h-[84%] w-[86%] -translate-x-1/2 -translate-y-1/2" />
      </div>

      {([0, 1] as const).map((index) => (
        <div
          key={`shadow-${index}`}
          ref={(node) => {
            shadowRefs.current[index] = node
          }}
          className="pd-shadow"
        />
      ))}

      <div ref={cupRef} className="pd-cup">
        <DiceCup className="block h-full w-full" />
      </div>

      {([0, 1] as const).map((index) => (
        <Die
          key={`die-${index}`}
          wrapperRef={(node) => {
            dieRefs.current[index] = node
          }}
          cubeRef={(node) => {
            cubeRefs.current[index] = node
          }}
          className={outcome?.kind === 'seat' && outcome.winner !== index ? 'is-dim' : ''}
        />
      ))}

      {layout && settled && outcome
        ? ([0, 1] as const).map((index) => {
            const base = layout.targets[index]
            const lift = topViewOnSettle ? 1 : 0
            const target = { x: base.x, y: viewY(base.y, layout, lift) }
            const size = die * (1 + (TOP_VIEW_DIE_SCALE - 1) * lift)
            const winner = outcome.kind === 'seat' && outcome.winner === index
            const tie = outcome.kind === 'tie'
            const mine = selfSeat === index
            return (
              <span key={`result-${index}-${settled.id}`}>
                {winner || tie ? (
                  <span
                    className={`pd-halo ${tie ? 'is-tie' : ''}`}
                    style={{
                      left: target.x - size * 1.05,
                      top: target.y + size * 0.36 - size * 0.34,
                      width: size * 2.1,
                      height: size * 0.68,
                    }}
                  />
                ) : null}
                <span
                  className={`pd-chip rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    winner
                      ? 'bg-[#00ff86] text-[#03170d]'
                      : tie
                        ? 'bg-[#ffdf1a]/15 text-[#ffdf1a]'
                        : 'bg-white/[0.06] text-white/55'
                  } ${mine && !winner ? 'ring-1 ring-[#00fa7f]/40' : ''}`}
                  style={{ left: target.x, top: target.y + size * 0.82 }}
                >
                  {tie ? 'Tie' : winner ? `${seatLabels[index]} wins` : seatLabels[index]}
                </span>
              </span>
            )
          })
        : null}

      {children}
    </div>
  )
}
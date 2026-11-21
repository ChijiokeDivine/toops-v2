'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { OutcomeIcon } from './icons'
import * as sfx from './sfx'
import { SLOT_PATTERN, type Outcome, type Phase } from './types'

const TILE = 108
const GAP = 10
const STEP = TILE + GAP
const SLOTS = SLOT_PATTERN.length
const REPEATS = 9
const REST_REPEAT = 2
const SPIN_REPEAT = 6
const SPIN_MS = 6000

const TILE_STYLES: Record<Outcome, string> = {
  red: 'border-[#c9343d]/70 bg-[linear-gradient(135deg,#8e1b22_0%,#a71f29_55%,#c1232d_100%)] text-[#6b1318]',
  black: 'border-[#2c3643] bg-[linear-gradient(135deg,#1b2129_0%,#222a35_100%)] text-[#12161c]',
  green: 'border-[#27b06a]/70 bg-[linear-gradient(135deg,#0b6d3d_0%,#12a05a_100%)] text-[#06462a]',
}

interface RouletteStripProps {
  phase: Phase
  target: Outcome | null
  spinId: number
  onSettled: () => void
  /** Exact slot (0-14) the server landed on, so the stop is verifiable. */
  targetIndex?: number | null
}

export function RouletteStrip({ phase, target, spinId, onSettled, targetIndex = null }: RouletteStripProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const widthRef = useRef(0)
  const slotRef = useRef(5) // pattern index currently under the marker
  const jitterRef = useRef(0)
  const animatingRef = useRef(false)
  const spinMsRef = useRef(SPIN_MS)
  const onSettledRef = useRef(onSettled)
  onSettledRef.current = onSettled

  const [offset, setOffset] = useState(0)
  const [animating, setAnimating] = useState(false)

  const offsetFor = useCallback(
    (index: number, jitter: number) => index * STEP + TILE / 2 - widthRef.current / 2 + jitter,
    [],
  )

  const tiles = useMemo(
    () =>
      Array.from({ length: REPEATS }, () => SLOT_PATTERN)
        .flat()
        .map((outcome, i) => (
          <div
            key={i}
            style={{ width: TILE, height: TILE }}
            className={`flex shrink-0 items-center justify-center rounded-[18px] border shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${TILE_STYLES[outcome]}`}
          >
            <OutcomeIcon outcome={outcome} className="h-[58px] w-[58px] drop-shadow-[0_1px_0_rgba(255,255,255,0.14)]" />
          </div>
        )),
    [],
  )

  // keep the resting tile centred, also on resize
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const place = () => {
      widthRef.current = el.clientWidth
      if (!animatingRef.current) {
        setOffset(offsetFor(REST_REPEAT * SLOTS + slotRef.current, jitterRef.current))
      }
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    return () => ro.disconnect()
  }, [offsetFor])

  // new round: jump back to the equivalent tile in the first repeat (identical tiles, so unnoticeable)
  useEffect(() => {
    if (phase !== 'betting') return
    animatingRef.current = false
    setAnimating(false)
    setOffset(offsetFor(REST_REPEAT * SLOTS + slotRef.current, jitterRef.current))
  }, [phase, offsetFor])

  // spin
  useEffect(() => {
    if (phase !== 'spinning' || !target) return
    const choices = SLOT_PATTERN.flatMap((o, i) => (o === target ? [i] : []))
    const slot =
      targetIndex != null && SLOT_PATTERN[targetIndex] === target
        ? targetIndex
        : choices[Math.floor(Math.random() * choices.length)]
    const jitter = (Math.random() - 0.5) * TILE * 0.7
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    spinMsRef.current = reduce ? 1200 : SPIN_MS

    let timer: ReturnType<typeof setTimeout> | undefined
    let stopSound: (() => void) | undefined
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const ticks = SPIN_REPEAT * SLOTS + slot - (REST_REPEAT * SLOTS + slotRef.current)
        stopSound = sfx.spin(ticks, spinMsRef.current)
        slotRef.current = slot
        jitterRef.current = jitter
        animatingRef.current = true
        setAnimating(true)
        setOffset(offsetFor(SPIN_REPEAT * SLOTS + slot, jitter))
        timer = setTimeout(() => onSettledRef.current(), spinMsRef.current + 150)
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      if (timer) clearTimeout(timer)
      stopSound?.()
    }
  }, [phase, target, targetIndex, spinId, offsetFor])

  return (
    <div ref={wrapRef} className="relative h-[132px] w-full overflow-hidden pt-3" aria-hidden="true">
      <div
        className="flex will-change-transform"
        style={{
          gap: GAP,
          transform: `translate3d(${-offset}px,0,0)`,
          transition: animating ? `transform ${spinMsRef.current}ms cubic-bezier(0.1,0.75,0.12,1)` : 'none',
        }}
      >
        {tiles}
      </div>
      <svg
        viewBox="0 0 24 14"
        className="pointer-events-none absolute left-1/2 top-0 z-10 h-[14px] w-6 -translate-x-1/2"
      >
        <path d="M2 1h20L12 13z" fill="#eef0f4" stroke="#eef0f4" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

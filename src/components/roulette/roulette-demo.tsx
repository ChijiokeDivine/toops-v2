'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { OutcomeIcon } from './icons'
import * as sfx from './sfx'
import { SLOT_PATTERN, type Outcome } from './types'

/**
 * Ambient, non-interactive wheel. It loops through spin → land → hold on its
 * own while nobody is at the table, so the page always shows a spinning wheel
 * with sound instead of a frozen strip. It never reports a result and never
 * touches the round; the live RouletteStrip takes over as soon as real chips
 * are on the table.
 */

const TILE = 108
const GAP = 10
const STEP = TILE + GAP
const SLOTS = SLOT_PATTERN.length

/** Tiles on the track. The 15-slot pattern repeats, so it loops cleanly. */
const REPEATS = 8
/** Full laps travelled before the wheel lands. */
const LAPS = 3
/** The tile index the track rests on between spins. */
const BASE_INDEX = LAPS * SLOTS
const SPIN_MS = 6000
const LAND_MS = 160
const HOLD_MS = 2600
const START_DELAY_MS = 700

const TILE_STYLES: Record<Outcome, string> = {
  red: 'border-[#c9343d]/70 bg-[linear-gradient(135deg,#8e1b22_0%,#a71f29_55%,#c1232d_100%)] text-[#6b1318]',
  black: 'border-[#2c3643] bg-[linear-gradient(135deg,#1b2129_0%,#222a35_100%)] text-[#12161c]',
  green: 'border-[#27b06a]/70 bg-[linear-gradient(135deg,#0b6d3d_0%,#12a05a_100%)] text-[#06462a]',
}

export function RouletteDemo() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const widthRef = useRef(0)
  const baseRef = useRef(BASE_INDEX)
  const animatingRef = useRef(false)
  const spinMsRef = useRef(SPIN_MS)

  const [offset, setOffset] = useState(0)
  const [animating, setAnimating] = useState(false)

  const offsetFor = useCallback(
    (index: number) => index * STEP + TILE / 2 - widthRef.current / 2,
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
      if (!animatingRef.current) setOffset(offsetFor(baseRef.current))
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    return () => ro.disconnect()
  }, [offsetFor])

  // spin, land, hold, spin again — forever
  useEffect(() => {
    spinMsRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 1400
      : SPIN_MS

    const control = { cancelled: false }
    let timer: number | undefined
    let raf = 0
    let sound: (() => void) | undefined

    const spin = () => {
      const from = baseRef.current
      const target = from + LAPS * SLOTS + Math.floor(Math.random() * SLOTS)

      raf = requestAnimationFrame(() => {
        if (control.cancelled) return
        sound = sfx.spin(target - from, spinMsRef.current)
        animatingRef.current = true
        setAnimating(true)
        setOffset(offsetFor(target))

        timer = window.setTimeout(() => {
          if (control.cancelled) return
          // Land, then snap to the identical tile lower on the track so the
          // loop can run forever without running out of tiles.
          animatingRef.current = false
          setAnimating(false)
          baseRef.current = BASE_INDEX + (target % SLOTS)
          setOffset(offsetFor(baseRef.current))
          timer = window.setTimeout(() => {
            if (!control.cancelled) spin()
          }, HOLD_MS)
        }, spinMsRef.current + LAND_MS)
      })
    }

    timer = window.setTimeout(() => {
      if (!control.cancelled) spin()
    }, START_DELAY_MS)

    return () => {
      control.cancelled = true
      cancelAnimationFrame(raf)
      if (timer) window.clearTimeout(timer)
      sound?.()
    }
  }, [offsetFor])

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className="pointer-events-none relative h-[132px] w-full select-none overflow-hidden pt-3"
    >
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

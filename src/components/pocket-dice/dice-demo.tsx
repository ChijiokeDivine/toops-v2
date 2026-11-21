// src/components/pocket-dice/dice-demo.tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { rollDemoDice } from '@/lib/pocket-dice/demo'
import { resolveDuel, type PocketDiceValues } from '@/lib/pocket-dice/rules'
import { DiceStage, type DiceRoll } from './dice-stage'

/**
 * Ambient, non-interactive demo shown next to the stake form. It loops the
 * whole round on its own: cup shakes, pours, the dice settle, and a few seconds
 * later the cup goes again. No winner is announced; a tie simply rolls again,
 * exactly like a real replay.
 *
 * The values come from `rollDemoDice()` (plain Math.random). Nothing here is
 * provably fair and nothing here touches a stake.
 */

const FIRST_ROLL_DELAY_MS = 900
const HOLD_AFTER_WIN_MS = 2_400
const HOLD_AFTER_TIE_MS = 1_800
const RECENT_LIMIT = 6

const SEED_HISTORY: PocketDiceValues[] = [
  [4, 2],
  [6, 6],
  [1, 5],
  [3, 2],
  [5, 1],
  [2, 6],
]

export function DiceDemo() {
  const [roll, setRoll] = useState<DiceRoll | null>(null)
  const [recent, setRecent] = useState<PocketDiceValues[]>(SEED_HISTORY)
  const counterRef = useRef(0)
  const timerRef = useRef<number | undefined>(undefined)

  const rollAgain = useCallback(() => {
    counterRef.current += 1
    setRoll({ id: counterRef.current, values: rollDemoDice() })
  }, [])

  useEffect(() => {
    timerRef.current = window.setTimeout(rollAgain, FIRST_ROLL_DELAY_MS)
    return () => window.clearTimeout(timerRef.current)
  }, [rollAgain])

  const handleSettled = useCallback(
    (settled: DiceRoll) => {
      setRecent((previous) => [settled.values, ...previous].slice(0, RECENT_LIMIT))
      const tie = resolveDuel(settled.values).kind === 'tie'
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(rollAgain, tie ? HOLD_AFTER_TIE_MS : HOLD_AFTER_WIN_MS)
    },
    [rollAgain],
  )

  return (
    <div className="order-first flex min-h-[340px] flex-col bg-[#0c1116] lg:order-none lg:min-h-[640px]">
      <DiceStage
        roll={roll}
        onSettled={handleSettled}
        showResult={false}
        className="min-h-[340px] flex-1 lg:min-h-[640px]"
      >
        <div className="pointer-events-none absolute left-4 top-4 z-50 flex items-center gap-2 sm:left-6 sm:top-5">
          <span className="pd-live-dot h-2 w-2 rounded-full bg-[#00ff86] shadow-[0_0_10px_rgba(0,255,134,0.9)]" />
          <span className="text-[12px] font-semibold text-white/60">Demo </span>
        </div>

        <div className="pointer-events-none absolute right-4 top-3.5 z-50 hidden max-w-[55%] flex-wrap items-center justify-end gap-1.5 sm:right-6 sm:top-4 sm:flex">
          {recent.map((values, index) => {
            const outcome = resolveDuel(values)
            return (
              <span
                key={`${values.join('-')}-${index}`}
                className={`flex h-[26px] min-w-[52px] items-center justify-center rounded-full px-2.5 text-[12px] font-bold tabular-nums ${
                  outcome.kind === 'tie'
                    ? 'bg-[#ffdf1a]/15 text-[#ffdf1a]'
                    : 'bg-[#252f3a] text-[#e6e9ed]'
                }`}
              >
                {values[0]}–{values[1]}
              </span>
            )
          })}
        </div>
      </DiceStage>
    </div>
  )
}
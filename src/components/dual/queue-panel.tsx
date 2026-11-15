'use client'

import { useEffect, useState } from 'react'
import { formatClock, usd } from './format'

type QueuePanelProps = {
  stakePusd: string
  expiresAt: string
  onCancel: () => void
  busy: boolean
}

const AXIS_MAX = 8

/**
 * Matchmaking view. It reuses the crash demo board (same status bar, axes and
 * height) but the rocket's spot in the chart is replaced by the queue status:
 * stake locked, countdown and the refund action.
 */
export function QueuePanel({ stakePusd, expiresAt, onCancel, busy }: QueuePanelProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  const remaining = Math.max(0, new Date(expiresAt).getTime() - now)

  return (
    <section className="overflow-hidden rounded-xl border border-white/[0.04] bg-[#0c1116]">
      <div className="flex min-h-[440px] flex-col bg-[#0c1116] lg:min-h-[640px]">
        {/* Status bar */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 bg-[#0f151b] px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#00ff86] shadow-[0_0_10px_rgba(0,255,134,0.9)]" />
            <span className="text-[13px] font-semibold text-white">Network Status</span>
          </div>

          <span className="ml-auto text-[11px] font-semibold uppercase tracking-[0.08em] text-white/35">
            Matchmaking
          </span>
        </div>

        {/* Board */}
        <div className="relative flex flex-1 select-none items-center justify-center overflow-hidden">
          {/* Grid + axes, mirroring the demo chart */}
          <svg
            viewBox="0 0 1000 600"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            {[2, 4, 6].map((value) => {
              const y = 600 - (value / AXIS_MAX) * 600
              return (
                <line
                  key={value}
                  x1={0}
                  x2={1000}
                  y1={y}
                  y2={y}
                  stroke="rgba(255,255,255,0.07)"
                  strokeDasharray="5 9"
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
            {[1, 2, 3].map((step) => {
              const x = (step / 3) * 1000
              return (
                <line
                  key={step}
                  x1={x}
                  x2={x}
                  y1={0}
                  y2={600}
                  stroke="rgba(255,255,255,0.035)"
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
            <line
              x1={0}
              x2={1000}
              y1={600}
              y2={600}
              stroke="rgba(255,255,255,0.1)"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Y axis */}
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {[6, 4, 2].map((value) => (
              <div
                key={value}
                className="absolute left-3 flex -translate-y-1/2 items-center gap-2"
                style={{ top: `${(1 - value / AXIS_MAX) * 100}%` }}
              >
                <span className="h-px w-3 bg-white/25" />
                <span className="text-[11px] font-bold text-[#cfd4da]">{value}.0x</span>
              </div>
            ))}
            {Array.from({ length: 13 }, (_, index) => (
              <span
                key={index}
                className="absolute left-1 h-px w-2 bg-white/15"
                style={{ top: `${(1 - (index + 1) / 14) * 100}%` }}
              />
            ))}
          </div>

          {/* X axis */}
          <div className="pointer-events-none absolute inset-x-0 bottom-2" aria-hidden="true">
            {[10, 20, 30].map((seconds, index) => (
              <span
                key={seconds}
                className={`absolute text-[11px] font-semibold text-white/45 ${
                  index === 2 ? 'right-2' : '-translate-x-1/2'
                }`}
                style={index === 2 ? undefined : { left: `${((index + 1) / 3) * 100}%` }}
              >
                {seconds}s
              </span>
            ))}
          </div>

          {/* Radar rings where the rocket would be */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="absolute h-56 w-56 rounded-full border border-[#00fa7f]/10" />
            <div className="dual-radar absolute h-40 w-40 rounded-full border border-[#00fa7f]/20" />
            <div className="dual-radar dual-radar-delay absolute h-24 w-24 rounded-full border border-[#00fa7f]/30" />
          </div>

          {/* Queue status, centered on the board */}
          <div className="relative z-10 flex flex-col items-center px-5 pb-6 text-center">
            
            <h2 className="mt-4 text-lg font-bold text-white sm:text-xl">Finding an opponent</h2>
            <p className="mt-1 max-w-[240px] text-[12px] leading-relaxed text-[var(--t-muted)]">
              You&apos;ll be paired with another player at the same stake.
            </p>

            <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/[0.07] bg-[#070b13]/70 px-3 py-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#00fa7f]" />
              <span className="text-[12px] font-semibold text-white">{usd(stakePusd)} locked</span>
              <span className="text-white/20">·</span>
              <span className="text-[11px] tabular-nums text-[var(--t-muted)]">
                {formatClock(remaining)}
              </span>
            </div>

            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="mt-4 h-10 rounded-xl border border-white/[0.09] bg-white/[0.03] px-5 text-[12px] font-semibold text-white/75 transition hover:border-white/20 hover:bg-white/[0.06] disabled:opacity-50"
            >
              {busy ? 'Cancelling…' : 'Cancel & refund'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

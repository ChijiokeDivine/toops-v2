'use client'

import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { MINES_CURSOR_PULSE_MS, MINES_CURSOR_TTL_MS } from '@/lib/mines/config'
import type { MinesCursor, MinesPickResult, MinesTileView } from '@/lib/mines/types'
import { BombIcon, GemIcon, ShieldIcon, TileGlyph } from './icons'

type MinesBoardProps = {
  tiles: MinesTileView[]
  interactive: boolean
  pendingTile: number | null
  lastPick: MinesPickResult | null
  opponentCursor: MinesCursor | null
  onPick: (tile: number) => void
  onCursorMove: (x: number, y: number, tile: number | null) => void
  onCursorLeave: () => void
}

const STATE_CLASS: Record<MinesTileView, string> = {
  HIDDEN: 'is-hidden',
  SAFE: 'is-safe',
  BOMB: 'is-bomb',
  SHIELD: 'is-shield',
}

function TileGlyphFor({ state }: { state: MinesTileView }) {
  if (state === 'BOMB') return <BombIcon className="mn-tile-icon" />
  if (state === 'SHIELD') return <ShieldIcon className="mn-tile-icon" />
  if (state === 'SAFE') return <GemIcon className="mn-tile-icon" />
  return <TileGlyph className="mn-tile-icon" />
}

export function MinesBoard({
  tiles,
  interactive,
  pendingTile,
  lastPick,
  opponentCursor,
  onPick,
  onCursorMove,
  onCursorLeave,
}: MinesBoardProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<MinesCursor | null>(opponentCursor)
  cursorRef.current = opponentCursor

  const hoverRef = useRef<{ tile: number | null; since: number }>({ tile: null, since: 0 })
  const [pulseTile, setPulseTile] = useState<number | null>(null)
  const [flash, setFlash] = useState<{ tile: number; at: number } | null>(null)
  const [, setTick] = useState(0)

  // Track when the opponent settles on one tile so we can pulse its border.
  useEffect(() => {
    if (!opponentCursor || opponentCursor.tile == null) {
      hoverRef.current = { tile: null, since: 0 }
      setPulseTile(null)
      return
    }
    if (hoverRef.current.tile !== opponentCursor.tile) {
      hoverRef.current = { tile: opponentCursor.tile, since: Date.now() }
    }
  }, [opponentCursor?.tile, opponentCursor])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const cursor = cursorRef.current
      const fresh = cursor != null && Date.now() - cursor.at <= MINES_CURSOR_TTL_MS
      const hover = hoverRef.current
      setPulseTile(
        fresh && hover.tile != null && Date.now() - hover.since >= MINES_CURSOR_PULSE_MS
          ? hover.tile
          : null,
      )
      setTick((value) => (value + 1) % 1_000)
    }, 300)
    return () => window.clearInterval(timer)
  }, [])

  const lastPickAt = lastPick?.at ?? null
  useEffect(() => {
    if (!lastPick) return
    setFlash({ tile: lastPick.tile, at: lastPick.at })
    const timer = window.setTimeout(() => {
      setFlash((current) => (current?.at === lastPick.at ? null : current))
    }, 700)
    return () => window.clearTimeout(timer)
    // The pick timestamp is the stable identity; snapshots recreate the object.
  }, [lastPickAt])

  const cursorFresh =
    opponentCursor != null && Date.now() - opponentCursor.at <= MINES_CURSOR_TTL_MS

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const grid = gridRef.current
    if (!grid) return
    const rect = grid.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-tile]')
    const tile = target?.dataset.tile ? Number(target.dataset.tile) : null
    onCursorMove(x, y, Number.isInteger(tile) ? tile : null)
  }

  return (
    <div className="mn-board-wrap">
      <div
        ref={gridRef}
        className={`mn-board${interactive ? ' is-interactive' : ''}`}
        onPointerMove={handlePointerMove}
        onPointerLeave={onCursorLeave}
        onPointerDown={handlePointerMove}
        role="grid"
        aria-label="Mines board, 50 tiles"
      >
        {tiles.map((state, index) => {
          const flashing = flash?.tile === index
          const classNames = [
            'mn-tile',
            STATE_CLASS[state],
            interactive && state === 'HIDDEN' ? 'is-pickable' : '',
            pendingTile === index ? 'is-pending' : '',
            pulseTile === index ? 'is-pulse' : '',
            flashing ? 'is-flash' : '',
            flashing && lastPick ? `is-flash-${lastPick.kind.toLowerCase()}` : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <button
              key={index}
              type="button"
              data-tile={index}
              className={classNames}
              onClick={() => onPick(index)}
              disabled={!interactive || state !== 'HIDDEN' || pendingTile != null}
              aria-label={
                state === 'HIDDEN'
                  ? `Tile ${index + 1}, hidden`
                  : state === 'BOMB'
                    ? `Tile ${index + 1}, bomb`
                    : state === 'SHIELD'
                      ? `Tile ${index + 1}, Aegis Shield`
                      : `Tile ${index + 1}, safe`
              }
            >
              <TileGlyphFor state={state} />
            </button>
          )
        })}

        {cursorFresh && opponentCursor ? (
          <span
            className="mn-ghost"
            style={{
              left: `${opponentCursor.x * 100}%`,
              top: `${opponentCursor.y * 100}%`,
            }}
            aria-hidden="true"
          >
            <span className="mn-ghost-ring" />
            <span className="mn-ghost-dot" />
          </span>
        ) : null}
      </div>
    </div>
  )
}

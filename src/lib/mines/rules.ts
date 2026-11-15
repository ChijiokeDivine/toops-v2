import {
  MINES_BOMB_PENALTY_BPS,
  MINES_KNOCKOUT_SCORE,
  MINES_PENALTY_ROUND_TO,
  MINES_SAFE_COUNT,
  MINES_TURN_MS,
  pointsForStreak,
} from './config'
import type { MinesPickResult, MinesRuntime, MinesSeat, MinesWinReason } from './types'

export type MinesWinner = { seat: MinesSeat; reason: MinesWinReason }

export function otherSeat(seat: MinesSeat): MinesSeat {
  return seat === 0 ? 1 : 0
}

/** 35% of banked points, rounded to the nearest 10. Never exceeds the score. */
export function bombPenalty(score: number): number {
  if (score <= 0) return 0
  const raw = (score * MINES_BOMB_PENALTY_BPS) / 10_000
  const rounded = Math.round(raw / MINES_PENALTY_ROUND_TO) * MINES_PENALTY_ROUND_TO
  return Math.min(Math.max(rounded, 0), score)
}

export function averageClickMs(player: { clicks: number; totalClickMs: number }): number | null {
  if (player.clicks <= 0) return null
  return Math.round(player.totalClickMs / player.clicks)
}

export function revealedSafeCount(state: MinesRuntime): number {
  let count = 0
  for (const tile of state.revealed) {
    if (state.board[tile] === 'SAFE') count += 1
  }
  return count
}

export function pickableTiles(state: MinesRuntime): number[] {
  const revealed = new Set(state.revealed)
  const tiles: number[] = []
  for (let index = 0; index < state.board.length; index += 1) {
    if (!revealed.has(index)) tiles.push(index)
  }
  return tiles
}

export function isPickable(state: MinesRuntime, tile: number): boolean {
  return (
    Number.isInteger(tile) &&
    tile >= 0 &&
    tile < state.board.length &&
    !state.revealed.includes(tile)
  )
}

/**
 * Instant knockout beats everything. When the last safe tile is revealed the
 * highest score wins; bombs hit breaks a score tie, then faster average click
 * speed. A perfect tie falls back to seat 0 deterministically.
 */
export function decideWinner(state: MinesRuntime, scorerSeat: MinesSeat): MinesWinner | null {
  const scorer = state.players[scorerSeat]
  if (scorer.score >= MINES_KNOCKOUT_SCORE) {
    return { seat: scorerSeat, reason: 'KNOCKOUT' }
  }

  if (revealedSafeCount(state) < MINES_SAFE_COUNT) return null

  const [seat0, seat1] = state.players
  if (seat0.score !== seat1.score) {
    return {
      seat: seat0.score > seat1.score ? 0 : 1,
      reason: 'EXHAUSTION',
    }
  }

  if (seat0.bombs !== seat1.bombs) {
    return {
      seat: seat0.bombs < seat1.bombs ? 0 : 1,
      reason: 'TIEBREAK_BOMBS',
    }
  }

  const speed0 = averageClickMs(seat0)
  const speed1 = averageClickMs(seat1)
  if (speed0 != null && speed1 != null && speed0 !== speed1) {
    return {
      seat: speed0 < speed1 ? 0 : 1,
      reason: 'TIEBREAK_SPEED',
    }
  }

  return { seat: 0, reason: 'TIEBREAK_SPEED' }
}

function advanceTurn(state: MinesRuntime, now: number): void {
  state.turn = otherSeat(state.turn)
  state.turnStartedAt = now
  state.turnDeadline = now + MINES_TURN_MS
  state.turnCount += 1
}

/**
 * Applies one pick. The caller has already validated turn ownership and that
 * the tile is still hidden. Mutates `state` in place and returns the public
 * result used by the board animation.
 */
export function applyPick(
  state: MinesRuntime,
  seat: MinesSeat,
  tile: number,
  now: number,
  options: { auto?: boolean } = {},
): MinesPickResult {
  const player = state.players[seat]
  const auto = options.auto === true
  const clickMs = auto
    ? MINES_TURN_MS
    : Math.min(Math.max(now - state.turnStartedAt, 0), MINES_TURN_MS)

  player.clicks += 1
  player.totalClickMs += clickMs

  state.revealed.push(tile)
  state.revealed.sort((a, b) => a - b)

  const kind = state.board[tile]
  let result: MinesPickResult

  if (kind === 'BOMB') {
    state.exploded.push(tile)
    state.exploded.sort((a, b) => a - b)
    player.bombs += 1

    if (player.shields > 0) {
      player.shields -= 1
      player.shieldsUsed += 1
      result = {
        seat,
        tile,
        kind,
        points: 0,
        penalty: 0,
        shieldUsed: true,
        shieldGained: false,
        streak: player.streak,
        auto,
        at: now,
      }
    } else {
      const penalty = bombPenalty(player.score)
      player.score = Math.max(0, player.score - penalty)
      player.streak = 0
      result = {
        seat,
        tile,
        kind,
        points: penalty,
        penalty,
        shieldUsed: false,
        shieldGained: false,
        streak: 0,
        auto,
        at: now,
      }
    }
  } else {
    const shieldGained = state.shieldIndex === tile
    if (shieldGained) {
      player.shields = 1
    }
    const points = pointsForStreak(player.streak)
    player.streak += 1
    player.score += points
    result = {
      seat,
      tile,
      kind,
      points,
      penalty: 0,
      shieldUsed: false,
      shieldGained,
      streak: player.streak,
      auto,
      at: now,
    }
  }

  state.lastPick = result
  state.updatedAt = now

  const winner = decideWinner(state, seat)
  if (winner) {
    state.winnerSeat = winner.seat
    state.winReason = winner.reason
    state.turnDeadline = 0
    state.turnStartedAt = 0
  } else {
    advanceTurn(state, now)
  }

  return result
}

/** Server-selected random unrevealed tile when the shot clock expires. */
export function chooseAutoTile(state: MinesRuntime, random: () => number): number | null {
  const available = pickableTiles(state)
  if (available.length === 0) return null
  const index = Math.min(available.length - 1, Math.max(0, Math.floor(random() * available.length)))
  return available[index] ?? null
}

/** True once a winner exists or every safe tile has been revealed. */
export function isMatchOver(state: MinesRuntime): boolean {
  return state.winnerSeat != null || revealedSafeCount(state) >= MINES_SAFE_COUNT
}

/** Milliseconds left on the active turn (0 when the match is not live). */
export function msLeftOnClock(state: MinesRuntime, now: number): number {
  if (state.status !== 'LIVE' || state.winnerSeat != null) return 0
  return Math.max(0, state.turnDeadline - now)
}

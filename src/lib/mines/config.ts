/**
 * Mines Duel configuration. Safe to import from client components.
 *
 * PUSD amounts are base units (2 decimals): 200n = 2.00 PUSD.
 * Scores are whole points; the 35% bomb penalty is rounded to the nearest 10.
 */

export const MINES_BOARD_SIZE = 35
export const MINES_BOMB_COUNT = 9
export const MINES_SAFE_COUNT = MINES_BOARD_SIZE - MINES_BOMB_COUNT

/** One in six boards hides an Aegis Shield inside a safe tile. */
export const MINES_SHIELD_ODDS = 1 / 6

/** A turn lasts exactly ten seconds, server-authoritative. */
export const MINES_TURN_MS = 10_000

/** First player to this score is knocked out of the match immediately. */
export const MINES_KNOCKOUT_SCORE = 1_750

/**
 * Points awarded for the n-th consecutive safe pick. The fourth and every
 * later pick in the same streak pay the cap. Scaled with the smaller board
 * (70% of the old 100 / 150 / 250 / 400 ladder).
 */
export const MINES_STREAK_POINTS = [70, 105, 175, 280] as const

/** A bomb without a shield costs 35% of banked points, rounded to nearest 10. */
export const MINES_BOMB_PENALTY_BPS = 3_500
export const MINES_PENALTY_ROUND_TO = 10

export const MINES_DEFAULT_STAKE_PUSD = 200n
/** 0.20 PUSD minimum stake. */
export const MINES_MIN_STAKE_PUSD = 20n
export const MINES_MAX_STAKE_PUSD = 100_000n

/** 1% platform fee on the pot, in basis points. */
export const MINES_FEE_BPS = 100n
export const MINES_FEE_DIVISOR = 10_000n

/** Preset stakes shown in the bet builder. */
export const MINES_STAKE_PRESETS = [200n, 500n, 1_000n, 2_500n, 5_000n] as const

/** Both clients must load and call `ready` before the clock starts. */
export const MINES_READY_TIMEOUT_MS = 60_000
/** A queued ticket is refunded after this long without an opponent. */
export const MINES_QUEUE_TTL_MS = 5 * 60_000

/** How long a player may go without a heartbeat before appearing offline. */
export const MINES_DISCONNECT_GRACE_MS = 20_000
/** If both players are gone for this long, the match is voided and refunded. */
export const MINES_ABANDON_MS = 60_000

/** Client polling cadence; SSE snapshots normally arrive first. */
export const MINES_POLL_LIVE_MS = 1_200
export const MINES_POLL_IDLE_MS = 1_800
export const MINES_HEARTBEAT_MS = 4_000

/** Ghost cursor telemetry: ~25 updates per second, smoothed on the receiver. */
export const MINES_CURSOR_HZ = 25
export const MINES_CURSOR_INTERVAL_MS = Math.round(1_000 / MINES_CURSOR_HZ)
/** A hover held on one tile for this long gets a pulsing border. */
export const MINES_CURSOR_PULSE_MS = 2_500
/** Cursors vanish after this long without an update. */
export const MINES_CURSOR_TTL_MS = 3_000

export const MINES_MAX_DISPUTE_REASON_LENGTH = 500

/** True when the score crosses the instant-knockout threshold. */
export function reachesKnockout(score: number): boolean {
  return score >= MINES_KNOCKOUT_SCORE
}

/** Points paid for the next safe pick, given the current streak length. */
export function pointsForStreak(streak: number): number {
  const index = Math.min(Math.max(streak, 0), MINES_STREAK_POINTS.length - 1)
  return MINES_STREAK_POINTS[index] ?? MINES_STREAK_POINTS[MINES_STREAK_POINTS.length - 1]!
}

// src/lib/pocket-dice/config.ts
/**
 * Pocket Dice configuration. Safe to import from client components.
 *
 * All amounts are PUSD base units (2 decimals): 200n = 2.00 PUSD.
 *
 * One shared pot, 2-10 players, one pick each from 2-12. The dice roll once
 * the join window closes; winners take the whole pot (there is no fee).
 */

export const POCKET_DICE_DEFAULT_STAKE_PUSD = 200n
export const POCKET_DICE_MIN_STAKE_PUSD = 100n
export const POCKET_DICE_MAX_STAKE_PUSD = 100_000n

export const POCKET_DICE_STAKE_PRESETS = [
  { amountPusd: 100n, label: '1' },
  { amountPusd: 500n, label: '5' },
  { amountPusd: 1_000n, label: '10' },
  { amountPusd: 2_500n, label: '25' },
  { amountPusd: 5_000n, label: '50' },
] as const

export const POCKET_DICE_MIN_PLAYERS = 2
export const POCKET_DICE_MAX_PLAYERS = 10

/** Each player picks one of these totals. */
export const POCKET_DICE_PICK_MIN = 2
export const POCKET_DICE_PICK_MAX = 12

/** How long a room stays open for more players after it is created. */
export const POCKET_DICE_JOIN_WINDOW_MS = 30_000
/** A settled round stays on screen this long (unless the player joins again). */
export const POCKET_DICE_RESULT_HOLD_MS = 45_000

/** Two dice in one cup. */
export const POCKET_DICE_DICE_COUNT = 2
export const POCKET_DICE_FACES = 6

/** Client polling cadence. */
export const POCKET_DICE_POLL_ACTIVE_MS = 800
export const POCKET_DICE_POLL_IDLE_MS = 1_200

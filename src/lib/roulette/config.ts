// src/lib/roulette/config.ts
/**
 * Roulette configuration. Safe to import from client components.
 *
 * All amounts are PUSD base units (2 decimals): 20n = 0.20 PUSD.
 *
 * One shared table: everyone bets on a single colour, the wheel has 15 slots
 * (7 red, 7 black, 1 green), and the whole pool is split between the backers
 * of the colour that lands. If the wheel lands on a colour nobody backed the
 * round is void and it spins again with the same pool.
 */

export const ROULETTE_DEFAULT_STAKE_PUSD = 100n
export const ROULETTE_MIN_STAKE_PUSD = 20n
export const ROULETTE_MAX_STAKE_PUSD = 100_000n

/** How long betting stays open before the wheel spins. */
export const ROULETTE_BETTING_WINDOW_MS = 15_000
/**
 * A settled round stays on screen this long before a fresh betting window
 * opens. It covers the client's spin animation plus the result pause.
 */
export const ROULETTE_RESULT_HOLD_MS = 10_000

/** Distinct players allowed to back a colour in one round. */
export const ROULETTE_MAX_BETTORS = 20

/** Strip sizes in the header. */
export const ROULETTE_HISTORY_LENGTH = 10
export const ROULETTE_HISTORY_WINDOW = 100

/** Client polling cadence. */
export const ROULETTE_POLL_OPEN_MS = 1_000
export const ROULETTE_POLL_SPIN_MS = 1_500

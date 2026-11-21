// src/lib/roulette/rules.ts
/**
 * Pure Roulette rules. Client-safe: the UI derives labels and previews the
 * payout with these, and the server uses the same wheel and split.
 */

export type RouletteOutcome = 'red' | 'black' | 'green'

export const ROULETTE_OUTCOMES = ['red', 'black', 'green'] as const

/**
 * The 15-slot wheel: one green, then red and black alternating. The green
 * slot is why a green win pays so much more, it is backed far less often.
 */
export const ROULETTE_SLOT_PATTERN: RouletteOutcome[] = [
  'green',
  ...Array.from({ length: 14 }, (_, index): RouletteOutcome =>
    index % 2 === 0 ? 'red' : 'black',
  ),
]

export const ROULETTE_SLOT_COUNT = ROULETTE_SLOT_PATTERN.length

export const ROULETTE_OUTCOME_LABEL: Record<RouletteOutcome, string> = {
  red: 'Red',
  black: 'Black',
  green: 'Green',
}

export function isRouletteOutcome(value: unknown): value is RouletteOutcome {
  return value === 'red' || value === 'black' || value === 'green'
}

/** The colour sitting in slot `index` (0-14). */
export function slotOutcome(index: number): RouletteOutcome {
  const slot = ((index % ROULETTE_SLOT_COUNT) + ROULETTE_SLOT_COUNT) % ROULETTE_SLOT_COUNT
  return ROULETTE_SLOT_PATTERN[slot] ?? 'red'
}

/**
 * Splits `pool` between backers in proportion to their stakes. Whole base
 * units round down, and the few leftover units go to the largest stakes so
 * the payouts always add up to the pool exactly.
 */
export function splitPool(pool: bigint, stakes: bigint[]): bigint[] {
  const total = stakes.reduce((sum, stake) => sum + stake, 0n)
  if (total <= 0n || pool <= 0n) return stakes.map(() => 0n)

  const shares = stakes.map((stake) => (pool * stake) / total)
  let remainder = pool - shares.reduce((sum, share) => sum + share, 0n)

  if (remainder > 0n) {
    const order = stakes
      .map((stake, index) => ({ stake, index }))
      .sort((a, b) => (a.stake === b.stake ? a.index - b.index : a.stake > b.stake ? -1 : 1))
    for (const { index } of order) {
      if (remainder <= 0n) break
      shares[index] = (shares[index] ?? 0n) + 1n
      remainder -= 1n
    }
  }

  return shares
}

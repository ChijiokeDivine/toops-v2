// src/lib/pocket-dice/rules.ts
/**
 * Pure Pocket Dice rules. Client-safe: the UI previews the pot with these and
 * the server uses the same functions to settle a round.
 */
import { POCKET_DICE_FACES, POCKET_DICE_PICK_MAX, POCKET_DICE_PICK_MIN } from './config'

export type PocketDiceFace = 1 | 2 | 3 | 4 | 5 | 6
/** `[left die, right die]`. */
export type PocketDiceValues = readonly [PocketDiceFace, PocketDiceFace]
export type PocketDiceSeat = 0 | 1
export type PocketDicePick = number

export type DuelOutcome = { kind: 'seat'; winner: PocketDiceSeat } | { kind: 'tie' }

export type PocketDiceEntry = {
  userId: string
  pick: PocketDicePick
  createdAt: Date
}

export type PocketDiceSettlement = {
  /** The two dice total. */
  roll: number
  /** True when a player picked the exact total. */
  exactHit: boolean
  /** The paid numbers: the total, or the two closest chosen numbers. */
  winningNumbers: number[]
  /** Credit per player id. Everyone appears, losers with 0n. */
  payouts: Map<string, bigint>
}

/** Both stakes together (kept for the old board preview). */
export function potPusd(stakePusd: bigint, players = 2): bigint {
  return stakePusd * BigInt(players)
}

/** Legacy duel resolver used by the ambient board's result chip. */
export function resolveDuel(values: PocketDiceValues): DuelOutcome {
  const [first, second] = values
  if (first === second) return { kind: 'tie' }
  return { kind: 'seat', winner: first > second ? 0 : 1 }
}

export function isFace(value: unknown): value is PocketDiceFace {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= POCKET_DICE_FACES
  )
}

export function isPick(value: unknown): value is PocketDicePick {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= POCKET_DICE_PICK_MIN &&
    value <= POCKET_DICE_PICK_MAX
  )
}

export function diceTotal(values: PocketDiceValues): number {
  return values[0] + values[1]
}

/** Splits `amount` across `count` players, giving leftover units to the first ones. */
function splitEqually(amount: bigint, count: number): bigint[] {
  if (count <= 0) return []
  const base = amount / BigInt(count)
  const remainder = Number(amount % BigInt(count))
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1n : 0n))
}

/** Oldest first, so leftover base units are handed out deterministically. */
function byAge(a: PocketDiceEntry, b: PocketDiceEntry): number {
  return a.createdAt.getTime() - b.createdAt.getTime() || a.userId.localeCompare(b.userId)
}

function groupByPick(entries: PocketDiceEntry[]): Map<number, PocketDiceEntry[]> {
  const groups = new Map<number, PocketDiceEntry[]>()
  for (const entry of entries) {
    const group = groups.get(entry.pick)
    if (group) group.push(entry)
    else groups.set(entry.pick, [entry])
  }
  for (const group of groups.values()) group.sort(byAge)
  return groups
}

/**
 * Settles one roll.
 *
 * - Exact total picked: those players split the whole pot equally.
 * - Nobody exact: the two closest chosen totals share the pot by closeness
 *   (the nearer total gets the larger weight), each group split equally.
 */
export function settlePocketDice(
  pot: bigint,
  values: PocketDiceValues,
  entries: PocketDiceEntry[],
): PocketDiceSettlement {
  const roll = diceTotal(values)
  const groups = groupByPick(entries)
  const payouts = new Map<string, bigint>(entries.map((entry) => [entry.userId, 0n]))

  const exact = groups.get(roll)
  if (exact) {
    const shares = splitEqually(pot, exact.length)
    exact.forEach((entry, index) => payouts.set(entry.userId, shares[index] ?? 0n))
    return { roll, exactHit: true, winningNumbers: [roll], payouts }
  }

  const closest = [...groups.keys()]
    .sort((a, b) => Math.abs(a - roll) - Math.abs(b - roll) || a - b)
    .slice(0, 2)
  if (closest.length === 0) {
    return { roll, exactHit: false, winningNumbers: [], payouts }
  }

  const winningNumbers = closest.sort((a, b) => a - b)
  if (closest.length === 1) {
    const only = groups.get(closest[0] ?? -1) ?? []
    const shares = splitEqually(pot, only.length)
    only.forEach((entry, index) => payouts.set(entry.userId, shares[index] ?? 0n))
    return { roll, exactHit: false, winningNumbers, payouts }
  }

  const [first, second] = closest as [number, number]
  const firstDistance = Math.abs(first - roll)
  const secondDistance = Math.abs(second - roll)
  // Inverse-distance weights: pot * otherDistance / sum(distances).
  const totalWeight = BigInt(firstDistance + secondDistance)
  const firstPot = (pot * BigInt(secondDistance)) / totalWeight
  const secondPot = pot - firstPot

  for (const [number, sharePot] of [
    [first, firstPot],
    [second, secondPot],
  ] as const) {
    const group = groups.get(number) ?? []
    const shares = splitEqually(sharePot, group.length)
    group.forEach((entry, index) => payouts.set(entry.userId, shares[index] ?? 0n))
  }

  return { roll, exactHit: false, winningNumbers, payouts }
}

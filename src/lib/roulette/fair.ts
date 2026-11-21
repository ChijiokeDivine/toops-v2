// src/lib/roulette/fair.ts
import 'server-only'

import { createHash, createHmac, randomBytes } from 'node:crypto'
import { ROULETTE_SLOT_COUNT, slotOutcome, type RouletteOutcome } from './rules'

export function generateServerSeed(): string {
  return randomBytes(32).toString('hex')
}

export function hashServerSeed(serverSeed: string): string {
  return createHash('sha256').update(serverSeed).digest('hex')
}

/**
 * Slot the wheel stops on for `attempt` of a round. Each attempt is an
 * independent draw from HMAC-SHA256(serverSeed, `${roundId}:${attempt}`), so a
 * void round's replay is randomised again. The hash of `serverSeed` is
 * published before the round and the seed is revealed after it settles, so
 * every spin can be recomputed by anyone.
 */
export function spinSlot(serverSeed: string, roundId: string, attempt: number): number {
  const digest = createHmac('sha256', serverSeed).update(`${roundId}:${attempt}`).digest()
  const value =
    (((digest[0] ?? 0) << 24) |
      ((digest[1] ?? 0) << 16) |
      ((digest[2] ?? 0) << 8) |
      (digest[3] ?? 0)) >>>
    0
  return value % ROULETTE_SLOT_COUNT
}

export function spinOutcome(serverSeed: string, roundId: string, attempt: number): RouletteOutcome {
  return slotOutcome(spinSlot(serverSeed, roundId, attempt))
}

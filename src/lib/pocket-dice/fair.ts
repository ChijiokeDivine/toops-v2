// src/lib/pocket-dice/fair.ts
import 'server-only'

import { createHash, createHmac, randomBytes } from 'node:crypto'
import { POCKET_DICE_FACES } from './config'
import type { PocketDiceFace, PocketDiceValues } from './rules'

export function generateServerSeed(): string {
  return randomBytes(32).toString('hex')
}

export function hashServerSeed(serverSeed: string): string {
  return createHash('sha256').update(serverSeed).digest('hex')
}

/**
 * Two dice from HMAC-SHA256(serverSeed, `${matchId}:${nonce}`). The hash of
 * `serverSeed` is stored before the round and the seed is revealed after it,
 * so the roll can be recomputed by anyone.
 */
export function rollMatchDice(
  serverSeed: string,
  matchId: string,
  nonce: number,
): PocketDiceValues {
  const digest = createHmac('sha256', serverSeed).update(`${matchId}:${nonce}`).digest()
  const die = (byte: number): PocketDiceFace =>
    ((byte % POCKET_DICE_FACES) + 1) as PocketDiceFace
  return [die(digest[0] ?? 0), die(digest[1] ?? 0)]
}

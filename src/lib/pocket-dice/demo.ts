// src/lib/pocket-dice/demo.ts
/**
 * Demo-only dice logic for the ambient board shown on the lobby.
 *
 * This is deliberately a plain `Math.random()` roll: it never touches stakes
 * and proves nothing. Real rounds must use the server's provably-fair result
 * (HMAC-SHA256 of the server seed, both client seeds and the nonce).
 */
import { POCKET_DICE_FACES } from './config'
import type { PocketDiceFace, PocketDiceValues } from './rules'

export function rollDemoDie(): PocketDiceFace {
  return (Math.floor(Math.random() * POCKET_DICE_FACES) + 1) as PocketDiceFace
}

export function rollDemoDice(): PocketDiceValues {
  return [rollDemoDie(), rollDemoDie()]
}

// src/lib/pocket-dice/types.ts
/**
 * Shared Pocket Dice DTOs. PUSD amounts are decimal strings so payloads stay
 * JSON-safe. Picks stay hidden until the round settles.
 */

export type PocketDiceStatus = 'WAITING' | 'SETTLED' | 'CANCELLED'

export type PocketDicePlayerView = {
  userId: string
  displayName: string
  avatarUrl: string | null
  isSelf: boolean
  /** `null` for other players until the round settles. */
  pick: number | null
  payoutPusd: string
}

export type PocketDiceViewer = {
  isPlayer: boolean
  canLeave: boolean
  canStart: boolean
  payoutPusd: string
}

export type PocketDiceMatchView = {
  id: string
  status: PocketDiceStatus
  stakePusd: string
  potPusd: string
  die1: number | null
  die2: number | null
  roll: number | null
  exactHit: boolean
  winningNumbers: number[]
  serverSeedHash: string
  serverSeed: string | null
  startsAt: string
  endedAt: string | null
  serverNow: string
  countdownMsRemaining: number | null
  players: PocketDicePlayerView[]
  viewer: PocketDiceViewer
}

export type PocketDiceStateResponse = {
  serverNow: string
  user: {
    id: string
    displayName: string
    avatarUrl: string | null
    balancePusd: string
  }
  match: PocketDiceMatchView | null
}

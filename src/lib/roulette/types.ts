// src/lib/roulette/types.ts
/**
 * Shared Roulette DTOs. PUSD amounts are decimal strings so payloads stay
 * JSON-safe. Rivals' stakes are visible while betting, the wheel's seed is
 * only revealed once the round settles.
 */
import type { RouletteOutcome } from './rules'

export type RouletteStatus = 'BETTING' | 'SETTLED' | 'CANCELLED'

export type RouletteBettorView = {
  userId: string
  displayName: string
  avatarUrl: string | null
  isSelf: boolean
  amountPusd: string
}

export type RouletteViewer = {
  signedIn: boolean
  /** The colour this viewer backed, or null if they sat the round out. */
  outcome: RouletteOutcome | null
  stakePusd: string
  payoutPusd: string
  canBet: boolean
}

export type RouletteRoundView = {
  id: string
  status: RouletteStatus
  /** Null while betting, and on a round nobody backed. */
  outcome: RouletteOutcome | null
  /** Winning slot (0-14) on the 15-slot wheel. */
  slot: number | null
  potPusd: string
  pools: Record<RouletteOutcome, string>
  bettors: Record<RouletteOutcome, RouletteBettorView[]>
  /** Extra spins the wheel needed because it landed on an empty colour. */
  voidSpins: number
  serverSeedHash: string
  serverSeed: string | null
  closesAt: string
  endedAt: string | null
  serverNow: string
  countdownMsRemaining: number | null
  viewer: RouletteViewer
}

export type RouletteHistory = {
  outcomes: RouletteOutcome[]
  counts: Record<RouletteOutcome, number>
}

export type RouletteStateResponse = {
  serverNow: string
  signedIn: boolean
  user: {
    id: string
    displayName: string
    avatarUrl: string | null
    balancePusd: string
  } | null
  round: RouletteRoundView
  history: RouletteHistory
}

/**
 * Shared Mines Duel types. The runtime is server-only (it contains the hidden
 * board); the snapshot is the public DTO pushed over SSE and returned by the
 * state endpoint.
 */

export type MinesSeat = 0 | 1
export type MinesTileKind = 'BOMB' | 'SAFE'
export type MinesStatus = 'WAITING' | 'LIVE' | 'SETTLED' | 'CANCELLED'
export type MinesWinReason = 'KNOCKOUT' | 'EXHAUSTION' | 'TIEBREAK_BOMBS' | 'TIEBREAK_SPEED'

export type MinesPlayerRuntime = {
  userId: string
  displayName: string
  avatarUrl: string | null
  clientSeed: string
  score: number
  streak: number
  bombs: number
  shields: number
  shieldsUsed: number
  clicks: number
  totalClickMs: number
  ready: boolean
}

export type MinesPickResult = {
  seat: MinesSeat
  tile: number
  kind: 'SAFE' | 'BOMB'
  /** Points added (safe) or removed (bomb). Always >= 0 as an absolute value. */
  points: number
  /** 35% penalty actually charged; 0 when a shield absorbed the hit. */
  penalty: number
  shieldUsed: boolean
  shieldGained: boolean
  streak: number
  auto: boolean
  at: number
}

export type MinesRuntime = {
  matchId: string
  status: MinesStatus
  stakePusd: string
  potPusd: string
  serverSeedHash: string
  hmacHex: string
  nonce: number
  /** Never leaves the server until the match is finished. */
  serverSeed: string
  /** 35 entries. `B` = bomb, `S` = safe. Never sent while unrevealed. */
  board: MinesTileKind[]
  /** Index of the Aegis Shield inside the safe tiles, or null when not rolled. */
  shieldIndex: number | null
  players: [MinesPlayerRuntime, MinesPlayerRuntime]
  /** Every revealed tile index (safe, shield and bomb). */
  revealed: number[]
  /** Every bomb tile revealed so far. These stay visible for both players. */
  exploded: number[]
  turn: MinesSeat
  turnStartedAt: number
  turnDeadline: number
  turnCount: number
  winnerSeat: MinesSeat | null
  winReason: MinesWinReason | null
  lastPick: MinesPickResult | null
  startedAt: number | null
  endedAt: number | null
  readyDeadlineAt: number | null
  createdAt: number
  updatedAt: number
}

export type MinesTileView = 'HIDDEN' | 'SAFE' | 'SHIELD' | 'BOMB'

export type MinesPlayerView = {
  userId: string
  displayName: string
  avatarUrl: string | null
  seat: MinesSeat
  score: number
  streak: number
  /** Points the next safe pick would pay, given the current streak. */
  nextPoints: number
  bombs: number
  shields: number
  /** Average milliseconds from turn start to click; null before the first pick. */
  averageClickMs: number | null
  online: boolean
  ready: boolean
}

export type MinesCursor = {
  x: number
  y: number
  tile: number | null
  at: number
}

export type MinesCursorMap = Partial<Record<MinesSeat, MinesCursor>>

export type MinesMatchSnapshot = {
  id: string
  status: MinesStatus
  stakePusd: string
  potPusd: string
  feePusd: string
  payoutPusd: string
  serverSeedHash: string
  /** Revealed with the rest of the board once the match is over. */
  serverSeed: string | null
  nonce: number | null
  clientSeeds: string[]
  hmacHex: string
  tiles: MinesTileView[]
  players: MinesPlayerView[]
  turn: MinesSeat
  turnStartedAt: number | null
  turnDeadline: number | null
  winnerSeat: MinesSeat | null
  winReason: MinesWinReason | null
  lastPick: MinesPickResult | null
  startedAt: string | null
  endedAt: string | null
  readyDeadlineAt: string | null
  serverNow: string
  cursors: MinesCursorMap
}

export type MinesViewer = {
  seat: MinesSeat | null
  isPlayer: boolean
  /** True when it is the viewer's turn and a tile can be picked right now. */
  canPick: boolean
  canCancel: boolean
  canLeave: boolean
  canRematch: boolean
}

export type MinesQueueView = {
  stakePusd: string
  expiresAt: string
}

export type MinesStateResponse = {
  serverNow: string
  user: {
    id: string
    displayName: string
    avatarUrl: string | null
    balancePusd: string
    clientSeed: string
  }
  queue: MinesQueueView | null
  match: (MinesMatchSnapshot & { viewer: MinesViewer }) | null
}

export type MinesVerifyResponse = {
  matchId: string
  status: MinesStatus
  serverSeedHash: string
  serverSeed: string | null
  clientSeeds: string[]
  nonce: number
  hmacHex: string
  board: string
  shieldIndex: number | null
  hashMatches: boolean
  boardMatches: boolean | null
  shieldMatches: boolean | null
  revealed: boolean
  note: string
}

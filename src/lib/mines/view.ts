import { formatPusdUnits } from '@/lib/pusd'
import {
  MINES_CURSOR_TTL_MS,
  MINES_DISCONNECT_GRACE_MS,
  MINES_TURN_MS,
  pointsForStreak,
} from './config'
import { projectedMinesPayout } from './settlement'
import type {
  MinesCursorMap,
  MinesMatchSnapshot,
  MinesPlayerView,
  MinesRuntime,
  MinesSeat,
  MinesTileView,
  MinesViewer,
} from './types'

export type SnapshotExtras = {
  now: number
  presence: [number | null, number | null]
  cursors: MinesCursorMap
}

function tileViews(state: MinesRuntime): MinesTileView[] {
  const finished = state.status === 'SETTLED' || state.status === 'CANCELLED'
  const revealed = new Set(state.revealed)
  const tiles: MinesTileView[] = []

  for (let index = 0; index < state.board.length; index += 1) {
    if (!finished && !revealed.has(index)) {
      tiles.push('HIDDEN')
      continue
    }
    if (state.board[index] === 'BOMB') {
      // Bombs stay hidden until someone hits them; a finished board shows all.
      tiles.push(finished || revealed.has(index) ? 'BOMB' : 'HIDDEN')
      continue
    }
    if (state.shieldIndex === index) {
      tiles.push(finished || revealed.has(index) ? 'SHIELD' : 'HIDDEN')
      continue
    }
    tiles.push('SAFE')
  }

  return tiles
}

function playerViews(
  state: MinesRuntime,
  now: number,
  presence: [number | null, number | null],
): MinesPlayerView[] {
  return state.players.map((player, index) => {
    const seat = index as MinesSeat
    const lastSeen = presence[seat]
    const online = lastSeen == null ? true : now - lastSeen <= MINES_DISCONNECT_GRACE_MS
    return {
      userId: player.userId,
      displayName: player.displayName,
      avatarUrl: player.avatarUrl,
      seat,
      score: player.score,
      streak: player.streak,
      nextPoints: pointsForStreak(player.streak),
      bombs: player.bombs,
      shields: player.shields,
      averageClickMs: player.clicks > 0 ? Math.round(player.totalClickMs / player.clicks) : null,
      online,
      ready: player.ready,
    }
  })
}

function freshCursors(cursors: MinesCursorMap, now: number): MinesCursorMap {
  const fresh: MinesCursorMap = {}
  for (const seat of [0, 1] as const) {
    const cursor = cursors[seat]
    if (cursor && now - cursor.at <= MINES_CURSOR_TTL_MS) fresh[seat] = cursor
  }
  return fresh
}

export function buildMinesSnapshot(
  state: MinesRuntime,
  extras: SnapshotExtras,
): MinesMatchSnapshot {
  const finished = state.status === 'SETTLED' || state.status === 'CANCELLED'
  const pot = BigInt(state.potPusd)
  const projected = projectedMinesPayout(pot)

  return {
    id: state.matchId,
    status: state.status,
    stakePusd: state.stakePusd,
    potPusd: state.potPusd,
    feePusd: formatPusdUnits(projected.feePusd),
    payoutPusd: formatPusdUnits(projected.payoutPusd),
    serverSeedHash: state.serverSeedHash,
    serverSeed: finished ? state.serverSeed : null,
    nonce: finished ? state.nonce : null,
    clientSeeds: finished ? state.players.map((player) => player.clientSeed) : [],
    hmacHex: state.hmacHex,
    tiles: tileViews(state),
    players: playerViews(state, extras.now, extras.presence),
    turn: state.turn,
    turnStartedAt: state.status === 'LIVE' ? state.turnStartedAt : null,
    turnDeadline: state.status === 'LIVE' ? state.turnDeadline : null,
    winnerSeat: state.winnerSeat,
    winReason: state.winReason,
    lastPick: state.lastPick,
    startedAt: state.startedAt == null ? null : new Date(state.startedAt).toISOString(),
    endedAt: state.endedAt == null ? null : new Date(state.endedAt).toISOString(),
    readyDeadlineAt:
      state.readyDeadlineAt == null ? null : new Date(state.readyDeadlineAt).toISOString(),
    serverNow: new Date(extras.now).toISOString(),
    cursors: freshCursors(extras.cursors, extras.now),
  }
}

export function buildMinesViewer(
  state: MinesRuntime,
  snapshot: MinesMatchSnapshot,
  userId: string,
  now: number,
): MinesViewer {
  const seat = state.players.findIndex((player) => player.userId === userId)
  const viewerSeat = seat === 0 || seat === 1 ? (seat as MinesSeat) : null
  const live = snapshot.status === 'LIVE'
  const canPick =
    viewerSeat != null &&
    live &&
    snapshot.winnerSeat == null &&
    snapshot.turn === viewerSeat &&
    snapshot.turnDeadline != null &&
    now < snapshot.turnDeadline
  const terminal = snapshot.status === 'SETTLED' || snapshot.status === 'CANCELLED'

  return {
    seat: viewerSeat,
    isPlayer: viewerSeat != null,
    canPick,
    canCancel: viewerSeat != null && snapshot.status === 'WAITING',
    canLeave: viewerSeat != null && terminal,
    canRematch: viewerSeat != null && snapshot.status === 'SETTLED',
  }
}

/** Full turn duration used by the client clock (kept in sync with the server). */
export const MINES_CLOCK_MS = MINES_TURN_MS

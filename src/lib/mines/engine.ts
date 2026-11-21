import 'server-only'

import { randomInt } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { formatPusdUnits, pusdUnitsToSats } from '@/lib/pusd'
import { getPusdRate } from '@/lib/pusd-server'
import {
  createMatchEscrow,
  fundMatchEscrow,
  getEscrowTimeoutBlock,
  getPlatformTreasuryLockingBytecode,
  instantiateStoredMatchEscrow,
  pkhFromAddress,
  refundMatchEscrow,
  settleMatchEscrow,
  storedParams,
  type StoredMatchEscrowParams,
} from '@/lib/contracts'
import { publishMinesEvent } from './bus'
import {
  MINES_ABANDON_MS,
  MINES_BOARD_SIZE,
  MINES_BOMB_COUNT,
  MINES_FEE_BPS,
  MINES_MAX_STAKE_PUSD,
  MINES_MIN_STAKE_PUSD,
  MINES_QUEUE_TTL_MS,
  MINES_READY_TIMEOUT_MS,
  MINES_TURN_MS,
} from './config'
import {
  decodeBoard,
  deriveMinesBoard,
  encodeBoard,
  generateClientSeed,
  generateServerSeed,
  hashServerSeed,
  verifyMinesBoard,
} from './fair'
import { applyPick, chooseAutoTile, isPickable } from './rules'
import { projectedMinesPayout } from './settlement'
import {
  clearClock,
  deleteRuntime,
  getRuntime,
  MinesStoreBusyError,
  primePresence,
  readCursors,
  readPresence,
  scheduleClock,
  setRuntime,
  touchPresence,
  withMatchLock,
  writeCursor,
} from './store'
import type {
  MinesCursor,
  MinesMatchSnapshot,
  MinesPlayerRuntime,
  MinesRuntime,
  MinesSeat,
  MinesStateResponse,
  MinesStatus,
  MinesVerifyResponse,
  MinesViewer,
  MinesWinReason,
} from './types'
import { buildMinesSnapshot, buildMinesViewer } from './view'

const MATCH_INCLUDE = {
  players: {
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          clientSeed: true,
        },
      },
    },
    orderBy: { seat: 'asc' as const },
  },
} satisfies Prisma.MinesMatchInclude

type MinesMatchRow = Prisma.MinesMatchGetPayload<{ include: typeof MATCH_INCLUDE }>
type Tx = Prisma.TransactionClient

const MATCHMAKING_LOCK = 'mines:matchmaking'
const TX_OPTIONS = { maxWait: 15_000, timeout: 60_000 } as const

export class MinesError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, status = 400, code = 'MINES_ERROR') {
    super(message)
    this.name = 'MinesError'
    this.status = status
    this.code = code
  }
}

function runTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, TX_OPTIONS)
}

function matchLockKey(matchId: string): string {
  return `mines:match:${matchId}`
}

async function acquireLock(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`
}

async function locked<T>(matchId: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await withMatchLock(matchId, fn)
  } catch (error) {
    if (error instanceof MinesStoreBusyError) {
      throw new MinesError('The match is busy. Try again.', 409, 'MATCH_BUSY')
    }
    throw error
  }
}

function secureRandom(): number {
  return randomInt(0, 1_000_000) / 1_000_000
}

function parseState(value: Prisma.JsonValue | null): MinesRuntime | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const state = value as unknown as MinesRuntime
  if (typeof state.matchId !== 'string') return null
  if (!Array.isArray(state.players) || state.players.length !== 2) return null
  if (!Array.isArray(state.board) || state.board.length !== MINES_BOARD_SIZE) return null
  return state
}

function runtimeFromRow(row: MinesMatchRow): MinesRuntime {
  const parsed = parseState(row.state)
  if (parsed && parsed.matchId === row.id) {
    // The seed lives on the row, not in the ephemeral snapshot.
    return { ...parsed, serverSeed: row.serverSeed }
  }

  const players = row.players.map((player) => ({
    userId: player.userId,
    displayName: player.user.displayName ?? `Player ${player.seat + 1}`,
    avatarUrl: player.user.avatarUrl,
    clientSeed: player.clientSeed,
    score: player.score,
    streak: player.streak,
    bombs: player.bombsHit,
    shields: 0,
    shieldsUsed: player.shieldsUsed,
    clicks: player.clicks,
    totalClickMs: player.totalClickMs,
    ready: player.ready,
  })) as [MinesPlayerRuntime, MinesPlayerRuntime]

  return {
    matchId: row.id,
    status: row.status as MinesStatus,
    stakePusd: formatPusdUnits(row.stakePusd),
    potPusd: formatPusdUnits(row.potPusd),
    serverSeedHash: row.serverSeedHash,
    hmacHex: row.hmacHex,
    nonce: row.nonce,
    serverSeed: row.serverSeed,
    board: decodeBoard(row.board),
    shieldIndex: row.shieldIndex,
    players,
    revealed: [],
    exploded: [],
    turn: 0,
    turnStartedAt: 0,
    turnDeadline: 0,
    turnCount: 0,
    winnerSeat: row.winnerSeat === 0 || row.winnerSeat === 1 ? row.winnerSeat : null,
    winReason: (row.winReason as MinesWinReason | null) ?? null,
    lastPick: null,
    startedAt: row.startsAt?.getTime() ?? null,
    endedAt: row.endedAt?.getTime() ?? null,
    readyDeadlineAt: row.readyDeadlineAt?.getTime() ?? null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

async function loadRuntime(matchId: string): Promise<MinesRuntime | null> {
  const cached = await getRuntime(matchId)
  // Clone so a failed persistence cannot mutate the process-wide cache.
  if (cached) return structuredClone(cached)

  const row = await prisma.minesMatch.findUnique({
    where: { id: matchId },
    include: MATCH_INCLUDE,
  })
  if (!row) return null

  const runtime = runtimeFromRow(row)
  await setRuntime(runtime)
  await primePresence(matchId, [
    row.players[0]?.lastSeenAt.getTime() ?? null,
    row.players[1]?.lastSeenAt.getTime() ?? null,
  ])
  return runtime
}

async function persistRuntime(state: MinesRuntime): Promise<void> {
  state.updatedAt = Date.now()
  await setRuntime(state)
  try {
    await prisma.minesMatch.update({
      where: { id: state.matchId },
      data: { state: state as unknown as Prisma.InputJsonValue },
    })
  } catch (error) {
    // Redis stays authoritative for the live match; the durable copy is a
    // safety net and must not block play.
    console.error('[mines] state snapshot failed', state.matchId, error)
  }
}

async function snapshotFor(state: MinesRuntime, now: number): Promise<MinesMatchSnapshot> {
  const [presence, cursors] = await Promise.all([
    readPresence(state.matchId),
    readCursors(state.matchId),
  ])
  return buildMinesSnapshot(state, { now, presence, cursors })
}

async function publishSnapshot(state: MinesRuntime, now = Date.now()): Promise<void> {
  const snapshot = await snapshotFor(state, now)
  await publishMinesEvent(state.matchId, {
    type: 'snapshot',
    matchId: state.matchId,
    snapshot,
  })
}

function seatOf(state: MinesRuntime, userId: string): MinesSeat | null {
  const index = state.players.findIndex((player) => player.userId === userId)
  return index === 0 || index === 1 ? (index as MinesSeat) : null
}

function requireSeat(state: MinesRuntime, userId: string): MinesSeat {
  const seat = seatOf(state, userId)
  if (seat == null) throw new MinesError('You are not in this match.', 403, 'NOT_A_PLAYER')
  return seat
}

async function ensureClientSeed(db: Pick<Tx, 'user'>, userId: string): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { clientSeed: true },
  })
  if (!user) throw new MinesError('User not found.', 404, 'USER_NOT_FOUND')
  if (user.clientSeed) return user.clientSeed

  const clientSeed = generateClientSeed()
  await db.user.update({ where: { id: userId }, data: { clientSeed } })
  return clientSeed
}

async function recordLedger(
  tx: Tx,
  params: {
    userId: string
    kind: 'BET' | 'WIN' | 'ADJUSTMENT'
    amountPusd: bigint
    reference: string
    metadata?: Prisma.InputJsonValue
  },
): Promise<void> {
  const account = await tx.user.findUniqueOrThrow({
    where: { id: params.userId },
    select: { balancePusd: true },
  })
  await tx.ledgerEntry.create({
    data: {
      userId: params.userId,
      kind: params.kind,
      amountPusd: params.amountPusd,
      balanceAfterPusd: account.balancePusd,
      reference: params.reference,
      metadata: params.metadata,
    },
  })
}

// ── queue ───────────────────────────────────────────────────

async function refundTicketWithinTx(
  tx: Tx,
  ticket: { id: string; userId: string; stakePusd: bigint },
): Promise<void> {
  const deleted = await tx.minesTicket.deleteMany({ where: { id: ticket.id } })
  if (deleted.count !== 1) return

  await tx.user.update({
    where: { id: ticket.userId },
    data: { balancePusd: { increment: ticket.stakePusd } },
  })
  await recordLedger(tx, {
    userId: ticket.userId,
    kind: 'ADJUSTMENT',
    amountPusd: ticket.stakePusd,
    reference: `mines:queue-refund:${ticket.id}`,
    metadata: {
      reason: 'queue-expired-or-left',
      stakePusd: ticket.stakePusd.toString(),
    },
  })
}

async function expireTicketsWithinTx(tx: Tx, now: Date): Promise<void> {
  const expired = await tx.minesTicket.findMany({
    where: { expiresAt: { lte: now } },
    select: { id: true, userId: true, stakePusd: true },
  })
  for (const ticket of expired) {
    await refundTicketWithinTx(tx, ticket)
  }
}

async function expireTicketForUser(userId: string): Promise<void> {
  const ticket = await prisma.minesTicket.findUnique({ where: { userId } })
  if (!ticket || ticket.expiresAt > new Date()) return

  await runTx(async (tx) => {
    await acquireLock(tx, MATCHMAKING_LOCK)
    const fresh = await tx.minesTicket.findUnique({ where: { userId } })
    if (!fresh || fresh.expiresAt > new Date()) return
    await refundTicketWithinTx(tx, fresh)
  })
}

type QueueEntry = { userId: string; clientSeed: string; stakePusd: bigint }

async function createMatchWithinTx(
  tx: Tx,
  entries: [QueueEntry, QueueEntry],
): Promise<{ match: MinesMatchRow; runtime: MinesRuntime }> {
  const [seat0, seat1] = entries
  if (seat0.stakePusd !== seat1.stakePusd) {
    throw new MinesError('Both stakes must be equal.', 400, 'STAKE_MISMATCH')
  }

  const stakePusd = seat0.stakePusd
  const serverSeed = generateServerSeed()
  const serverSeedHash = hashServerSeed(serverSeed)
  const clientSeeds = [seat0.clientSeed, seat1.clientSeed] as const
  const board = deriveMinesBoard(serverSeed, clientSeeds, 0)
  const now = new Date()

  const created = await tx.minesMatch.create({
    data: {
      status: 'WAITING',
      stakePusd,
      potPusd: stakePusd * 2n,
      serverSeed,
      serverSeedHash,
      nonce: 0,
      clientSeed1: seat0.clientSeed,
      clientSeed2: seat1.clientSeed,
      board: encodeBoard(board.tiles),
      shieldIndex: board.shieldIndex,
      hmacHex: board.hmacHex,
      readyDeadlineAt: new Date(now.getTime() + MINES_READY_TIMEOUT_MS),
      players: {
        create: entries.map((entry, seat) => ({
          userId: entry.userId,
          seat,
          stakePusd: entry.stakePusd,
          clientSeed: entry.clientSeed,
          lastSeenAt: now,
        })),
      },
    },
    include: MATCH_INCLUDE,
  })

  const runtime = runtimeFromRow(created)
  const match = await tx.minesMatch.update({
    where: { id: created.id },
    data: { state: runtime as unknown as Prisma.InputJsonValue },
    include: MATCH_INCLUDE,
  })

  await tx.user.updateMany({
    where: { id: { in: entries.map((entry) => entry.userId) } },
    data: { activeMinesMatchId: match.id },
  })

  await provisionMatchEscrow(tx, match.id, [seat0.userId, seat1.userId], stakePusd)

  return { match, runtime }
}

async function provisionMatchEscrow(
  tx: Tx,
  matchId: string,
  userIds: string[],
  stakePusd: bigint,
): Promise<void> {
  try {
    const wallets = await tx.platformWallet.findMany({ where: { userId: { in: userIds } } })
    if (wallets.length !== 2) return
    const player1Wallet = wallets.find((wallet) => wallet.userId === userIds[0])
    const player2Wallet = wallets.find((wallet) => wallet.userId === userIds[1])
    if (!player1Wallet || !player2Wallet) return

    const [rate, timeoutBlock, treasuryLockingBytecode] = await Promise.all([
      getPusdRate(),
      getEscrowTimeoutBlock(),
      Promise.resolve(getPlatformTreasuryLockingBytecode()),
    ])
    const stakeSats = pusdUnitsToSats(stakePusd, rate.satsPerPusd)
    if (stakeSats <= 0n) return

    const match = await tx.minesMatch.findUnique({
      where: { id: matchId },
      select: { serverSeedHash: true },
    })
    if (!match) return

    const contract = createMatchEscrow({
      player1Pkh: pkhFromAddress(player1Wallet.address),
      player2Pkh: pkhFromAddress(player2Wallet.address),
      stake: stakeSats,
      feeBps: MINES_FEE_BPS,
      serverSeedHash: match.serverSeedHash,
      timeoutBlock,
      treasuryLockingBytecode,
    })
    const { outpoint } = await fundMatchEscrow({
      contract,
      player1: {
        address: player1Wallet.address,
        derivationIndex: player1Wallet.derivationIndex,
      },
      player2: {
        address: player2Wallet.address,
        derivationIndex: player2Wallet.derivationIndex,
      },
      stakeSats,
    })

    await tx.minesMatch.update({
      where: { id: matchId },
      data: {
        escrowOutpoint: outpoint,
        escrowParams: storedParams(
          contract,
          {
            player1Pkh: pkhFromAddress(player1Wallet.address),
            player2Pkh: pkhFromAddress(player2Wallet.address),
            stake: stakeSats,
            feeBps: MINES_FEE_BPS,
            serverSeedHash: match.serverSeedHash,
            timeoutBlock,
            treasuryLockingBytecode,
          },
          {
            player1Address: player1Wallet.address,
            player2Address: player2Wallet.address,
          },
        ) as unknown as Prisma.InputJsonValue,
      },
    })
  } catch (error) {
    // Chain or wallet failures must not block the off-chain match.
    console.error('[mines] escrow provisioning failed', matchId, error)
  }
}

export async function joinMinesQueue(
  userId: string,
  stakePusd: bigint,
): Promise<{ matchId: string | null }> {
  if (stakePusd < MINES_MIN_STAKE_PUSD) {
    throw new MinesError(
      `Minimum stake is $${formatPusdUnits(MINES_MIN_STAKE_PUSD)}.`,
      400,
      'STAKE_TOO_LOW',
    )
  }
  if (stakePusd > MINES_MAX_STAKE_PUSD) {
    throw new MinesError(
      `Maximum stake is $${formatPusdUnits(MINES_MAX_STAKE_PUSD)}.`,
      400,
      'STAKE_TOO_HIGH',
    )
  }

  const result = await runTx(async (tx) => {
    await acquireLock(tx, MATCHMAKING_LOCK)
    const now = new Date()
    await expireTicketsWithinTx(tx, now)

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        balancePusd: true,
        clientSeed: true,
        activeMatchId: true,
        activeMinesMatchId: true,
      },
    })
    if (!user) throw new MinesError('User not found.', 404, 'USER_NOT_FOUND')

    if (user.activeMatchId) {
      const dual = await tx.dualMatch.findUnique({
        where: { id: user.activeMatchId },
        select: { status: true },
      })
      if (dual && dual.status !== 'SETTLED' && dual.status !== 'CANCELLED') {
        throw new MinesError('Finish your Dual Crash match first.', 409, 'ACTIVE_MATCH')
      }
      await tx.user.update({ where: { id: userId }, data: { activeMatchId: null } })
    }

    if (user.activeMinesMatchId) {
      const active = await tx.minesMatch.findUnique({
        where: { id: user.activeMinesMatchId },
        select: { status: true },
      })
      if (active && (active.status === 'WAITING' || active.status === 'LIVE')) {
        throw new MinesError('Finish your current Mines match first.', 409, 'ACTIVE_MATCH')
      }
      await tx.user.update({ where: { id: userId }, data: { activeMinesMatchId: null } })
    }

    const existingTicket = await tx.minesTicket.findUnique({ where: { userId } })
    if (existingTicket) {
      if (existingTicket.stakePusd === stakePusd && existingTicket.expiresAt > now) {
        return { matchId: null as string | null, runtime: null as MinesRuntime | null }
      }
      await refundTicketWithinTx(tx, existingTicket)
    }

    const clientSeed = user.clientSeed ?? (await ensureClientSeed(tx, userId))

    const debited = await tx.user.updateMany({
      where: { id: userId, balancePusd: { gte: stakePusd } },
      data: { balancePusd: { decrement: stakePusd } },
    })
    if (debited.count !== 1) {
      throw new MinesError('Insufficient PUSD balance.', 409, 'INSUFFICIENT_BALANCE')
    }

    const ticket = await tx.minesTicket.create({
      data: {
        userId,
        stakePusd,
        expiresAt: new Date(now.getTime() + MINES_QUEUE_TTL_MS),
      },
    })

    await recordLedger(tx, {
      userId,
      kind: 'BET',
      amountPusd: -stakePusd,
      reference: `mines:queue:${ticket.id}`,
      metadata: { stakePusd: stakePusd.toString(), queue: true },
    })

    const opponentTicket = await tx.minesTicket.findFirst({
      where: {
        stakePusd,
        userId: { not: userId },
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'asc' },
    })
    if (!opponentTicket) {
      return { matchId: null as string | null, runtime: null as MinesRuntime | null }
    }

    const opponent = await tx.user.findUnique({
      where: { id: opponentTicket.userId },
      select: { id: true, clientSeed: true, activeMinesMatchId: true },
    })
    if (!opponent || opponent.activeMinesMatchId) {
      if (opponent) await refundTicketWithinTx(tx, opponentTicket)
      else await tx.minesTicket.delete({ where: { id: opponentTicket.id } })
      return { matchId: null as string | null, runtime: null as MinesRuntime | null }
    }

    const opponentClientSeed = opponent.clientSeed ?? (await ensureClientSeed(tx, opponent.id))

    await tx.minesTicket.deleteMany({
      where: { id: { in: [ticket.id, opponentTicket.id] } },
    })

    const created = await createMatchWithinTx(tx, [
      { userId: opponent.id, clientSeed: opponentClientSeed, stakePusd },
      { userId, clientSeed, stakePusd },
    ])

    return { matchId: created.match.id, runtime: created.runtime }
  })

  if (result.runtime) {
    await setRuntime(result.runtime)
    await scheduleClock(result.runtime.matchId, Date.now() + MINES_READY_TIMEOUT_MS)
    await publishSnapshot(result.runtime)
  }

  return { matchId: result.matchId }
}

export async function leaveMinesQueue(userId: string): Promise<void> {
  await runTx(async (tx) => {
    await acquireLock(tx, MATCHMAKING_LOCK)
    const ticket = await tx.minesTicket.findUnique({ where: { userId } })
    if (!ticket) return
    await refundTicketWithinTx(tx, ticket)
  })
}

// ── lifecycle ───────────────────────────────────────────────

export async function getMinesState(userId: string): Promise<MinesStateResponse> {
  const initial = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, activeMinesMatchId: true },
  })
  if (!initial) throw new MinesError('User not found.', 404, 'USER_NOT_FOUND')

  if (initial.activeMinesMatchId) {
    await locked(initial.activeMinesMatchId, () =>
      advanceLocked(initial.activeMinesMatchId!),
    ).catch((error) => {
      console.error('[mines] advance failed', initial.activeMinesMatchId, error)
    })
  } else {
    await expireTicketForUser(userId).catch((error) => {
      console.error('[mines] ticket expiry failed', userId, error)
    })
  }

  const [user, ticket] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        balancePusd: true,
        clientSeed: true,
        activeMinesMatchId: true,
      },
    }),
    prisma.minesTicket.findUnique({ where: { userId } }),
  ])
  if (!user) throw new MinesError('User not found.', 404, 'USER_NOT_FOUND')

  const now = Date.now()
  let match: (MinesMatchSnapshot & { viewer: MinesViewer }) | null = null

  if (user.activeMinesMatchId) {
    const state = await loadRuntime(user.activeMinesMatchId)
    if (state) {
      const seat = seatOf(state, userId)
      if (seat != null) {
        await touchPresence(state.matchId, seat, now)
      }
      const snapshot = await snapshotFor(state, now)
      match = { ...snapshot, viewer: buildMinesViewer(state, snapshot, userId, now) }
    }
  }

  let queue: MinesStateResponse['queue'] = null
  if (!match && ticket) {
    queue = {
      stakePusd: formatPusdUnits(ticket.stakePusd),
      expiresAt: ticket.expiresAt.toISOString(),
    }
  }

  const clientSeed = user.clientSeed ?? (await ensureClientSeed(prisma, userId))

  return {
    serverNow: new Date().toISOString(),
    user: {
      id: user.id,
      displayName: user.displayName ?? 'Player',
      avatarUrl: user.avatarUrl,
      balancePusd: formatPusdUnits(user.balancePusd),
      clientSeed,
    },
    queue,
    match,
  }
}

export async function getMinesMatchSnapshot(
  matchId: string,
  userId: string,
): Promise<{ snapshot: MinesMatchSnapshot; viewer: MinesViewer }> {
  await locked(matchId, () => advanceLocked(matchId))
  const state = await loadRuntime(matchId)
  if (!state) throw new MinesError('Match not found.', 404, 'MATCH_NOT_FOUND')
  const seat = requireSeat(state, userId)
  const now = Date.now()
  await touchPresence(matchId, seat, now)
  const snapshot = await snapshotFor(state, now)
  return { snapshot, viewer: buildMinesViewer(state, snapshot, userId, now) }
}

export async function markMinesReady(matchId: string, userId: string): Promise<void> {
  await locked(matchId, async () => {
    const state = await loadRuntime(matchId)
    if (!state) throw new MinesError('Match not found.', 404, 'MATCH_NOT_FOUND')
    const seat = requireSeat(state, userId)
    const now = Date.now()
    await touchPresence(matchId, seat, now)

    if (state.status === 'SETTLED' || state.status === 'CANCELLED') return
    if (state.status === 'LIVE') return

    state.players[seat].ready = true

    if (state.players.every((player) => player.ready)) {
      state.status = 'LIVE'
      state.startedAt = now
      state.readyDeadlineAt = null
      state.turn = 0
      state.turnStartedAt = now
      state.turnDeadline = now + MINES_TURN_MS
      state.turnCount = 0
      state.players[0].ready = true
      state.players[1].ready = true
      await persistRuntime(state)
      await scheduleClock(matchId, state.turnDeadline)
      await publishSnapshot(state, now)
      return
    }

    await persistRuntime(state)
    await publishSnapshot(state, now)
  })
}

export async function touchMinesPresence(matchId: string, userId: string): Promise<void> {
  const state = await loadRuntime(matchId)
  if (!state) return
  const seat = seatOf(state, userId)
  if (seat == null) return
  await touchPresence(matchId, seat, Date.now())
}

export async function setMinesCursor(
  matchId: string,
  userId: string,
  input: { x: number; y: number; tile: number | null },
): Promise<void> {
  const state = await loadRuntime(matchId)
  if (!state) throw new MinesError('Match not found.', 404, 'MATCH_NOT_FOUND')
  if (state.status !== 'LIVE') return
  const seat = requireSeat(state, userId)

  const x = Math.min(1, Math.max(0, Number(input.x)))
  const y = Math.min(1, Math.max(0, Number(input.y)))
  if (!Number.isFinite(x) || !Number.isFinite(y)) return

  const tile =
    input.tile != null &&
    Number.isInteger(input.tile) &&
    input.tile >= 0 &&
    input.tile < MINES_BOARD_SIZE
      ? input.tile
      : null

  const cursor: MinesCursor = { x, y, tile, at: Date.now() }
  await writeCursor(matchId, seat, cursor)
  await publishMinesEvent(matchId, {
    type: 'cursor',
    matchId,
    frame: { matchId, seat, cursor },
  })
}

// ── picks ───────────────────────────────────────────────────

export async function pickMinesTile(
  matchId: string,
  userId: string,
  tile: number,
): Promise<MinesMatchSnapshot> {
  return locked(matchId, async () => {
    const state = await loadRuntime(matchId)
    if (!state) throw new MinesError('Match not found.', 404, 'MATCH_NOT_FOUND')
    const seat = requireSeat(state, userId)
    const now = Date.now()
    await touchPresence(matchId, seat, now)

    if (state.status !== 'LIVE' || state.winnerSeat != null) {
      throw new MinesError('The match is not live.', 409, 'MATCH_NOT_LIVE')
    }

    // Enforce the clock before accepting a click so a late tap cannot race
    // the automatic pick.
    await enforceClockLocked(state, now)

    if (state.winnerSeat != null || state.status !== 'LIVE') {
      await publishSnapshot(state)
      throw new MinesError('The match has ended.', 409, 'MATCH_OVER')
    }
    if (state.turn !== seat) {
      throw new MinesError("It is the opponent's turn.", 409, 'NOT_YOUR_TURN')
    }
    if (!Number.isInteger(tile) || !isPickable(state, tile)) {
      throw new MinesError('That tile is not available.', 409, 'TILE_UNAVAILABLE')
    }

    applyPick(state, seat, tile, now)
    await persistRuntime(state)

    if (state.winnerSeat != null) {
      await clearClock(matchId)
      await settleLocked(state, now)
    } else {
      await scheduleClock(matchId, state.turnDeadline)
      await publishSnapshot(state, now)
    }

    return snapshotFor(state, now)
  })
}

/**
 * Server-side shot clock. Called by every state/pick request and by the SSE
 * route once per second, so a turn expires even when the browser tab is asleep.
 */
export async function enforceMinesClock(matchId: string): Promise<void> {
  await locked(matchId, () => advanceLocked(matchId))
}

async function enforceClockLocked(state: MinesRuntime, now: number): Promise<number> {
  let picks = 0
  let pickAt = state.turnDeadline
  let guard = 0

  while (
    state.status === 'LIVE' &&
    state.winnerSeat == null &&
    pickAt > 0 &&
    pickAt <= now &&
    guard < 60
  ) {
    const tile = chooseAutoTile(state, secureRandom)
    if (tile == null) break
    applyPick(state, state.turn, tile, pickAt, { auto: true })
    picks += 1
    pickAt += MINES_TURN_MS
    guard += 1
  }

  if (picks > 0) {
    await persistRuntime(state)
    if (state.winnerSeat != null) {
      await clearClock(state.matchId)
      await settleLocked(state, now)
    } else {
      await scheduleClock(state.matchId, state.turnDeadline)
      await publishSnapshot(state, now)
    }
  }

  return picks
}

async function advanceLocked(matchId: string, now = Date.now()): Promise<void> {
  const state = await loadRuntime(matchId)
  if (!state) return
  if (state.status === 'SETTLED' || state.status === 'CANCELLED') return

  if (state.status === 'WAITING') {
    if (state.readyDeadlineAt != null && now > state.readyDeadlineAt) {
      await cancelLocked(state, 'Players did not load in time.', now)
    }
    return
  }

  const presence = await readPresence(matchId)
  const seen = presence.filter((value): value is number => value != null)
  if (seen.length === 2 && now - Math.max(...seen) > MINES_ABANDON_MS) {
    await cancelLocked(state, 'Both players disconnected.', now)
    return
  }

  // A rehydrated match can lose its ephemeral clock; give the active player a
  // fresh turn rather than leaving the match frozen.
  if (state.turnDeadline <= 0) {
    state.turnStartedAt = now
    state.turnDeadline = now + MINES_TURN_MS
    await persistRuntime(state)
    await scheduleClock(matchId, state.turnDeadline)
    await publishSnapshot(state, now)
  }

  await enforceClockLocked(state, now)

  if (state.status === 'LIVE' && state.winnerSeat != null) {
    await settleLocked(state, now)
  }
}

// ── settlement / refunds ────────────────────────────────────

async function settleLocked(state: MinesRuntime, now: number): Promise<void> {
  const winnerSeat = state.winnerSeat
  if (winnerSeat == null) return
  const reason = state.winReason ?? 'EXHAUSTION'
  const winner = state.players[winnerSeat]

  const finalized: MinesRuntime = {
    ...state,
    status: 'SETTLED',
    endedAt: now,
    turnDeadline: 0,
    turnStartedAt: 0,
    updatedAt: now,
  }

  try {
    await runTx(async (tx) => {
      await acquireLock(tx, matchLockKey(state.matchId))
      const match = await tx.minesMatch.findUnique({
        where: { id: state.matchId },
        select: {
          id: true,
          status: true,
          potPusd: true,
          stakePusd: true,
          nonce: true,
          serverSeed: true,
          escrowOutpoint: true,
          escrowParams: true,
        },
      })
      if (!match) throw new MinesError('Match not found.', 404, 'MATCH_NOT_FOUND')
      if (match.status === 'SETTLED' || match.status === 'CANCELLED') return

      const { feePusd, payoutPusd } = projectedMinesPayout(match.potPusd)

      await tx.minesMatch.update({
        where: { id: state.matchId },
        data: {
          status: 'SETTLED',
          winnerUserId: winner.userId,
          winnerSeat,
          winReason: reason,
          feePusd,
          payoutPusd,
          endedAt: new Date(now),
          state: finalized as unknown as Prisma.InputJsonValue,
        },
      })

      for (const [index, player] of state.players.entries()) {
        await tx.minesMatchPlayer.updateMany({
          where: { matchId: state.matchId, seat: index },
          data: {
            score: player.score,
            streak: player.streak,
            bombsHit: player.bombs,
            shieldsUsed: player.shieldsUsed,
            clicks: player.clicks,
            totalClickMs: player.totalClickMs,
            payoutPusd: index === winnerSeat ? payoutPusd : 0n,
            lastSeenAt: new Date(now),
          },
        })
      }

      await tx.user.update({
        where: { id: winner.userId },
        data: { balancePusd: { increment: payoutPusd } },
      })

      await recordLedger(tx, {
        userId: winner.userId,
        kind: 'WIN',
        amountPusd: payoutPusd,
        reference: `mines:payout:${state.matchId}`,
        metadata: {
          matchId: state.matchId,
          stakePusd: match.stakePusd.toString(),
          potPusd: match.potPusd.toString(),
          feePusd: feePusd.toString(),
          winnerSeat,
          winReason: reason,
        },
      })

      await settleEscrowOnChain(tx, match, winner.userId, winnerSeat)
    })
  } catch (error) {
    // The next state poll retries settlement; the board is already final.
    console.error('[mines] settlement failed', state.matchId, error)
    return
  }

  state.status = 'SETTLED'
  state.endedAt = now
  state.turnDeadline = 0
  state.turnStartedAt = 0
  await setRuntime(state)
  await clearClock(state.matchId)
  await publishSnapshot(state, now)
}

type EscrowRow = {
  serverSeed: string
  escrowOutpoint: string | null
  escrowParams: Prisma.JsonValue | null
}

async function settleEscrowOnChain(
  tx: Tx,
  match: EscrowRow,
  winnerUserId: string,
  winnerSeat: number,
): Promise<void> {
  if (!match.escrowOutpoint || !match.escrowParams) return

  try {
    const params = match.escrowParams as unknown as StoredMatchEscrowParams
    const wallet = await tx.platformWallet.findUnique({ where: { userId: winnerUserId } })
    if (!wallet) return

    const stakeSats = BigInt(params.stakeSats)
    const potSats = stakeSats * 2n
    const feeSats = (potSats * BigInt(params.feeBps)) / 10_000n

    await settleMatchEscrow({
      contract: instantiateStoredMatchEscrow(params),
      outpoint: match.escrowOutpoint,
      serverSeed: match.serverSeed,
      winnerSeat,
      winnerAddress: wallet.address,
      treasuryLockingBytecode: params.treasuryLockingBytecode,
      feeSats,
      payoutSats: potSats - feeSats,
      feeSigner: { address: wallet.address, derivationIndex: wallet.derivationIndex },
    })
  } catch (error) {
    console.error('[mines] escrow settlement failed', winnerUserId, error)
  }
}

/** Refunds expired, never-settled escrows. Safe to call repeatedly. */
export async function refundExpiredEscrows(): Promise<number> {
  const matches = await prisma.minesMatch.findMany({
    where: { escrowOutpoint: { not: null }, status: 'CANCELLED' },
    select: { id: true, escrowOutpoint: true, escrowParams: true },
    take: 25,
  })

  let refunded = 0
  for (const match of matches) {
    if (!match.escrowOutpoint || !match.escrowParams) continue
    try {
      const params = match.escrowParams as unknown as StoredMatchEscrowParams
      const players = await prisma.minesMatchPlayer.findMany({
        where: { matchId: match.id },
        select: { userId: true },
      })
      const feeWallet = await prisma.platformWallet.findFirst({
        where: { userId: { in: players.map((player) => player.userId) } },
      })
      if (!feeWallet) continue

      await refundMatchEscrow({
        contract: instantiateStoredMatchEscrow(params),
        outpoint: match.escrowOutpoint,
        player1Address: params.player1Address,
        player2Address: params.player2Address,
        stakeSats: BigInt(params.stakeSats),
        timeoutBlock: params.timeoutBlock,
        feeSigner: {
          address: feeWallet.address,
          derivationIndex: feeWallet.derivationIndex,
        },
      })
      refunded += 1
    } catch (error) {
      console.error('[mines] escrow refund failed', match.id, error)
    }
  }
  return refunded
}

async function cancelLocked(state: MinesRuntime, reason: string, now: number): Promise<void> {
  if (state.status === 'SETTLED' || state.status === 'CANCELLED') return

  const cancelled: MinesRuntime = {
    ...state,
    status: 'CANCELLED',
    endedAt: now,
    turnDeadline: 0,
    turnStartedAt: 0,
    updatedAt: now,
  }

  try {
    await runTx(async (tx) => {
      await acquireLock(tx, matchLockKey(state.matchId))
      const match = await tx.minesMatch.findUnique({
        where: { id: state.matchId },
        include: { players: { select: { userId: true, stakePusd: true } } },
      })
      if (!match) return
      if (match.status === 'SETTLED' || match.status === 'CANCELLED') return

      await tx.minesMatch.update({
        where: { id: state.matchId },
        data: {
          status: 'CANCELLED',
          cancelReason: reason.slice(0, 200),
          endedAt: new Date(now),
          feePusd: 0n,
          payoutPusd: 0n,
          winnerUserId: null,
          winnerSeat: null,
          state: cancelled as unknown as Prisma.InputJsonValue,
        },
      })

      for (const player of match.players) {
        await tx.user.update({
          where: { id: player.userId },
          data: { balancePusd: { increment: player.stakePusd } },
        })
        await recordLedger(tx, {
          userId: player.userId,
          kind: 'ADJUSTMENT',
          amountPusd: player.stakePusd,
          reference: `mines:refund:${state.matchId}:${player.userId}`,
          metadata: {
            matchId: state.matchId,
            reason,
            stakePusd: player.stakePusd.toString(),
          },
        })
      }
    })
  } catch (error) {
    console.error('[mines] refund failed', state.matchId, error)
    return
  }

  state.status = 'CANCELLED'
  state.endedAt = now
  state.turnDeadline = 0
  state.turnStartedAt = 0
  await setRuntime(state)
  await clearClock(state.matchId)
  await publishSnapshot(state, now)
}

export async function cancelMinesMatch(matchId: string, userId: string): Promise<void> {
  await locked(matchId, async () => {
    const state = await loadRuntime(matchId)
    if (!state) throw new MinesError('Match not found.', 404, 'MATCH_NOT_FOUND')
    requireSeat(state, userId)
    if (state.status === 'LIVE') {
      throw new MinesError('You cannot leave a live match.', 409, 'MATCH_LIVE')
    }
    if (state.status === 'WAITING') {
      await cancelLocked(state, 'Cancelled by a player.', Date.now())
      return
    }
    await releaseActiveMatch(matchId, userId)
  })
}

/** Dismisses a finished match and clears the pinned result screen. */
export async function dismissMinesMatch(matchId: string, userId: string): Promise<void> {
  await locked(matchId, async () => {
    const state = await loadRuntime(matchId)
    if (!state) throw new MinesError('Match not found.', 404, 'MATCH_NOT_FOUND')
    requireSeat(state, userId)
    if (state.status === 'WAITING') {
      await cancelLocked(state, 'Cancelled by a player.', Date.now())
    }
    await releaseActiveMatch(matchId, userId)
  })
}

async function releaseActiveMatch(matchId: string, userId: string): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, activeMinesMatchId: matchId },
    data: { activeMinesMatchId: null },
  })
}

// ── verification ────────────────────────────────────────────

export async function verifyMinesMatch(matchId: string): Promise<MinesVerifyResponse> {
  const match = await prisma.minesMatch.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      status: true,
      serverSeed: true,
      serverSeedHash: true,
      clientSeed1: true,
      clientSeed2: true,
      nonce: true,
      board: true,
      shieldIndex: true,
      hmacHex: true,
    },
  })
  if (!match) throw new MinesError('Match not found.', 404, 'MATCH_NOT_FOUND')

  const reveal = match.status === 'SETTLED' || match.status === 'CANCELLED'
  const clientSeeds = [match.clientSeed1, match.clientSeed2]
  const check = verifyMinesBoard({
    serverSeed: match.serverSeed,
    serverSeedHash: match.serverSeedHash,
    clientSeeds,
    nonce: match.nonce,
    storedBoard: match.board,
    storedShieldIndex: match.shieldIndex,
    reveal,
  })

  return {
    matchId,
    status: match.status as MinesStatus,
    serverSeedHash: match.serverSeedHash,
    serverSeed: reveal ? match.serverSeed : null,
    clientSeeds: reveal ? clientSeeds : [],
    nonce: match.nonce,
    hmacHex: match.hmacHex,
    board: reveal ? match.board : '',
    shieldIndex: reveal ? match.shieldIndex : null,
    hashMatches: check.hashMatches,
    boardMatches: check.boardMatches,
    shieldMatches: check.shieldMatches,
    revealed: reveal,
    note: reveal
      ? `HMAC-SHA256(serverSeed, clientSeed1 + clientSeed2 + nonce) expands in counter mode. Word 1 rolls the 1-in-6 shield; the next words shuffle the ${MINES_BOMB_COUNT} bombs.`
      : 'The server seed and the full board are revealed when the match ends.',
  }
}

/** Housekeeping used after a match is dismissed or refunded. */
export async function forgetMinesMatch(matchId: string): Promise<void> {
  await deleteRuntime(matchId)
}

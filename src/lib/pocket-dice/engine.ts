import 'server-only'

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { formatPusdUnits } from '@/lib/pusd'
import {
  POCKET_DICE_JOIN_WINDOW_MS,
  POCKET_DICE_MAX_PLAYERS,
  POCKET_DICE_MIN_PLAYERS,
  POCKET_DICE_MIN_STAKE_PUSD,
  POCKET_DICE_MAX_STAKE_PUSD,
  POCKET_DICE_RESULT_HOLD_MS,
} from './config'
import { generateServerSeed, hashServerSeed, rollMatchDice } from './fair'
import { isPick, settlePocketDice } from './rules'
import type {
  PocketDiceMatchView,
  PocketDicePlayerView,
  PocketDiceStateResponse,
  PocketDiceStatus,
} from './types'

type Tx = Prisma.TransactionClient

export class PocketDiceError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, status = 400, code = 'POCKET_DICE_ERROR') {
    super(message)
    this.name = 'PocketDiceError'
    this.status = status
    this.code = code
  }
}

const MATCH_INCLUDE = {
  players: {
    include: {
      user: { select: { id: true, displayName: true, avatarUrl: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.PocketDiceMatchInclude

type MatchWithPlayers = Prisma.PocketDiceMatchGetPayload<{ include: typeof MATCH_INCLUDE }>

const TX_OPTIONS = { maxWait: 15_000, timeout: 60_000 } as const
const MATCHMAKING_LOCK = 'pocket-dice:matchmaking'

function runTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, TX_OPTIONS)
}

function matchLockKey(matchId: string): string {
  return `pocket-dice:match:${matchId}`
}

async function acquireLock(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`
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

function playerName(player: MatchWithPlayers['players'][number]): string {
  return player.user.displayName?.trim() || 'Player'
}

function buildMatchView(
  match: MatchWithPlayers,
  userId: string,
  now: Date,
): PocketDiceMatchView {
  const isPlayer = match.players.some((player) => player.userId === userId)
  const reveal = match.status !== 'WAITING'
  const players: PocketDicePlayerView[] = match.players.map((player) => ({
    userId: player.userId,
    displayName: playerName(player),
    avatarUrl: player.user.avatarUrl,
    isSelf: player.userId === userId,
    pick: reveal || player.userId === userId ? player.pick : null,
    payoutPusd: formatPusdUnits(player.payoutPusd),
  }))
  const self = match.players.find((player) => player.userId === userId)
  const startsAt = match.startsAt.getTime()

  return {
    id: match.id,
    status: match.status as PocketDiceStatus,
    stakePusd: formatPusdUnits(match.stakePusd),
    potPusd: formatPusdUnits(match.potPusd),
    die1: match.die1,
    die2: match.die2,
    roll: match.roll,
    exactHit: match.exactHit,
    winningNumbers: match.winningNumbers,
    serverSeedHash: match.serverSeedHash,
    serverSeed: reveal ? match.serverSeed : null,
    startsAt: match.startsAt.toISOString(),
    endedAt: match.endedAt?.toISOString() ?? null,
    serverNow: now.toISOString(),
    countdownMsRemaining: match.status === 'WAITING' ? Math.max(0, startsAt - now.getTime()) : null,
    players,
    viewer: {
      isPlayer,
      canLeave: isPlayer && match.status === 'WAITING',
      canStart: isPlayer && match.status === 'WAITING' && match.players.length >= POCKET_DICE_MIN_PLAYERS,
      payoutPusd: formatPusdUnits(self?.payoutPusd ?? 0n),
    },
  }
}

/** Joins the open room at this stake, or opens a new one. */
export async function joinMatch(
  userId: string,
  stakePusd: bigint,
  pick: number,
): Promise<{ matchId: string }> {
  if (stakePusd < POCKET_DICE_MIN_STAKE_PUSD) {
    throw new PocketDiceError(
      `Minimum stake is ${formatPusdUnits(POCKET_DICE_MIN_STAKE_PUSD)} PUSD.`,
      400,
      'STAKE_TOO_LOW',
    )
  }
  if (stakePusd > POCKET_DICE_MAX_STAKE_PUSD) {
    throw new PocketDiceError(
      `Maximum stake is ${formatPusdUnits(POCKET_DICE_MAX_STAKE_PUSD)} PUSD.`,
      400,
      'STAKE_TOO_HIGH',
    )
  }
  if (!isPick(pick)) {
    throw new PocketDiceError('Pick a whole number from 2 to 12.', 400, 'INVALID_PICK')
  }

  return runTx(async (tx) => {
    await acquireLock(tx, MATCHMAKING_LOCK)
    const now = new Date()

    const current = await tx.pocketDicePlayer.findFirst({
      where: {
        userId,
        match: { status: 'WAITING', startsAt: { gt: now } },
      },
      select: { matchId: true },
    })
    if (current) return { matchId: current.matchId }

    const open = await tx.pocketDiceMatch.findMany({
      where: { status: 'WAITING', stakePusd, startsAt: { gt: now } },
      include: { _count: { select: { players: true } } },
      orderBy: { createdAt: 'asc' },
      take: 5,
    })
    const room = open.find((match) => match._count.players < POCKET_DICE_MAX_PLAYERS)

    const debited = await tx.user.updateMany({
      where: { id: userId, balancePusd: { gte: stakePusd } },
      data: { balancePusd: { decrement: stakePusd } },
    })
    if (debited.count !== 1) {
      throw new PocketDiceError('Insufficient PUSD balance.', 409, 'INSUFFICIENT_BALANCE')
    }

    const match =
      room ??
      (await (() => {
        const serverSeed = generateServerSeed()
        return tx.pocketDiceMatch.create({
          data: {
            stakePusd,
            potPusd: stakePusd,
            startsAt: new Date(now.getTime() + POCKET_DICE_JOIN_WINDOW_MS),
            serverSeed,
            serverSeedHash: hashServerSeed(serverSeed),
          },
        })
      })())

    // `room` already has its pot; a fresh match starts with this stake.
    if (room) {
      await tx.pocketDiceMatch.update({
        where: { id: room.id },
        data: { potPusd: { increment: stakePusd } },
      })
    }

    const player = await tx.pocketDicePlayer.create({
      data: { matchId: match.id, userId, pick },
    })

    await recordLedger(tx, {
      userId,
      kind: 'BET',
      amountPusd: -stakePusd,
      reference: `pocket-dice:bet:${player.id}`,
      metadata: { matchId: match.id, stakePusd: stakePusd.toString(), pick },
    })

    return { matchId: match.id }
  })
}

/** Leaves a waiting room and gets the stake back. */
export async function leaveMatch(userId: string): Promise<void> {
  await runTx(async (tx) => {
    const player = await tx.pocketDicePlayer.findFirst({
      where: { userId, match: { status: 'WAITING' } },
      include: { match: true },
      orderBy: { createdAt: 'desc' },
    })
    if (!player) return

    await acquireLock(tx, matchLockKey(player.matchId))
    const match = await tx.pocketDiceMatch.findUnique({
      where: { id: player.matchId },
      select: { status: true, stakePusd: true },
    })
    if (!match || match.status !== 'WAITING') return

    const deleted = await tx.pocketDicePlayer.deleteMany({
      where: { id: player.id, matchId: player.matchId },
    })
    if (deleted.count !== 1) return

    await tx.user.update({
      where: { id: userId },
      data: { balancePusd: { increment: match.stakePusd } },
    })
    await recordLedger(tx, {
      userId,
      kind: 'ADJUSTMENT',
      amountPusd: match.stakePusd,
      reference: `pocket-dice:leave:${player.id}`,
      metadata: { reason: 'left-waiting-room', matchId: player.matchId },
    })

    const remaining = await tx.pocketDicePlayer.count({ where: { matchId: player.matchId } })
    if (remaining === 0) {
      await tx.pocketDiceMatch.delete({ where: { id: player.matchId } })
    } else {
      await tx.pocketDiceMatch.update({
        where: { id: player.matchId },
        data: { potPusd: { decrement: match.stakePusd } },
      })
    }
  })
}

/** Rolls immediately once at least two players are in. */
export async function startMatch(userId: string): Promise<void> {
  const matchId = await runTx(async (tx) => {
    const player = await tx.pocketDicePlayer.findFirst({
      where: { userId, match: { status: 'WAITING' } },
      select: { matchId: true },
      orderBy: { createdAt: 'desc' },
    })
    if (!player) return null

    await acquireLock(tx, matchLockKey(player.matchId))
    const match = await tx.pocketDiceMatch.findUnique({
      where: { id: player.matchId },
      include: { _count: { select: { players: true } } },
    })
    if (!match || match.status !== 'WAITING') return null
    if (match._count.players < POCKET_DICE_MIN_PLAYERS) {
      throw new PocketDiceError(
        `Need at least ${POCKET_DICE_MIN_PLAYERS} players to roll.`,
        409,
        'NOT_ENOUGH_PLAYERS',
      )
    }

    await tx.pocketDiceMatch.update({
      where: { id: match.id },
      data: { startsAt: new Date() },
    })
    return match.id
  })

  if (matchId) await advanceMatch(matchId)
}

async function refundPlayers(tx: Tx, match: MatchWithPlayers, now: Date): Promise<void> {
  await tx.pocketDiceMatch.update({
    where: { id: match.id },
    data: { status: 'CANCELLED', endedAt: now },
  })

  for (const player of match.players) {
    await tx.user.update({
      where: { id: player.userId },
      data: { balancePusd: { increment: match.stakePusd } },
    })
    await recordLedger(tx, {
      userId: player.userId,
      kind: 'ADJUSTMENT',
      amountPusd: match.stakePusd,
      reference: `pocket-dice:refund:${match.id}:${player.userId}`,
      metadata: { reason: 'not-enough-players', matchId: match.id },
    })
  }
}

async function settle(tx: Tx, match: MatchWithPlayers, now: Date): Promise<void> {
  const values = rollMatchDice(match.serverSeed, match.id, match.nonce)
  const pot = match.players.reduce((total) => total + match.stakePusd, 0n)
  const settlement = settlePocketDice(
    pot,
    values,
    match.players.map((player) => ({
      userId: player.userId,
      pick: player.pick,
      createdAt: player.createdAt,
    })),
  )

  await tx.pocketDiceMatch.update({
    where: { id: match.id },
    data: {
      status: 'SETTLED',
      potPusd: pot,
      die1: values[0],
      die2: values[1],
      roll: settlement.roll,
      exactHit: settlement.exactHit,
      winningNumbers: settlement.winningNumbers,
      endedAt: now,
    },
  })

  for (const player of match.players) {
    const payout = settlement.payouts.get(player.userId) ?? 0n
    await tx.pocketDicePlayer.update({
      where: { id: player.id },
      data: { payoutPusd: payout },
    })

    if (payout <= 0n) continue
    await tx.user.update({
      where: { id: player.userId },
      data: { balancePusd: { increment: payout } },
    })
    await recordLedger(tx, {
      userId: player.userId,
      kind: 'WIN',
      amountPusd: payout,
      reference: `pocket-dice:win:${match.id}:${player.userId}`,
      metadata: {
        matchId: match.id,
        roll: settlement.roll,
        pick: player.pick,
        winningNumbers: settlement.winningNumbers,
      },
    })
  }
}

/** Settles or cancels a room once its join window has closed. */
export async function advanceMatch(matchId: string): Promise<boolean> {
  return runTx(async (tx) => {
    await acquireLock(tx, matchLockKey(matchId))
    const match = await tx.pocketDiceMatch.findUnique({
      where: { id: matchId },
      include: MATCH_INCLUDE,
    })
    if (!match || match.status !== 'WAITING') return false

    const now = new Date()
    if (match.startsAt.getTime() > now.getTime()) return false

    if (match.players.length < POCKET_DICE_MIN_PLAYERS) {
      await refundPlayers(tx, match, now)
    } else {
      await settle(tx, match, now)
    }
    return true
  })
}

async function advanceDueMatches(): Promise<void> {
  const due = await prisma.pocketDiceMatch.findMany({
    where: { status: 'WAITING', startsAt: { lte: new Date() } },
    select: { id: true },
    take: 10,
  })
  for (const match of due) {
    await advanceMatch(match.id).catch((error) => {
      console.error('[pocket-dice] advance failed', match.id, error)
    })
  }
}

export async function getPocketDiceState(userId: string): Promise<PocketDiceStateResponse> {
  await advanceDueMatches()

  const now = new Date()
  const holdFrom = new Date(now.getTime() - POCKET_DICE_RESULT_HOLD_MS)
  const [user, match] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true, avatarUrl: true, balancePusd: true },
    }),
    prisma.pocketDiceMatch.findFirst({
      where: {
        players: { some: { userId } },
        OR: [{ status: 'WAITING' }, { endedAt: { gt: holdFrom } }],
      },
      include: MATCH_INCLUDE,
      orderBy: { createdAt: 'desc' },
    }),
  ])

  if (!user) throw new PocketDiceError('User not found.', 404, 'USER_NOT_FOUND')

  return {
    serverNow: now.toISOString(),
    user: {
      id: user.id,
      displayName: user.displayName ?? 'Player',
      avatarUrl: user.avatarUrl,
      balancePusd: formatPusdUnits(user.balancePusd),
    },
    match: match ? buildMatchView(match, userId, now) : null,
  }
}

import 'server-only'

import { Prisma } from '@prisma/client'
import type { RouletteOutcome as DbOutcome, RouletteRound } from '@prisma/client'
import { prisma } from '@/lib/db'
import { formatPusdUnits } from '@/lib/pusd'
import {
  ROULETTE_BETTING_WINDOW_MS,
  ROULETTE_HISTORY_LENGTH,
  ROULETTE_HISTORY_WINDOW,
  ROULETTE_MAX_BETTORS,
  ROULETTE_MAX_STAKE_PUSD,
  ROULETTE_MIN_STAKE_PUSD,
  ROULETTE_RESULT_HOLD_MS,
} from './config'
import { generateServerSeed, hashServerSeed, spinSlot } from './fair'
import {
  ROULETTE_OUTCOMES,
  isRouletteOutcome,
  slotOutcome,
  splitPool,
  type RouletteOutcome,
} from './rules'
import type {
  RouletteBettorView,
  RouletteHistory,
  RouletteRoundView,
  RouletteStateResponse,
  RouletteStatus,
} from './types'

type Tx = Prisma.TransactionClient

export class RouletteError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, status = 400, code = 'ROULETTE_ERROR') {
    super(message)
    this.name = 'RouletteError'
    this.status = status
    this.code = code
  }
}

const BET_INCLUDE = {
  user: { select: { id: true, displayName: true, avatarUrl: true } },
} satisfies Prisma.RouletteBetInclude

type BetWithUser = Prisma.RouletteBetGetPayload<{ include: typeof BET_INCLUDE }>

const TX_OPTIONS = { maxWait: 15_000, timeout: 60_000 } as const
/** Serialises round creation and betting across every server instance. */
const TABLE_LOCK = 'roulette:table'
/**
 * Hard cap on void replays in one settlement. Landing on a backed colour is
 * overwhelmingly likely well before this, so it only exists to guarantee a
 * settlement, and the pool can never be paid to an unbacked colour.
 */
const MAX_VOID_SPINS = 512

const OUTCOME_TO_DB: Record<RouletteOutcome, DbOutcome> = {
  red: 'RED',
  black: 'BLACK',
  green: 'GREEN',
}

const OUTCOME_FROM_DB: Record<DbOutcome, RouletteOutcome> = {
  RED: 'red',
  BLACK: 'black',
  GREEN: 'green',
}

function runTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, TX_OPTIONS)
}

async function acquireLock(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`
}

async function recordLedger(
  tx: Tx,
  params: {
    userId: string
    kind: 'BET' | 'WIN'
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

function bettorName(bet: BetWithUser): string {
  return bet.user.displayName?.trim() || 'Player'
}

/**
 * The round the table is on. Returns the open round, or the just-settled one
 * while its result is still on screen; a fresh betting window only opens once
 * that hold has passed.
 */
async function currentRoundInTx(tx: Tx, now: Date): Promise<RouletteRound> {
  const latest = await tx.rouletteRound.findFirst({ orderBy: { createdAt: 'desc' } })

  if (latest) {
    if (latest.status === 'BETTING') return latest
    const endedAt = latest.endedAt?.getTime()
    if (endedAt != null && now.getTime() - endedAt < ROULETTE_RESULT_HOLD_MS) return latest
  }

  const serverSeed = generateServerSeed()
  return tx.rouletteRound.create({
    data: {
      serverSeed,
      serverSeedHash: hashServerSeed(serverSeed),
      closesAt: new Date(now.getTime() + ROULETTE_BETTING_WINDOW_MS),
    },
  })
}

/** Spins the wheel, replaying while it lands on a colour nobody backed. */
function spinUntilBacked(
  serverSeed: string,
  roundId: string,
  backed: RouletteOutcome[],
): { outcome: RouletteOutcome; slot: number; spins: number } {
  for (let attempt = 0; attempt < MAX_VOID_SPINS; attempt += 1) {
    const slot = spinSlot(serverSeed, roundId, attempt)
    const outcome = slotOutcome(slot)
    if (backed.includes(outcome)) return { outcome, slot, spins: attempt + 1 }
  }
  // Unreachable in practice; never pay an unbacked colour.
  return { outcome: backed[0] ?? 'red', slot: 0, spins: MAX_VOID_SPINS }
}

async function settleRound(tx: Tx, round: RouletteRound, now: Date): Promise<void> {
  const bets = await tx.rouletteBet.findMany({
    where: { roundId: round.id },
    orderBy: { createdAt: 'asc' },
  })

  if (bets.length === 0) {
    await tx.rouletteRound.update({
      where: { id: round.id },
      data: { status: 'CANCELLED', endedAt: now },
    })
    return
  }

  const pot = bets.reduce((total, bet) => total + bet.amountPusd, 0n)
  const backed = ROULETTE_OUTCOMES.filter((outcome) =>
    bets.some((bet) => OUTCOME_FROM_DB[bet.outcome] === outcome),
  )
  const { outcome, slot, spins } = spinUntilBacked(round.serverSeed, round.id, backed)

  await tx.rouletteRound.update({
    where: { id: round.id },
    data: { status: 'SETTLED', outcome: OUTCOME_TO_DB[outcome], slot, spins, potPusd: pot, endedAt: now },
  })

  const winners = bets.filter((bet) => OUTCOME_FROM_DB[bet.outcome] === outcome)
  const shares = splitPool(
    pot,
    winners.map((bet) => bet.amountPusd),
  )

  for (const [index, winner] of winners.entries()) {
    const payout = shares[index] ?? 0n
    await tx.rouletteBet.update({ where: { id: winner.id }, data: { payoutPusd: payout } })
    if (payout <= 0n) continue

    await tx.user.update({
      where: { id: winner.userId },
      data: { balancePusd: { increment: payout } },
    })
    await recordLedger(tx, {
      userId: winner.userId,
      kind: 'WIN',
      amountPusd: payout,
      reference: `roulette:win:${round.id}:${winner.userId}`,
      metadata: {
        roundId: round.id,
        outcome,
        slot,
        stakePusd: winner.amountPusd.toString(),
      },
    })
  }
}

async function advanceDueRounds(): Promise<void> {
  const due = await prisma.rouletteRound.findMany({
    where: { status: 'BETTING', closesAt: { lte: new Date() } },
    select: { id: true },
    take: 10,
  })

  for (const round of due) {
    await runTx(async (tx) => {
      await acquireLock(tx, TABLE_LOCK)
      const fresh = await tx.rouletteRound.findUnique({ where: { id: round.id } })
      if (!fresh || fresh.status !== 'BETTING') return
      if (fresh.closesAt.getTime() > Date.now()) return
      await settleRound(tx, fresh, new Date())
    }).catch((error) => {
      console.error('[roulette] settlement failed', round.id, error)
    })
  }
}

function buildHistory(rounds: { outcome: DbOutcome | null }[]): RouletteHistory {
  const counts: Record<RouletteOutcome, number> = { red: 0, black: 0, green: 0 }
  const outcomes: RouletteOutcome[] = []

  for (const round of rounds) {
    if (!round.outcome) continue
    const outcome = OUTCOME_FROM_DB[round.outcome]
    counts[outcome] += 1
    if (outcomes.length < ROULETTE_HISTORY_LENGTH) outcomes.push(outcome)
  }

  return { outcomes, counts }
}

function buildRoundView(
  round: RouletteRound,
  bets: BetWithUser[],
  userId: string | null,
  now: Date,
): RouletteRoundView {
  const pools: Record<RouletteOutcome, bigint> = { red: 0n, black: 0n, green: 0n }
  const bettors: Record<RouletteOutcome, RouletteBettorView[]> = { red: [], black: [], green: [] }

  for (const bet of bets) {
    const outcome = OUTCOME_FROM_DB[bet.outcome]
    pools[outcome] += bet.amountPusd
    bettors[outcome].push({
      userId: bet.userId,
      displayName: bettorName(bet),
      avatarUrl: bet.user.avatarUrl,
      isSelf: bet.userId === userId,
      amountPusd: formatPusdUnits(bet.amountPusd),
    })
  }

  const mine = bets.find((bet) => bet.userId === userId) ?? null
  const revealed = round.status !== 'BETTING'

  return {
    id: round.id,
    status: round.status as RouletteStatus,
    outcome: round.outcome ? OUTCOME_FROM_DB[round.outcome] : null,
    slot: round.slot,
    potPusd: formatPusdUnits(pools.red + pools.black + pools.green),
    pools: {
      red: formatPusdUnits(pools.red),
      black: formatPusdUnits(pools.black),
      green: formatPusdUnits(pools.green),
    },
    bettors,
    voidSpins: revealed ? Math.max(0, round.spins - 1) : 0,
    serverSeedHash: round.serverSeedHash,
    serverSeed: revealed ? round.serverSeed : null,
    closesAt: round.closesAt.toISOString(),
    endedAt: round.endedAt?.toISOString() ?? null,
    serverNow: now.toISOString(),
    countdownMsRemaining:
      round.status === 'BETTING' ? Math.max(0, round.closesAt.getTime() - now.getTime()) : null,
    viewer: {
      signedIn: userId != null,
      outcome: mine ? OUTCOME_FROM_DB[mine.outcome] : null,
      stakePusd: formatPusdUnits(mine?.amountPusd ?? 0n),
      payoutPusd: formatPusdUnits(mine?.payoutPusd ?? 0n),
      canBet: round.status === 'BETTING',
    },
  }
}

/** The live table: the current round plus the recent-colour strips. */
export async function getRouletteState(userId: string | null): Promise<RouletteStateResponse> {
  await advanceDueRounds()

  const now = new Date()
  const round = await runTx(async (tx) => {
    await acquireLock(tx, TABLE_LOCK)
    return currentRoundInTx(tx, now)
  })

  const [bets, history, user] = await Promise.all([
    prisma.rouletteBet.findMany({
      where: { roundId: round.id },
      include: BET_INCLUDE,
      orderBy: { createdAt: 'asc' },
    }),
    prisma.rouletteRound.findMany({
      where: { status: 'SETTLED', outcome: { not: null }, id: { not: round.id } },
      orderBy: { endedAt: 'desc' },
      take: ROULETTE_HISTORY_WINDOW,
      select: { outcome: true },
    }),
    userId
      ? prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, displayName: true, avatarUrl: true, balancePusd: true },
        })
      : Promise.resolve(null),
  ])

  return {
    serverNow: now.toISOString(),
    signedIn: user != null,
    user: user
      ? {
          id: user.id,
          displayName: user.displayName?.trim() || 'Player',
          avatarUrl: user.avatarUrl,
          balancePusd: formatPusdUnits(user.balancePusd),
        }
      : null,
    round: buildRoundView(round, bets, user?.id ?? null, now),
    history: buildHistory(history),
  }
}

/** Takes a seat at the table, opening a betting window if the wheel is idle. */
export async function joinTable(): Promise<{ roundId: string }> {
  return runTx(async (tx) => {
    await acquireLock(tx, TABLE_LOCK)
    const round = await currentRoundInTx(tx, new Date())
    if (round.status !== 'BETTING') {
      throw new RouletteError('The wheel is spinning. Join the next round.', 409, 'ROUND_CLOSED')
    }
    return { roundId: round.id }
  })
}

/**
 * Places (or tops up) a stake on one colour. A player backs a single colour
 * per round, so a second colour is rejected instead of split.
 */
export async function placeBet(
  userId: string,
  outcome: RouletteOutcome,
  amountPusd: bigint,
): Promise<void> {
  if (!isRouletteOutcome(outcome)) {
    throw new RouletteError('Bet on red, black or green.', 400, 'INVALID_OUTCOME')
  }
  if (amountPusd < ROULETTE_MIN_STAKE_PUSD) {
    throw new RouletteError(
      `Minimum bet is $${formatPusdUnits(ROULETTE_MIN_STAKE_PUSD)}.`,
      400,
      'BET_TOO_LOW',
    )
  }
  if (amountPusd > ROULETTE_MAX_STAKE_PUSD) {
    throw new RouletteError(
      `Maximum bet is $${formatPusdUnits(ROULETTE_MAX_STAKE_PUSD)}.`,
      400,
      'BET_TOO_HIGH',
    )
  }

  const dbOutcome = OUTCOME_TO_DB[outcome]

  await runTx(async (tx) => {
    await acquireLock(tx, TABLE_LOCK)
    const now = new Date()
    const round = await currentRoundInTx(tx, now)

    if (round.status !== 'BETTING' || round.closesAt.getTime() <= now.getTime()) {
      throw new RouletteError('The wheel is spinning. Bet on the next round.', 409, 'ROUND_CLOSED')
    }

    const existing = await tx.rouletteBet.findUnique({
      where: { roundId_userId: { roundId: round.id, userId } },
    })

    if (existing && existing.outcome !== dbOutcome) {
      throw new RouletteError(
        'One colour per round. You are already on this round.',
        409,
        'ONE_COLOUR_PER_ROUND',
      )
    }

    if (!existing) {
      const bettors = await tx.rouletteBet.count({ where: { roundId: round.id } })
      if (bettors >= ROULETTE_MAX_BETTORS) {
        throw new RouletteError('The table is full. Bet on the next round.', 409, 'TABLE_FULL')
      }
    }

    const totalPusd = (existing?.amountPusd ?? 0n) + amountPusd
    if (totalPusd > ROULETTE_MAX_STAKE_PUSD) {
      throw new RouletteError(
        `A round is capped at $${formatPusdUnits(ROULETTE_MAX_STAKE_PUSD)}.`,
        400,
        'BET_TOO_HIGH',
      )
    }

    const debited = await tx.user.updateMany({
      where: { id: userId, balancePusd: { gte: amountPusd } },
      data: { balancePusd: { decrement: amountPusd } },
    })
    if (debited.count !== 1) {
      throw new RouletteError('Insufficient PUSD balance.', 409, 'INSUFFICIENT_BALANCE')
    }

    if (existing) {
      await tx.rouletteBet.update({
        where: { id: existing.id },
        data: { amountPusd: { increment: amountPusd } },
      })
    } else {
      await tx.rouletteBet.create({
        data: { roundId: round.id, userId, outcome: dbOutcome, amountPusd },
      })
    }

    await tx.rouletteRound.update({
      where: { id: round.id },
      data: { potPusd: { increment: amountPusd } },
    })

    await recordLedger(tx, {
      userId,
      kind: 'BET',
      amountPusd: -amountPusd,
      reference: `roulette:bet:${round.id}:${userId}:${totalPusd.toString()}`,
      metadata: {
        roundId: round.id,
        outcome,
        stakePusd: amountPusd.toString(),
        totalPusd: totalPusd.toString(),
      },
    })
  })
}

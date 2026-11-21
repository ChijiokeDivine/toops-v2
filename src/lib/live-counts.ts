import 'server-only'

import { prisma } from '@/lib/db'

/**
 * Real player counts for the home page category cards.
 *
 * A player counts as "playing" while their stake is locked: they hold a queue
 * ticket, or they sit in a match that has not settled yet. Roulette has no
 * server state, so it contributes nothing to the multiplayer count.
 */
export type LiveCounts = {
  multiplayer: number
  dual: number
}

function uniqueUsers(rows: Array<{ userId: string }>): Set<string> {
  return new Set(rows.map((row) => row.userId))
}

export async function getLiveCounts(now: Date = new Date()): Promise<LiveCounts> {
  try {
    const [dice, dualTickets, dualPlayers, minesTickets, minesPlayers] = await Promise.all([
      prisma.pocketDicePlayer.findMany({
        where: { match: { status: 'WAITING', startsAt: { gt: now } } },
        select: { userId: true },
      }),
      prisma.dualTicket.findMany({
        where: { expiresAt: { gt: now } },
        select: { userId: true },
      }),
      prisma.dualMatchPlayer.findMany({
        where: { match: { status: { in: ['WAITING', 'COUNTDOWN', 'RUNNING', 'INTERMISSION'] } } },
        select: { userId: true },
      }),
      prisma.minesTicket.findMany({
        where: { expiresAt: { gt: now } },
        select: { userId: true },
      }),
      prisma.minesMatchPlayer.findMany({
        where: { match: { status: { in: ['WAITING', 'LIVE'] } } },
        select: { userId: true },
      }),
    ])

    return {
      multiplayer: uniqueUsers(dice).size,
      dual: uniqueUsers([...dualTickets, ...dualPlayers, ...minesTickets, ...minesPlayers]).size,
    }
  } catch {
    // The lobby must keep rendering when the database is unreachable.
    return { multiplayer: 0, dual: 0 }
  }
}

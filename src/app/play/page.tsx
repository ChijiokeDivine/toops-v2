import { redirect } from 'next/navigation'
import type { DualMatchStatus, MinesMatchStatus } from '@prisma/client'
import { getSessionUserId } from '@/lib/auth/session'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

const MINES_ROUTE = '/originals/mines'
const DUAL_ROUTE = '/originals/crash'
/** Where a player lands when they have nothing already in flight. */
const LOBBY_ROUTE = '/multiplayer'

/** Match states that can still be rejoined. The rest mean the match is over. */
const MINES_ACTIVE: MinesMatchStatus[] = ['WAITING', 'LIVE']
const DUAL_ACTIVE: DualMatchStatus[] = [
  'WAITING',
  'COUNTDOWN',
  'RUNNING',
  'SETTLING',
  'INTERMISSION',
]

/**
 * The route a returning player should be dropped into, or `null` when they
 * have nothing waiting.
 *
 * A queued ticket — a locked stake sitting in matchmaking — wins, because that
 * player is already committed and only needs an opponent. Otherwise an open
 * match is resumed. Both are checked against expiry and terminal state so a
 * stale row from an earlier session cannot hijack the redirect.
 */
async function resumableRoute(userId: string): Promise<string | null> {
  const now = new Date()

  const [minesTicket, dualTicket, user] = await Promise.all([
    prisma.minesTicket.findFirst({
      where: { userId, expiresAt: { gt: now } },
      select: { id: true },
    }),
    prisma.dualTicket.findFirst({
      where: { userId, expiresAt: { gt: now } },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { activeMinesMatchId: true, activeMatchId: true },
    }),
  ])

  if (minesTicket) return MINES_ROUTE
  if (dualTicket) return DUAL_ROUTE

  const [minesMatch, dualMatch] = await Promise.all([
    user?.activeMinesMatchId
      ? prisma.minesMatch.findFirst({
          where: { id: user.activeMinesMatchId, status: { in: MINES_ACTIVE } },
          select: { id: true },
        })
      : null,
    user?.activeMatchId
      ? prisma.dualMatch.findFirst({
          where: { id: user.activeMatchId, status: { in: DUAL_ACTIVE } },
          select: { id: true },
        })
      : null,
  ])

  if (minesMatch) return MINES_ROUTE
  if (dualMatch) return DUAL_ROUTE

  return null
}

/** Puts a player straight back into whatever they are already playing. */
export default async function PlayPage() {
  const userId = await getSessionUserId()

  if (userId) {
    const target = await resumableRoute(userId)
    if (target) redirect(target)
  }

  redirect(LOBBY_ROUTE)
}

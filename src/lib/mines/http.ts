import 'server-only'

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { SESSION_COOKIE, getSessionUserId, hashSessionToken } from '@/lib/auth/session'
import { MinesError } from './engine'

type SessionCache = Map<string, { userId: string; expiresAt: number }>

const holder = globalThis as typeof globalThis & {
  __toopsMinesSessionCache?: SessionCache
}
const sessionCache: SessionCache = (holder.__toopsMinesSessionCache ??= new Map())

/**
 * Ghost-cursor frames arrive ~20-25 times per second. Hitting Postgres for the
 * session on every frame would dwarf the game traffic, so the resolved user id
 * is cached for a short window. Sign-out invalidates the cookie immediately;
 * the worst case here is a 20-second stale identity on a cursor write.
 */
async function cachedSessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null

  const key = hashSessionToken(token)
  const hit = sessionCache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.userId

  const userId = await getSessionUserId()
  if (userId) {
    sessionCache.set(key, { userId, expiresAt: Date.now() + 20_000 })
    if (sessionCache.size > 2_000) sessionCache.clear()
  }
  return userId
}

export async function requireMinesUserId(options: { cached?: boolean } = {}): Promise<string> {
  const userId = options.cached ? await cachedSessionUserId() : await getSessionUserId()
  if (!userId) {
    throw new MinesError('Sign in to play Mines Duel.', 401, 'UNAUTHENTICATED')
  }
  return userId
}

export function minesErrorResponse(error: unknown): NextResponse {
  if (error instanceof MinesError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  }
  console.error('[mines] request failed', error)
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
}

export function readMatchId(body: unknown): string {
  if (!body || typeof body !== 'object' || !('matchId' in body)) {
    throw new MinesError('Match id is required.', 400, 'MATCH_ID_REQUIRED')
  }
  const matchId = (body as { matchId?: unknown }).matchId
  if (typeof matchId !== 'string' || matchId.trim().length === 0) {
    throw new MinesError('Match id is required.', 400, 'MATCH_ID_REQUIRED')
  }
  return matchId.trim()
}

export function readTile(body: unknown): number {
  if (!body || typeof body !== 'object' || !('tile' in body)) {
    throw new MinesError('Choose a tile.', 400, 'TILE_REQUIRED')
  }
  const tile = (body as { tile?: unknown }).tile
  if (typeof tile !== 'number' || !Number.isInteger(tile) || tile < 0 || tile > 49) {
    throw new MinesError('Choose a valid tile.', 400, 'INVALID_TILE')
  }
  return tile
}

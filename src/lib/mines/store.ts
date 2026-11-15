import 'server-only'

import { randomUUID } from 'node:crypto'
import Redis from 'ioredis'
import type { MinesCursor, MinesCursorMap, MinesRuntime, MinesSeat } from './types'

/**
 * Ephemeral Mines state.
 *
 * Redis is the hot path in production: every active match is a hash keyed by
 * `mines:match:<id>` with one field per state slice (board, revealed mask,
 * scores, streaks, shields, bomb counts, clock). Because Redis is optional in
 * local development, the same interface falls back to a process-global map that
 * is shared across Next.js route bundles via `globalThis`.
 *
 * The database keeps a durable snapshot; `engine.loadRuntime` rehydrates Redis
 * after an eviction, so losing the cache never loses a match.
 */

const MATCH_PREFIX = 'mines:match:'
const CLOCK_KEY = 'mines:clocks'
const CURSOR_PREFIX = 'mines:cursor:'
const PRESENCE_PREFIX = 'mines:presence:'
const LOCK_PREFIX = 'mines:lock:'

const MATCH_TTL_SECONDS = 60 * 60 * 6
const LOCK_TTL_MS = 5_000
const LOCK_WAIT_MS = 2_500

const RELEASE_LOCK = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`

type GlobalStore = {
  redis?: Redis | null
  matches: Map<string, MinesRuntime>
  clocks: Map<string, number>
  cursors: Map<string, MinesCursorMap>
  presence: Map<string, [number | null, number | null]>
  locks: Map<string, Promise<void>>
}

const globalHolder = globalThis as typeof globalThis & { __toopsMinesStore?: GlobalStore }
const store: GlobalStore = (globalHolder.__toopsMinesStore ??= {
  matches: new Map(),
  clocks: new Map(),
  cursors: new Map(),
  presence: new Map(),
  locks: new Map(),
})

export class MinesStoreBusyError extends Error {
  constructor() {
    super('The match is busy. Try again.')
    this.name = 'MinesStoreBusyError'
  }
}

function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null
  if (store.redis !== undefined) return store.redis
  try {
    const client = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 2_000,
      commandTimeout: 1_500,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: true,
      retryStrategy: (attempt) => Math.min(attempt * 400, 3_000),
    })
    client.on('error', (error) => {
      // Avoid a noisy unhandled error event; the store simply falls back.
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[mines] redis error:', error.message)
      }
    })
    store.redis = client
    return client
  } catch (error) {
    console.warn('[mines] redis unavailable, using memory store:', error)
    store.redis = null
    return null
  }
}

export function isMinesRedisEnabled(): boolean {
  return Boolean(process.env.REDIS_URL)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

// ── serialisation ───────────────────────────────────────────

function encodeValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function decodeJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function decodeNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function decodeNullableNumber(value: string | undefined): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toHash(state: MinesRuntime): Record<string, string> {
  return {
    matchId: state.matchId,
    status: state.status,
    stakePusd: state.stakePusd,
    potPusd: state.potPusd,
    serverSeedHash: state.serverSeedHash,
    hmacHex: state.hmacHex,
    nonce: String(state.nonce),
    serverSeed: state.serverSeed,
    board: state.board.map((tile) => (tile === 'BOMB' ? 'B' : 'S')).join(''),
    shieldIndex: state.shieldIndex == null ? '' : String(state.shieldIndex),
    players: JSON.stringify(state.players),
    revealed: JSON.stringify(state.revealed),
    exploded: JSON.stringify(state.exploded),
    turn: String(state.turn),
    turnStartedAt: String(state.turnStartedAt),
    turnDeadline: String(state.turnDeadline),
    turnCount: String(state.turnCount),
    winnerSeat: state.winnerSeat == null ? '' : String(state.winnerSeat),
    winReason: state.winReason ?? '',
    lastPick: encodeValue(state.lastPick),
    startedAt: state.startedAt == null ? '' : String(state.startedAt),
    endedAt: state.endedAt == null ? '' : String(state.endedAt),
    readyDeadlineAt: state.readyDeadlineAt == null ? '' : String(state.readyDeadlineAt),
    createdAt: String(state.createdAt),
    updatedAt: String(state.updatedAt),
  }
}

function fromHash(hash: Record<string, string>): MinesRuntime | null {
  if (!hash.matchId) return null
  const board = (hash.board ?? '').slice(0, 50)
  const players = decodeJson<MinesRuntime['players'] | null>(hash.players, null)
  if (!players || players.length !== 2) return null

  const status = (hash.status ?? 'WAITING') as MinesRuntime['status']
  return {
    matchId: hash.matchId,
    status,
    stakePusd: hash.stakePusd ?? '0.00',
    potPusd: hash.potPusd ?? '0.00',
    serverSeedHash: hash.serverSeedHash ?? '',
    hmacHex: hash.hmacHex ?? '',
    nonce: decodeNumber(hash.nonce, 0),
    serverSeed: hash.serverSeed ?? '',
    board: Array.from(board.padEnd(50, 'S'), (char) => (char === 'B' ? 'BOMB' : 'SAFE')),
    shieldIndex: decodeNullableNumber(hash.shieldIndex),
    players,
    revealed: decodeJson<number[]>(hash.revealed, []),
    exploded: decodeJson<number[]>(hash.exploded, []),
    turn: decodeNumber(hash.turn, 0) === 1 ? 1 : 0,
    turnStartedAt: decodeNumber(hash.turnStartedAt, 0),
    turnDeadline: decodeNumber(hash.turnDeadline, 0),
    turnCount: decodeNumber(hash.turnCount, 0),
    winnerSeat: hash.winnerSeat === '1' ? 1 : hash.winnerSeat === '0' ? 0 : null,
    winReason: (hash.winReason || null) as MinesRuntime['winReason'],
    lastPick: decodeJson<MinesRuntime['lastPick']>(hash.lastPick, null),
    startedAt: decodeNullableNumber(hash.startedAt),
    endedAt: decodeNullableNumber(hash.endedAt),
    readyDeadlineAt: decodeNullableNumber(hash.readyDeadlineAt),
    createdAt: decodeNumber(hash.createdAt, Date.now()),
    updatedAt: decodeNumber(hash.updatedAt, Date.now()),
  }
}

// ── runtime state ───────────────────────────────────────────

export async function getRuntime(matchId: string): Promise<MinesRuntime | null> {
  const redis = getRedis()
  if (redis) {
    try {
      const hash = await redis.hgetall(`${MATCH_PREFIX}${matchId}`)
      if (Object.keys(hash).length > 0) return fromHash(hash)
    } catch {
      // fall through to the local copy
    }
  }
  return store.matches.get(matchId) ?? null
}

export async function setRuntime(state: MinesRuntime): Promise<void> {
  store.matches.set(state.matchId, state)
  const redis = getRedis()
  if (!redis) return
  try {
    const hash = toHash(state)
    const pipeline = redis.multi()
    pipeline.hset(`${MATCH_PREFIX}${state.matchId}`, hash)
    pipeline.expire(`${MATCH_PREFIX}${state.matchId}`, MATCH_TTL_SECONDS)
    await pipeline.exec()
  } catch {
    // The local copy above keeps the match playable on this instance.
  }
}

export async function deleteRuntime(matchId: string): Promise<void> {
  store.matches.delete(matchId)
  store.cursors.delete(matchId)
  store.presence.delete(matchId)
  store.clocks.delete(matchId)
  const redis = getRedis()
  if (!redis) return
  try {
    await redis
      .multi()
      .del(`${MATCH_PREFIX}${matchId}`)
      .del(`${CURSOR_PREFIX}${matchId}`)
      .del(`${PRESENCE_PREFIX}${matchId}`)
      .zrem(CLOCK_KEY, matchId)
      .exec()
  } catch {
    // ignore
  }
}

// ── locking ─────────────────────────────────────────────────

async function withMemoryLock<T>(matchId: string, fn: () => Promise<T>): Promise<T> {
  const previous = store.locks.get(matchId) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const next = previous.then(() => gate)
  store.locks.set(matchId, next)

  await previous
  try {
    return await fn()
  } finally {
    release()
    if (store.locks.get(matchId) === next) store.locks.delete(matchId)
  }
}

/**
 * Serialises a mutation per match. With Redis this is a distributed lock
 * (`SET NX PX` + compare-and-delete), so two Vercel instances cannot apply the
 * same turn twice. Without Redis it degrades to an in-process mutex.
 */
export async function withMatchLock<T>(matchId: string, fn: () => Promise<T>): Promise<T> {
  const redis = getRedis()
  if (!redis) return withMemoryLock(matchId, fn)

  const token = randomUUID()
  const key = `${LOCK_PREFIX}${matchId}`
  const deadline = Date.now() + LOCK_WAIT_MS

  while (true) {
    try {
      const acquired = await redis.set(key, token, 'PX', LOCK_TTL_MS, 'NX')
      if (acquired === 'OK') {
        try {
          return await fn()
        } finally {
          await redis.eval(RELEASE_LOCK, 1, key, token).catch(() => undefined)
        }
      }
    } catch {
      // Redis connection dropped between reads. Keep the match playable on
      // this instance instead of failing the request.
      return withMemoryLock(matchId, fn)
    }
    if (Date.now() > deadline) throw new MinesStoreBusyError()
    await sleep(30)
  }
}

// ── turn clocks ─────────────────────────────────────────────

export async function scheduleClock(matchId: string, at: number): Promise<void> {
  store.clocks.set(matchId, at)
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.zadd(CLOCK_KEY, at, matchId)
  } catch {
    // local map already updated
  }
}

export async function clearClock(matchId: string): Promise<void> {
  store.clocks.delete(matchId)
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.zrem(CLOCK_KEY, matchId)
  } catch {
    // ignore
  }
}

/** Match ids whose shot clock expired, oldest first. */
export async function dueClocks(now: number, limit = 20): Promise<string[]> {
  const ids = new Set<string>()
  const redis = getRedis()
  if (redis) {
    try {
      const rows = await redis.zrangebyscore(CLOCK_KEY, '-inf', now, 'LIMIT', 0, limit)
      for (const id of rows) ids.add(id)
    } catch {
      // fall back to local map
    }
  }
  for (const [id, at] of store.clocks) {
    if (at <= now) ids.add(id)
  }
  return [...ids].slice(0, limit)
}

// ── presence ────────────────────────────────────────────────

export async function touchPresence(matchId: string, seat: MinesSeat, at: number): Promise<void> {
  const current = store.presence.get(matchId) ?? [null, null]
  current[seat] = at
  store.presence.set(matchId, current)

  const redis = getRedis()
  if (!redis) return
  try {
    await redis
      .multi()
      .hset(`${PRESENCE_PREFIX}${matchId}`, String(seat), String(at))
      .expire(`${PRESENCE_PREFIX}${matchId}`, 60 * 60)
      .exec()
  } catch {
    // local map stays fresh
  }
}

export async function readPresence(matchId: string): Promise<[number | null, number | null]> {
  const redis = getRedis()
  if (redis) {
    try {
      const hash = await redis.hgetall(`${PRESENCE_PREFIX}${matchId}`)
      if (Object.keys(hash).length > 0) {
        const presence: [number | null, number | null] = [
          hash['0'] ? Number(hash['0']) : null,
          hash['1'] ? Number(hash['1']) : null,
        ]
        store.presence.set(matchId, presence)
        return presence
      }
    } catch {
      // local map below
    }
  }
  return store.presence.get(matchId) ?? [null, null]
}

// ── ghost cursors ───────────────────────────────────────────

export async function writeCursor(
  matchId: string,
  seat: MinesSeat,
  cursor: MinesCursor,
): Promise<void> {
  const map = store.cursors.get(matchId) ?? {}
  map[seat] = cursor
  store.cursors.set(matchId, map)

  const redis = getRedis()
  if (!redis) return
  try {
    await redis
      .multi()
      .hset(`${CURSOR_PREFIX}${matchId}`, String(seat), JSON.stringify(cursor))
      .expire(`${CURSOR_PREFIX}${matchId}`, 60)
      .exec()
  } catch {
    // local map stays fresh
  }
}

export async function readCursors(matchId: string): Promise<MinesCursorMap> {
  const redis = getRedis()
  if (redis) {
    try {
      const hash = await redis.hgetall(`${CURSOR_PREFIX}${matchId}`)
      if (Object.keys(hash).length > 0) {
        const cursors: MinesCursorMap = {}
        for (const seat of [0, 1] as const) {
          const raw = hash[String(seat)]
          if (!raw) continue
          try {
            cursors[seat] = JSON.parse(raw) as MinesCursor
          } catch {
            // skip malformed entry
          }
        }
        store.cursors.set(matchId, cursors)
        return cursors
      }
    } catch {
      // local map below
    }
  }
  return store.cursors.get(matchId) ?? {}
}

/** Priming used after hydrating a match from Postgres. */
export async function primePresence(
  matchId: string,
  presence: [number | null, number | null],
): Promise<void> {
  store.presence.set(matchId, presence)
  const redis = getRedis()
  if (!redis) return
  try {
    await redis
      .multi()
      .hset(`${PRESENCE_PREFIX}${matchId}`, {
        '0': String(presence[0] ?? Date.now()),
        '1': String(presence[1] ?? Date.now()),
      })
      .expire(`${PRESENCE_PREFIX}${matchId}`, 60 * 60)
      .exec()
  } catch {
    // ignore
  }
}

import 'server-only'

import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import Redis from 'ioredis'
import type { MinesCursor, MinesMatchSnapshot, MinesSeat } from './types'

/**
 * Per-match realtime bus.
 *
 * Snapshots and ghost-cursor frames are published here and fanned out by the
 * SSE route. Locally the bus is a `globalThis` EventEmitter (Next.js compiles
 * each route into its own bundle, so a plain module singleton would not be
 * shared). When `REDIS_URL` is set, every frame is also published on Redis
 * pub/sub so instances in different regions/processes see each other.
 */

export type MinesCursorFrame = {
  matchId: string
  seat: MinesSeat
  cursor: MinesCursor
}

export type MinesServerEvent =
  | { id: string; type: 'snapshot'; matchId: string; snapshot: MinesMatchSnapshot }
  | { id: string; type: 'cursor'; matchId: string; frame: MinesCursorFrame }
  | { id: string; type: 'notice'; matchId: string; code: string; message: string }
  | { id: string; type: 'ping'; matchId: string; at: number }

type WithOptionalId<T> = T extends unknown ? Omit<T, 'id'> & { id?: string } : never
export type MinesEventInput = WithOptionalId<MinesServerEvent>

type BusGlobal = {
  emitter: EventEmitter
  publisher?: Redis | null
  subscriber?: Redis | null
  subscriberReady?: boolean
  recent: Map<string, number>
}

const holder = globalThis as typeof globalThis & { __toopsMinesBus?: BusGlobal }
const bus: BusGlobal = (holder.__toopsMinesBus ??= {
  emitter: new EventEmitter(),
  recent: new Map(),
})

function channelFor(matchId: string): string {
  return `mines:events:${matchId}`
}

function channelMatch(channel: string): string | null {
  const prefix = 'mines:events:'
  return channel.startsWith(prefix) ? channel.slice(prefix.length) : null
}

function remember(id: string): void {
  bus.recent.set(id, Date.now())
  if (bus.recent.size > 500) {
    const cutoff = Date.now() - 30_000
    for (const [key, at] of bus.recent) {
      if (at < cutoff) bus.recent.delete(key)
    }
  }
}

function redisOptions() {
  return {
    lazyConnect: true,
    connectTimeout: 2_000,
    commandTimeout: 1_500,
    maxRetriesPerRequest: 1,
    retryStrategy: (attempt: number) => Math.min(attempt * 400, 3_000),
  } as const
}

function getPublisher(): Redis | null {
  if (!process.env.REDIS_URL) return null
  if (bus.publisher !== undefined) return bus.publisher
  try {
    const client = new Redis(process.env.REDIS_URL, redisOptions())
    client.on('error', (error) => {
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[mines] realtime publish error:', error.message)
      }
    })
    bus.publisher = client
    return client
  } catch {
    bus.publisher = null
    return null
  }
}

function getSubscriber(): Redis | null {
  if (!process.env.REDIS_URL) return null
  if (bus.subscriber !== undefined) return bus.subscriber
  try {
    const client = new Redis(process.env.REDIS_URL, redisOptions())
    client.on('error', (error) => {
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[mines] realtime subscribe error:', error.message)
      }
    })
    bus.subscriber = client

    const subscribe = () => {
      client
        .psubscribe('mines:events:*')
        .then(() => {
          bus.subscriberReady = true
        })
        .catch(() => undefined)
    }

    client.on('pmessage', (_pattern, channel, payload) => {
      const matchId = channelMatch(channel)
      if (!matchId) return
      let event: MinesServerEvent
      try {
        event = JSON.parse(payload) as MinesServerEvent
      } catch {
        return
      }
      if (!event?.id) return
      // Our own publish is already delivered locally; skip the echo.
      if (bus.recent.has(event.id)) return
      remember(event.id)
      bus.emitter.emit(channelFor(matchId), event)
    })

    client.on('ready', subscribe)
    if (client.status === 'ready') subscribe()
    else void client.connect().catch(() => undefined)

    return client
  } catch {
    bus.subscriber = null
    return null
  }
}

/** Pushes one frame to local subscribers and, if configured, Redis. */
export async function publishMinesEvent(matchId: string, input: MinesEventInput): Promise<void> {
  const event = { ...input, id: input.id ?? randomUUID() } as MinesServerEvent
  remember(event.id)

  bus.emitter.emit(channelFor(matchId), event)

  const publisher = getPublisher()
  if (!publisher) return
  try {
    await publisher.publish(channelFor(matchId), JSON.stringify(event))
  } catch {
    // Local delivery already happened.
  }
}

/** Subscribes to one match. Returns an unsubscribe function. */
export async function subscribeMinesEvents(
  matchId: string,
  handler: (event: MinesServerEvent) => void,
): Promise<() => void> {
  const channel = channelFor(matchId)
  getSubscriber()
  bus.emitter.on(channel, handler)
  return () => {
    bus.emitter.off(channel, handler)
  }
}

/**
 * In-process wake-up used by the SSE route to enforce the 10-second clock even
 * when nobody is clicking. It piggybacks on the event emitter rather than
 * creating a timer per match on every instance.
 */
export function onMinesTick(handler: () => void): () => void {
  const timer = setInterval(handler, 1_000)
  return () => clearInterval(timer)
}

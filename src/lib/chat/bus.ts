import 'server-only'

import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import Redis from 'ioredis'
import type { ChatMessageView, ChatServerEvent } from './types'

/**
 * Chat realtime bus.
 *
 * Messages fan out through a `globalThis` EventEmitter (Next.js bundles each
 * route separately) and, when `REDIS_URL` is set, through Redis pub/sub so
 * every instance sees every message. Presence is global: each open stream is a
 * member of a Redis sorted set refreshed by its heartbeat, so a phone and a
 * desktop connected to different serverless instances see the same count.
 */

type BusGlobal = {
  emitter: EventEmitter
  publisher?: Redis | null
  subscriber?: Redis | null
  subscriberReady?: boolean
  recent: Map<string, number>
  connections: Set<string>
}

const holder = globalThis as typeof globalThis & { __toopsChatBus?: BusGlobal }
const bus: BusGlobal = (holder.__toopsChatBus ??= {
  emitter: new EventEmitter(),
  recent: new Map(),
  connections: new Set(),
})

const CHANNEL = 'chat:events:newcomers'
const REDIS_PATTERN = 'chat:events:*'
const PRESENCE_KEY = 'chat:presence:newcomers'
/** A stream that stops heartbeating for this long is considered gone. */
const PRESENCE_TTL_MS = 45_000

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
        console.warn('[chat] realtime publish error:', error.message)
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
        console.warn('[chat] realtime subscribe error:', error.message)
      }
    })
    bus.subscriber = client

    const subscribe = () => {
      client
        .psubscribe(REDIS_PATTERN)
        .then(() => {
          bus.subscriberReady = true
        })
        .catch(() => undefined)
    }

    client.on('pmessage', (_pattern, channel, payload) => {
      if (!channel.startsWith('chat:events:')) return
      let event: ChatServerEvent
      try {
        event = JSON.parse(payload) as ChatServerEvent
      } catch {
        return
      }
      if (!event?.id) return
      if (bus.recent.has(event.id)) return
      remember(event.id)
      bus.emitter.emit(CHANNEL, event)
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

function emitLocal(event: ChatServerEvent): void {
  bus.emitter.emit(CHANNEL, event)
}

/** Publishes a message to this instance and, if configured, to Redis. */
export async function publishChatMessage(message: ChatMessageView): Promise<void> {
  const event: ChatServerEvent = { id: randomUUID(), type: 'message', message }
  remember(event.id)
  emitLocal(event)

  const publisher = getPublisher()
  if (!publisher) return
  try {
    await publisher.publish(CHANNEL, JSON.stringify(event))
  } catch {
    // Local delivery already happened.
  }
}

/** Presence is broadcast to every instance, not just the one holding the stream. */
async function publishChatPresence(online: number): Promise<void> {
  const event: ChatServerEvent = { id: randomUUID(), type: 'presence', online }
  remember(event.id)
  emitLocal(event)

  const publisher = getPublisher()
  if (!publisher) return
  try {
    await publisher.publish(CHANNEL, JSON.stringify(event))
  } catch {
    // Local delivery already happened.
  }
}

/** Drops members that stopped heartbeating and returns the global count. */
async function redisPresenceCount(): Promise<number | null> {
  const redis = getPublisher()
  if (!redis) return null
  try {
    await redis.zremrangebyscore(PRESENCE_KEY, 0, Date.now() - PRESENCE_TTL_MS)
    const count = Number(await redis.zcard(PRESENCE_KEY))
    return Number.isFinite(count) ? count : null
  } catch {
    return null
  }
}

export async function subscribeChatEvents(
  handler: (event: ChatServerEvent) => void,
): Promise<() => void> {
  getSubscriber()
  bus.emitter.on(CHANNEL, handler)
  return () => {
    bus.emitter.off(CHANNEL, handler)
  }
}

export async function joinChatPresence(connectionId: string): Promise<number> {
  bus.connections.add(connectionId)
  const redis = getPublisher()

  if (redis) {
    try {
      await redis.zadd(PRESENCE_KEY, Date.now(), connectionId)
      await redis.pexpire(PRESENCE_KEY, PRESENCE_TTL_MS * 2)
      const count = await redisPresenceCount()
      if (count !== null) {
        await publishChatPresence(count)
        return count
      }
    } catch {
      // Fall through to the in-process count.
    }
  }

  const online = bus.connections.size
  await publishChatPresence(online)
  return online
}

/** Keeps this stream's presence entry fresh; stale entries expire. */
export async function touchChatPresence(connectionId: string): Promise<void> {
  if (!bus.connections.has(connectionId)) return
  const redis = getPublisher()
  if (!redis) return

  try {
    await redis.zadd(PRESENCE_KEY, Date.now(), connectionId)
    await redis.pexpire(PRESENCE_KEY, PRESENCE_TTL_MS * 2)
    const count = await redisPresenceCount()
    if (count !== null) await publishChatPresence(count)
  } catch {
    // The next heartbeat will try again.
  }
}

export async function leaveChatPresence(connectionId: string): Promise<void> {
  bus.connections.delete(connectionId)
  const redis = getPublisher()

  if (redis) {
    try {
      await redis.zrem(PRESENCE_KEY, connectionId)
      const count = await redisPresenceCount()
      await publishChatPresence(count ?? bus.connections.size)
      return
    } catch {
      // Fall through to the in-process count.
    }
  }

  await publishChatPresence(bus.connections.size)
}

export async function getChatOnlineCount(): Promise<number> {
  const count = await redisPresenceCount()
  return count ?? bus.connections.size
}

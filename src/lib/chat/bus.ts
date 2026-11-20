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
 * every instance sees every message. Presence is intentionally local: it is
 * the count of open chat streams on this instance, and broadcasting a local
 * count over Redis would make instances overwrite each other with wrong values.
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

/** Presence only matters on the instance holding the connections. */
export function publishChatPresence(online: number): void {
  emitLocal({ id: randomUUID(), type: 'presence', online })
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

export function joinChatPresence(connectionId: string): number {
  bus.connections.add(connectionId)
  const online = bus.connections.size
  publishChatPresence(online)
  return online
}

export function leaveChatPresence(connectionId: string): number {
  bus.connections.delete(connectionId)
  const online = bus.connections.size
  publishChatPresence(online)
  return online
}

export function getChatOnlineCount(): number {
  return bus.connections.size
}

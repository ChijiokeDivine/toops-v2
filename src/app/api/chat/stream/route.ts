import { randomUUID } from 'node:crypto'
import {
  joinChatPresence,
  leaveChatPresence,
  subscribeChatEvents,
  touchChatPresence,
} from '@/lib/chat/bus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** Long-lived stream; the platform closes it at `maxDuration` and EventSource reconnects. */
export const maxDuration = 300

/**
 * Server-Sent Events keeps chat realtime on serverless hosting. The message
 * POST writes the durable row and publishes it on the bus; this stream fans it
 * out to every open panel. Presence is the number of open streams across every
 * instance, kept in Redis and refreshed by the heartbeat below.
 */
export async function GET(request: Request) {
  const encoder = new TextEncoder()
  let cleanup: (() => void) | null = null

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const connectionId = randomUUID()
      let closed = false
      let unsubscribe: (() => void) | null = null
      let ping: ReturnType<typeof setInterval> | null = null
      let lifetime: ReturnType<typeof setTimeout> | null = null

      const send = (event: string, data: unknown) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          closed = true
        }
      }

      const close = () => {
        if (closed) return
        closed = true
        if (ping) clearInterval(ping)
        if (lifetime) clearTimeout(lifetime)
        unsubscribe?.()
        void leaveChatPresence(connectionId).catch(() => undefined)
        try {
          controller.close()
        } catch {
          // already closed
        }
      }

      cleanup = close
      request.signal.addEventListener('abort', close)

      unsubscribe = await subscribeChatEvents((event) => {
        if (event.type === 'message') send('chat', event.message)
        else if (event.type === 'presence') send('presence', { online: event.online })
        else if (event.type === 'ping') send('ping', { at: event.at })
      })

      if (closed) {
        unsubscribe()
        return
      }

      // Subscribe first, then announce presence so no message slips through the
      // gap between the initial snapshot and the live feed.
      const online = await joinChatPresence(connectionId)
      if (closed) {
        void leaveChatPresence(connectionId).catch(() => undefined)
        return
      }
      send('ready', { online, at: Date.now() })
      send('presence', { online })

      ping = setInterval(() => {
        void touchChatPresence(connectionId).catch(() => undefined)
        send('ping', { at: Date.now() })
      }, 15_000)

      // Close before the platform hard limit; EventSource reconnects and the
      // panel refetches the latest page on open, so nothing is lost.
      lifetime = setTimeout(close, 240_000)
    },
    cancel() {
      cleanup?.()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

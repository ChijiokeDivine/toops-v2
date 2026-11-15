import { MinesError, enforceMinesClock, getMinesMatchSnapshot } from '@/lib/mines/engine'
import { minesErrorResponse, requireMinesUserId } from '@/lib/mines/http'
import { subscribeMinesEvents } from '@/lib/mines/bus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** Long-lived stream; Vercel closes it at `maxDuration` and EventSource retries. */
export const maxDuration = 300

/**
 * Server-Sent Events is the realtime transport on Vercel: serverless functions
 * cannot accept a WebSocket upgrade. The shape is the same as a socket room —
 * snapshots on every turn and 20-25 cursor frames per second — while the POST
 * endpoints carry the upstream actions.
 */
export async function GET(request: Request) {
  try {
    const userId = await requireMinesUserId()
    const matchId = new URL(request.url).searchParams.get('matchId')?.trim()
    if (!matchId) {
      throw new MinesError('Match id is required.', 400, 'MATCH_ID_REQUIRED')
    }

    // Also proves the viewer is a player and advances a stale shot clock before
    // the stream opens.
    const { snapshot } = await getMinesMatchSnapshot(matchId, userId)

    const encoder = new TextEncoder()
    let cleanup: (() => void) | null = null

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false
        let clock: ReturnType<typeof setInterval> | null = null
        let ping: ReturnType<typeof setInterval> | null = null
        let lifetime: ReturnType<typeof setTimeout> | null = null
        let unsubscribe: (() => void) | null = null

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
          if (clock) clearInterval(clock)
          if (ping) clearInterval(ping)
          if (lifetime) clearTimeout(lifetime)
          unsubscribe?.()
          try {
            controller.close()
          } catch {
            // already closed
          }
        }

        cleanup = close
        request.signal.addEventListener('abort', close)

        unsubscribe = await subscribeMinesEvents(matchId, (event) => {
          if (event.type === 'snapshot') send('snapshot', event.snapshot)
          else if (event.type === 'cursor') send('cursor', event.frame)
          else if (event.type === 'notice') {
            send('notice', { code: event.code, message: event.message })
          }
        })

        if (closed) {
          unsubscribe()
          return
        }

        // Subscribe first, then seed the stream, so no turn can slip between
        // the initial snapshot and the live feed.
        send('snapshot', snapshot)
        send('ping', { at: Date.now() })

        // The shot clock is enforced here as well as on every request, so an
        // idle turn auto-picks even when both browsers are in the background.
        clock = setInterval(() => {
          void enforceMinesClock(matchId).catch(() => undefined)
        }, 1_000)

        ping = setInterval(() => send('ping', { at: Date.now() }), 15_000)

        // Close before the platform hard limit; EventSource reconnects with the
        // latest snapshot and no game state is lost.
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
  } catch (error) {
    return minesErrorResponse(error)
  }
}

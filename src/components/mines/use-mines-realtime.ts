'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MINES_CURSOR_INTERVAL_MS } from '@/lib/mines/config'
import type { MinesCursor, MinesMatchSnapshot, MinesSeat } from '@/lib/mines/types'

type CursorFrame = {
  matchId: string
  seat: MinesSeat
  cursor: MinesCursor
}

type Options = {
  matchId: string | null
  selfSeat: MinesSeat | null
  enabled: boolean
  onSnapshot: (snapshot: MinesMatchSnapshot) => void
  onCursor: (targetSeat: MinesSeat, cursor: MinesCursor) => void
  onNotice?: (message: string) => void
  onReconnect: () => void
}

/**
 * SSE subscriber for a live match. The server pushes a snapshot on every turn
 * and 20-25 ghost-cursor frames per second. `EventSource` reconnects on its own
 * after the platform's stream timeout.
 */
export function useMinesRealtime(options: Options) {
  const { matchId, selfSeat, enabled, onSnapshot, onCursor, onReconnect } = options
  const [connected, setConnected] = useState(false)
  const lastSentRef = useRef(0)

  const snapshotRef = useRef(onSnapshot)
  snapshotRef.current = onSnapshot
  const cursorRef = useRef(onCursor)
  cursorRef.current = onCursor
  const noticeRef = useRef(options.onNotice)
  noticeRef.current = options.onNotice
  const reconnectRef = useRef(onReconnect)
  reconnectRef.current = onReconnect
  const selfSeatRef = useRef<MinesSeat | null>(selfSeat)
  selfSeatRef.current = selfSeat

  useEffect(() => {
    if (!matchId || !enabled) {
      setConnected(false)
      return
    }

    let closed = false
    const source = new EventSource(`/api/mines/events?matchId=${encodeURIComponent(matchId)}`)

    const handleSnapshot = (event: MessageEvent<string>) => {
      try {
        const snapshot = JSON.parse(event.data) as MinesMatchSnapshot
        if (snapshot?.id === matchId) snapshotRef.current(snapshot)
      } catch {
        // ignore malformed frame
      }
    }

    const handleCursor = (event: MessageEvent<string>) => {
      try {
        const frame = JSON.parse(event.data) as CursorFrame
        if (frame?.matchId !== matchId) return
        const self = selfSeatRef.current
        if (self != null && frame.seat === self) return
        cursorRef.current(frame.seat, frame.cursor)
      } catch {
        // ignore malformed frame
      }
    }

    const handleOpen = () => {
      if (closed) return
      setConnected(true)
      reconnectRef.current()
    }

    const handleError = () => {
      if (!closed) setConnected(false)
    }

    const handleNotice = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as { message?: string }
        if (payload?.message) noticeRef.current?.(payload.message)
      } catch {
        // ignore malformed frame
      }
    }

    source.addEventListener('open', handleOpen)
    source.addEventListener('snapshot', handleSnapshot as EventListener)
    source.addEventListener('cursor', handleCursor as EventListener)
    source.addEventListener('notice', handleNotice as EventListener)
    source.addEventListener('error', handleError)

    return () => {
      closed = true
      source.removeEventListener('open', handleOpen)
      source.removeEventListener('snapshot', handleSnapshot as EventListener)
      source.removeEventListener('cursor', handleCursor as EventListener)
      source.removeEventListener('notice', handleNotice as EventListener)
      source.removeEventListener('error', handleError)
      source.close()
      setConnected(false)
    }
  }, [matchId, enabled])

  /** Upstream cursor frame, throttled to ~25 fps and only while visible. */
  const sendCursor = useCallback(
    (x: number, y: number, tile: number | null, force = false) => {
      if (!matchId || !enabled) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      const now = performance.now()
      if (!force && now - lastSentRef.current < MINES_CURSOR_INTERVAL_MS) return
      lastSentRef.current = now

      void fetch('/api/mines/cursor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, x, y, tile }),
        keepalive: true,
      }).catch(() => undefined)
    },
    [matchId, enabled],
  )

  return { connected, sendCursor }
}

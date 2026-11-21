// src/components/pocket-dice/use-pocket-dice.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  POCKET_DICE_POLL_ACTIVE_MS,
  POCKET_DICE_POLL_IDLE_MS,
} from '@/lib/pocket-dice/config'
import type { PocketDiceStateResponse } from '@/lib/pocket-dice/types'

export type PocketDiceNotice = { tone: 'info' | 'error' | 'success'; text: string } | null

/** The one seam between the Pocket Dice UI and `/api/pocket-dice/*`. */
export function usePocketDice() {
  const [state, setState] = useState<PocketDiceStateResponse | null>(null)
  const [authRequired, setAuthRequired] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<PocketDiceNotice>(null)
  const [clockOffsetMs, setClockOffsetMs] = useState(0)
  const authRef = useRef(false)

  const refresh = useCallback(async (): Promise<PocketDiceStateResponse | null> => {
    try {
      const response = await fetch('/api/pocket-dice/state', {
        cache: 'no-store',
        signal: AbortSignal.timeout(25_000),
      })
      if (response.status === 401) {
        authRef.current = true
        setAuthRequired(true)
        setState(null)
        setLoading(false)
        return null
      }
      const data = (await response.json().catch(() => null)) as
        | PocketDiceStateResponse
        | { error?: string }
        | null
      if (!response.ok || !data || 'error' in data) {
        setNotice({
          tone: 'error',
          text: (data as { error?: string } | null)?.error ?? 'Unable to load the game.',
        })
        setLoading(false)
        return null
      }
      const next = data as PocketDiceStateResponse
      const serverNowMs = new Date(next.serverNow).getTime()
      if (Number.isFinite(serverNowMs)) setClockOffsetMs(serverNowMs - Date.now())
      authRef.current = false
      setAuthRequired(false)
      setState(next)
      setLoading(false)
      return next
    } catch {
      setNotice({ tone: 'error', text: 'Unable to reach the game server.' })
      setLoading(false)
      return null
    }
  }, [])

  useEffect(() => {
    const control = { cancelled: false }
    const schedule: { timer?: number } = {}

    const run = async () => {
      const data = await refresh()
      if (control.cancelled) return
      const active = data?.match?.status === 'WAITING'
      const delay = authRef.current
        ? 2_500
        : active
          ? POCKET_DICE_POLL_ACTIVE_MS
          : POCKET_DICE_POLL_IDLE_MS
      schedule.timer = window.setTimeout(run, delay)
    }

    void run()
    return () => {
      control.cancelled = true
      if (schedule.timer) window.clearTimeout(schedule.timer)
    }
  }, [refresh])

  useEffect(() => {
    const resume = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('focus', resume)
    window.addEventListener('online', resume)
    return () => {
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('focus', resume)
      window.removeEventListener('online', resume)
    }
  }, [refresh])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), notice.tone === 'error' ? 6_500 : 4_000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const mutate = useCallback(
    async (path: string, body: unknown, label: string): Promise<boolean> => {
      setBusy(label)
      setNotice(null)
      try {
        const response = await fetch(path, {
          method: 'POST',
          headers: body == null ? undefined : { 'Content-Type': 'application/json' },
          body: body == null ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(25_000),
        })
        const data = (await response.json().catch(() => null)) as { error?: string } | null
        if (!response.ok) {
          setNotice({ tone: 'error', text: data?.error ?? 'Something went wrong.' })
          return false
        }
        return true
      } catch {
        setNotice({ tone: 'error', text: 'Network error.' })
        return false
      } finally {
        setBusy(null)
        void refresh()
      }
    },
    [refresh],
  )

  const join = useCallback(
    async (stake: string, pick: number): Promise<boolean> =>
      mutate('/api/pocket-dice/join', { stake, pick }, 'join'),
    [mutate],
  )

  const leave = useCallback(
    async (): Promise<boolean> => mutate('/api/pocket-dice/leave', null, 'leave'),
    [mutate],
  )

  const start = useCallback(
    async (): Promise<boolean> => mutate('/api/pocket-dice/start', null, 'start'),
    [mutate],
  )

  return {
    state,
    authRequired,
    loading,
    busy,
    notice,
    clockOffsetMs,
    refresh,
    join,
    leave,
    start,
  }
}

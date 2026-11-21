// src/components/roulette/use-roulette.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ROULETTE_POLL_OPEN_MS, ROULETTE_POLL_SPIN_MS } from '@/lib/roulette/config'
import type { RouletteOutcome } from '@/lib/roulette/rules'
import type { RouletteStateResponse } from '@/lib/roulette/types'

export type RouletteNotice = { tone: 'info' | 'error' | 'success'; text: string } | null

/** The one seam between the Roulette UI and `/api/roulette/*`. */
export function useRoulette() {
  const [state, setState] = useState<RouletteStateResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<RouletteNotice>(null)

  const refresh = useCallback(async (): Promise<RouletteStateResponse | null> => {
    try {
      const response = await fetch('/api/roulette/state', {
        cache: 'no-store',
        signal: AbortSignal.timeout(25_000),
      })
      const data = (await response.json().catch(() => null)) as
        | RouletteStateResponse
        | { error?: string }
        | null
      if (!response.ok || !data || 'error' in data) {
        setNotice({
          tone: 'error',
          text: (data as { error?: string } | null)?.error ?? 'Unable to load the table.',
        })
        setLoading(false)
        return null
      }

      const next = data as RouletteStateResponse
      setState(next)
      setLoading(false)
      return next
    } catch {
      setNotice({ tone: 'error', text: 'Unable to reach the game server.' })
      setLoading(false)
      return null
    }
  }, [])

  // the table is public, so it is polled whether or not the visitor is signed in
  useEffect(() => {
    const control = { cancelled: false }
    const schedule: { timer?: number } = {}

    const run = async () => {
      const data = await refresh()
      if (control.cancelled) return
      const delay = data?.round.status === 'BETTING' ? ROULETTE_POLL_OPEN_MS : ROULETTE_POLL_SPIN_MS
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
    async (): Promise<boolean> => mutate('/api/roulette/join', null, 'join'),
    [mutate],
  )

  const bet = useCallback(
    async (outcome: RouletteOutcome, amount: string): Promise<boolean> =>
      mutate('/api/roulette/bet', { outcome, amount }, 'bet'),
    [mutate],
  )

  return { state, loading, busy, notice, refresh, join, bet }
}

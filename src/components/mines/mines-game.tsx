'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { openAuth } from '@/components/auth/auth-events'
import {
  MINES_BOARD_SIZE,
  MINES_DEFAULT_STAKE_PUSD,
  MINES_HEARTBEAT_MS,
  MINES_POLL_IDLE_MS,
  MINES_POLL_LIVE_MS,
} from '@/lib/mines/config'
import type {
  MinesCursor,
  MinesMatchSnapshot,
  MinesSeat,
  MinesStateResponse,
  MinesTileView,
} from '@/lib/mines/types'
import { formatPusdUnits, parsePusdInput } from '@/lib/pusd'
import { FairnessDialog } from './fairness-dialog'
import { shortHash, usd } from './format'
import { MinesBoard } from './mines-board'
import { PlayerCard } from './player-card'
import { ResultOverlay } from './result-overlay'
import { SidePanel } from './side-panel'
import { TurnClock } from './turn-clock'
import { useMinesRealtime } from './use-mines-realtime'

type Notice = { tone: 'info' | 'error' | 'success'; text: string } | null

const HIDDEN_TILES: MinesTileView[] = Array.from({ length: MINES_BOARD_SIZE }, () => 'HIDDEN')

export function MinesGame() {
  const [state, setState] = useState<MinesStateResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [authRequired, setAuthRequired] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [stake, setStake] = useState(() => formatPusdUnits(MINES_DEFAULT_STAKE_PUSD))
  const [cursor, setCursor] = useState<MinesCursor | null>(null)
  const [pendingTile, setPendingTile] = useState<number | null>(null)
  const [fairnessOpen, setFairnessOpen] = useState(false)
  const [clockOffsetMs, setClockOffsetMs] = useState(0)
  const [nowTick, setNowTick] = useState(() => Date.now())

  const authRef = useRef(false)
  const readyKeyRef = useRef<string | null>(null)
  const settledRef = useRef<string | null>(null)
  const seatRef = useRef<MinesSeat | null>(null)
  const lastPositionRef = useRef({ x: 0.5, y: 0.5 })
  const cursorServerAtRef = useRef(0)

  const match = state?.match ?? null
  const seat = match?.viewer.seat ?? null
  seatRef.current = seat
  const matchId = match?.id ?? null
  const matchStatus = match?.status ?? null

  const refresh = useCallback(async (): Promise<MinesStateResponse | null> => {
    try {
      const response = await fetch('/api/mines/state', {
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
        MinesStateResponse | { error?: string } | null
      if (!response.ok || !data || 'error' in data) {
        setNotice({
          tone: 'error',
          text: (data as { error?: string } | null)?.error ?? 'Unable to load the game.',
        })
        setLoading(false)
        return null
      }

      const next = data as MinesStateResponse
      const serverNow = new Date(next.serverNow).getTime()
      if (Number.isFinite(serverNow)) setClockOffsetMs(serverNow - Date.now())

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

  // Polling remains the source of truth; SSE snapshots usually arrive first.
  useEffect(() => {
    const control = { cancelled: false }
    const timer = { id: 0 }

    const run = async () => {
      const data = await refresh()
      if (control.cancelled) return
      const delay = data?.match?.status === 'LIVE' ? MINES_POLL_LIVE_MS : MINES_POLL_IDLE_MS
      timer.id = window.setTimeout(() => void run(), delay)
    }

    void run()
    return () => {
      control.cancelled = true
      window.clearTimeout(timer.id)
    }
  }, [refresh])

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 100)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!state?.match?.stakePusd) return
    setStake(state.match.stakePusd)
  }, [state?.match?.stakePusd])

  // Mark both clients ready as soon as the match row appears.
  useEffect(() => {
    if (!matchId || matchStatus !== 'WAITING') return
    if (readyKeyRef.current === matchId) return
    readyKeyRef.current = matchId

    void fetch('/api/mines/ready', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchId }),
      signal: AbortSignal.timeout(20_000),
    })
      .then((response) => {
        if (!response.ok) readyKeyRef.current = null
      })
      .catch(() => {
        readyKeyRef.current = null
      })
  }, [matchId, matchStatus])

  // Presence is separate from the heavier state poll.
  useEffect(() => {
    if (!matchId || (matchStatus !== 'LIVE' && matchStatus !== 'WAITING')) return
    const control = { cancelled: false }

    const beat = () => {
      if (control.cancelled) return
      void fetch('/api/mines/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId }),
        cache: 'no-store',
        keepalive: true,
        signal: AbortSignal.timeout(20_000),
      }).catch(() => undefined)
    }

    beat()
    const timer = window.setInterval(beat, MINES_HEARTBEAT_MS)
    return () => {
      control.cancelled = true
      window.clearInterval(timer)
    }
  }, [matchId, matchStatus])

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

  const applyCursor = useCallback((incoming: MinesCursor) => {
    if (incoming.at <= cursorServerAtRef.current) return
    cursorServerAtRef.current = incoming.at
    // Normalise to the local clock so a skewed server clock cannot hide or
    // immortalise the ghost cursor.
    setCursor({ ...incoming, at: Date.now() })
  }, [])

  const applySnapshot = useCallback(
    (snapshot: MinesMatchSnapshot) => {
      const serverNow = new Date(snapshot.serverNow).getTime()
      if (Number.isFinite(serverNow)) setClockOffsetMs(serverNow - Date.now())

      const self = seatRef.current
      if (self != null) {
        const other = self === 0 ? 1 : 0
        const incoming = snapshot.cursors?.[other]
        if (incoming) applyCursor(incoming)
      }

      setState((previous) => {
        if (!previous?.match || previous.match.id !== snapshot.id) return previous
        const viewerSeat = previous.match.viewer.seat
        const canPick =
          snapshot.status === 'LIVE' &&
          viewerSeat != null &&
          snapshot.turn === viewerSeat &&
          snapshot.winnerSeat == null &&
          snapshot.turnDeadline != null
        return {
          ...previous,
          serverNow: snapshot.serverNow,
          match: {
            ...previous.match,
            ...snapshot,
            viewer: { ...previous.match.viewer, canPick, isPlayer: viewerSeat != null },
          },
        }
      })

      if (snapshot.status === 'SETTLED' || snapshot.status === 'CANCELLED') {
        if (settledRef.current !== snapshot.id) {
          settledRef.current = snapshot.id
          void refresh()
        }
      }
    },
    [applyCursor, refresh],
  )

  useEffect(() => {
    setCursor(null)
    cursorServerAtRef.current = 0
  }, [matchId])

  const { connected, sendCursor } = useMinesRealtime({
    matchId,
    selfSeat: seat,
    enabled: matchStatus === 'LIVE' || matchStatus === 'WAITING',
    onSnapshot: applySnapshot,
    onCursor: (_targetSeat, nextCursor) => applyCursor(nextCursor),
    onNotice: (message) => setNotice({ tone: 'info', text: message }),
    onReconnect: () => {
      void refresh()
    },
  })

  const clockNow = nowTick + clockOffsetMs
  const msLeft = match?.turnDeadline != null ? Math.max(0, match.turnDeadline - clockNow) : 0
  const canPick =
    match != null &&
    match.status === 'LIVE' &&
    seat != null &&
    match.turn === seat &&
    match.winnerSeat == null &&
    msLeft > 0

  const self = useMemo(
    () => match?.players.find((player) => player.seat === seat) ?? null,
    [match, seat],
  )
  const opponent = useMemo(
    () => match?.players.find((player) => player.seat !== seat) ?? null,
    [match, seat],
  )
  const opponentName = opponent?.displayName ?? 'Opponent'

  const pick = useCallback(
    async (tile: number) => {
      if (!matchId || !canPick || pendingTile != null) return
      setPendingTile(tile)
      setNotice(null)
      try {
        const response = await fetch('/api/mines/pick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matchId, tile }),
          signal: AbortSignal.timeout(20_000),
        })
        const data = (await response.json().catch(() => null)) as {
          ok?: boolean
          snapshot?: MinesMatchSnapshot
          error?: string
        } | null
        if (!response.ok || !data?.ok || !data.snapshot) {
          throw new Error(data?.error ?? 'That pick was not accepted.')
        }
        applySnapshot(data.snapshot)
        void refresh()
      } catch (error) {
        setNotice({
          tone: 'error',
          text: error instanceof Error ? error.message : 'That pick was not accepted.',
        })
      } finally {
        setPendingTile(null)
      }
    },
    [applySnapshot, canPick, matchId, pendingTile, refresh],
  )

  const join = useCallback(async () => {
    if (authRequired) {
      openAuth({ view: 'telegram' })
      return
    }
    const units = parsePusdInput(stake)
    if (!units) {
      setNotice({ tone: 'error', text: 'Enter a valid stake of at least $2.00.' })
      return
    }

    setBusy('queue')
    setNotice(null)
    try {
      const response = await fetch('/api/mines/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stake: formatPusdUnits(units) }),
        signal: AbortSignal.timeout(25_000),
      })
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean
        error?: string
      } | null
      if (!response.ok) throw new Error(data?.error ?? 'Unable to join the queue.')
      await refresh()
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Unable to join the queue.',
      })
    } finally {
      setBusy(null)
    }
  }, [authRequired, refresh, stake])

  const cancelQueue = useCallback(async () => {
    setBusy('leave-queue')
    setNotice(null)
    try {
      const response = await fetch('/api/mines/queue', {
        method: 'DELETE',
        signal: AbortSignal.timeout(25_000),
      })
      const data = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(data?.error ?? 'Unable to cancel the search.')
      await refresh()
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Unable to cancel the search.',
      })
    } finally {
      setBusy(null)
    }
  }, [refresh])

  const dismiss = useCallback(async () => {
    if (!matchId) return
    setBusy('dismiss')
    try {
      await fetch('/api/mines/match', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId }),
        signal: AbortSignal.timeout(20_000),
      })
      setCursor(null)
      setState((previous) => (previous ? { ...previous, match: null, queue: null } : previous))
      void refresh()
    } finally {
      setBusy(null)
    }
  }, [matchId, refresh])

  const playAgain = useCallback(() => {
    if (match?.stakePusd) setStake(match.stakePusd)
    void join()
  }, [join, match?.stakePusd])

  const handleCursorMove = useCallback(
    (x: number, y: number, tile: number | null) => {
      lastPositionRef.current = { x, y }
      sendCursor(x, y, tile)
    },
    [sendCursor],
  )

  const handleCursorLeave = useCallback(() => {
    const position = lastPositionRef.current
    sendCursor(position.x, position.y, null, true)
  }, [sendCursor])

  const tiles = match?.tiles ?? HIDDEN_TILES
  const finished = matchStatus === 'SETTLED' || matchStatus === 'CANCELLED'
  const pot = match?.potPusd ?? '4.00'

  return (
    <div className="mn-shell">
      <section className="mn-stage" aria-label="Mines game">
        {match && opponent && self ? (
          <div className="mn-stage-head">
            <div className="mn-players">
              <PlayerCard
                player={opponent}
                isSelf={false}
                isTurn={match.turn === opponent.seat}
                live={matchStatus === 'LIVE'}
              />
              <TurnClock
                status={matchStatus ?? 'WAITING'}
                turn={match.turn}
                selfSeat={seat}
                msLeft={msLeft}
                opponentName={opponentName}
              />
              <PlayerCard
                player={self}
                isSelf
                isTurn={match.turn === self.seat}
                live={matchStatus === 'LIVE'}
              />
            </div>
          </div>
        ) : null}

        <div className="mn-board-area">
          <MinesBoard
            tiles={tiles}
            interactive={canPick && !finished}
            pendingTile={pendingTile}
            lastPick={match?.lastPick ?? null}
            opponentCursor={cursor}
            onPick={(tile) => void pick(tile)}
            onCursorMove={handleCursorMove}
            onCursorLeave={handleCursorLeave}
          />

          {finished && match ? (
            <ResultOverlay
              match={match}
              selfSeat={seat}
              busy={busy}
              onPlayAgain={playAgain}
              onDismiss={() => void dismiss()}
              onVerify={() => setFairnessOpen(true)}
            />
          ) : null}
        </div>

        <div className="mn-meta">
          <span className="mn-meta-pot">
            Pot <strong>{usd(pot)}</strong>
          </span>
          <span className="mn-meta-sep" aria-hidden="true" />
          <span
            className="mn-meta-hash"
            title={match?.serverSeedHash ?? 'Server seed hash appears when a match starts'}
          >
            Hash {shortHash(match?.serverSeedHash ?? '')}
          </span>
          <span className="mn-meta-grow" />
          {match?.status === 'LIVE' ? (
            <span className="mn-meta-live">
              <span className={`mn-status-dot${connected ? ' is-live' : ''}`} />
              {connected ? 'Live' : 'Polling'}
            </span>
          ) : null}
        </div>
      </section>

      <SidePanel
        authRequired={authRequired}
        stake={stake}
        onStakeChange={setStake}
        balance={state?.user.balancePusd ?? null}
        match={match}
        queue={state?.queue ?? null}
        busy={busy}
        notice={notice}
        onJoin={() => void join()}
        onCancelQueue={() => void cancelQueue()}
        onDismiss={() => void dismiss()}
        onPlayAgain={playAgain}
        onSignIn={() => openAuth({ view: 'telegram' })}
        now={nowTick}
      />

      <FairnessDialog
        open={fairnessOpen}
        onClose={() => setFairnessOpen(false)}
        match={match}
        clientSeed={state?.user.clientSeed ?? null}
      />

      {loading ? <span className="mn-sr-only">Loading Mines Duel…</span> : null}
    </div>
  )
}

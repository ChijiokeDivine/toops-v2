'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { openAuth } from '@/components/auth/auth-events'
import { ROULETTE_BETTING_WINDOW_MS } from '@/lib/roulette/config'
import { ROULETTE_OUTCOMES } from '@/lib/roulette/rules'
import { BetPanel, money } from './bet-panel'
import { OutcomeIcon, SoundOffIcon, SoundOnIcon } from './icons'
import { RouletteDemo } from './roulette-demo'
import { RouletteStrip } from './roulette-strip'
import * as sfx from './sfx'
import { MIN_BET, OUTCOME_LABEL, type Bet, type Outcome, type Phase } from './types'
import { useRoulette } from './use-roulette'

const MINI: Record<Outcome, string> = {
  red: 'bg-[#c6252f] text-[#6e1218]',
  black: 'bg-[#232b36] text-[#0f1318]',
  green: 'bg-[#12a560] text-[#05391f]',
}

function MiniTile({ outcome, size = 16 }: { outcome: Outcome; size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className={`grid shrink-0 place-items-center rounded-[4px] ${MINI[outcome]}`}
    >
      <OutcomeIcon outcome={outcome} className="h-[68%] w-[68%]" />
    </span>
  )
}

export function RouletteGame() {
  const table = useRoulette()
  const [phase, setPhase] = useState<Phase>('betting')
  const [winner, setWinner] = useState<Outcome | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [amount, setAmount] = useState('')
  const [started, setStarted] = useState(false)
  const [muted, setMuted] = useState(false)
  const [spinId, setSpinId] = useState(0)

  const animatedRef = useRef<string | null>(null)
  const knownBettorsRef = useRef<Set<string>>(new Set())
  const beepRef = useRef(-1)

  const round = table.state?.round ?? null
  const user = table.state?.user ?? null
  const signedIn = table.state?.signedIn ?? false
  const history = table.state?.history.outcomes ?? []
  const counts = table.state?.history.counts ?? { red: 0, black: 0, green: 0 }

  const roundId = round?.id ?? null
  const roundStatus = round?.status ?? null
  const closesAt = round?.closesAt ?? null
  const serverNow = round?.serverNow ?? null

  const balance = Number(user?.balancePusd ?? 0)
  const myPick = round?.viewer.outcome ?? null
  const payoutPusd = round?.viewer.payoutPusd ?? '0.00'

  // sound: restore the saved mute choice, unlock audio on the first click / key press
  useEffect(() => {
    setMuted(sfx.isMuted())
    const unlock = () => sfx.unlock()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    sfx.setMuted(next)
  }

  // the round on the server drives the phase: betting, spin, then the result pause
  useEffect(() => {
    if (!round) return

    if (round.status === 'BETTING') {
      animatedRef.current = null
      setPhase('betting')
      setWinner(null)
      return
    }

    if (round.status === 'CANCELLED') {
      animatedRef.current = round.id
      setPhase('result')
      setWinner(null)
      return
    }

    if (animatedRef.current === round.id) return
    animatedRef.current = round.id
    setWinner(round.outcome)
    setSpinId((n) => n + 1)
    setPhase('spinning')
  }, [round])

  // countdown, measured against the server's clock so a skewed device still agrees
  useEffect(() => {
    if (roundStatus !== 'BETTING' || !closesAt || !serverNow) {
      setRemaining(0)
      return
    }
    const closeMs = new Date(closesAt).getTime()
    const offsetMs = new Date(serverNow).getTime() - Date.now()
    const tick = () => setRemaining(Math.max(0, closeMs - (Date.now() + offsetMs)))
    tick()
    const id = window.setInterval(tick, 80)
    return () => window.clearInterval(id)
  }, [roundStatus, closesAt, serverNow])

  useEffect(() => {
    beepRef.current = -1
  }, [roundId])

  // countdown ticks through the last three seconds before the wheel rolls
  useEffect(() => {
    if (phase !== 'betting') return
    const seconds = Math.ceil(remaining / 1000)
    if (seconds > 0 && seconds <= 3 && seconds !== beepRef.current) {
      beepRef.current = seconds
      sfx.beep()
    }
  }, [phase, remaining])

  // a quiet blip as other players put chips on the table
  useEffect(() => {
    if (!round) return
    const seen = knownBettorsRef.current
    if (round.status !== 'BETTING') {
      seen.clear()
      return
    }
    for (const outcome of ROULETTE_OUTCOMES) {
      for (const bettor of round.bettors[outcome]) {
        if (seen.has(bettor.userId)) continue
        seen.add(bettor.userId)
        if (!bettor.isSelf) sfx.blip()
      }
    }
  }, [round])

  // a staked round keeps the table open across a refresh
  useEffect(() => {
    if (myPick) setStarted(true)
  }, [myPick])

  const handleSettled = useCallback(() => {
    setPhase((current) => (current === 'spinning' ? 'result' : current))
    if (!winner) return
    const won = Number(payoutPusd) > 0
    sfx.result(winner, myPick ? (won ? 'win' : 'lose') : null)
  }, [winner, payoutPusd, myPick])

  const startGame = useCallback(() => {
    if (started || table.busy) return
    if (!signedIn) {
      openAuth({ view: 'telegram' })
      return
    }
    void (async () => {
      const ok = await table.join()
      if (ok) {
        setStarted(true)
        sfx.chip()
      }
    })()
  }, [started, signedIn, table])

  const placeBet = useCallback(
    (outcome: Outcome) => {
      if (!started || table.busy || !round) return
      const value = Number.parseFloat(amount) || 0
      if (round.status !== 'BETTING' || value < MIN_BET || value > balance) return
      if (myPick && myPick !== outcome) return // one colour per round
      void (async () => {
        const ok = await table.bet(outcome, amount)
        if (ok) {
          setAmount('')
          sfx.chip()
        }
      })()
    },
    [started, table, round, amount, balance, myPick],
  )

  const panelBets = useMemo<Record<Outcome, Bet[]>>(() => {
    const next: Record<Outcome, Bet[]> = { red: [], black: [], green: [] }
    if (!round) return next
    for (const outcome of ROULETTE_OUTCOMES) {
      next[outcome] = round.bettors[outcome].map((bettor) => ({
        id: bettor.userId,
        name: bettor.isSelf ? 'You' : bettor.displayName,
        amount: Number(bettor.amountPusd),
      }))
    }
    return next
  }, [round])

  if (table.loading && !round) {
    return (
      <section className="mx-auto grid min-h-[420px] w-full place-items-center overflow-hidden rounded-2xl border border-[#161d26] bg-[#0b0f14]">
        <p className="text-[13px] font-semibold text-[#8993a3]">Loading the table…</p>
      </section>
    )
  }

  // Nothing real to reveal while the table is empty: the ambient demo wheel
  // spins instead of a frozen strip. Real chips hand over to the live strip.
  const liveBets = round
    ? ROULETTE_OUTCOMES.reduce((count, outcome) => count + round.bettors[outcome].length, 0)
    : 0

  const label =
    phase === 'betting'
      ? 'STARTING IN'
      : phase === 'spinning'
        ? 'ROLLING'
        : winner
          ? `${OUTCOME_LABEL[winner].toUpperCase()} WINS`
          : 'NO BETS — NEXT ROUND'

  return (
    <section className="mx-auto w-full overflow-hidden rounded-2xl border border-[#161d26] bg-[#0b0f14] pb-10">
      {table.notice ? (
        <div
          role="status"
          className={`mx-5 mt-5 rounded-lg border px-3 py-2 text-[12px] font-medium sm:mx-9 ${
            table.notice.tone === 'error'
              ? 'border-[#c9343d]/35 bg-[#c9343d]/10 text-[#ffb4b8]'
              : 'border-white/[0.08] bg-white/[0.04] text-white/70'
          }`}
        >
          {table.notice.text}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 pt-7 text-[12px] font-semibold text-[#8993a3] sm:px-9">
        <div className="flex items-center gap-3">
          <span>LAST 10</span>
          <ul className="flex gap-1.5">
            {history.map((o, i) => (
              <li key={`${i}-${o}`}>
                <MiniTile outcome={o} />
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center gap-4">
          <span>LAST 100</span>
          {(['red', 'black', 'green'] as const).map((o) => (
            <span key={o} className="flex items-center gap-1.5 text-[13px] font-bold text-white">
              <MiniTile outcome={o} size={18} />
              {counts[o]}
            </span>
          ))}
          <button
            type="button"
            onClick={toggleMute}
            aria-pressed={muted}
            aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
            className="-mr-1.5 grid h-7 w-7 place-items-center rounded-md text-[#8993a3] transition-colors hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1fd36b]"
          >
            {muted ? <SoundOffIcon className="h-4 w-4" /> : <SoundOnIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="mt-6">
        {liveBets === 0 ? (
          <RouletteDemo />
        ) : (
          <RouletteStrip
            phase={phase}
            target={winner}
            spinId={spinId}
            onSettled={handleSettled}
            targetIndex={winner ? round?.slot ?? null : null}
          />
        )}
      </div>

      <div role="status" className="mx-auto mt-5 w-full max-w-[582px] px-4 text-center">
        <p className="text-[12px] font-semibold text-[#8993a3]">
          {label}{' '}
          {phase === 'betting' && (
            <span className="font-bold tabular-nums text-white">{(remaining / 1000).toFixed(2)}</span>
          )}
          {phase === 'result' && (round?.voidSpins ?? 0) > 0 ? (
            <span className="text-[#7b8594]"> · respun {round?.voidSpins}×</span>
          ) : null}
        </p>
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[#1a212a]">
          <div
            className="h-full rounded-full bg-[#1fd36b]"
            style={{
              width:
                phase === 'betting' ? `${(remaining / ROULETTE_BETTING_WINDOW_MS) * 100}%` : '0%',
            }}
          />
        </div>
        {Number(payoutPusd) > 0 && phase === 'result' && (
          <p className="mt-2 text-[13px] font-bold text-[#1fd36b]">You won {money(Number(payoutPusd))}</p>
        )}
      </div>

      <div className="mx-auto mt-5 w-full max-w-[980px] px-4">
        <BetPanel
          amount={amount}
          onAmountChange={setAmount}
          balance={balance}
          phase={phase}
          winner={winner}
          myPick={myPick}
          bets={panelBets}
          started={started}
          onStart={startGame}
          onBet={placeBet}
        />
      </div>
    </section>
  )
}

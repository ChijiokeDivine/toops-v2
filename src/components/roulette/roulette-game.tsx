'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { BetPanel, money } from './bet-panel'
import { OutcomeIcon, SoundOffIcon, SoundOnIcon } from './icons'
import { RouletteStrip } from './roulette-strip'
import * as sfx from './sfx'
import { OUTCOME_LABEL, SLOT_PATTERN, type Bet, type Outcome, type Phase } from './types'

const BETTING_MS = 15000
const RESULT_MS = 3500
const START_BALANCE = 250
const MIN_PLAYERS = 2
const MAX_PLAYERS = 20

const EMPTY_BETS: Record<Outcome, Bet[]> = { red: [], black: [], green: [] }

// Placeholder data: replace with your API / socket feed.
const INITIAL_HISTORY: Outcome[] = ['red', 'red', 'black', 'black', 'red', 'red', 'black', 'black', 'red', 'red']
const LAST_100 = { red: 56, black: 42, green: 2 }

// Demo players that bet during each betting window (set demo={false} once real data is wired in).
const BOT_NAMES = ['Kairo', 'Mina', 'Sol', 'Tayo', 'Zed', 'Ivy', 'Obi', 'Nova', 'Rex', 'Lumi', 'Ada', 'Jax']
const BOT_AMOUNTS = [1, 2, 5, 5, 10, 10, 25, 25, 50, 100, 250]

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

const sumOf = (list: Bet[]) => list.reduce((s, b) => s + b.amount, 0)

const countBettors = (bets: Record<Outcome, Bet[]>) =>
  bets.red.length + bets.black.length + bets.green.length

function randomHex(bytes: number) {
  const out = new Uint8Array(bytes)
  crypto.getRandomValues(out)
  return Array.from(out, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Provably fair roll: HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}`) mapped onto the 15-slot
 * wheel (7 red, 7 black, 1 green). The server seed is generated at the start of each round and the
 * nonce increments on every spin, including replays.
 */
async function rollFair(serverSeed: string, clientSeed: string, nonce: number): Promise<Outcome> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(serverSeed), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${clientSeed}:${nonce}`))
  const bytes = new Uint8Array(sig)
  const value = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0
  return SLOT_PATTERN[value % SLOT_PATTERN.length]
}

function botOutcome(): Outcome {
  const r = Math.random()
  return r < 0.45 ? 'red' : r < 0.9 ? 'black' : 'green'
}

export function RouletteGame({ demo = true }: { demo?: boolean }) {
  const [phase, setPhase] = useState<Phase>('betting')
  const [remaining, setRemaining] = useState(BETTING_MS)
  const [winner, setWinner] = useState<Outcome | null>(null)
  const [history, setHistory] = useState<Outcome[]>(INITIAL_HISTORY)
  const [amount, setAmount] = useState('')
  const [balance, setBalance] = useState(START_BALANCE)
  const [bets, setBets] = useState(EMPTY_BETS)
  const [myPick, setMyPick] = useState<Outcome | null>(null)
  const [payout, setPayout] = useState<number | null>(null)
  const [muted, setMuted] = useState(false)
  const [started, setStarted] = useState(false)
  const [roundKey, setRoundKey] = useState(0)
  const [spinId, setSpinId] = useState(0)

  const betsRef = useRef(bets)
  betsRef.current = bets
  const winnerRef = useRef<Outcome | null>(null)
  const lastBeepRef = useRef(-1)
  const serverSeedRef = useRef('')
  const clientSeedRef = useRef('')
  const nonceRef = useRef(0)

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

  const addBet = useCallback((outcome: Outcome, id: string, name: string, value: number) => {
    setBets((prev) => {
      const exists = prev[outcome].some((b) => b.id === id)
      const list = exists
        ? prev[outcome].map((b) => (b.id === id ? { ...b, amount: b.amount + value } : b))
        : [...prev[outcome], { id, name, amount: value }]
      return { ...prev, [outcome]: list }
    })
  }, [])

  // betting countdown -> spin
  useEffect(() => {
    if (phase !== 'betting') return
    if (!clientSeedRef.current) clientSeedRef.current = randomHex(16)
    serverSeedRef.current = randomHex(32)
    nonceRef.current = 0
    const end = Date.now() + BETTING_MS
    lastBeepRef.current = -1
    setRemaining(BETTING_MS)
    const id = setInterval(() => {
      const left = Math.max(0, end - Date.now())
      setRemaining(left)
      const sec = Math.ceil(left / 1000)
      if (sec !== lastBeepRef.current) {
        lastBeepRef.current = sec
        if (sec > 0 && sec <= 3) sfx.beep()
      }
      if (left === 0) {
        clearInterval(id)
        const all = betsRef.current
        // a round needs at least two players; otherwise it is void and restarts
        if (countBettors(all) < MIN_PLAYERS) {
          const mine = [...all.red, ...all.black, ...all.green].filter((b) => b.id === 'me')
          if (mine.length > 0) setBalance((b) => b + sumOf(mine))
          setBets(EMPTY_BETS)
          setMyPick(null)
          setAmount('')
          setRoundKey((k) => k + 1)
          return
        }
        void rollFair(serverSeedRef.current, clientSeedRef.current, nonceRef.current).then((result) => {
          winnerRef.current = result
          setWinner(result)
          setSpinId((n) => n + 1)
          setPhase('spinning')
        })
      }
    }, 50)
    return () => clearInterval(id)
  }, [phase, roundKey])

  // demo players join during the betting window
  useEffect(() => {
    if (!demo || phase !== 'betting') return
    const count = 6 + Math.floor(Math.random() * 5)
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5)
    const timers = Array.from({ length: count }, (_, i) =>
      setTimeout(() => {
        if (countBettors(betsRef.current) >= MAX_PLAYERS) return
        const amountPick = BOT_AMOUNTS[Math.floor(Math.random() * BOT_AMOUNTS.length)]
        addBet(botOutcome(), `bot-${i}`, names[i], amountPick)
        sfx.blip()
      }, 600 + Math.random() * (BETTING_MS - 3500)),
    )
    return () => timers.forEach(clearTimeout)
  }, [demo, phase, addBet])

  // result pause -> next round
  useEffect(() => {
    if (phase !== 'result') return
    const id = setTimeout(() => {
      setBets(EMPTY_BETS)
      setMyPick(null)
      setWinner(null)
      setPayout(null)
      winnerRef.current = null
      setPhase('betting')
    }, RESULT_MS)
    return () => clearTimeout(id)
  }, [phase])

  const handleSettled = useCallback(() => {
    const w = winnerRef.current
    if (!w) return
    const all = betsRef.current
    if (all[w].length === 0) {
      // nobody backed this outcome: the round is void and replays with the same pool
      const nonce = ++nonceRef.current
      void rollFair(serverSeedRef.current, clientSeedRef.current, nonce).then((next) => {
        winnerRef.current = next
        setWinner(next)
        setSpinId((n) => n + 1)
      })
      return
    }
    const mine = all[w].find((b) => b.id === 'me')
    const hadBet = (Object.keys(all) as Outcome[]).some((o) => all[o].some((b) => b.id === 'me'))
    if (mine) {
      // pool is shared in proportion to each winner's stake
      const pool = sumOf(all.red) + sumOf(all.black) + sumOf(all.green)
      const won = (pool * mine.amount) / sumOf(all[w])
      setPayout(won)
      setBalance((b) => b + won)
    }
    sfx.result(w, mine ? 'win' : hadBet ? 'lose' : null)
    setHistory((h) => [w, ...h].slice(0, 10))
    setPhase('result')
  }, [])

  const startGame = () => {
    if (started) return
    setStarted(true)
    setBets(EMPTY_BETS)
    setMyPick(null)
    setWinner(null)
    setPayout(null)
    winnerRef.current = null
    setPhase('betting')
    setRoundKey((k) => k + 1)
    sfx.chip()
  }

  const placeBet = (outcome: Outcome) => {
    if (!started) return
    const value = Number.parseFloat(amount) || 0
    if (phase !== 'betting' || value <= 0 || value > balance) return
    if (myPick && myPick !== outcome) return // one outcome per round
    if (!myPick && countBettors(betsRef.current) >= MAX_PLAYERS) return
    addBet(outcome, 'me', 'You', value)
    setMyPick(outcome)
    setBalance((b) => b - value)
    setAmount('')
    sfx.chip()
  }

  const label =
    phase === 'betting' ? 'STARTING IN' : phase === 'spinning' ? 'ROLLING' : `${OUTCOME_LABEL[winner ?? 'red'].toUpperCase()} WINS`

  return (
    <section className="mx-auto w-full overflow-hidden rounded-2xl border border-[#161d26] bg-[#0b0f14] pb-10">
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
              {LAST_100[o]}
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
        <RouletteStrip phase={phase} target={winner} spinId={spinId} onSettled={handleSettled} />
      </div>

      <div role="status" className="mx-auto mt-5 w-full max-w-[582px] px-4 text-center">
        <p className="text-[12px] font-semibold text-[#8993a3]">
          {label}{' '}
          {phase === 'betting' && (
            <span className="font-bold tabular-nums text-white">{(remaining / 1000).toFixed(2)}</span>
          )}
        </p>
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[#1a212a]">
          <div
            className="h-full rounded-full bg-[#1fd36b]"
            style={{ width: phase === 'betting' ? `${(remaining / BETTING_MS) * 100}%` : '0%' }}
          />
        </div>
        {payout !== null && (
          <p className="mt-2 text-[13px] font-bold text-[#1fd36b]">You won {money(payout)}</p>
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
          bets={bets}
          started={started}
          onStart={startGame}
          onBet={placeBet}
        />
      </div>
    </section>
  )
}

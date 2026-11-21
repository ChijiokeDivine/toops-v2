'use client'

import type { ChangeEvent } from 'react'

import { DollarBadge, OutcomeIcon, PlayIcon, UsersIcon } from './icons'
import { MIN_BET, OUTCOME_LABEL, type Bet, type Outcome, type Phase } from './types'

const ORDER: Outcome[] = ['black', 'green', 'red']

const BUTTON_STYLES: Record<Outcome, { idle: string; ready: string }> = {
  black: {
    idle: 'bg-[#1a2029] text-[#667184]',
    ready: 'bg-[#2b3543] text-white hover:bg-[#344052]',
  },
  green: {
    idle: 'bg-[linear-gradient(90deg,#0b6b3f,#0d8450)] text-[#b3efcd]',
    ready: 'bg-[linear-gradient(90deg,#0f8a50,#14a860)] text-white hover:brightness-110',
  },
  red: {
    idle: 'bg-[#5a1b20] text-[#d2666c]',
    ready: 'bg-[linear-gradient(90deg,#a81d29,#c4222f)] text-white hover:brightness-110',
  },
}

export const money = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const toField = (n: number) => (n > 0 ? String(Number(n.toFixed(2))) : '')

interface BetPanelProps {
  amount: string
  onAmountChange: (value: string) => void
  balance: number
  phase: Phase
  winner: Outcome | null
  myPick: Outcome | null
  bets: Record<Outcome, Bet[]>
  started: boolean
  onStart: () => void
  onBet: (outcome: Outcome) => void
}

export function BetPanel({
  amount,
  onAmountChange,
  balance,
  phase,
  winner,
  myPick,
  bets,
  started,
  onStart,
  onBet,
}: BetPanelProps) {
  const value = Number.parseFloat(amount) || 0
  const locked = phase !== 'betting' || !started

  const canBet = (o: Outcome) =>
    !locked && value >= MIN_BET && value <= balance && (myPick === null || myPick === o)

  const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value.replace(/^\$/, '')
    if (/^\d*\.?\d{0,2}$/.test(next)) onAmountChange(next)
  }

  const segment =
    'px-2.5 text-[13px] font-bold text-white transition-colors hover:bg-white/5 disabled:opacity-40 sm:px-4 sm:text-[14px]'

  return (
    <div>
      <div className="flex items-center justify-between text-[13px] text-[#8993a3]">
        <span>Bet Amount</span>
        <span>{value.toFixed(2)} USD</span>
      </div>

      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <div className="flex h-11 min-w-0 flex-1 overflow-hidden rounded-lg bg-[#070b0e]">
          <label className="flex min-w-0 flex-1 items-center gap-1 pl-3.5 pr-3">
            <span className="sr-only">Bet amount in USD</span>
            {amount !== '' && <span className="text-[17px] font-medium text-[#8993a3]">$</span>}
            <input
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={handleInput}
              disabled={locked}
              placeholder="$0.00"
              className="w-full h-10 min-w-0 bg-transparent text-[17px] font-medium text-white outline-none placeholder:text-[#4a5361] disabled:opacity-60"
            />
            <DollarBadge className="h-[22px] w-[22px] text-[13px]" />
          </label>
          <div className="flex shrink-0 items-stretch divide-x divide-[#0b0f14] bg-[#151b22]">
            <button type="button" className={segment} disabled={locked} onClick={() => onAmountChange('')}>
              Clear
            </button>
            <button type="button" className={segment} disabled={locked} onClick={() => onAmountChange(toField(value / 2))}>
              ½
            </button>
            <button
              type="button"
              className={segment}
              disabled={locked}
              onClick={() => onAmountChange(toField(Math.min(value * 2, balance)))}
            >
              2×
            </button>
            <button type="button" className={segment} disabled={locked} onClick={() => onAmountChange(toField(balance))}>
              Max
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onStart}
          disabled={started}
          className="flex h-11 w-full shrink-0 items-center justify-center gap-2.5 rounded-lg bg-[#1fd36b] px-5 text-[14px] font-bold text-[#06210f] transition-colors hover:bg-[#25e377] disabled:cursor-default disabled:bg-[#151b22] disabled:text-[#7b8594] sm:w-auto"
        >
          <PlayIcon className="h-4 w-4" />
          {started ? 'Playing' : 'Play'}
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {ORDER.map((o) => {
          const list = bets[o]
          const total = list.reduce((sum, b) => sum + b.amount, 0)
          const ready = canBet(o)
          const dim = phase === 'result' && winner !== null && winner !== o
          return (
            <div key={o} className={`min-w-0 transition-opacity ${dim ? 'opacity-40' : ''}`}>
              <button
                type="button"
                disabled={!ready}
                onClick={() => onBet(o)}
                className={`flex h-11 w-full items-center gap-2.5 rounded-lg px-4 text-[15px] font-bold transition disabled:cursor-not-allowed ${
                  ready ? BUTTON_STYLES[o].ready : BUTTON_STYLES[o].idle
                }`}
              >
                <OutcomeIcon outcome={o} className="h-[18px] w-[18px]" />
                Bet {OUTCOME_LABEL[o]}
              </button>

              <div className="mt-2.5 overflow-hidden rounded-lg border border-[#161d26] bg-[#0e1319]">
                <div className="flex h-11 items-center justify-between border-b border-[#1a212b] px-4 text-[14px] font-bold text-white">
                  <span className="flex items-center gap-2">
                    <UsersIcon className="h-4 w-4 text-[#7b8594]" />
                    {list.length}
                  </span>
                  <span className="flex items-center gap-2 tabular-nums">
                    <DollarBadge className="h-5 w-5 text-[12px]" />
                    {money(total)}
                  </span>
                </div>
                {list.length === 0 ? (
                  <p className="grid h-[88px] place-items-center text-[13px] text-[#7b8594]">No bets</p>
                ) : (
                  <ul className="max-h-[220px] min-h-[88px] overflow-y-auto py-1">
                    {list.map((b) => (
                      <li key={b.id} className="flex items-center justify-between px-4 py-2 text-[13px]">
                        <span className="flex items-center gap-2 text-[#c5ccd6]">
                          <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-[#1b222c] text-[11px] font-bold text-white">
                            {b.name.charAt(0)}
                          </span>
                          {b.name}
                        </span>
                        <span className="font-semibold tabular-nums text-white">{money(b.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

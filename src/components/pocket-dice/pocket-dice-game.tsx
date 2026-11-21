// src/components/pocket-dice/pocket-dice-game.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  POCKET_DICE_DEFAULT_STAKE_PUSD,
  POCKET_DICE_MAX_PLAYERS,
  POCKET_DICE_MIN_PLAYERS,
} from '@/lib/pocket-dice/config'
import type { PocketDiceMatchView } from '@/lib/pocket-dice/types'
import type { PocketDiceValues } from '@/lib/pocket-dice/rules'
import { formatPusdUnits } from '@/lib/pusd'
import { DiceStage } from './dice-stage'
import { StakePanel } from './stake-panel'
import { usePocketDice } from './use-pocket-dice'

function usd(value: string): string {
  return `$${value}`
}

function secondsLeft(
  match: PocketDiceMatchView,
  clockOffsetMs: number,
  nowTick: number,
): number {
  if (match.countdownMsRemaining == null) return 0
  const elapsed = nowTick + clockOffsetMs - new Date(match.serverNow).getTime()
  return Math.max(0, Math.ceil((match.countdownMsRemaining - elapsed) / 1_000))
}

function PlayerRow({
  player,
  winningNumbers,
  revealed = true,
}: {
  player: PocketDiceMatchView['players'][number]
  winningNumbers: number[]
  revealed?: boolean
}) {
  const won = player.pick != null && winningNumbers.includes(player.pick)
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 ${
        won && revealed ? 'bg-[#00fa7f]/10' : 'bg-white/[0.03]'
      }`}
    >
      <span className={`truncate text-[12px] font-semibold ${won && revealed ? 'text-[#00fa7f]' : 'text-white/75'}`}>
        {player.isSelf ? 'You' : player.displayName}
      </span>
      <span className="shrink-0 text-[12px] tabular-nums text-white/55">
        {player.pick ?? '—'}
      </span>
      {revealed && player.payoutPusd !== '0.00' ? (
        <span className="shrink-0 text-[12px] font-bold tabular-nums text-[#00fa7f]">
          +{usd(player.payoutPusd)}
        </span>
      ) : null}
    </div>
  )
}

export function PocketDiceGame() {
  const dice = usePocketDice()
  const [stake, setStake] = useState(() => formatPusdUnits(POCKET_DICE_DEFAULT_STAKE_PUSD))
  const [pick, setPick] = useState<number | null>(7)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [settledId, setSettledId] = useState<string | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())

  const match = dice.state?.match ?? null
  const visible = match && match.id !== dismissed ? match : null
  const settled = visible != null && settledId === visible.id

  useEffect(() => {
    setSettledId(null)
  }, [visible?.id])

  useEffect(() => {
    if (visible?.status !== 'WAITING') return
    setNowTick(Date.now())
    const timer = window.setInterval(() => setNowTick(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [visible?.id, visible?.status])

  const join = useCallback(async () => {
    if (pick == null) return
    const ok = await dice.join(stake, pick)
    if (ok) setDismissed(null)
  }, [dice, pick, stake])

  const leave = useCallback(async () => {
    const ok = await dice.leave()
    if (ok) setDismissed(null)
  }, [dice])

  const start = useCallback(async () => {
    await dice.start()
  }, [dice])

  const newRound = useCallback(() => {
    if (match) setDismissed(match.id)
  }, [match])

  const notice = dice.notice

  return (
    <div className="space-y-3">
      {notice ? (
        <div
          role="status"
          className={`rounded-xl border px-3 py-2 text-[12px] font-medium ${
            notice.tone === 'error'
              ? 'border-[#ff5b6e]/25 bg-[#ff5b6e]/10 text-[#ffb4c0]'
              : notice.tone === 'success'
                ? 'border-[#00fa7f]/25 bg-[#00fa7f]/10 text-[#8dffc4]'
                : 'border-white/[0.08] bg-white/[0.04] text-white/70'
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      {dice.loading ? (
        <div className="dual-card h-[320px] animate-pulse bg-white/[0.02]" />
      ) : !dice.state && !dice.authRequired ? (
        <div className="dual-card flex h-[320px] flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm font-bold text-white">Could not load the game</p>
          <button
            type="button"
            onClick={() => {
              void dice.refresh()
            }}
            className="mn-cta mn-cta-fit"
          >
            Retry
          </button>
        </div>
      ) : visible?.status === 'WAITING' ? (
        <section className="dual-card p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <span className="text-[11px] text-[var(--t-muted)]">
              {usd(match?.stakePusd ?? '0.00')} each · {visible.players.length}/
              {POCKET_DICE_MAX_PLAYERS}
            </span>
            <p className="text-[11px] font-semibold text-white/55">
              Pot {usd(visible.potPusd)}
            </p>
          </div>

          <div className="mt-2.5 grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_230px]">
            <div className="relative min-h-[340px] overflow-hidden rounded-xl">
              <DiceStage roll={null} showResult={false} className="min-h-[340px]" />
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-4 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                  Roll in
                </p>
                <p className="text-4xl font-black tabular-nums text-white">
                  {secondsLeft(visible, dice.clockOffsetMs, nowTick)}s
                </p>
                <p className="mt-2 text-[12px] text-[var(--t-muted)]">
                  {visible.players.length < POCKET_DICE_MIN_PLAYERS
                    ? 'Waiting for at least one more player'
                    : 'Picks stay hidden until the roll'}
                </p>
                <div className="mt-3 flex gap-2">
                  {visible.viewer.canStart ? (
                    <button
                      type="button"
                      onClick={() => void start()}
                      disabled={dice.busy != null}
                      className="mn-cta mn-cta-fit"
                    >
                      Roll now
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void leave()}
                    disabled={dice.busy != null}
                    className="h-9 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 text-[11px] font-semibold text-white/65 transition hover:border-white/25 disabled:opacity-50"
                  >
                    Leave
                  </button>
                </div>
              </div>
            </div>

            <div className="grid content-start gap-1.5">
              {visible.players.map((player) => (
                <PlayerRow key={player.userId} player={player} winningNumbers={[]} />
              ))}
            </div>
          </div>
        </section>
      ) : visible ? (
        <section className="dual-card p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <span className="text-[11px] text-[var(--t-muted)]">
              {usd(visible.stakePusd)} each · Pot {usd(visible.potPusd)}
            </span>
            {visible.status === 'SETTLED' && visible.roll != null ? (
              <p className="text-[11px] font-semibold text-white/55">
                {settled
                  ? `Rolled ${visible.roll}${
                      visible.winningNumbers.length > 0
                        ? ` · ${visible.winningNumbers.join(' + ')} paid`
                        : ''
                    }`
                  : 'Rolling…'}
              </p>
            ) : (
              <p className="text-[11px] font-semibold text-white/55">Refunded</p>
            )}
          </div>

          <div className="mt-2.5 grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_230px]">
            <div className="min-w-0">
              {visible.status === 'SETTLED' && visible.die1 != null && visible.die2 != null ? (
                <DiceStage
                  roll={{
                    id: visible.id,
                    values: [visible.die1, visible.die2] as unknown as PocketDiceValues,
                  }}
                  showResult={false}
                  onSettled={() => setSettledId(visible.id)}
                  className="min-h-[340px] rounded-xl lg:min-h-[480px]"
                />
              ) : (
                <div className="flex min-h-[340px] items-center justify-center rounded-xl bg-[#0c1116] p-6 text-center text-sm text-[var(--t-muted)]">
                  Not enough players · all stakes refunded
                </div>
              )}
            </div>

            <div className="grid content-start gap-1.5">
              {visible.players.map((player) => (
                <PlayerRow
                  key={player.userId}
                  player={player}
                  winningNumbers={visible.winningNumbers}
                  revealed={settled}
                />
              ))}
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
            <span className="text-[12px] font-bold text-white">
              {visible.status === 'SETTLED'
                ? settled
                  ? Number(visible.viewer.payoutPusd) > 0
                    ? `You won ${usd(visible.viewer.payoutPusd)}`
                    : 'No win this round'
                  : 'Rolling…'
                : 'Round cancelled'}
            </span>
            <button
              type="button"
              onClick={newRound}
              disabled={visible.status === 'SETTLED' && !settled}
              className="mn-cta mn-cta-fit disabled:opacity-50"
            >
              New round
            </button>
          </div>
        </section>
      ) : (
        <StakePanel
          balancePusd={dice.state?.user.balancePusd ?? '0.00'}
          stake={stake}
          onStakeChange={setStake}
          pick={pick}
          onPickChange={setPick}
          onJoin={() => void join()}
          busy={dice.busy === 'join'}
          signedIn={!dice.authRequired && dice.state != null}
        />
      )}
    </div>
  )
}

'use client'

import type { MinesMatchSnapshot, MinesSeat } from '@/lib/mines/types'
import { points as formatPoints, reasonLabel, usd } from './format'
import { BombIcon, ShieldOutlineIcon } from './icons'

type ResultOverlayProps = {
  match: MinesMatchSnapshot
  selfSeat: MinesSeat | null
  busy: string | null
  onPlayAgain: () => void
  onDismiss: () => void
  onVerify: () => void
}

export function ResultOverlay({
  match,
  selfSeat,
  busy,
  onPlayAgain,
  onDismiss,
  onVerify,
}: ResultOverlayProps) {
  const self = match.players.find((player) => player.seat === selfSeat) ?? null
  const opponent = match.players.find((player) => player.seat !== selfSeat) ?? null
  const cancelled = match.status === 'CANCELLED'
  const won = !cancelled && match.winnerSeat != null && match.winnerSeat === selfSeat
  const title = cancelled
    ? 'Match voided'
    : won
      ? 'You win'
      : `${opponent?.displayName ?? 'Opponent'} wins`
  const payout = won ? match.payoutPusd : '0.00'

  return (
    <div className="mn-result" role="dialog" aria-modal="true" aria-label="Match result">
      <div className="mn-result-card">
        <span className="mn-result-kicker">{cancelled ? 'Refunded' : 'Match complete'}</span>
        <h2 className={`mn-result-title${won ? ' is-win' : ''}`}>{title}</h2>
        <p className="mn-result-reason">
          {cancelled ? 'Both stakes were returned to the players.' : reasonLabel(match.winReason)}
        </p>

        <div className="mn-result-stats">
          <div>
            <span>Your score</span>
            <strong>{formatPoints(self?.score ?? 0)}</strong>
          </div>
          <div>
            <span>Opponent</span>
            <strong>{formatPoints(opponent?.score ?? 0)}</strong>
          </div>
          <div className={won ? 'is-payout' : undefined}>
            <span>{cancelled ? 'Refunded' : 'Payout'}</span>
            <strong>{cancelled ? usd(match.stakePusd) : `${won ? '+' : ''}${usd(payout)}`}</strong>
          </div>
        </div>

        <div className="mn-result-meta">
          <span>
            <BombIcon className="mn-meta-icon" />
            {self?.bombs ?? 0} bombs hit
          </span>
          <span>
            <ShieldOutlineIcon className="mn-meta-icon" />
            {self?.shields ?? 0} shield left
          </span>
          <button type="button" className="mn-link" onClick={onVerify}>
            Reveal server seed
          </button>
        </div>

        <div className="mn-result-actions">
          <button
            type="button"
            className="mn-cta"
           
            onClick={onPlayAgain}
            disabled={busy === 'queue'}
          >
            {busy === 'queue' ? 'Finding opponent…' : 'Play again'}
          </button>
          <button
            type="button"
            className="mn-cta mn-cta-ghost"
            onClick={onDismiss}
            disabled={busy === 'dismiss'}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

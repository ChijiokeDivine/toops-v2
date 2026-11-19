'use client'

import type { MinesMatchSnapshot, MinesQueueView, MinesViewer } from '@/lib/mines/types'
import { formatPusdUnits, parsePusdInput } from '@/lib/pusd'
import { usd } from './format'
import { SpinnerIcon, WalletIcon } from './icons'

type Notice = { tone: 'info' | 'error' | 'success'; text: string } | null

type SidePanelProps = {
  authRequired: boolean
  stake: string
  onStakeChange: (value: string) => void
  balance: string | null
  match: (MinesMatchSnapshot & { viewer: MinesViewer }) | null
  queue: MinesQueueView | null
  busy: string | null
  notice: Notice
  onJoin: () => void
  onCancelQueue: () => void
  onDismiss: () => void
  onPlayAgain: () => void
  onSignIn: () => void
  now: number
}

function clampStake(value: number, balance: number | null): string {
  if (!Number.isFinite(value) || value <= 0) return '2.00'
  const max = balance == null ? value : Math.max(2, balance)
  const bounded = Math.min(max, Math.max(2, Math.round(value * 100) / 100))
  return bounded.toFixed(2)
}

export function SidePanel(props: SidePanelProps) {
  const {
    authRequired,
    stake,
    onStakeChange,
    balance,
    match,
    queue,
    busy,
    notice,
    onJoin,
    onCancelQueue,
    onDismiss,
    onPlayAgain,
    onSignIn,
    now,
  } = props

  const status = match?.status ?? null
  const active = status === 'WAITING' || status === 'LIVE'
  const finished = status === 'SETTLED' || status === 'CANCELLED'
  const canEditStake = !authRequired && !queue && !active && !finished

  const balanceUnits = balance == null ? null : Number(balance)
  const quick = (kind: 'half' | 'double' | 'max') => {
    const parsed = parsePusdInput(stake)
    const current = parsed == null ? 2 : Number(formatPusdUnits(parsed))
    if (kind === 'half') onStakeChange(clampStake(current / 2, balanceUnits))
    else if (kind === 'double') onStakeChange(clampStake(current * 2, balanceUnits))
    else onStakeChange(clampStake(balanceUnits ?? current, balanceUnits))
  }

  const queueSeconds =
    queue == null ? 0 : Math.max(0, Math.ceil((new Date(queue.expiresAt).getTime() - now) / 1_000))

  return (
    <aside className="mn-panel" aria-label="Mines controls">
      <div className="mn-tabs" role="tablist" aria-label="Game mode">
        <button type="button" role="tab" aria-selected="true" className="mn-tab is-active">
          Manual
        </button>
        <button type="button" role="tab" aria-selected="false" className="mn-tab" disabled>
          Auto <span className="mn-tab-tag">soon</span>
        </button>
      </div>

      <div className="mn-panel-body">
        <div className="mn-field">
          <div className="mn-field-head">
            <label htmlFor="mn-stake">Your Bet</label>
            {balance != null ? (
              <span className="mn-balance">
                <WalletIcon className="mn-balance-icon" />
                {usd(balance)}
              </span>
            ) : null}
          </div>

          <div className={`mn-bet${canEditStake ? '' : ' is-locked'}`}>
            <span className="mn-bet-currency" aria-hidden="true">
              $
            </span>
            <input
              id="mn-stake"
              value={stake}
              onChange={(event) => onStakeChange(event.target.value.replace(/[^\d.]/g, ''))}
              inputMode="decimal"
              spellCheck={false}
              autoComplete="off"
              disabled={!canEditStake}
              aria-label="Your bet in PUSD"
            />
            <div className="mn-bet-quick">
              <button type="button" onClick={() => quick('half')} disabled={!canEditStake}>
                ½
              </button>
              <button type="button" onClick={() => quick('double')} disabled={!canEditStake}>
                2×
              </button>
              <button type="button" onClick={() => quick('max')} disabled={!canEditStake}>
                Max
              </button>
            </div>
          </div>
          <p className="mn-field-hint">Minimum stake $2.00 </p>
        </div>

        <div className="mn-action">
          {authRequired ? (
            <button type="button" className="mn-cta" onClick={onSignIn}>
              Sign in
            </button>
          ) : queue ? (
            <div className="mn-queue">
              <div className="mn-queue-line">
                <SpinnerIcon className="mn-spin" />
                <span>
                  Searching for an opponent
                  <span className="mn-dots" aria-hidden="true" />
                </span>
              </div>
              <span className="mn-queue-sub">
                {usd(queue.stakePusd)} locked · {Math.floor(queueSeconds / 60)}:
                {String(queueSeconds % 60).padStart(2, '0')} left
              </span>
              <button
                type="button"
                className="mn-cta mn-cta-ghost"
                onClick={onCancelQueue}
                disabled={busy === 'leave-queue'}
              >
                Cancel search
              </button>
            </div>
          ) : active && match ? (
            <div className="mn-live">
              <div className="mn-live-row">
                <span className="mn-live-dot" />
                <span>Match live</span>
                <span className="mn-live-pot">{usd(match.potPusd)} pot</span>
              </div>
              <button type="button" className="mn-cta" disabled>
                {match.status === 'WAITING' ? 'Starting…' : 'Match in progress'}
              </button>
            </div>
          ) : finished && match ? (
            <div className="mn-finished">
              <div className="mn-live-row is-muted">
                <span>{match.status === 'CANCELLED' ? 'Match voided' : 'Winner paid'}</span>
                <span>
                  {match.status === 'CANCELLED' ? 'Stakes refunded' : usd(match.payoutPusd)}
                </span>
              </div>
              <button
                type="button"
                className="mn-cta"
                onClick={onPlayAgain}
                disabled={busy === 'queue'}
              >
                Play again
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
          ) : (
            <button type="button" className="mn-cta" onClick={onJoin} disabled={busy === 'queue'}>
              {busy === 'queue' ? 'Finding opponent…' : 'Find opponent'}
            </button>
          )}

          {notice ? (
            <p className={`mn-notice is-${notice.tone}`} role="status">
              {notice.text}
            </p>
          ) : null}
        </div>
      </div>
    </aside>
  )
}

import { MINES_TURN_MS } from '@/lib/mines/config'
import type { MinesSeat, MinesStatus } from '@/lib/mines/types'

type TurnClockProps = {
  status: MinesStatus
  turn: MinesSeat
  selfSeat: MinesSeat | null
  msLeft: number
  opponentName: string
}

function labelFor(status: MinesStatus, isSelfTurn: boolean, opponentName: string): string {
  if (status === 'WAITING') return 'Waiting'
  if (status === 'SETTLED' || status === 'CANCELLED') return 'Match over'
  return isSelfTurn ? 'Your turn' : `${opponentName}’s turn`
}

export function TurnClock({ status, turn, selfSeat, msLeft, opponentName }: TurnClockProps) {
  const live = status === 'LIVE'
  const isSelfTurn = live && selfSeat != null && turn === selfSeat
  const seconds = live ? Math.max(0, Math.ceil(msLeft / 1_000)) : 0
  const progress = live ? Math.max(0, Math.min(1, msLeft / MINES_TURN_MS)) : 0
  const urgent = live && msLeft <= 3_000

  return (
    <div className={`mn-clock${isSelfTurn ? ' is-self' : ''}${urgent ? ' is-urgent' : ''}`}>
      <span className="mn-clock-value" aria-live="off">
        {live ? seconds : status === 'SETTLED' || status === 'CANCELLED' ? '—' : '10'}
      </span>
      <div className="mn-clock-track" aria-hidden="true">
        <span className="mn-clock-fill" style={{ width: `${progress * 100}%` }} />
      </div>
      <span className="mn-clock-label">{labelFor(status, isSelfTurn, opponentName)}</span>
    </div>
  )
}

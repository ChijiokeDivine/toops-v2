import type { MinesPlayerView } from '@/lib/mines/types'
import { points as formatPoints, initials } from './format'
import { BombIcon, ShieldIcon } from './icons'

type PlayerCardProps = {
  player: MinesPlayerView
  isSelf: boolean
  isTurn: boolean
  live: boolean
}

export function PlayerCard({ player, isSelf, isTurn, live }: PlayerCardProps) {
  return (
    <div
      className={`mn-player${isSelf ? ' is-self' : ''}${isTurn && live ? ' is-turn' : ''}`}
      aria-current={isTurn && live ? 'true' : undefined}
    >
      <span className="mn-avatar" aria-hidden="true">
        {player.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={player.avatarUrl} alt="" />
        ) : (
          initials(player.displayName)
        )}
        <span className={`mn-presence${player.online ? ' is-online' : ''}`} />
      </span>

      <div className="mn-player-info">
        <div className="mn-player-name-row">
          <span className="mn-player-name">{player.displayName}</span>
          {isSelf ? <span className="mn-you">YOU</span> : null}
        </div>
        <div className="mn-player-meta">
          <span className="mn-stat">
            <span className="mn-stat-label">Streak</span>
            <span className="mn-stat-value">{player.streak}</span>
          </span>
          <span className="mn-stat">
            <BombIcon className="mn-meta-icon" />
            <span className="mn-stat-value">{player.bombs}</span>
          </span>
          {player.shields > 0 ? (
            <span className="mn-shield-badge" title="Aegis Shield ready">
              <ShieldIcon className="mn-meta-icon" />
              Shield
            </span>
          ) : null}
          {!player.online ? <span className="mn-offline">Offline</span> : null}
        </div>
      </div>

      <div className="mn-score-block">
        <span className="mn-score">{formatPoints(player.score)}</span>
        <span className="mn-score-sub">+{player.nextPoints} next</span>
      </div>
    </div>
  )
}

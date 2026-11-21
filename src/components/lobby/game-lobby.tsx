'use client'

import { useState, type ReactNode } from 'react'

export type LobbyGame = {
  key: string
  label: string
  blurb: string
  /** Mounted only while its tab is selected. */
  node: ReactNode
}

type GameLobbyProps = {
  title: string
  description: string
  games: LobbyGame[]
}

/**
 * Tabbed lobby: the games that belong to one home page category, rendered one
 * at a time so only the visible game talks to the server.
 */
export function GameLobby({ title, description, games }: GameLobbyProps) {
  const [activeKey, setActiveKey] = useState(() => games[0]?.key ?? '')
  const active = games.find((game) => game.key === activeKey) ?? games[0]

  return (
    <div>
      <h1 className="text-2xl font-semibold leading-tight text-white lg:text-3xl">{title}</h1>
      <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--t-muted)]">{description}</p>

      <div
        role="tablist"
        aria-label={`${title} games`}
        className="mt-4 grid gap-1.5 rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface)] p-1.5 sm:grid-cols-2"
      >
        {games.map((game) => {
          const selected = game.key === active?.key
          return (
            <button
              key={game.key}
              type="button"
              role="tab"
              id={`lobby-tab-${game.key}`}
              aria-selected={selected}
              aria-controls={`lobby-panel-${game.key}`}
              onClick={() => setActiveKey(game.key)}
              className={`cursor-pointer rounded-xl px-4 py-2.5 text-left transition ${
                selected
                  ? 'bg-[var(--t-surface-2)] text-white'
                  : 'text-[var(--t-muted)] hover:bg-[var(--t-surface-2)] hover:text-white'
              }`}
            >
              <span className="block text-[15px] font-semibold leading-5">{game.label}</span>
              <span className="mt-0.5 block text-[12px] leading-4">{game.blurb}</span>
            </button>
          )
        })}
      </div>

      {active ? (
        <div
          role="tabpanel"
          id={`lobby-panel-${active.key}`}
          aria-labelledby={`lobby-tab-${active.key}`}
          className="mt-2.5"
        >
          {active.node}
        </div>
      ) : null}
    </div>
  )
}

import type { Metadata } from 'next'

import { categoryGames } from '../_components/data'
import { GameCard } from '../_components/originals-row'

export const metadata: Metadata = {
  title: 'Multiplayer - toops',
  description:
    'Shared-table games. Pocket Dice shares one pot between 2-10 players; Roulette shares one pool with everyone on the winning colour.',
}

export default function MultiplayerPage() {
  return (
    <main className="mx-auto w-full max-w-[1600px] px-3 pb-24 pt-4 lg:px-4 lg:pb-12">
      <h1 className="text-2xl font-semibold leading-tight text-white lg:text-3xl">Multiplayer</h1>
      <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--t-muted)]">
        Shared-table games: everyone at the table locks the same stake, and the winning side splits
        what is on it.
      </p>

      <div className="mt-5 grid max-w-[520px] grid-cols-2 gap-2.5">
        {categoryGames('multiplayer').map((game) => (
          <GameCard key={game.slug} game={game} />
        ))}
      </div>
    </main>
  )
}

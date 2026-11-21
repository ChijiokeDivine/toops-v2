import type { Metadata } from 'next'

import { categoryGames } from '../_components/data'
import { GameCard } from '../_components/originals-row'

export const metadata: Metadata = {
  title: 'Dual - toops',
  description:
    'Two-player PvP. Mines Duel and Dual Crash pair you with one opponent at the exact same stake.',
}

export default function DualPage() {
  return (
    <main className="mx-auto w-full max-w-[1600px] px-3 pb-24 pt-4 lg:px-4 lg:pb-12">
      <h1 className="text-2xl font-semibold leading-tight text-white lg:text-3xl">Dual</h1>
      <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--t-muted)]">
        One-on-one games. You are queued against a single opponent who locked the exact same stake,
        and only one of you takes the pot.
      </p>

      <div className="mt-5 grid max-w-[520px] grid-cols-2 gap-2.5">
        {categoryGames('dual').map((game) => (
          <GameCard key={game.slug} game={game} />
        ))}
      </div>
    </main>
  )
}

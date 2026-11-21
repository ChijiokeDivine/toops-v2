import type { Metadata } from 'next'

import { GameLobby } from '@/components/lobby/game-lobby'
import { PocketDiceGame } from '@/components/pocket-dice/pocket-dice-game'
import { PocketDiceRules } from '@/components/pocket-dice/pocket-dice-rules'
import { RouletteGame } from '@/components/roulette/roulette-game'
import '../originals/pocket-dice/pocket-dice.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Multiplayer - toops',
  description:
    'Shared-table games. Pocket Dice shares one pot between 2-10 players; Roulette shares one pool with everyone on the winning colour.',
}

export default function MultiplayerPage() {
  return (
    <main className="mx-auto w-full max-w-[1600px] px-3 pb-24 pt-4 lg:px-4 lg:pb-12">
      <GameLobby
        title="Multiplayer"
        description="Shared-table games: everyone at the table locks the same stake, and the winning side splits what is on it."
        games={[
          {
            key: 'pocket-dice',
            label: 'Pocket Dice',
            blurb: '2-10 players, one shared pot, one roll',
            node: (
              <>
                <PocketDiceGame />
                <PocketDiceRules />
              </>
            ),
          },
          {
            key: 'roulette',
            label: 'Roulette',
            blurb: 'Back red, black or green and split the pool',
            node: <RouletteGame />,
          },
        ]}
      />
    </main>
  )
}

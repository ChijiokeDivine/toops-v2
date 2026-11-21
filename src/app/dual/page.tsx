import type { Metadata } from 'next'

import { DualGame } from '@/components/dual/dual-game'
import { DualRules } from '@/components/dual/dual-rules'
import { GameLobby } from '@/components/lobby/game-lobby'
import { MinesGame } from '@/components/mines/mines-game'
import { MinesRules } from '@/components/mines/mines-rules'
import '../originals/mines/mines.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Dual - toops',
  description:
    'Two-player PvP. Mines Duel and Dual Crash pair you with one opponent at the exact same stake.',
}

export default function DualPage() {
  return (
    <main className="mx-auto w-full max-w-[1600px] px-3 pb-24 pt-4 lg:px-4 lg:pb-12">
      <GameLobby
        title="Dual"
        description="One-on-one games. You are queued against a single opponent who locked the exact same stake, and only one of you takes the pot."
        games={[
          {
            key: 'mines',
            label: 'Mines Duel',
            blurb: '35 tiles, 9 bombs, 10 seconds per turn',
            node: (
              <div className="mn-page mn-page--embed">
                <MinesGame />
                <MinesRules />
              </div>
            ),
          },
          {
            key: 'crash',
            label: 'Crash',
            blurb: 'Ride the rocket, cash out last',
            node: (
              <>
                <DualGame />
                <DualRules />
              </>
            ),
          },
        ]}
      />
    </main>
  )
}

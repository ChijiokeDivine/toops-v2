import type { Metadata } from 'next'

import { RouletteGame } from '@/components/roulette/roulette-game'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Roulette - toops',
  description: 'PvP roulette. Pick red, black or green, share the pool with everyone on the winning side.',
}

export default function RoulettePage() {
  return (
    <main className="mx-auto w-full max-w-[1600px] px-3 pb-24 pt-4 lg:px-4 lg:pb-12">
      <RouletteGame />
    </main>
  )
}

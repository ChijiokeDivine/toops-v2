import type { Metadata } from 'next'
import { MinesGame } from '@/components/mines/mines-game'
import './mines.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Mines Duel - toops',
  description:
    'Real-time 1v1 Mines. Fifty tiles, thirteen bombs, one Aegis Shield, ten seconds per turn. First to 2,500 points takes the pot.',
}

export default function MinesPage() {
  return (
    <main className="mn-page">
      <MinesGame />
    </main>
  )
}

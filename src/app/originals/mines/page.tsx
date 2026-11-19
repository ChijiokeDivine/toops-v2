import type { Metadata } from 'next'
import { MinesGame } from '@/components/mines/mines-game'
import { MinesRules } from '@/components/mines/mines-rules'
import './mines.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Mines Duel - toops',
  description:
    'Real-time 1v1 Mines. Thirty-five tiles, nine bombs, one Aegis Shield, ten seconds per turn. First to 1,750 points takes the pot.',
}

export default function MinesPage() {
  return (
    <main className="mn-page">
      <MinesGame />
      <MinesRules />
    </main>
  )
}

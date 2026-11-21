// src/app/originals/pocket-dice/page.tsx
import type { Metadata } from 'next'
import { PocketDiceGame } from '@/components/pocket-dice/pocket-dice-game'
import { PocketDiceRules } from '@/components/pocket-dice/pocket-dice-rules'
import './pocket-dice.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Pocket Dice - toops',
  description:
    'Shared-pot dice. 2-10 players lock the same stake, pick a total from 2 to 12, and one roll pays the pot.',
}

export default function PocketDicePage() {
  return (
    <main className="mx-auto w-full max-w-[1600px] px-3 pb-24 pt-4 lg:px-4 lg:pb-12">
      <PocketDiceGame />
      <PocketDiceRules />
    </main>
  )
}

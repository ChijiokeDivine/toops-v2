import {
  ROULETTE_OUTCOME_LABEL,
  ROULETTE_SLOT_PATTERN,
  type RouletteOutcome,
} from '@/lib/roulette/rules'
import { ROULETTE_MIN_STAKE_PUSD } from '@/lib/roulette/config'
import { formatPusdUnits } from '@/lib/pusd'

export type Outcome = RouletteOutcome
export type Phase = 'betting' | 'spinning' | 'result'

/** Minimum bet, in whole USD/PUSD. Mirrors the server's 0.20 PUSD floor. */
export const MIN_BET = Number(formatPusdUnits(ROULETTE_MIN_STAKE_PUSD))

export interface Bet {
  id: string
  name: string
  amount: number
}

/** The 15-slot wheel: 7 red, 7 black, 1 green. */
export const SLOT_PATTERN: Outcome[] = ROULETTE_SLOT_PATTERN

export const OUTCOME_LABEL: Record<Outcome, string> = ROULETTE_OUTCOME_LABEL

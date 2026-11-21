export type Outcome = 'red' | 'black' | 'green'
export type Phase = 'betting' | 'spinning' | 'result'

export interface Bet {
  id: string
  name: string
  amount: number
}

/** 15 slots: 1 green, 7 red, 7 black (alternating after the green). */
export const SLOT_PATTERN: Outcome[] = [
  'green',
  ...Array.from({ length: 14 }, (_, i): Outcome => (i % 2 === 0 ? 'red' : 'black')),
]

export const OUTCOME_LABEL: Record<Outcome, string> = {
  red: 'Red',
  black: 'Black',
  green: 'Green',
}

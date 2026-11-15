import type { MinesWinReason } from '@/lib/mines/types'

export function usd(amount: string): string {
  return `$${amount}`
}

export function points(value: number): string {
  return value.toLocaleString('en-US')
}

export function shortHash(hash: string, head = 8, tail = 6): string {
  if (!hash) return '—'
  if (hash.length <= head + tail + 1) return hash
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`
}

export function reasonLabel(reason: MinesWinReason | null): string {
  switch (reason) {
    case 'KNOCKOUT':
      return 'First to 2,500 points'
    case 'EXHAUSTION':
      return 'Board cleared — highest score'
    case 'TIEBREAK_BOMBS':
      return 'Tie-break — fewer bombs hit'
    case 'TIEBREAK_SPEED':
      return 'Tie-break — faster average click'
    default:
      return 'Match complete'
  }
}

export function initials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

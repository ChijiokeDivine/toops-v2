// src/components/pocket-dice/format.ts
/** PUSD amounts are already formatted decimal strings (e.g. "19.80"). */
export function usd(amount: string): string {
  return `$${amount}`
}

export function withSeparators(value: string): string {
  const [whole = '0', fraction] = value.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return fraction ? `${grouped}.${fraction}` : grouped
}

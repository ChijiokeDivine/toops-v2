import { MINES_FEE_BPS, MINES_FEE_DIVISOR } from './config'

/** Platform fee: 1% of the pot, floored to a whole base unit. */
export function calculateMinesFee(potPusd: bigint): bigint {
  return (potPusd * MINES_FEE_BPS) / MINES_FEE_DIVISOR
}

/** Splits the pot into the platform fee and the winner's payout. */
export function projectedMinesPayout(potPusd: bigint): {
  feePusd: bigint
  payoutPusd: bigint
} {
  const feePusd = calculateMinesFee(potPusd)
  return { feePusd, payoutPusd: potPusd - feePusd }
}

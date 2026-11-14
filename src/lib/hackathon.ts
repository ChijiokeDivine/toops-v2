/**
 * BCH BLAZE 2026 submission details, rendered in the top-of-page banner.
 *
 * The rules require the banner to link back to the project as it was on
 * November 14 (the start of the build window) and to show the CashTokens
 * address that receives EMBER2026 Community Choice votes.
 */
export const HACKATHON = {
  event: 'BCH BLAZE 2026',
  /** Demo of the project as it stood on November 14, before judged work began. */
  baselineDemoUrl: 'https://toops1.vercel.app/',
  /** Code frozen at the fork point: tag `nov-14-baseline` (commit 6f87c7e). */
  baselineCodeUrl: 'https://github.com/ChijiokeDivine/toops/tree/nov-14-baseline',
  /** Repository where all work between November 14 and 22 lives. */
  repoUrl: 'https://github.com/ChijiokeDivine/toops-v2',
  /**
   * Public payout address for EMBER2026 votes. This is not a secret, so the
   * value is baked in as a fallback to guarantee the banner always renders.
   * Override it with `NEXT_PUBLIC_EMBER2026_ADDRESS` if the address changes.
   */
  emberAddress:
    process.env.NEXT_PUBLIC_EMBER2026_ADDRESS?.trim() ||
    'bitcoincash:zp6dvscvwl7adcvaegwr03au4dktugnh4ug46msnfc',
} as const

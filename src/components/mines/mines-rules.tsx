import {
  MINES_BOARD_SIZE,
  MINES_BOMB_COUNT,
  MINES_BOMB_PENALTY_BPS,
  MINES_FEE_BPS,
  MINES_FEE_DIVISOR,
  MINES_KNOCKOUT_SCORE,
  MINES_SAFE_COUNT,
  MINES_SHIELD_ODDS,
  MINES_STAKE_PRESETS,
  MINES_STREAK_POINTS,
  MINES_TURN_MS,
} from '@/lib/mines/config'
import { formatPusdUnits } from '@/lib/pusd'
import { points } from './format'

const TURN_SECONDS = MINES_TURN_MS / 1_000
const PENALTY_PERCENT = MINES_BOMB_PENALTY_BPS / 100
const FEE_PERCENT = Number(MINES_FEE_BPS) / 100
const SHIELD_ONE_IN = Math.round(1 / MINES_SHIELD_ODDS)
const STREAK_LADDER = MINES_STREAK_POINTS.join(' / ')
const STREAK_CAP = MINES_STREAK_POINTS[MINES_STREAK_POINTS.length - 1] ?? 0

const RULES = [
  {
    title: 'Queue at the same stake',
    body: 'Pick a preset or enter a custom PUSD amount and join the queue. You are paired with a random player who chose the exact same stake, which is locked as soon as you queue.',
  },
  {
    title: 'Both players load, then play',
    body: 'The match does not start until both players are on the board and ready. If someone fails to load in time, the match is cancelled and both stakes are refunded.',
  },
  {
    title: 'Share one board, take turns',
    body: `Both players pick from a single ${MINES_BOARD_SIZE}-tile board holding ${MINES_BOMB_COUNT} bombs and ${MINES_SAFE_COUNT} safe tiles. Turns alternate one pick at a time, each lasting ${TURN_SECONDS} seconds; a timeout auto-picks a random unrevealed tile.`,
  },
  {
    title: 'Safe picks build a streak',
    body: `Consecutive safe picks pay ${STREAK_LADDER} points. The fourth pick and every later pick in the same streak pay the ${STREAK_CAP}-point cap, and a bomb resets the streak.`,
  },
  {
    title: 'Bombs burn banked points',
    body: `A bomb without a shield costs ${PENALTY_PERCENT}% of your banked points, rounded to the nearest 10, and reveals the bomb to both players. Your score can never drop below zero.`,
  },
  {
    title: 'Aegis Shield',
    body: `About one in ${SHIELD_ONE_IN} boards hides an Aegis Shield inside a safe tile. It absorbs a single bomb with no point loss and keeps your streak alive; the bomb tile is still revealed.`,
  },
  {
    title: 'First to the knockout score',
    body: `The first player to reach ${points(MINES_KNOCKOUT_SCORE)} points wins instantly. If every safe tile is revealed first, the higher score wins; a tie goes to the player who hit fewer bombs, then the faster average click time.`,
  },
]

const FAQ = [
  {
    question: 'What happens if I disconnect?',
    answer:
      'Your seat stays open for a short grace period and the turn clock keeps running. If both players stay offline, the match is voided and both stakes are refunded.',
  },
  {
    question: 'Can I cancel a match?',
    answer:
      'Yes, while you are queued or while the match is still waiting for both players. Cancelling at either point refunds both stakes in full. Once the match is live it cannot be cancelled.',
  },
  {
    question: 'What if the board runs out?',
    answer: `When all ${MINES_SAFE_COUNT} safe tiles are revealed, the higher score wins. Fewer bombs hit breaks a score tie, then the faster average click time. A perfect tie falls to seat 0.`,
  },
  {
    question: 'When is the fee taken?',
    answer: `A ${FEE_PERCENT}% fee is taken from the pot when the winner is paid, never from a single player. A cancelled or voided match pays no fee.`,
  },
  {
    question: 'Can the result be verified?',
    answer:
      'Every board is derived from the server seed hash published at match start, both client seeds, and the nonce. The server seed is revealed when the match ends, and the result can be recomputed from “Reveal server seed”.',
  },
]

const PAYOUT_ROWS = MINES_STAKE_PRESETS.map((stake) => {
  const pot = stake * 2n
  const fee = (pot * MINES_FEE_BPS) / MINES_FEE_DIVISOR
  return {
    stake: `$${formatPusdUnits(stake)}`,
    pot: `$${formatPusdUnits(pot)}`,
    fee: `$${formatPusdUnits(fee)}`,
    winner: `$${formatPusdUnits(pot - fee)}`,
  }
})

export function MinesRules() {
  return (
    <div className="mt-4 space-y-3">
      <details
        id="rules"
        className="group/section rounded-xl border border-[var(--t-border)] bg-[#050910] p-4 sm:p-5"
      >
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-white">How Mines Duel works</h2>
          <span className="shrink-0 text-2xl leading-none text-white/40 transition group-open/section:rotate-45">
            ＋
          </span>
        </summary>

        <ol className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {RULES.map((rule, index) => (
            <li key={rule.title} className="rounded-xl">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#ffffff]">
                  {index + 1}
                </span>
                <h3 className="text-[13px] font-bold text-white">{rule.title}</h3>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--t-muted)]">
                {rule.body}
              </p>
            </li>
          ))}
        </ol>
      </details>

      <div className="grid gap-3">
        <details className="group/section rounded-xl border border-[var(--t-border)] bg-[#050910] p-4 sm:p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-white">Payouts &amp; fees</h2>
            <span className="shrink-0 text-2xl leading-none text-white/40 transition group-open/section:rotate-45">
              ＋
            </span>
          </summary>

          <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.06]">
            <div className="grid grid-cols-4 gap-2 bg-white/[0.04] px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--t-muted)]">
              <span>Each stake</span>
              <span className="text-right">Pot</span>
              <span className="text-right">{FEE_PERCENT}% fee</span>
              <span className="text-right">Winner</span>
            </div>
            {PAYOUT_ROWS.map((row) => (
              <div
                key={row.stake}
                className="grid grid-cols-4 gap-2 border-t border-white/[0.04] px-3 py-2 text-[11px] tabular-nums text-white/70"
              >
                <span>{row.stake}</span>
                <span className="text-right">{row.pot}</span>
                <span className="text-right text-white/45">{row.fee}</span>
                <span className="text-right font-semibold text-[#00fa7f]">{row.winner}</span>
              </div>
            ))}
          </div>

          <ul className="mt-3 space-y-1.5 text-[11px] leading-relaxed text-[var(--t-muted)]">
            <li>• Both players lock the same stake; the winner takes the whole pot.</li>
            <li>
              • The fee is taken from the pot when a winner is paid, never from a single player.
            </li>
            <li>• PUSD is a 2-decimal CashToken, so every amount is exact to the base unit.</li>
          </ul>
        </details>
      </div>

      <details className="group/section rounded-xl border border-[var(--t-border)] bg-[#050910] p-4 sm:p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-white">Edge cases</h2>
          <span className="shrink-0 text-2xl leading-none text-white/40 transition group-open/section:rotate-45">
            ＋
          </span>
        </summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {FAQ.map((item) => (
            <details
              key={item.question}
              className="group rounded-xl border border-white/[0.06] bg-[#070b13]/55 p-3 open:border-white/[0.1]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[12px] font-semibold text-white/80">
                {item.question}
                <span className="text-white/30 transition group-open:rotate-45">＋</span>
              </summary>
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--t-muted)]">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </details>
    </div>
  )
}

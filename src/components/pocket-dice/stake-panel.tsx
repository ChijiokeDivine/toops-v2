'use client'

import { AuthTrigger } from '@/components/auth/auth-trigger'
import {
  POCKET_DICE_MAX_STAKE_PUSD,
  POCKET_DICE_MIN_STAKE_PUSD,
  POCKET_DICE_PICK_MAX,
  POCKET_DICE_PICK_MIN,
  POCKET_DICE_STAKE_PRESETS,
} from '@/lib/pocket-dice/config'
import { formatPusdUnits, parsePusdInput } from '@/lib/pusd'
import { DiceDemo } from './dice-demo'

type StakePanelProps = {
  balancePusd: string
  stake: string
  onStakeChange: (value: string) => void
  pick: number | null
  onPickChange: (value: number) => void
  onJoin: () => void
  busy: boolean
  signedIn?: boolean
}

const PICKS = Array.from(
  { length: POCKET_DICE_PICK_MAX - POCKET_DICE_PICK_MIN + 1 },
  (_, index) => POCKET_DICE_PICK_MIN + index,
)

function withSeparators(value: string): string {
  const [whole = '0', fraction] = value.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return fraction ? `${grouped}.${fraction}` : grouped
}

function validationFor(stake: string, balancePusd: string): string | null {
  const stakePusd = parsePusdInput(stake)
  const balance = parsePusdInput(balancePusd) ?? 0n
  if (!stakePusd) return 'Enter a valid stake.'
  if (stakePusd < POCKET_DICE_MIN_STAKE_PUSD) {
    return `Minimum stake is $${formatPusdUnits(POCKET_DICE_MIN_STAKE_PUSD)}.`
  }
  if (stakePusd > POCKET_DICE_MAX_STAKE_PUSD) {
    return `Maximum stake is $${formatPusdUnits(POCKET_DICE_MAX_STAKE_PUSD)}.`
  }
  if (stakePusd > balance) {
    return `You need $${formatPusdUnits(stakePusd - balance)} more PUSD.`
  }
  return null
}

export function StakePanel({
  balancePusd,
  stake,
  onStakeChange,
  pick,
  onPickChange,
  onJoin,
  busy,
  signedIn = true,
}: StakePanelProps) {
  const validation = signedIn ? validationFor(stake, balancePusd) : null
  const blocked = validation != null || pick == null

  return (
    <section className="overflow-hidden rounded-xl border border-white/[0.04] bg-[#0c1116]">
      <div className="grid lg:grid-cols-[330px_minmax(0,1fr)]">
        <div className="order-last flex flex-col border-t border-[#1b2127] bg-[#0f151b] p-4 lg:order-none lg:min-h-[640px] lg:border-t-0 lg:border-r">
          <div>
            <p className="text-[13px] font-medium text-[#8b97a5]">Stake</p>
            <input
              inputMode="decimal"
              value={stake}
              placeholder="0.00"
              aria-label="Your stake in PUSD"
              onChange={(event) => onStakeChange(event.target.value.replace(/[^0-9.]/g, ''))}
              className="mt-2 h-11 w-full rounded-xl bg-[#19212a] px-3 text-[16px] font-semibold tabular-nums text-white outline-none placeholder:text-white/30"
            />
            <div className="mt-2 flex gap-1.5">
              {POCKET_DICE_STAKE_PRESETS.map((preset) => {
                const active = parsePusdInput(stake) === preset.amountPusd
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => onStakeChange(formatPusdUnits(preset.amountPusd))}
                    className={`h-8 flex-1 rounded-lg text-[12px] font-semibold transition ${
                      active
                        ? 'bg-[#00fa7f]/15 text-[#00fa7f]'
                        : 'bg-[#19212a] text-white/55 hover:text-white'
                    }`}
                  >
                    ${preset.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-4">
            <p className="text-[13px] font-medium text-[#8b97a5]">Your pick</p>
            <div className="mt-2 grid grid-cols-6 gap-1.5">
              {PICKS.map((number) => (
                <button
                  key={number}
                  type="button"
                  onClick={() => onPickChange(number)}
                  className={`h-9 rounded-lg text-[13px] font-bold tabular-nums transition ${
                    pick === number
                      ? 'bg-[#00fa7f] text-[#03170d]'
                      : 'bg-[#19212a] text-white/65 hover:text-white'
                  }`}
                >
                  {number}
                </button>
              ))}
            </div>
          </div>

          {signedIn ? (
            <button
              type="button"
              onClick={onJoin}
              disabled={busy || blocked}
              className="mn-cta mt-4"
            >
              {busy ? 'Joining…' : 'Play'}
            </button>
          ) : (
            <AuthTrigger view="telegram" className="mn-cta mt-4">
              Sign in
            </AuthTrigger>
          )}

          {validation ? (
            <p className="mt-2 text-center text-[11px] font-medium text-[#ffb4a6]">{validation}</p>
          ) : null}

          <div className="mt-auto pt-8">
            <div className="flex h-12 items-center justify-between rounded-xl bg-[#141b22] px-3">
              <span className="text-[12px] font-medium text-[#8b97a5]">Balance</span>
              <span className="text-[16px] font-bold tabular-nums text-white">
                ${withSeparators(balancePusd)}
              </span>
            </div>
          </div>
        </div>

        <DiceDemo />
      </div>
    </section>
  )
}

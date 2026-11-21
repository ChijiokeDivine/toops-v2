import type { Metadata } from 'next'
import { AuthTrigger } from '@/components/auth/auth-trigger'
import { XpClaimCard } from '@/components/xp/xp-claim-card'
import { getSession } from '@/lib/auth/session'
import { XP_PER_LEVEL, getXpSummary, type XpSummary } from '@/lib/xp'
import { XpIcon } from '../_components/icons'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'XP · toops',
  description: 'Claim daily XP, keep your streak alive, and level up your toops account.',
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US')
}

function formatClaimDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function LevelCard({ summary }: { summary: XpSummary }) {
  const { level, intoLevel, needed, percent } = summary.levelProgress

  return (
    <section className="rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface)] p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--t-muted)]">Level</p>
          <p className="mt-0.5 text-4xl font-bold text-white">{level}</p>
        </div>
        <div className="flex gap-6 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--t-muted)]">XP</p>
            <p className="mt-0.5 font-semibold text-white">{formatNumber(summary.xp)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--t-muted)]">Streak</p>
            <p className="mt-0.5 font-semibold text-white">{summary.streak}d</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--t-muted)]">Best</p>
            <p className="mt-0.5 font-semibold text-white">{summary.bestStreak}d</p>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3 text-xs text-[var(--t-muted)]">
          <span>
            {formatNumber(intoLevel)} / {formatNumber(XP_PER_LEVEL)} XP
          </span>
          <span>{formatNumber(needed)} XP to next level</span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={XP_PER_LEVEL}
          aria-valuenow={intoLevel}
          className="mt-2 h-2 overflow-hidden rounded-full bg-black/35"
        >
          <div
            className="h-full rounded-full bg-[var(--t-green)]"
            style={{ width: `${Math.max(percent, 2)}%` }}
          />
        </div>
      </div>
    </section>
  )
}

function Activity({ summary }: { summary: XpSummary }) {
  return (
    <section className="rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface)] p-5">
      <h2 className="text-lg font-semibold text-white">Recent claims</h2>

      {summary.claims.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--t-muted)]">No claims yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--t-border)]">
          {summary.claims.map((claim) => (
            <li key={claim.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm text-white">Daily check-in</p>
                <p className="text-xs text-[var(--t-muted)]">
                  {formatClaimDate(claim.createdAt)} · day {claim.streak}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-[var(--t-green)]">
                +{formatNumber(claim.amount)} XP
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function SignedOut() {
  return (
    <div className="mt-6 rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface)] p-8 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[var(--t-surface-2)] text-white">
        <XpIcon className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-xl font-semibold text-white">Sign in to earn XP</h2>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <AuthTrigger view="telegram" className="mn-cta mn-cta-fit cursor-pointer">
          Continue with Telegram
        </AuthTrigger>
        <AuthTrigger
          view="wallet"
          className="cursor-pointer rounded-lg border border-[var(--t-border)] px-4 py-2.5 text-sm font-semibold text-white transition hover:border-[var(--t-green)]"
        >
          Connect wallet
        </AuthTrigger>
      </div>
    </div>
  )
}

export default async function XpPage() {
  const session = await getSession()
  const summary = session ? await getXpSummary(session.user.id) : null

  return (
    <main className="mx-auto w-full max-w-[900px] px-3 pb-24 pt-6 lg:px-4 lg:pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">XP</h1>
        <p className="mt-1 text-sm text-[var(--t-muted)]">
          Claim once a day to keep your streak and level up.
        </p>
      </div>

      {!session || !summary ? (
        <SignedOut />
      ) : (
        <div className="mt-6 space-y-3">
          <LevelCard summary={summary} />
          <XpClaimCard
            canClaim={summary.canClaim}
            claimAmount={summary.claimAmount}
            streak={summary.streak}
            nextClaimAt={summary.nextClaimAt?.toISOString() ?? null}
          />
          <Activity summary={summary} />
        </div>
      )}
    </main>
  )
}

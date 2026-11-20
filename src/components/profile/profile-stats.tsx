import { CalendarIcon, CasinoIcon, ChartUpIcon, CoinIcon } from '@/app/_components/icons'
import { prisma } from '@/lib/db'
import { formatPusdUnits } from '@/lib/pusd'

function usd(units: bigint): string {
  const negative = units < 0n
  return `${negative ? '-' : ''}$${formatPusdUnits(negative ? -units : units)}`
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export async function ProfileStats({ userId }: { userId: string }) {
  const [bets, betsToday, net] = await Promise.all([
    prisma.ledgerEntry.aggregate({
      where: { userId, kind: 'BET' },
      _count: { _all: true },
      _sum: { amountPusd: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: { userId, kind: 'BET', createdAt: { gte: startOfUtcDay(new Date()) } },
      _sum: { amountPusd: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: { userId, kind: { in: ['BET', 'WIN', 'ADJUSTMENT'] } },
      _sum: { amountPusd: true },
    }),
  ])

  const stats = [
    { label: 'Games Played', value: String(bets._count._all), Icon: CasinoIcon },
    { label: 'Total Wagered', value: usd(-(bets._sum.amountPusd ?? 0n)), Icon: CoinIcon },
    { label: 'Wagered Today', value: usd(-(betsToday._sum.amountPusd ?? 0n)), Icon: CalendarIcon },
    { label: 'Net Profit', value: usd(net._sum.amountPusd ?? 0n), Icon: ChartUpIcon },
  ]

  return (
    <section className="mt-7">
      <h2 className="text-xl font-bold text-white">Statistics</h2>

      <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {stats.map(({ label, value, Icon }) => (
          <div
            key={label}
            className="flex items-start justify-between gap-3 rounded-xl border border-[var(--t-border)] bg-[var(--t-surface)] px-3.5 py-3"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--t-muted)]">
                {label}
              </p>
              <p className="mt-1.5 text-lg font-bold text-white">{value}</p>
            </div>
            <span
              aria-hidden
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--t-bg)] text-[#6aa8e5]"
            >
              <Icon className="h-5 w-5" />
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

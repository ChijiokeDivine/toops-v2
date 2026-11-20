import { GiftIcon } from '@/app/_components/icons'
import { prisma } from '@/lib/db'
import { formatPusdUnits } from '@/lib/pusd'

function recipientName(user: {
  displayName: string | null
  telegramUsername: string | null
  bchAddress: string | null
}): string {
  if (user.displayName?.trim()) return user.displayName.trim()
  if (user.telegramUsername) return `@${user.telegramUsername}`
  if (user.bchAddress) return `${user.bchAddress.slice(0, 10)}…${user.bchAddress.slice(-6)}`
  return 'BCH user'
}

export async function ProfileTips({ userId }: { userId: string }) {
  const tips = await prisma.chatTip.findMany({
    where: { fromUserId: userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      amountPusd: true,
      createdAt: true,
      toUser: {
        select: { displayName: true, telegramUsername: true, bchAddress: true },
      },
    },
  })

  return (
    <section className="mt-7 rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface)] p-4 lg:p-5">
      <h2 className="text-lg font-semibold text-white">Tips Sent</h2>

      {tips.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--t-border)] px-4 py-8 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--t-green)]/10 text-[var(--t-green)]">
            <GiftIcon className="h-5 w-5" />
          </span>
          <p className="text-sm text-[var(--t-muted)]">You haven&apos;t sent any tips yet.</p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--t-border)]">
          {tips.map((tip) => (
            <li key={tip.id} className="flex items-center gap-3 py-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--t-bg)] text-[var(--t-green)]">
                <GiftIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {recipientName(tip.toUser)}
                </p>
                <p className="text-xs text-[var(--t-muted)]">
                  {tip.createdAt.toISOString().slice(0, 10)}
                </p>
              </div>
              <p className="ml-auto shrink-0 text-sm font-bold text-white">
                ${formatPusdUnits(tip.amountPusd)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

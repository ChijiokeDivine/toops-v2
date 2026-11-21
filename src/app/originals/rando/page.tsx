import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Rando - toops',
  description: 'Rando is not live yet. It is coming soon.',
}

export default function RandoPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1600px] justify-center px-3 py-20 lg:px-4">
      <section className="w-full max-w-md rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface)] p-8 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--t-green)]/30 bg-[var(--t-green)]/10 px-3 py-1 text-[12px] font-semibold text-[var(--t-green)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--t-green)]" />
          Coming soon
        </span>

        <h1 className="mt-4 text-3xl font-bold text-white">Rando</h1>
        <p className="mt-2.5 text-sm leading-6 text-[var(--t-muted)]">
          Rando is still in the workshop. It will open here as soon as it is ready.
        </p>

        <Link href="/" className="mn-cta mn-cta-fit mt-6">
          Back to the lobby
        </Link>
      </section>
    </main>
  )
}

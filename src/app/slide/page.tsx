import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Toops - BLAZE 2026 deck',
  description: 'The full Toops BCH BLAZE 2026 project presentation.',
}

/** Share link for this deck on Google Slides. The deck must be viewable by anyone with the link. */
const DECK_SHARE_URL =
  'https://docs.google.com/presentation/d/1-bPcgJ6zdBBVPUg3OpN7u_5VdpyQ3xz-DcOmR7YXq6I/edit?usp=sharing'

/** Google's iframe player form of the same deck. */
const DECK_EMBED_URL = DECK_SHARE_URL.replace(
  /\/edit.*$/,
  '/embed?start=false&loop=false&delayms=3000',
)

export default function SlidePage() {
  return (
    // Fills everything below the 73px sticky header, and clears the 60px mobile
    // nav bar, so the deck is the only thing on the page.
    <main className="h-[calc(100dvh_-_133px)] w-full bg-black lg:h-[calc(100dvh_-_73px)]">
      <iframe
        src={DECK_EMBED_URL}
        title="Toops BLAZE 2026 deck"
        allowFullScreen
        className="h-full w-full border-0"
      />
    </main>
  )
}

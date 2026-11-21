'use client'

import { useState, type ReactNode } from 'react'

/** Turn any Google Slides share/publish URL into its embeddable URL. */
export function toEmbedUrl(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  if (trimmed.includes('/embed')) return trimmed

  const published = trimmed.match(/presentation\/d\/e\/([\w-]+)/)
  if (published) {
    return `https://docs.google.com/presentation/d/e/${published[1]}/embed?start=false&loop=false&delayms=3000`
  }

  const shared = trimmed.match(/presentation\/d\/([\w-]+)/)
  if (shared) {
    return `https://docs.google.com/presentation/d/${shared[1]}/embed?start=false&loop=false&delayms=3000`
  }

  return null
}

const TAB =
  'cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors'

export function DeckView({
  shareUrl,
  slides,
}: {
  shareUrl: string
  slides: ReactNode
}) {
  const embedUrl = toEmbedUrl(shareUrl)
  const [tab, setTab] = useState<'live' | 'builtin'>(embedUrl ? 'live' : 'builtin')

  if (!embedUrl) {
    return <>{slides}</>
  }

  return (
    <>
      <div className="mb-4 inline-flex items-center gap-1 rounded-full border border-[var(--t-border)] bg-[var(--t-surface)] p-1">
        <button
          type="button"
          onClick={() => setTab('live')}
          aria-pressed={tab === 'live'}
          className={`${TAB} ${tab === 'live' ? 'bg-[var(--t-surface-3)] text-white' : 'text-[var(--t-muted)] hover:text-white'}`}
        >
          Google Slides
        </button>
        <button
          type="button"
          onClick={() => setTab('builtin')}
          aria-pressed={tab === 'builtin'}
          className={`${TAB} ${tab === 'builtin' ? 'bg-[var(--t-surface-3)] text-white' : 'text-[var(--t-muted)] hover:text-white'}`}
        >
          Built-in render
        </button>
      </div>

      {tab === 'live' ? (
        <div
          className="relative w-full overflow-hidden rounded-[14px] border border-[var(--t-border)] bg-black"
          style={{ aspectRatio: '9144000 / 5143500' }}
        >
          <iframe
            src={embedUrl}
            title="Toops BLAZE 2026 deck"
            allowFullScreen
            loading="lazy"
            className="absolute inset-0 h-full w-full border-0"
          />
        </div>
      ) : (
        slides
      )}
    </>
  )
}

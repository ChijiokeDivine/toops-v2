'use client'

import { useState } from 'react'
import { HACKATHON } from '@/lib/hackathon'

export function SiteBanner() {
  const [copied, setCopied] = useState(false)

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(HACKATHON.emberAddress)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="border-b border-[var(--t-border)] bg-[var(--t-surface)]">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 text-[11px] leading-5 text-[var(--t-muted)] lg:px-4">
        <span className="font-semibold tracking-wide text-[var(--t-green)]">
          {HACKATHON.event}
        </span>

        <span className="flex min-w-0 items-center gap-1.5">
          <span className="hidden shrink-0 sm:inline">EMBER2026 votes:</span>
          <code className="min-w-0 break-all font-mono text-[11px] text-white/80">
            {HACKATHON.emberAddress}
          </code>
          <button
            type="button"
            onClick={copyAddress}
            aria-label="Copy the EMBER2026 CashTokens address"
            className="shrink-0 rounded border border-[var(--t-border)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--t-muted)] transition-colors hover:text-white"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </span>

        <span className="ml-auto flex items-center gap-3">
          <a
            href={HACKATHON.baselineDemoUrl}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-white"
          >
            Old demo ↗
          </a>
          <a
            href={HACKATHON.baselineCodeUrl}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-white"
          >
            Old GitHub ↗
          </a>
          <a
            href={HACKATHON.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-white"
          >
            GitHub ↗
          </a>
        </span>
      </div>
    </div>
  )
}

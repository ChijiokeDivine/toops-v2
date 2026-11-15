'use client'

import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { HACKATHON } from '@/lib/hackathon'

import { ExternalLinkIcon } from './icons'

export function SiteBanner() {
  const pathname = usePathname()
  const [copied, setCopied] = useState(false)

  const address = HACKATHON.emberAddress
  const shortAddress = `${address.slice(0, 14)}…${address.slice(-6)}`

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(HACKATHON.emberAddress)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  if (pathname !== '/') return null

  const content = (
    <>
      <span className="font-semibold tracking-wide text-[var(--t-green)]">{HACKATHON.event}</span>

      <span className="flex min-w-0 items-center gap-1.5">
        <span className="hidden shrink-0 sm:inline">EMBER2026 votes:</span>
        <code className="min-w-0 font-mono text-[11px] text-white/80">
          <span title={address} className="sm:hidden">
            {shortAddress}
          </span>
          <span className="hidden break-all sm:inline">{address}</span>
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

      <span className="flex items-center gap-3 sm:ml-auto">
        <a
          href={HACKATHON.baselineDemoUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 transition-colors hover:text-white"
        >
          Old demo
          <ExternalLinkIcon className="h-3 w-3" />
        </a>
        <a
          href={HACKATHON.baselineCodeUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 transition-colors hover:text-white"
        >
          Old GitHub
          <ExternalLinkIcon className="h-3 w-3" />
        </a>
        <a
          href={HACKATHON.repoUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 transition-colors hover:text-white"
        >
          GitHub
          <ExternalLinkIcon className="h-3 w-3" />
        </a>
      </span>
    </>
  )

  return (
    <div className="border-b border-[var(--t-border)] bg-[var(--t-surface)]">
      <div className="mx-auto max-w-[1600px] px-3 py-1.5 text-[11px] leading-5 text-[var(--t-muted)] lg:px-4">
        {/* Mobile: slow one-line ticker */}
        <div className="overflow-hidden sm:hidden">
          <div className="t-banner-ticker flex w-max items-center">
            <div className="flex items-center gap-4 whitespace-nowrap pr-4">{content}</div>
            <div aria-hidden="true" className="flex items-center gap-4 whitespace-nowrap pr-4">
              {content}
            </div>
          </div>
        </div>

        {/* Desktop: single row */}
        <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 sm:flex">{content}</div>
      </div>
    </div>
  )
}

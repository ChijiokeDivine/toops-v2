'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '@/app/_components/icons'
import { CHAT_TIP_MAX_UNITS, CHAT_TIP_MIN_UNITS, CHAT_TIP_PRESETS } from '@/lib/chat/config'
import type { ChatUserView } from '@/lib/chat/types'
import { formatPusdUnits, parsePusdInput } from '@/lib/pusd'

type ChatTipDialogProps = {
  user: ChatUserView
  onClose: () => void
  onSent?: (balancePusd: string) => void
}

type TipResponse = {
  amountPusd?: string
  balancePusd?: string
  error?: string
}

const PRESETS: bigint[] = [...CHAT_TIP_PRESETS]

export function ChatTipDialog({ user, onClose, onSent }: ChatTipDialogProps) {
  const [selected, setSelected] = useState<number | null>(0)
  const [amount, setAmount] = useState(() => formatPusdUnits(PRESETS[0] ?? CHAT_TIP_MIN_UNITS))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [requestId] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `tip-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown, true)
    closeRef.current?.focus()
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  useEffect(() => {
    if (!success) return
    const timer = setTimeout(onClose, 1600)
    return () => clearTimeout(timer)
  }, [success, onClose])

  function pickPreset(index: number) {
    const preset = PRESETS[index]
    if (!preset) return
    setSelected(index)
    setAmount(formatPusdUnits(preset))
    setError(null)
  }

  async function submit() {
    if (submitting || success) return
    const units = parsePusdInput(amount)
    if (!units) {
      setError('Enter an amount like 0.50.')
      return
    }
    if (units < CHAT_TIP_MIN_UNITS) {
      setError(`The smallest tip is ${formatPusdUnits(CHAT_TIP_MIN_UNITS)} PUSD.`)
      return
    }
    if (units > CHAT_TIP_MAX_UNITS) {
      setError(`The largest tip is ${formatPusdUnits(CHAT_TIP_MAX_UNITS)} PUSD.`)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch('/api/chat/tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          amountPusd: units.toString(),
          requestId,
        }),
      })
      const data = (await response.json().catch(() => null)) as TipResponse | null
      if (!response.ok || !data?.amountPusd) {
        throw new Error(data?.error ?? 'The tip did not go through.')
      }
      setSuccess(`Tipped ${data.amountPusd} PUSD to ${user.name}.`)
      if (data.balancePusd) onSent?.(data.balancePusd)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The tip did not go through.')
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="chat-dialog-backdrop" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-tip-title"
        className="chat-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="chat-dialog-head">
          <div>
            <h2 id="chat-tip-title" className="chat-dialog-title">
              Tip User
            </h2>
            <p className="chat-dialog-sub">
              Send PUSD to <span className="font-semibold text-slate-200">{user.name}</span>
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="chat-dialog-close"
            aria-label="Close tip"
            onClick={onClose}
          >
            <CloseIcon className="h-[18px] w-[18px]" />
          </button>
        </div>

        {success ? (
          <>
            <p className="chat-dialog-success" role="status">
              {success}
            </p>
            <div className="chat-dialog-actions">
              <button type="button" className="chat-btn chat-btn-ghost" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <p className="chat-tip-label">Choose an amount</p>
            <div className="chat-tip-presets">
              {PRESETS.map((preset, index) => (
                <button
                  key={preset.toString()}
                  type="button"
                  className="chat-chip"
                  data-active={selected === index}
                  onClick={() => pickPreset(index)}
                  disabled={submitting}
                >
                  {formatPusdUnits(preset)}
                </button>
              ))}
            </div>

            <label className="chat-tip-label block" htmlFor="chat-tip-amount">
              Amount
            </label>
            <div className="chat-amount-field">
              <input
                id="chat-tip-amount"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                disabled={submitting}
                onChange={(event) => {
                  setSelected(null)
                  setAmount(event.target.value)
                  setError(null)
                }}
                placeholder="0.50"
              />
              <span className="chat-amount-unit">PUSD</span>
            </div>

            {error ? (
              <p className="chat-dialog-error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="chat-dialog-actions">
              <button type="button" className="chat-btn chat-btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="chat-btn chat-btn-primary" disabled={submitting}>
                {submitting ? 'Sending…' : 'Send tip'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}

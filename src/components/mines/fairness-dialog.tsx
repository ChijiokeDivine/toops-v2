'use client'

import { useEffect, useState } from 'react'
import { MINES_BOMB_COUNT, MINES_SAFE_COUNT, MINES_SHIELD_ODDS } from '@/lib/mines/config'
import type { MinesMatchSnapshot, MinesVerifyResponse } from '@/lib/mines/types'
import { CloseIcon, ShieldOutlineIcon } from './icons'

type FairnessDialogProps = {
  open: boolean
  onClose: () => void
  match: MinesMatchSnapshot | null
  clientSeed: string | null
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="mn-fair-row">
      <span>{label}</span>
      <code className={mono ? 'is-mono' : undefined}>{value}</code>
    </div>
  )
}

export function FairnessDialog({ open, onClose, match, clientSeed }: FairnessDialogProps) {
  const [data, setData] = useState<MinesVerifyResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open || !match) {
      setData(null)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/mines/verify?matchId=${encodeURIComponent(match.id)}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          MinesVerifyResponse | { error?: string } | null
        if (cancelled) return
        if (!response.ok || !payload || 'error' in payload) {
          setError((payload as { error?: string } | null)?.error ?? 'Verification unavailable.')
        } else {
          setData(payload as MinesVerifyResponse)
        }
      })
      .catch(() => {
        if (!cancelled) setError('Verification unavailable.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, match])

  if (!open) return null

  const revealed = data?.revealed === true
  const shieldLabel =
    data?.shieldIndex == null ? 'Not rolled (5 in 6)' : `Tile #${data.shieldIndex + 1}`

  return (
    <div className="mn-modal" role="presentation" onMouseDown={onClose}>
      <div
        className="mn-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mn-fair-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mn-modal-head">
          <div className="mn-modal-title-row">
            <ShieldOutlineIcon className="mn-modal-icon" />
            <h2 id="mn-fair-title">Provably Fair</h2>
          </div>
          <button type="button" className="mn-icon-button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <p className="mn-modal-lead">
          {MINES_BOMB_COUNT} bombs and {MINES_SAFE_COUNT} safe tiles are shuffled from{' '}
          <code>HMAC-SHA256(serverSeed, clientSeed1 + clientSeed2 + nonce)</code>. The first word
          rolls the {(MINES_SHIELD_ODDS * 100).toFixed(1)}% shield chance; the following words pick
          the bomb tiles.
        </p>

        <div className="mn-fair-list">
          <Row
            label="Server seed hash"
            value={match?.serverSeedHash ?? data?.serverSeedHash ?? '—'}
            mono
          />
          <Row label="Server seed" value={data?.serverSeed ?? 'Hidden until the match ends'} mono />
          <Row
            label="Client seeds"
            value={
              revealed && data?.clientSeeds.length
                ? data.clientSeeds.join(' + ')
                : (clientSeed ?? '—')
            }
            mono
          />
          <Row label="Nonce" value={String(data?.nonce ?? match?.nonce ?? 0)} />
          <Row label="HMAC (block 0)" value={data?.hmacHex ?? match?.hmacHex ?? '—'} mono />
          <Row label="Shield tile" value={revealed ? shieldLabel : 'Hidden until the match ends'} />
        </div>

        {loading ? <p className="mn-modal-note">Recomputing the board…</p> : null}
        {error ? <p className="mn-modal-note is-error">{error}</p> : null}

        {data && !loading ? (
          <div className="mn-checks">
            <span className={data.hashMatches ? 'is-ok' : 'is-bad'}>
              {data.hashMatches ? 'Hash matches' : 'Hash mismatch'}
            </span>
            <span
              className={data.boardMatches == null ? '' : data.boardMatches ? 'is-ok' : 'is-bad'}
            >
              {data.boardMatches == null
                ? 'Board sealed'
                : data.boardMatches
                  ? 'Board verified'
                  : 'Board mismatch'}
            </span>
            <span
              className={data.shieldMatches == null ? '' : data.shieldMatches ? 'is-ok' : 'is-bad'}
            >
              {data.shieldMatches == null
                ? 'Shield sealed'
                : data.shieldMatches
                  ? 'Shield verified'
                  : 'Shield mismatch'}
            </span>
          </div>
        ) : null}

        <p className="mn-modal-foot">
          The unhashed server seed is published after settlement, so anyone can recompute every
          tile. Cursor telemetry never affects the board.
        </p>
      </div>
    </div>
  )
}

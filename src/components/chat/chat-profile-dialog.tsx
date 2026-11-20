'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AtIcon, CloseIcon, CoinsIcon } from '@/app/_components/icons'
import type { ChatProfileView } from '@/lib/chat/types'
import { chatAccent } from './chat-colors'

type ChatProfileDialogProps = {
  userId: string
  isSelf: boolean
  onClose: () => void
  onMention: (user: ChatProfileView) => void
  onTip: (user: ChatProfileView) => void
}

function joinedLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

export function ChatProfileDialog({
  userId,
  isSelf,
  onClose,
  onMention,
  onTip,
}: ChatProfileDialogProps) {
  const [profile, setProfile] = useState<ChatProfileView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const controller = new AbortController()

    void fetch(`/api/chat/users/${encodeURIComponent(userId)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as {
          user?: ChatProfileView
          error?: string
        } | null
        if (!response.ok || !data?.user) {
          throw new Error(data?.error ?? 'That profile could not be loaded.')
        }
        setProfile(data.user)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(reason instanceof Error ? reason.message : 'That profile could not be loaded.')
      })

    return () => controller.abort()
  }, [userId])

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

  const accent = profile ? chatAccent(profile.id) : '#7c8695'

  return createPortal(
    <div className="chat-dialog-backdrop" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-profile-title"
        className="chat-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        {error ? (
          <>
            <div className="chat-dialog-head">
              <div>
                <h2 id="chat-profile-title" className="chat-dialog-title">
                  Profile
                </h2>
                <p className="chat-dialog-sub">{error}</p>
              </div>
              <button
                ref={closeRef}
                type="button"
                className="chat-dialog-close"
                aria-label="Close profile"
                onClick={onClose}
              >
                <CloseIcon className="h-[18px] w-[18px]" />
              </button>
            </div>
            <div className="chat-dialog-actions">
              <button type="button" className="chat-btn chat-btn-ghost" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : profile ? (
          <>
            <div className="chat-dialog-head">
              <div
                className="chat-profile-avatar"
                style={{ background: `${accent}26`, color: accent }}
              >
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="" draggable={false} />
                ) : (
                  profile.name.trim().charAt(0) || '?'
                )}
              </div>
              <div className="min-w-0">
                <h2
                  id="chat-profile-title"
                  className="chat-dialog-title truncate"
                  style={{ color: accent }}
                >
                  {profile.name}
                </h2>
                <p className="chat-dialog-sub truncate">
                  {profile.username ? `@${profile.username}` : 'toops player'}
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                className="chat-dialog-close"
                aria-label="Close profile"
                onClick={onClose}
              >
                <CloseIcon className="h-[18px] w-[18px]" />
              </button>
            </div>

            <dl className="chat-stats">
              <div className="chat-stat">
                <dt>Level</dt>
                <dd>{profile.level}</dd>
              </div>
              <div className="chat-stat">
                <dt>XP</dt>
                <dd>{profile.xp.toLocaleString('en-US')}</dd>
              </div>
              <div className="chat-stat">
                <dt>Messages</dt>
                <dd>{profile.messageCount.toLocaleString('en-US')}</dd>
              </div>
            </dl>

            <p className="chat-dialog-note">Joined {joinedLabel(profile.joinedAt)}</p>

            <div className="chat-dialog-actions">
              <button
                type="button"
                className="chat-btn chat-btn-ghost"
                onClick={() => onMention(profile)}
              >
                <AtIcon />
                Mention
              </button>
              {isSelf ? null : (
                <button
                  type="button"
                  className="chat-btn chat-btn-primary"
                  onClick={() => onTip(profile)}
                >
                  <CoinsIcon />
                  Tip User
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="chat-dialog-head">
              <div>
                <h2 id="chat-profile-title" className="chat-dialog-title">
                  Profile
                </h2>
                <p className="chat-dialog-sub">Loading player…</p>
              </div>
              <button
                ref={closeRef}
                type="button"
                className="chat-dialog-close"
                aria-label="Close profile"
                onClick={onClose}
              >
                <CloseIcon className="h-[18px] w-[18px]" />
              </button>
            </div>
            <div className="chat-dialog-loading" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

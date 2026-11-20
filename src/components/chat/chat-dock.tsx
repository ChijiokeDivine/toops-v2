'use client'

import type { CSSProperties, MouseEvent } from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowDownIcon,
  ChevronDownIcon,
  CloseIcon,
  FlagUkIcon,
  SendIcon,
  SmileIcon,
} from '@/app/_components/icons'
import { openAuth } from '@/components/auth/auth-events'
import { CHAT_MAX_LENGTH, CHAT_TITLE } from '@/lib/chat/config'
import { countChatChars, mentionToken } from '@/lib/chat/format'
import type { ChatUserView } from '@/lib/chat/types'
import { ChatContextMenu } from './chat-context-menu'
import { ChatEmojiBoard } from './chat-emoji-board'
import { CHAT_EVENT, consumePendingChat } from './chat-events'
import { ChatMessageRow } from './chat-message-row'
import { ChatProfileDialog } from './chat-profile-dialog'
import { ChatTipDialog } from './chat-tip-dialog'
import { type ChatRow, useChatFeed } from './use-chat-feed'

const ONLINE_FORMAT = new Intl.NumberFormat('en-US')
/** Distance from the bottom that still counts as "reading the latest". */
const BOTTOM_SLACK = 48
/** Distance from the top that triggers loading the previous page. */
const LOAD_OLDER_SLACK = 90

type MenuState = { row: ChatRow; x: number; y: number } | null

export function ChatDock() {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const [unread, setUnread] = useState(false)
  const [menu, setMenu] = useState<MenuState>(null)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [tipTarget, setTipTarget] = useState<ChatUserView | null>(null)

  const {
    status,
    viewer,
    rows,
    online,
    maxLength,
    hasMore,
    loadingOlder,
    error,
    connection,
    send,
    loadOlder,
    retry,
  } = useChatFeed(open)

  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const lastIdRef = useRef<string | null>(null)
  const initialisedRef = useRef(false)
  const anchorRef = useRef<{ height: number; top: number } | null>(null)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const element = listRef.current
    if (!element) return
    element.scrollTo({ top: element.scrollHeight, behavior })
    setUnread(false)
    setAtBottom(true)
  }, [])

  const loadOlderAnchored = useCallback(async () => {
    const element = listRef.current
    if (!element) return
    anchorRef.current = { height: element.scrollHeight, top: element.scrollTop }
    const loaded = await loadOlder()
    if (!loaded) anchorRef.current = null
  }, [loadOlder])

  // Open requests from the header, floating buttons, and mobile nav.
  useEffect(() => {
    if (consumePendingChat()) setOpen(true)
    const onOpen = () => setOpen(true)
    window.addEventListener(CHAT_EVENT, onOpen)
    return () => window.removeEventListener(CHAT_EVENT, onOpen)
  }, [])

  // Reset transient UI when the panel collapses.
  useEffect(() => {
    if (open) return
    initialisedRef.current = false
    lastIdRef.current = null
    anchorRef.current = null
    setDraft('')
    setNote(null)
    setEmojiOpen(false)
    setAtBottom(true)
    setUnread(false)
    setMenu(null)
    setProfileId(null)
    setTipTarget(null)
  }, [open])

  // Escape closes the emoji board first, then the panel. Menus and dialogs
  // handle their own Escape so one press never closes two layers.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (menu || profileId || tipTarget) return
      if (emojiOpen) {
        setEmojiOpen(false)
        return
      }
      setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, menu, profileId, tipTarget, emojiOpen])

  // Keep the page still behind the mobile sheet.
  useEffect(() => {
    if (!open) return
    if (!window.matchMedia('(max-width: 1023px)').matches) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  // Clicking anywhere outside the board (and its toggle) tucks it away.
  useEffect(() => {
    if (!open || !emojiOpen) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target) return
      if (target.closest('.chat-emoji-board')) return
      if (target.closest('[data-chat-emoji-toggle]')) return
      setEmojiOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, emojiOpen])

  // Grow the composer up to about five lines.
  useLayoutEffect(() => {
    const element = inputRef.current
    if (!element || !open) return
    element.style.height = '0px'
    element.style.height = `${Math.min(element.scrollHeight, 108)}px`
  }, [draft, open])

  // First paint of a page always lands on the newest message.
  useLayoutEffect(() => {
    if (!open || status !== 'ready' || initialisedRef.current) return
    const element = listRef.current
    if (!element) return
    initialisedRef.current = true
    element.scrollTop = element.scrollHeight
    lastIdRef.current = rows[rows.length - 1]?.id ?? null
  }, [open, status, rows])

  // New messages either follow the bottom or raise the "New message" pill.
  useLayoutEffect(() => {
    if (!open || !initialisedRef.current) return
    const element = listRef.current
    const last = rows[rows.length - 1]
    if (!element || !last || last.id === lastIdRef.current) return

    lastIdRef.current = last.id
    if (atBottom) {
      element.scrollTop = element.scrollHeight
      setUnread(false)
    } else {
      setUnread(true)
    }
  }, [open, rows, atBottom])

  // Prepending an older page must not move the text the reader is looking at.
  useLayoutEffect(() => {
    const element = listRef.current
    const anchor = anchorRef.current
    if (!element || !anchor) return
    anchorRef.current = null
    element.scrollTop = anchor.top + (element.scrollHeight - anchor.height)
  }, [rows.length])

  const onListScroll = useCallback(() => {
    const element = listRef.current
    if (!element) return

    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    const bottom = distance < BOTTOM_SLACK
    setAtBottom(bottom)
    if (bottom) setUnread(false)

    if (element.scrollTop < LOAD_OLDER_SLACK && hasMore && !loadingOlder) {
      void loadOlderAnchored()
    }
  }, [hasMore, loadingOlder, loadOlderAnchored])

  const handleSend = useCallback(async () => {
    if (!viewer) {
      openAuth()
      return
    }
    if (sending) return
    if (!draft.trim()) return
    if (countChatChars(draft) > maxLength) {
      setNote(`Messages can be at most ${maxLength} characters.`)
      return
    }

    setSending(true)
    setNote(null)
    const result = await send(draft)
    setSending(false)

    if (!result.ok) {
      setNote(result.error ?? 'Your message did not send.')
      return
    }

    setDraft('')
    setEmojiOpen(false)
    scrollToBottom()
  }, [viewer, sending, draft, maxLength, send, scrollToBottom])

  const insertMention = useCallback((user: ChatUserView) => {
    const token = `${mentionToken(user)} `
    setDraft((previous) => {
      if (!previous) return token
      return /[\s]$/.test(previous) ? `${previous}${token}` : `${previous} ${token}`
    })
    setMenu(null)
    setProfileId(null)
    setEmojiOpen(false)
    window.setTimeout(() => {
      const element = inputRef.current
      if (!element) return
      element.focus()
      const end = element.value.length
      element.setSelectionRange(end, end)
    }, 0)
  }, [])

  const openMenu = useCallback((event: MouseEvent<HTMLParagraphElement>, row: ChatRow) => {
    event.preventDefault()
    setEmojiOpen(false)
    setMenu({ row, x: event.clientX, y: event.clientY })
  }, [])

  const openTip = useCallback(
    (user: ChatUserView) => {
      setMenu(null)
      setProfileId(null)
      if (!viewer) {
        openAuth()
        return
      }
      setTipTarget(user)
    },
    [viewer],
  )

  if (!open) return null

  const used = countChatChars(draft)
  const overLimit = used > maxLength
  const canSend = Boolean(viewer) && draft.trim().length > 0 && !overLimit && !sending
  const onlineLabel = ONLINE_FORMAT.format(Math.max(online, 0))

  return (
    <>
      <section
        className="chat-panel chat-panel-open"
        role="dialog"
        aria-label={`${CHAT_TITLE} chat`}
      >
        <header className="chat-header">
          <FlagUkIcon className="chat-flag" />
          <span className="chat-title">{CHAT_TITLE}</span>
          <button
            type="button"
            className="chat-chevron-button"
            aria-label="More rooms are coming soon"
            title="More rooms are coming soon"
          >
            <ChevronDownIcon className="chat-chevron" />
          </button>
          <button
            type="button"
            className="chat-close"
            aria-label="Close chat"
            onClick={() => setOpen(false)}
          >
            <CloseIcon className="h-[18px] w-[18px]" />
          </button>
        </header>

        <div className="chat-stream">
          {status === 'loading' || status === 'idle' ? (
            <div className="chat-skeleton" aria-label="Loading chat" aria-busy="true">
              {Array.from({ length: 8 }, (_, index) => (
                <div className="chat-skeleton-row" key={index}>
                  <span className="chat-skeleton-avatar" />
                  <span className="chat-skeleton-lines">
                    <span
                      className="chat-skeleton-line"
                      style={{ width: `${58 + ((index * 13) % 35)}%` }}
                    />
                    <span className="chat-skeleton-line" />
                  </span>
                </div>
              ))}
            </div>
          ) : status === 'error' ? (
            <div className="chat-error">
              <p>{error ?? 'Chat is unavailable right now.'}</p>
              <button
                type="button"
                className="chat-btn chat-btn-ghost chat-btn-fit"
                onClick={retry}
              >
                Try again
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="chat-empty">
              <strong>No messages yet</strong>
              <span>Be the first to say hello in {CHAT_TITLE}.</span>
            </div>
          ) : (
            <div
              ref={listRef}
              className="chat-list"
              onScroll={onListScroll}
              aria-live="polite"
              aria-relevant="additions"
            >
              {loadingOlder ? (
                <div className="chat-loading-older" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              ) : null}
              {rows.map((row) => (
                <ChatMessageRow
                  key={row.id}
                  row={row}
                  isSelf={row.user.id === viewer?.id}
                  onOpenMenu={openMenu}
                />
              ))}
            </div>
          )}

          {unread ? (
            <button
              type="button"
              className="chat-new-message"
              onClick={() => scrollToBottom('smooth')}
            >
              <ArrowDownIcon />
              New message
            </button>
          ) : null}
        </div>

        <div className="chat-composer">
          {emojiOpen && viewer ? (
            <ChatEmojiBoard
              onPick={(emoji) => {
                setDraft((previous) => `${previous}${emoji}`)
                inputRef.current?.focus()
              }}
            />
          ) : null}

          {note ? (
            <div className="chat-error-note" role="alert">
              {note}
              <button type="button" aria-label="Dismiss error" onClick={() => setNote(null)}>
                <CloseIcon className="h-[13px] w-[13px]" />
              </button>
            </div>
          ) : null}

          <div className="chat-field">
            <textarea
              ref={inputRef}
              className="chat-input"
              rows={1}
              value={draft}
              readOnly={!viewer}
              placeholder={viewer ? 'Start typing...' : 'Sign in to chat'}
              aria-label="Message"
              onChange={(event) => {
                setDraft(event.target.value)
                if (note) setNote(null)
              }}
              onClick={() => {
                if (!viewer) openAuth()
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  void handleSend()
                }
              }}
            />

            <button
              type="button"
              className="chat-emoji-toggle"
              data-chat-emoji-toggle=""
              aria-label="Choose an emoji"
              aria-expanded={emojiOpen}
              disabled={!viewer}
              onClick={() => setEmojiOpen((previous) => !previous)}
            >
              <SmileIcon className="h-[22px] w-[22px]" />
            </button>

            <button
              type="button"
              className="chat-send"
              aria-label={viewer ? 'Send message' : 'Sign in to send'}
              disabled={viewer ? !canSend : false}
              onClick={() => {
                if (!viewer) {
                  openAuth()
                  return
                }
                void handleSend()
              }}
            >
              <SendIcon className="h-[21px] w-[21px]" />
            </button>
          </div>
        </div>

        <div className="chat-status">
          <span
            className="chat-dot"
            style={
              connection === 'live'
                ? undefined
                : ({
                    background: '#f0b429',
                    boxShadow: '0 0 6px rgba(240, 180, 41, 0.7)',
                  } satisfies CSSProperties)
            }
            title={connection === 'live' ? 'Connected' : 'Reconnecting…'}
          />
          <span>
            <span className="chat-online-count">{onlineLabel}</span> Online
          </span>
          <span className={`chat-counter${overLimit ? ' chat-counter-over' : ''}`}>
            {used} / {maxLength || CHAT_MAX_LENGTH}
          </span>
        </div>
      </section>

      {menu ? (
        <ChatContextMenu
          row={menu.row}
          x={menu.x}
          y={menu.y}
          canTip={menu.row.user.id !== viewer?.id}
          onProfile={(row) => {
            setMenu(null)
            setProfileId(row.user.id)
          }}
          onMention={(row) => insertMention(row.user)}
          onTip={(row) => openTip(row.user)}
          onClose={() => setMenu(null)}
        />
      ) : null}

      {profileId ? (
        <ChatProfileDialog
          key={profileId}
          userId={profileId}
          isSelf={profileId === viewer?.id}
          onClose={() => setProfileId(null)}
          onMention={(user) => insertMention(user)}
          onTip={(user) => openTip(user)}
        />
      ) : null}

      {tipTarget ? <ChatTipDialog user={tipTarget} onClose={() => setTipTarget(null)} /> : null}
    </>
  )
}

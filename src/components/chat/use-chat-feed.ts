'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AUTH_CHANGED } from '@/components/auth/auth-events'
import { CHAT_MAX_LENGTH, CHAT_PAGE_SIZE } from '@/lib/chat/config'
import { countChatChars, normalizeChatBody } from '@/lib/chat/format'
import type {
  ChatBootstrap,
  ChatMessageView,
  ChatMessagesPage,
  ChatUserView,
} from '@/lib/chat/types'

export type ChatRow = ChatMessageView & { pending?: boolean }

type FeedState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  viewer: ChatUserView | null
  messages: ChatMessageView[]
  online: number
  maxLength: number
  hasMore: boolean
  loadingOlder: boolean
  error: string | null
}

export type ChatConnection = 'connecting' | 'live' | 'reconnecting'

const EMPTY: FeedState = {
  status: 'idle',
  viewer: null,
  messages: [],
  online: 0,
  maxLength: CHAT_MAX_LENGTH,
  hasMore: false,
  loadingOlder: false,
  error: null,
}

function sortMessages(list: ChatMessageView[]): ChatMessageView[] {
  return [...list].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )
}

function mergeMessages(
  existing: ChatMessageView[],
  incoming: ChatMessageView[],
): ChatMessageView[] {
  const byId = new Map(existing.map((message) => [message.id, message]))
  for (const message of incoming) byId.set(message.id, message)
  return sortMessages([...byId.values()])
}

function isBootstrap(value: unknown): value is ChatBootstrap {
  return Boolean(
    value && typeof value === 'object' && Array.isArray((value as ChatBootstrap).messages),
  )
}

export function useChatFeed(open: boolean) {
  const [state, setState] = useState<FeedState>(EMPTY)
  const [pending, setPending] = useState<ChatRow[]>([])
  const [connection, setConnection] = useState<ChatConnection>('connecting')
  const stateRef = useRef(state)
  const pendingRef = useRef(pending)

  stateRef.current = state
  pendingRef.current = pending

  const fetchBootstrap = useCallback(async (signal?: AbortSignal): Promise<boolean> => {
    const response = await fetch(`/api/chat/messages?limit=${CHAT_PAGE_SIZE}`, {
      cache: 'no-store',
      signal,
    })
    if (!response.ok) return false
    const data: unknown = await response.json().catch(() => null)
    if (!isBootstrap(data)) return false

    setState((previous) => ({
      ...previous,
      status: 'ready',
      viewer: data.viewer ?? previous.viewer,
      online: data.online,
      maxLength: data.maxLength,
      hasMore: data.hasMore,
      messages: mergeMessages(previous.messages, data.messages),
      error: null,
    }))
    return true
  }, [])

  const refreshViewer = useCallback(async () => {
    if (!stateRef.current.viewer) await fetchBootstrap().catch(() => undefined)
  }, [fetchBootstrap])

  // Signing in happens in a global dialog, so the feed hears about it instead
  // of polling: the composer flips from "Sign in to chat" to a live input.
  useEffect(() => {
    if (!open) return
    const onAuthChanged = () => {
      void fetchBootstrap().catch(() => undefined)
    }
    window.addEventListener(AUTH_CHANGED, onAuthChanged)
    return () => window.removeEventListener(AUTH_CHANGED, onAuthChanged)
  }, [open, fetchBootstrap])

  useEffect(() => {
    if (!open) {
      setState(EMPTY)
      setPending([])
      setConnection('connecting')
      return
    }

    let cancelled = false
    const controller = new AbortController()
    let source: EventSource | null = null
    let connectedOnce = false

    setState({ ...EMPTY, status: 'loading' })
    setPending([])
    setConnection('connecting')

    void fetchBootstrap(controller.signal).then((ok) => {
      if (!cancelled && !ok) {
        setState((previous) => ({
          ...previous,
          status: 'error',
          error: 'Chat is unavailable right now.',
        }))
      }
    })

    const stream = new EventSource('/api/chat/stream')
    source = stream

    stream.onopen = () => {
      if (cancelled) return
      setConnection('live')
      // EventSource reconnects on its own. Refetch the latest page on every
      // reconnect so messages published while we were offline are not lost.
      if (connectedOnce) void fetchBootstrap(controller.signal).catch(() => undefined)
      connectedOnce = true
    }

    stream.onerror = () => {
      if (!cancelled) setConnection('reconnecting')
    }

    stream.addEventListener('chat', (event) => {
      let message: ChatMessageView | null = null
      try {
        message = JSON.parse((event as MessageEvent<string>).data) as ChatMessageView
      } catch {
        return
      }
      if (!message?.id) return
      setState((previous) => ({
        ...previous,
        messages: mergeMessages(previous.messages, [message as ChatMessageView]),
      }))
    })

    stream.addEventListener('presence', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent<string>).data) as { online?: number }
        if (typeof data.online === 'number') {
          setState((previous) => ({ ...previous, online: data.online as number }))
        }
      } catch {
        // ignore malformed frame
      }
    })

    stream.addEventListener('ready', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent<string>).data) as { online?: number }
        if (typeof data.online === 'number') {
          setState((previous) => ({ ...previous, online: data.online as number }))
        }
      } catch {
        // ignore malformed frame
      }
    })

    return () => {
      cancelled = true
      controller.abort()
      source?.close()
    }
  }, [open, fetchBootstrap])

  const retry = useCallback(() => {
    setState((previous) => ({ ...previous, status: 'loading', error: null }))
    void fetchBootstrap().then((ok) => {
      if (!ok) {
        setState((previous) => ({
          ...previous,
          status: 'error',
          error: 'Chat is unavailable right now.',
        }))
      }
    })
  }, [fetchBootstrap])

  const send = useCallback(async (rawBody: string): Promise<{ ok: boolean; error?: string }> => {
    const viewer = stateRef.current.viewer
    if (!viewer) return { ok: false, error: 'Sign in to chat.' }

    const body = normalizeChatBody(rawBody)
    if (!body) return { ok: false, error: 'Write a message first.' }
    if (countChatChars(body) > stateRef.current.maxLength) {
      return {
        ok: false,
        error: `Messages can be at most ${stateRef.current.maxLength} characters.`,
      }
    }

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const optimistic: ChatRow = {
      id: tempId,
      body,
      createdAt: new Date().toISOString(),
      user: viewer,
      pending: true,
    }
    setPending((previous) => [...previous, optimistic])

    try {
      const response = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      const data = (await response.json().catch(() => null)) as {
        message?: ChatMessageView
        error?: string
      } | null

      setPending((previous) => previous.filter((message) => message.id !== tempId))

      if (!response.ok || !data?.message) {
        return { ok: false, error: data?.error ?? 'Your message did not send.' }
      }

      setState((previous) => ({
        ...previous,
        messages: mergeMessages(previous.messages, [data.message as ChatMessageView]),
      }))
      return { ok: true }
    } catch {
      setPending((previous) => previous.filter((message) => message.id !== tempId))
      return { ok: false, error: 'Your message did not send. Check your connection.' }
    }
  }, [])

  const loadOlder = useCallback(async (): Promise<boolean> => {
    const before = stateRef.current.messages[0]?.id
    if (!before || !stateRef.current.hasMore || stateRef.current.loadingOlder) return false

    setState((previous) => ({ ...previous, loadingOlder: true }))
    try {
      const response = await fetch(
        `/api/chat/messages?before=${encodeURIComponent(before)}&limit=${CHAT_PAGE_SIZE}`,
        { cache: 'no-store' },
      )
      if (!response.ok) {
        setState((previous) => ({ ...previous, loadingOlder: false }))
        return false
      }
      const data = (await response.json().catch(() => null)) as ChatMessagesPage | null
      if (!data || !Array.isArray(data.messages)) {
        setState((previous) => ({ ...previous, loadingOlder: false }))
        return false
      }

      setState((previous) => ({
        ...previous,
        messages: mergeMessages(previous.messages, data.messages),
        hasMore: data.hasMore,
        loadingOlder: false,
      }))
      return data.messages.length > 0
    } catch {
      setState((previous) => ({ ...previous, loadingOlder: false }))
      return false
    }
  }, [])

  return {
    status: state.status,
    viewer: state.viewer,
    messages: state.messages,
    pending,
    rows: [...state.messages, ...pending],
    online: state.online,
    maxLength: state.maxLength,
    hasMore: state.hasMore,
    loadingOlder: state.loadingOlder,
    error: state.error,
    connection,
    send,
    loadOlder,
    retry,
    refreshViewer,
  }
}

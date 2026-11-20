import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getChatOnlineCount } from '@/lib/chat/bus'
import { CHAT_MAX_LENGTH, CHAT_PAGE_SIZE } from '@/lib/chat/config'
import { toChatUserView } from '@/lib/chat/serialize'
import { chatErrorResponse, createChatMessage, listChatMessages } from '@/lib/chat/service'
import type { ChatBootstrap } from '@/lib/chat/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const session = await getSession()
    const beforeId = url.searchParams.get('before')?.trim() || null
    const requested = Number(url.searchParams.get('limit') ?? CHAT_PAGE_SIZE)
    const limit = Number.isFinite(requested) ? requested : CHAT_PAGE_SIZE

    const page = await listChatMessages({ beforeId, limit })

    if (beforeId) {
      return NextResponse.json(page)
    }

    const payload: ChatBootstrap = {
      viewer: session ? toChatUserView(session.user) : null,
      online: getChatOnlineCount(),
      maxLength: CHAT_MAX_LENGTH,
      messages: page.messages,
      hasMore: page.hasMore,
    }
    return NextResponse.json(payload)
  } catch (error) {
    return chatErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Sign in to chat.' }, { status: 401 })
    }

    const payload = (await request.json().catch(() => null)) as { body?: unknown } | null
    if (!payload || typeof payload.body !== 'string') {
      return NextResponse.json({ error: 'Write a message first.' }, { status: 400 })
    }

    const message = await createChatMessage({
      userId: session.userId,
      viewer: toChatUserView(session.user),
      rawBody: payload.body,
    })

    return NextResponse.json({ message })
  } catch (error) {
    return chatErrorResponse(error)
  }
}

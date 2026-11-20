import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { chatErrorResponse, sendChatTip } from '@/lib/chat/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Sign in to tip.' }, { status: 401 })
    }

    const payload = (await request.json().catch(() => null)) as {
      userId?: unknown
      amountPusd?: unknown
      requestId?: unknown
    } | null
    if (!payload) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const toUserId = typeof payload.userId === 'string' ? payload.userId.trim() : ''
    if (!toUserId) {
      return NextResponse.json({ error: 'Choose a player to tip.' }, { status: 400 })
    }

    const amountText =
      typeof payload.amountPusd === 'string'
        ? payload.amountPusd.trim()
        : typeof payload.amountPusd === 'number'
          ? String(payload.amountPusd)
          : ''
    if (!/^\d{1,9}$/.test(amountText)) {
      return NextResponse.json({ error: 'Choose a valid tip amount.' }, { status: 400 })
    }

    const requestId =
      typeof payload.requestId === 'string' && payload.requestId.length <= 80
        ? payload.requestId
        : null

    const result = await sendChatTip({
      fromUserId: session.userId,
      toUserId,
      amountPusd: BigInt(amountText),
      requestId,
    })

    return NextResponse.json(result)
  } catch (error) {
    return chatErrorResponse(error)
  }
}

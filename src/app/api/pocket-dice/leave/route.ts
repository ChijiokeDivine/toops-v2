import { NextResponse } from 'next/server'
import { leaveMatch } from '@/lib/pocket-dice/engine'
import { pocketDiceErrorResponse, requireUserId } from '@/lib/pocket-dice/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const userId = await requireUserId()
    await leaveMatch(userId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return pocketDiceErrorResponse(error)
  }
}

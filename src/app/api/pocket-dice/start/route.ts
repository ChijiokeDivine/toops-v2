import { NextResponse } from 'next/server'
import { startMatch } from '@/lib/pocket-dice/engine'
import { pocketDiceErrorResponse, requireUserId } from '@/lib/pocket-dice/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const userId = await requireUserId()
    await startMatch(userId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return pocketDiceErrorResponse(error)
  }
}

import { NextResponse } from 'next/server'
import { getPocketDiceState } from '@/lib/pocket-dice/engine'
import { pocketDiceErrorResponse, requireUserId } from '@/lib/pocket-dice/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const userId = await requireUserId()
    return NextResponse.json(await getPocketDiceState(userId))
  } catch (error) {
    return pocketDiceErrorResponse(error)
  }
}

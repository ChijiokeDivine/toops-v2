import { NextResponse } from 'next/server'
import { getSessionUserId } from '@/lib/auth/session'
import { getRouletteState } from '@/lib/roulette/engine'
import { rouletteErrorResponse } from '@/lib/roulette/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Public: signed-out visitors watch the live table, they just cannot bet. */
export async function GET() {
  try {
    const userId = await getSessionUserId()
    return NextResponse.json(await getRouletteState(userId))
  } catch (error) {
    return rouletteErrorResponse(error)
  }
}

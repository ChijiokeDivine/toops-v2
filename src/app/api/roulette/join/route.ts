import { NextResponse } from 'next/server'
import { joinTable } from '@/lib/roulette/engine'
import { requireUserId, rouletteErrorResponse } from '@/lib/roulette/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Takes a seat at the shared table and opens a betting window if it is idle. */
export async function POST() {
  try {
    const userId = await requireUserId()
    const result = await joinTable()
    return NextResponse.json({ ok: true, roundId: result.roundId })
  } catch (error) {
    return rouletteErrorResponse(error)
  }
}

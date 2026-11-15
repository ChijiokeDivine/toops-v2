import { NextResponse } from 'next/server'
import { markMinesReady } from '@/lib/mines/engine'
import { minesErrorResponse, readMatchId, requireMinesUserId } from '@/lib/mines/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const userId = await requireMinesUserId()
    const body = await request.json().catch(() => null)
    const matchId = readMatchId(body)
    await markMinesReady(matchId, userId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return minesErrorResponse(error)
  }
}

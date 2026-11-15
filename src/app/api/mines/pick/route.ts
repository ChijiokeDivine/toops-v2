import { NextResponse } from 'next/server'
import { pickMinesTile } from '@/lib/mines/engine'
import { minesErrorResponse, readMatchId, readTile, requireMinesUserId } from '@/lib/mines/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const userId = await requireMinesUserId()
    const body = await request.json().catch(() => null)
    const matchId = readMatchId(body)
    const tile = readTile(body)
    const snapshot = await pickMinesTile(matchId, userId, tile)
    return NextResponse.json({ ok: true, snapshot })
  } catch (error) {
    return minesErrorResponse(error)
  }
}

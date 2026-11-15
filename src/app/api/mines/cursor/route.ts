import { NextResponse } from 'next/server'
import { setMinesCursor } from '@/lib/mines/engine'
import { minesErrorResponse, readMatchId, requireMinesUserId } from '@/lib/mines/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Upstream half of the ghost-cursor channel. The browser throttles this to
 * 20-25 frames per second and only sends while the pointer is over the board;
 * the SSE route fans the frame out to the opponent.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireMinesUserId({ cached: true })
    const body = await request.json().catch(() => null)
    const matchId = readMatchId(body)

    const source = body as { x?: unknown; y?: unknown; tile?: unknown } | null
    const x = Number(source?.x)
    const y = Number(source?.y)
    const tile =
      typeof source?.tile === 'number' && Number.isInteger(source.tile) ? source.tile : null

    await setMinesCursor(matchId, userId, { x, y, tile })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return minesErrorResponse(error)
  }
}

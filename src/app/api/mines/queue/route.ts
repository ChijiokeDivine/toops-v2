import { NextResponse } from 'next/server'
import { MinesError, joinMinesQueue, leaveMinesQueue } from '@/lib/mines/engine'
import { minesErrorResponse, requireMinesUserId } from '@/lib/mines/http'
import { parsePusdInput } from '@/lib/pusd'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const userId = await requireMinesUserId()
    const body = await request.json().catch(() => null)
    const rawStake =
      body && typeof body === 'object' && 'stake' in body
        ? (body as { stake?: unknown }).stake
        : null
    const stakePusd = parsePusdInput(String(rawStake ?? ''))

    if (!stakePusd) {
      throw new MinesError('Choose a valid stake amount.', 400, 'INVALID_STAKE')
    }

    const result = await joinMinesQueue(userId, stakePusd)
    return NextResponse.json({ ok: true, matchId: result.matchId })
  } catch (error) {
    return minesErrorResponse(error)
  }
}

export async function DELETE() {
  try {
    const userId = await requireMinesUserId()
    await leaveMinesQueue(userId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return minesErrorResponse(error)
  }
}

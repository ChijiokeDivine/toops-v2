import { NextResponse } from 'next/server'
import { dismissMinesMatch } from '@/lib/mines/engine'
import { minesErrorResponse, readMatchId, requireMinesUserId } from '@/lib/mines/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(request: Request) {
  try {
    const userId = await requireMinesUserId()
    const body = await request.json().catch(() => null)
    const matchId = readMatchId(body)
    await dismissMinesMatch(matchId, userId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return minesErrorResponse(error)
  }
}

import { NextResponse } from 'next/server'
import { MinesError, verifyMinesMatch } from '@/lib/mines/engine'
import { minesErrorResponse } from '@/lib/mines/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const matchId = new URL(request.url).searchParams.get('matchId')?.trim()
    if (!matchId) {
      throw new MinesError('Match id is required.', 400, 'MATCH_ID_REQUIRED')
    }
    const verification = await verifyMinesMatch(matchId)
    return NextResponse.json(verification)
  } catch (error) {
    return minesErrorResponse(error)
  }
}

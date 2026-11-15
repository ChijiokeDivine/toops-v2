import { NextResponse } from 'next/server'
import { touchMinesPresence } from '@/lib/mines/engine'
import { minesErrorResponse, readMatchId, requireMinesUserId } from '@/lib/mines/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const userId = await requireMinesUserId({ cached: true })
    const body = await request.json().catch(() => null)
    const matchId = readMatchId(body)
    await touchMinesPresence(matchId, userId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return minesErrorResponse(error)
  }
}

import { NextResponse } from 'next/server'
import { joinMatch } from '@/lib/pocket-dice/engine'
import { pocketDiceErrorResponse, requireUserId } from '@/lib/pocket-dice/http'
import { parsePusdInput } from '@/lib/pusd'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const userId = await requireUserId()
    const body = (await request.json().catch(() => null)) as {
      stake?: unknown
      pick?: unknown
    } | null

    const stakePusd = parsePusdInput(String(body?.stake ?? ''))
    if (!stakePusd) {
      return NextResponse.json(
        { error: 'Choose a valid stake amount.', code: 'INVALID_STAKE' },
        { status: 400 },
      )
    }

    const result = await joinMatch(userId, stakePusd, Number(body?.pick))
    return NextResponse.json({ ok: true, matchId: result.matchId })
  } catch (error) {
    return pocketDiceErrorResponse(error)
  }
}

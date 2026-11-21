import { NextResponse } from 'next/server'
import { placeBet } from '@/lib/roulette/engine'
import { requireUserId, rouletteErrorResponse } from '@/lib/roulette/http'
import { isRouletteOutcome } from '@/lib/roulette/rules'
import { parsePusdInput } from '@/lib/pusd'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const userId = await requireUserId()
    const body = (await request.json().catch(() => null)) as {
      outcome?: unknown
      amount?: unknown
    } | null

    if (!isRouletteOutcome(body?.outcome)) {
      return NextResponse.json(
        { error: 'Bet on red, black or green.', code: 'INVALID_OUTCOME' },
        { status: 400 },
      )
    }

    const amountPusd = parsePusdInput(String(body?.amount ?? ''))
    if (!amountPusd) {
      return NextResponse.json(
        { error: 'Enter a valid bet amount.', code: 'INVALID_AMOUNT' },
        { status: 400 },
      )
    }

    await placeBet(userId, body.outcome, amountPusd)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return rouletteErrorResponse(error)
  }
}

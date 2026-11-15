import { NextResponse } from 'next/server'
import { getMinesState } from '@/lib/mines/engine'
import { minesErrorResponse, requireMinesUserId } from '@/lib/mines/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const userId = await requireMinesUserId()
    const state = await getMinesState(userId)
    return NextResponse.json(state)
  } catch (error) {
    return minesErrorResponse(error)
  }
}

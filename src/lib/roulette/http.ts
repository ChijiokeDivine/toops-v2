import { NextResponse } from 'next/server'
import { getSessionUserId } from '@/lib/auth/session'
import { RouletteError } from './engine'

export async function requireUserId(): Promise<string> {
  const userId = await getSessionUserId()
  if (!userId) {
    throw new RouletteError('Sign in to play Roulette.', 401, 'UNAUTHENTICATED')
  }
  return userId
}

export function rouletteErrorResponse(error: unknown): NextResponse {
  if (error instanceof RouletteError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  }
  console.error('[roulette] request failed', error)
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
}

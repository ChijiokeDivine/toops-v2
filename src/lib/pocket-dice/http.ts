import { NextResponse } from 'next/server'
import { getSessionUserId } from '@/lib/auth/session'
import { PocketDiceError } from './engine'

export async function requireUserId(): Promise<string> {
  const userId = await getSessionUserId()
  if (!userId) {
    throw new PocketDiceError('Sign in to play Pocket Dice.', 401, 'UNAUTHENTICATED')
  }
  return userId
}

export function pocketDiceErrorResponse(error: unknown): NextResponse {
  if (error instanceof PocketDiceError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  }
  console.error('[pocket-dice] request failed', error)
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
}

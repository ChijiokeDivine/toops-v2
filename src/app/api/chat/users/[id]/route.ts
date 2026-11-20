import { NextResponse } from 'next/server'
import { chatErrorResponse, getChatProfile } from '@/lib/chat/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getChatProfile(id)
    return NextResponse.json({ user })
  } catch (error) {
    return chatErrorResponse(error)
  }
}

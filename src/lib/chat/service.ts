import 'server-only'

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { formatPusdUnits } from '@/lib/pusd'
import { publishChatMessage } from './bus'
import {
  CHAT_CHANNEL,
  CHAT_MAX_LENGTH,
  CHAT_RATE_LIMIT_COUNT,
  CHAT_RATE_LIMIT_WINDOW_MS,
  CHAT_TIP_MAX_UNITS,
  CHAT_TIP_MIN_UNITS,
} from './config'
import { countChatChars, normalizeChatBody } from './format'
import { chatUserSelect, toChatMessageView, toChatUserView } from './serialize'
import type { ChatMessageView, ChatMessagesPage, ChatProfileView, ChatUserView } from './types'

export class ChatError extends Error {
  status: number
  code: string

  constructor(message: string, status = 400, code = 'CHAT_ERROR') {
    super(message)
    this.name = 'ChatError'
    this.status = status
    this.code = code
  }
}

const messageRowSelect = {
  id: true,
  body: true,
  createdAt: true,
  user: { select: chatUserSelect },
} satisfies Prisma.ChatMessageSelect

/** Sliding-window flood control, deliberately in-process and disposable. */
const postHits = new Map<string, number[]>()

function assertCanPost(userId: string): void {
  const now = Date.now()
  const cutoff = now - CHAT_RATE_LIMIT_WINDOW_MS
  const hits = (postHits.get(userId) ?? []).filter((at) => at > cutoff)
  if (hits.length >= CHAT_RATE_LIMIT_COUNT) {
    postHits.set(userId, hits)
    throw new ChatError('Slow down a little before sending again.', 429, 'RATE_LIMITED')
  }
  hits.push(now)
  postHits.set(userId, hits)
  if (postHits.size > 5_000) {
    for (const [key, values] of postHits) {
      if (!values.some((at) => at > cutoff)) postHits.delete(key)
    }
  }
}

export async function listChatMessages(options: {
  beforeId?: string | null
  limit: number
}): Promise<ChatMessagesPage> {
  const limit = Math.max(1, Math.min(options.limit, 100))
  const where: Prisma.ChatMessageWhereInput = { channel: CHAT_CHANNEL }

  if (options.beforeId) {
    const cursor = await prisma.chatMessage.findUnique({
      where: { id: options.beforeId },
      select: { id: true, createdAt: true },
    })
    if (cursor) {
      where.OR = [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ]
    }
  }

  const rows = await prisma.chatMessage.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: messageRowSelect,
  })

  const hasMore = rows.length > limit
  const page = rows.slice(0, limit).reverse()

  return { messages: page.map(toChatMessageView), hasMore }
}

export async function createChatMessage(params: {
  userId: string
  viewer: ChatUserView
  rawBody: string
}): Promise<ChatMessageView> {
  const body = normalizeChatBody(params.rawBody)
  if (!body) throw new ChatError('Write a message first.', 400, 'EMPTY_MESSAGE')
  if (countChatChars(body) > CHAT_MAX_LENGTH) {
    throw new ChatError(
      `Messages can be at most ${CHAT_MAX_LENGTH} characters.`,
      400,
      'MESSAGE_TOO_LONG',
    )
  }

  assertCanPost(params.userId)

  const row = await prisma.chatMessage.create({
    data: { channel: CHAT_CHANNEL, userId: params.userId, body },
    select: { id: true, body: true, createdAt: true },
  })

  const message: ChatMessageView = {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    user: params.viewer,
  }

  await publishChatMessage(message).catch(() => undefined)
  return message
}

export async function getChatProfile(userId: string): Promise<ChatProfileView> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...chatUserSelect,
      _count: { select: { chatMessages: true } },
    },
  })
  if (!row) throw new ChatError('Player not found.', 404, 'USER_NOT_FOUND')

  const { _count, ...user } = row
  return { ...toChatUserView(user), messageCount: _count.chatMessages }
}

export type ChatTipResult = {
  id: string
  amountPusd: string
  balancePusd: string
  recipient: ChatUserView
}

export async function sendChatTip(params: {
  fromUserId: string
  toUserId: string
  amountPusd: bigint
  requestId?: string | null
}): Promise<ChatTipResult> {
  const { fromUserId, toUserId, amountPusd } = params

  if (fromUserId === toUserId) {
    throw new ChatError('You cannot tip yourself.', 400, 'SELF_TIP')
  }
  if (amountPusd < CHAT_TIP_MIN_UNITS || amountPusd > CHAT_TIP_MAX_UNITS) {
    throw new ChatError('Choose a valid tip amount.', 400, 'INVALID_AMOUNT')
  }

  const recipient = await prisma.user.findUnique({
    where: { id: toUserId },
    select: chatUserSelect,
  })
  if (!recipient) throw new ChatError('Player not found.', 404, 'USER_NOT_FOUND')

  const requestId = params.requestId?.trim() || null
  if (requestId) {
    const existing = await prisma.chatTip.findUnique({
      where: { requestId },
      select: { id: true, amountPusd: true, fromUserId: true, toUserId: true },
    })
    if (existing) {
      if (existing.fromUserId !== fromUserId || existing.toUserId !== toUserId) {
        throw new ChatError('That tip reference is already in use.', 409, 'TIP_CONFLICT')
      }
      const sender = await prisma.user.findUniqueOrThrow({
        where: { id: fromUserId },
        select: { balancePusd: true },
      })
      return {
        id: existing.id,
        amountPusd: formatPusdUnits(existing.amountPusd),
        balancePusd: formatPusdUnits(sender.balancePusd),
        recipient: toChatUserView(recipient),
      }
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const tip = await tx.chatTip.create({
        data: {
          requestId,
          fromUserId,
          toUserId,
          amountPusd,
        },
        select: { id: true, amountPusd: true },
      })

      const reserved = await tx.user.updateMany({
        where: { id: fromUserId, balancePusd: { gte: amountPusd } },
        data: { balancePusd: { decrement: amountPusd } },
      })
      if (reserved.count !== 1) {
        throw new ChatError('You do not have enough PUSD for that tip.', 409, 'INSUFFICIENT_FUNDS')
      }

      const receiver = await tx.user.update({
        where: { id: toUserId },
        data: { balancePusd: { increment: amountPusd } },
        select: { balancePusd: true },
      })
      const sender = await tx.user.findUniqueOrThrow({
        where: { id: fromUserId },
        select: { balancePusd: true },
      })

      await tx.ledgerEntry.createMany({
        data: [
          {
            userId: fromUserId,
            kind: 'TIP',
            amountPusd: -amountPusd,
            balanceAfterPusd: sender.balancePusd,
            reference: `chat-tip:${tip.id}:sent`,
            metadata: { toUserId, tipId: tip.id },
          },
          {
            userId: toUserId,
            kind: 'TIP',
            amountPusd,
            balanceAfterPusd: receiver.balancePusd,
            reference: `chat-tip:${tip.id}:received`,
            metadata: { fromUserId, tipId: tip.id },
          },
        ],
      })

      return {
        id: tip.id,
        amountPusd: tip.amountPusd,
        balancePusd: sender.balancePusd,
      }
    })

    return {
      id: result.id,
      amountPusd: formatPusdUnits(result.amountPusd),
      balancePusd: formatPusdUnits(result.balancePusd),
      recipient: toChatUserView(recipient),
    }
  } catch (error) {
    if (
      requestId &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const existing = await prisma.chatTip.findUnique({
        where: { requestId },
        select: { id: true, amountPusd: true, fromUserId: true, toUserId: true },
      })
      if (existing && existing.fromUserId === fromUserId && existing.toUserId === toUserId) {
        const sender = await prisma.user.findUniqueOrThrow({
          where: { id: fromUserId },
          select: { balancePusd: true },
        })
        return {
          id: existing.id,
          amountPusd: formatPusdUnits(existing.amountPusd),
          balancePusd: formatPusdUnits(sender.balancePusd),
          recipient: toChatUserView(recipient),
        }
      }
    }
    throw error
  }
}

export function chatErrorResponse(error: unknown): Response {
  if (error instanceof ChatError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status })
  }
  console.error('[chat] request failed', error)
  return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
}

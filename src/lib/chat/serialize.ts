import 'server-only'

import type { Prisma } from '@prisma/client'
import { chatLevel } from './format'
import type { ChatMessageView, ChatUserView } from './types'

export const chatUserSelect = {
  id: true,
  displayName: true,
  telegramUsername: true,
  telegramPhotoUrl: true,
  avatarUrl: true,
  xp: true,
  createdAt: true,
} satisfies Prisma.UserSelect

export type ChatUserRow = Prisma.UserGetPayload<{ select: typeof chatUserSelect }>

export function chatDisplayName(user: {
  displayName: string | null
  telegramUsername: string | null
}): string {
  const displayName = user.displayName?.trim()
  if (displayName) return displayName
  if (user.telegramUsername) return `@${user.telegramUsername}`
  return 'Player'
}

export function toChatUserView(user: ChatUserRow): ChatUserView {
  return {
    id: user.id,
    name: chatDisplayName(user),
    username: user.telegramUsername,
    avatarUrl: user.avatarUrl ?? user.telegramPhotoUrl ?? null,
    xp: user.xp,
    level: chatLevel(user.xp),
    joinedAt: user.createdAt.toISOString(),
  }
}

export function toChatMessageView(row: {
  id: string
  body: string
  createdAt: Date
  user: ChatUserRow
}): ChatMessageView {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    user: toChatUserView(row.user),
  }
}

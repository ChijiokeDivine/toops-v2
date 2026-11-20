'use client'

import type { ChatUserView } from '@/lib/chat/types'
import { chatAccent } from './chat-colors'

type ChatAvatarProps = {
  user: ChatUserView
  className?: string
}

/** 19px inline avatar used by message rows; falls back to the initial. */
export function ChatAvatar({ user, className }: ChatAvatarProps) {
  const accent = chatAccent(user.id)
  const style = { background: `${accent}26`, color: accent } as const

  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        loading="lazy"
        draggable={false}
        className={`chat-avatar${className ? ` ${className}` : ''}`}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className={`chat-avatar${className ? ` ${className}` : ''}`}
      style={style}
    >
      {user.name.trim().charAt(0) || '?'}
    </span>
  )
}

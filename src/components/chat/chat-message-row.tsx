'use client'

import { type MouseEvent, memo } from 'react'
import type { ChatRow } from './use-chat-feed'
import { ChatAvatar } from './chat-avatar'
import { chatAccent } from './chat-colors'

const TOKEN = /(https?:\/\/[^\s<>"']+|@[A-Za-z0-9_.-]{2,})/g

function renderBody(body: string) {
  return body.split(TOKEN).map((part, index) => {
    if (!part) return null

    if (part.startsWith('http://') || part.startsWith('https://')) {
      const trailing = /[),.;!?]+$/.exec(part)?.[0] ?? ''
      const href = trailing ? part.slice(0, -trailing.length) : part
      return (
        <span key={index}>
          <a href={href} target="_blank" rel="noopener noreferrer nofollow">
            {href}
          </a>
          {trailing}
        </span>
      )
    }

    if (part.startsWith('@') && part.length > 1) {
      return (
        <span key={index} className="chat-mention">
          {part}
        </span>
      )
    }

    return <span key={index}>{part}</span>
  })
}

type ChatMessageRowProps = {
  row: ChatRow
  isSelf: boolean
  onOpenMenu: (event: MouseEvent<HTMLParagraphElement>, row: ChatRow) => void
}

/**
 * One line of chat. The avatar is inline rather than a flex column so wrapped
 * text returns to the left edge, exactly like the reference screenshots.
 */
export const ChatMessageRow = memo(function ChatMessageRow({
  row,
  isSelf,
  onOpenMenu,
}: ChatMessageRowProps) {
  const accent = chatAccent(row.user.id)

  return (
    <p
      className={`chat-row${row.pending ? ' chat-row-pending' : ''}${isSelf ? ' chat-row-self' : ''}`}
      title={new Date(row.createdAt).toLocaleString()}
      onContextMenu={(event) => {
        event.preventDefault()
        onOpenMenu(event, row)
      }}
    >
      <ChatAvatar user={row.user} />
      <span className="chat-name" style={{ color: accent }}>
        {row.user.name}
      </span>
      <span className="chat-name-colon" style={{ color: accent }}>
        :
      </span>{' '}
      <span className="chat-body">{renderBody(row.body)}</span>
    </p>
  )
})

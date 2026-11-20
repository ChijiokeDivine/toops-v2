'use client'

import { CHAT_EMOJIS } from './emoji'

type ChatEmojiBoardProps = {
  onPick: (emoji: string) => void
}

export function ChatEmojiBoard({ onPick }: ChatEmojiBoardProps) {
  return (
    <div className="chat-emoji-board" role="dialog" aria-label="Choose an emoji">
      <div className="chat-emoji-grid">
        {CHAT_EMOJIS.map((emoji, index) => (
          <button
            key={`${emoji}-${index}`}
            type="button"
            className="chat-emoji-cell"
            aria-label={emoji}
            onClick={() => onPick(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}

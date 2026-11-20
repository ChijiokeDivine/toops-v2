'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AtIcon, CoinsIcon, UserIcon } from '@/app/_components/icons'
import type { ChatRow } from './use-chat-feed'

const MENU_WIDTH = 146
/** Three 34px rows, 5px padding on each side, plus the border. */
const MENU_HEIGHT = 34 * 3 + 10 + 2

type ChatContextMenuProps = {
  row: ChatRow
  x: number
  y: number
  canTip: boolean
  onProfile: (row: ChatRow) => void
  onMention: (row: ChatRow) => void
  onTip: (row: ChatRow) => void
  onClose: () => void
}

function fitToViewport(x: number, y: number) {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  let left = x
  let top = y
  if (left + MENU_WIDTH > viewportWidth - 8) left = x - MENU_WIDTH
  if (top + MENU_HEIGHT > viewportHeight - 8) top = y - MENU_HEIGHT

  return {
    left: Math.max(8, Math.min(left, viewportWidth - MENU_WIDTH - 8)),
    top: Math.max(8, Math.min(top, viewportHeight - MENU_HEIGHT - 8)),
  }
}

/** Right-click actions on a message: Profile, Mention (reply), Tip User. */
export function ChatContextMenu({
  row,
  x,
  y,
  canTip,
  onProfile,
  onMention,
  onTip,
  onClose,
}: ChatContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [position] = useState(() => fitToViewport(x, y))

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onClose, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={`Actions for ${row.user.name}`}
      className="chat-menu"
      style={{ left: position.left, top: position.top }}
    >
      <button
        type="button"
        role="menuitem"
        className="chat-menu-item"
        onClick={() => onProfile(row)}
      >
        <UserIcon />
        Profile
      </button>
      <button
        type="button"
        role="menuitem"
        className="chat-menu-item"
        onClick={() => onMention(row)}
      >
        <AtIcon />
        Mention
      </button>
      {canTip ? (
        <button type="button" role="menuitem" className="chat-menu-item" onClick={() => onTip(row)}>
          <CoinsIcon />
          Tip User
        </button>
      ) : null}
    </div>,
    document.body,
  )
}

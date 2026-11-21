'use client'

import { openChat } from '@/components/chat/chat-events'
import { ChatIcon, HeadsetIcon } from './icons'

const ACTIONS = [
  { label: 'Open chat', Icon: ChatIcon, action: 'chat' as const },
  { label: 'Customer support', Icon: HeadsetIcon, href: 'https://t.me/tekdiverse' },
]

/** Desktop-only floating buttons, bottom right. */
export function FloatingActions() {
  return (
    <div className="fixed bottom-4 right-4 z-40 hidden flex-col gap-1.5 lg:flex">
      {ACTIONS.map(({ label, Icon, ...rest }) => {
        const className =
          'flex h-11 w-11 items-center justify-center rounded-[10px] border border-white/5 bg-[#121a28] text-white shadow-lg shadow-black/40 transition-colors [--icon-cut:#121a28] hover:bg-[#19233a] hover:[--icon-cut:#19233a]'
        if ('href' in rest) {
          return (
            <a
              key={label}
              href={rest.href}
              target="_blank"
              rel="noreferrer"
              aria-label={label}
              className={className}
            >
              <Icon className="h-[22px] w-[22px]" />
            </a>
          )
        }
        return (
          <button
            key={label}
            type="button"
            aria-label={label}
            onClick={rest.action === 'chat' ? openChat : undefined}
            className={className}
          >
            <Icon className="h-[22px] w-[22px]" />
          </button>
        )
      })}
    </div>
  )
}

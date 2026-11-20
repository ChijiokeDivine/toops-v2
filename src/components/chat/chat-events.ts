export const CHAT_EVENT = 'toops:chat'

let pendingOpen = false

/** Opens the global chat panel from any client component. */
export function openChat(): void {
  if (typeof window === 'undefined') return
  pendingOpen = true
  window.dispatchEvent(new Event(CHAT_EVENT))
}

/** True when a click landed before the panel hydrated. */
export function consumePendingChat(): boolean {
  const pending = pendingOpen
  pendingOpen = false
  return pending
}

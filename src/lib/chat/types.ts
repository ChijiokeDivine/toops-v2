/** Public shape of a chat participant. Never includes email, balance, or wallet data. */
export type ChatUserView = {
  id: string
  name: string
  /** Telegram username without the leading `@`, when the account has one. */
  username: string | null
  avatarUrl: string | null
  xp: number
  level: number
  joinedAt: string
}

export type ChatMessageView = {
  id: string
  body: string
  createdAt: string
  user: ChatUserView
}

export type ChatProfileView = ChatUserView & {
  messageCount: number
}

export type ChatBootstrap = {
  viewer: ChatUserView | null
  online: number
  maxLength: number
  messages: ChatMessageView[]
  hasMore: boolean
}

export type ChatMessagesPage = {
  messages: ChatMessageView[]
  hasMore: boolean
}

export type ChatServerEvent =
  | { id: string; type: 'message'; message: ChatMessageView }
  | { id: string; type: 'presence'; online: number }
  | { id: string; type: 'ping'; at: number }

export type ChatEventInput = Omit<ChatServerEvent, 'id'> & { id?: string }

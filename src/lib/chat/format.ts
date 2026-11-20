import { CHAT_LEVEL_XP } from './config'

/** Counts Unicode code points, so an emoji costs one character. */
export function countChatChars(value: string): number {
  return Array.from(value).length
}

/**
 * Normalises user input without touching emoji or punctuation:
 * - CRLF becomes LF
 * - control characters are dropped
 * - trailing whitespace on each line is removed
 * - runs of 3+ newlines collapse to a blank line
 */
export function normalizeChatBody(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex -- control characters must never reach the DB
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function chatLevel(xp: number): number {
  return Math.floor(Math.max(0, xp) / CHAT_LEVEL_XP) + 1
}

/** The token inserted by the "Mention" action. */
export function mentionToken(user: { name: string; username: string | null }): string {
  const handle = user.username?.trim() || user.name.replace(/[^\w.-]+/g, '')
  return `@${handle || 'player'}`
}

import { describe, expect, it } from 'vitest'
import { CHAT_LEVEL_XP } from './config'
import { chatLevel, countChatChars, mentionToken, normalizeChatBody } from './format'

describe('countChatChars', () => {
  it('counts plain text in code points', () => {
    expect(countChatChars('hello')).toBe(5)
    expect(countChatChars('')).toBe(0)
  })

  it('counts a simple emoji as one character', () => {
    expect(countChatChars('😀')).toBe(1)
    expect(countChatChars('gg 😀')).toBe(4)
  })
})

describe('normalizeChatBody', () => {
  it('converts CRLF to LF and trims the message', () => {
    expect(normalizeChatBody('  hello\r\nworld  ')).toBe('hello\nworld')
  })

  it('drops control characters but keeps emoji', () => {
    expect(normalizeChatBody('hi\u0000 there\u0007 😀')).toBe('hi there 😀')
  })

  it('removes trailing spaces on each line', () => {
    expect(normalizeChatBody('one   \ntwo\t')).toBe('one\ntwo')
  })

  it('collapses runs of three or more newlines to a blank line', () => {
    expect(normalizeChatBody('one\n\n\n\ntwo')).toBe('one\n\ntwo')
  })
})

describe('mentionToken', () => {
  it('prefers the telegram username', () => {
    expect(mentionToken({ name: 'Big Glow', username: 'bigglow' })).toBe('@bigglow')
  })

  it('falls back to a handle-safe display name', () => {
    expect(mentionToken({ name: 'Big Glow!', username: null })).toBe('@BigGlow')
  })

  it('never returns a bare at sign', () => {
    expect(mentionToken({ name: '💎💎', username: null })).toBe('@player')
  })
})

describe('chatLevel', () => {
  it('starts at level 1 and steps every 500 XP', () => {
    expect(chatLevel(0)).toBe(1)
    expect(chatLevel(CHAT_LEVEL_XP - 1)).toBe(1)
    expect(chatLevel(CHAT_LEVEL_XP)).toBe(2)
  })
})

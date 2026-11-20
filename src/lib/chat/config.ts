/**
 * Chat limits and room configuration.
 *
 * The length is imported by both the composer and the POST route, so changing
 * `CHAT_MAX_LENGTH` updates the validator, the counter, and the API in one go.
 * The API also returns `maxLength` on bootstrap, which keeps an old cached
 * client honest after a deploy that changes the limit.
 */

export const CHAT_CHANNEL = 'newcomers'
export const CHAT_TITLE = 'Newcomers'

/** Maximum message length, counted in Unicode code points (so one emoji = 1). */
export const CHAT_MAX_LENGTH = 300

/** Messages fetched per page (initial load and "older" pages). */
export const CHAT_PAGE_SIZE = 40

/** Simple sliding-window flood control for posting. */
export const CHAT_RATE_LIMIT_COUNT = 8
export const CHAT_RATE_LIMIT_WINDOW_MS = 10_000

/** XP per level, mirrored from the account menu. */
export const CHAT_LEVEL_XP = 500

/** PUSD amounts are base units (1 PUSD = 100 units). */
export const CHAT_TIP_MIN_UNITS = 1n
export const CHAT_TIP_MAX_UNITS = 100_000n
export const CHAT_TIP_PRESETS = [10n, 50n, 100n, 500n] as const

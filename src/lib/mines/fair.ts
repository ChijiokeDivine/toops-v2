import { createHash, createHmac, randomBytes } from 'node:crypto'
import { MINES_BOARD_SIZE, MINES_BOMB_COUNT, MINES_SHIELD_ODDS } from './config'
import type { MinesTileKind } from './types'

const UINT32_SPACE = 0x1_0000_0000

export function generateServerSeed(): string {
  return randomBytes(32).toString('hex')
}

export function generateClientSeed(): string {
  return randomBytes(16).toString('hex')
}

export function hashServerSeed(serverSeed: string): string {
  return createHash('sha256').update(serverSeed).digest('hex')
}

/**
 * Deterministic 32-bit word stream.
 *
 * The published fairness recipe is:
 *   block 0 = HMAC-SHA256(serverSeed, clientSeed1 + clientSeed2 + nonce)
 * A 32-byte digest is not enough to shuffle 50 tiles, so the stream is expanded
 * in counter mode with the same key and message:
 *   block i = HMAC-SHA256(serverSeed, clientSeed1 + clientSeed2 + nonce + ':' + i)
 * Block 0 is the digest shown in the UI.
 */
class HmacWordStream {
  private readonly key: string
  private readonly message: string
  private block = 0
  private words: number[] = []
  private cursor = 0
  readonly firstDigest: Buffer

  constructor(key: string, message: string) {
    this.key = key
    this.message = message
    this.firstDigest = this.digest(0)
    this.absorb(this.firstDigest)
  }

  private digest(block: number): Buffer {
    // Block 0 is the published recipe: HMAC-SHA256(serverSeed, clientSeed1 +
    // clientSeed2 + nonce). Later blocks append a counter so 32 bytes are not
    // the only entropy available for a 50-tile shuffle.
    const message = block === 0 ? this.message : `${this.message}:${block}`
    return createHmac('sha256', this.key).update(message).digest()
  }

  private absorb(digest: Buffer): void {
    const words: number[] = []
    for (let offset = 0; offset < digest.length; offset += 4) {
      words.push(digest.readUInt32BE(offset))
    }
    this.words = words
    this.cursor = 0
  }

  next(): number {
    if (this.cursor >= this.words.length) {
      this.block += 1
      this.absorb(this.digest(this.block))
    }
    const word = this.words[this.cursor]!
    this.cursor += 1
    return word
  }

  /** Unbiased integer in [0, max) using rejection sampling. */
  int(max: number): number {
    if (max <= 0) return 0
    const limit = Math.floor(UINT32_SPACE / max) * max
    let word = this.next()
    while (word >= limit) word = this.next()
    return word % max
  }
}

export type MinesBoardResult = {
  /** 50 tile kinds; `BOMB` for the 13 mines, `SAFE` for the rest. */
  tiles: MinesTileKind[]
  /** Index of the Aegis Shield inside the safe tiles, or null on a 5/6 board. */
  shieldIndex: number | null
  /** Whether the 1-in-6 shield roll triggered. */
  shieldTriggered: boolean
  /** 0-5; zero triggers the shield. */
  shieldRoll: number
  /** HMAC digest of block 0, published with the match for verification. */
  hmacHex: string
}

/**
 * Derives the exact board for one match.
 *
 * Order of consumption from the HMAC stream:
 *   1. one word decides the 1-in-6 shield roll (`word % 6 === 0`);
 *   2. a partial Fisher-Yates shuffle chooses 13 bomb tiles;
 *   3. when the shield triggered, one word chooses its tile among the 37 safe.
 */
export function deriveMinesBoard(
  serverSeed: string,
  clientSeeds: readonly string[],
  nonce: number,
): MinesBoardResult {
  const [clientSeed1 = '', clientSeed2 = ''] = clientSeeds
  const message = `${clientSeed1}${clientSeed2}${nonce}`
  const stream = new HmacWordStream(serverSeed, message)

  const shieldRoll = stream.int(6)
  const shieldTriggered = shieldRoll === 0

  const order = Array.from({ length: MINES_BOARD_SIZE }, (_, index) => index)
  for (let index = 0; index < MINES_BOMB_COUNT; index += 1) {
    const swapWith = index + stream.int(MINES_BOARD_SIZE - index)
    const current = order[index]!
    order[index] = order[swapWith]!
    order[swapWith] = current
  }

  const bombs = new Set(order.slice(0, MINES_BOMB_COUNT))
  const safeTiles = order.slice(MINES_BOMB_COUNT)
  const tiles: MinesTileKind[] = Array.from({ length: MINES_BOARD_SIZE }, (_, index) =>
    bombs.has(index) ? 'BOMB' : 'SAFE',
  )

  const shieldIndex = shieldTriggered ? (safeTiles[stream.int(safeTiles.length)] ?? null) : null

  return {
    tiles,
    shieldIndex,
    shieldTriggered,
    shieldRoll,
    hmacHex: stream.firstDigest.toString('hex'),
  }
}

/** 50-char durable encoding: `B` for bomb, `S` for safe. */
export function encodeBoard(tiles: readonly MinesTileKind[]): string {
  return tiles.map((tile) => (tile === 'BOMB' ? 'B' : 'S')).join('')
}

export function decodeBoard(value: string): MinesTileKind[] {
  const chars = value.padEnd(MINES_BOARD_SIZE, 'S').slice(0, MINES_BOARD_SIZE)
  return Array.from(chars, (char) => (char === 'B' ? 'BOMB' : 'SAFE'))
}

export type MinesBoardCheck = {
  hashMatches: boolean
  boardMatches: boolean | null
  shieldMatches: boolean | null
  derived: MinesBoardResult | null
}

/**
 * Recomputes a stored board from the revealed seed. Used by
 * `GET /api/mines/verify` and the integrity marker in the database.
 */
export function verifyMinesBoard(params: {
  serverSeed: string
  serverSeedHash: string
  clientSeeds: readonly string[]
  nonce: number
  storedBoard: string
  storedShieldIndex: number | null
  reveal: boolean
}): MinesBoardCheck {
  const hashMatches = hashServerSeed(params.serverSeed) === params.serverSeedHash
  if (!params.reveal) {
    return { hashMatches, boardMatches: null, shieldMatches: null, derived: null }
  }

  const derived = deriveMinesBoard(params.serverSeed, params.clientSeeds, params.nonce)
  return {
    hashMatches,
    boardMatches: encodeBoard(derived.tiles) === params.storedBoard,
    shieldMatches: derived.shieldIndex === params.storedShieldIndex,
    derived,
  }
}

/** Human-readable chance used in the rules copy. */
export const MINES_SHIELD_CHANCE_LABEL = `${Math.round(MINES_SHIELD_ODDS * 100)}%`

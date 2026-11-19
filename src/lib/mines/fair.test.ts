import { describe, expect, it } from 'vitest'
import { MINES_BOARD_SIZE, MINES_BOMB_COUNT, MINES_SAFE_COUNT } from './config'
import {
  decodeBoard,
  deriveMinesBoard,
  encodeBoard,
  generateClientSeed,
  generateServerSeed,
  hashServerSeed,
  verifyMinesBoard,
} from './fair'

describe('mines provably-fair board', () => {
  const serverSeed = 'a'.repeat(64)
  const clientSeeds = ['11111111111111111111111111111111', '22222222222222222222222222222222']

  it('is deterministic for the same seeds and nonce', () => {
    const first = deriveMinesBoard(serverSeed, clientSeeds, 0)
    const second = deriveMinesBoard(serverSeed, clientSeeds, 0)
    expect(first).toEqual(second)
    expect(encodeBoard(first.tiles)).toHaveLength(MINES_BOARD_SIZE)
  })

  it('matches the published HMAC recipe and a known board vector', () => {
    // HMAC-SHA256(serverSeed, clientSeed1 + clientSeed2 + "0"). Hard-coded so
    // an accidental change to the recipe fails loudly.
    const board = deriveMinesBoard(serverSeed, clientSeeds, 0)
    expect(board.hmacHex).toBe('0523be6b88a8047ea10854b8c5c23edd54fca7a5ff6e5d8a6cde47e23f9b44d2')
    expect(board.shieldTriggered).toBe(false)
    expect(board.shieldIndex).toBeNull()
    expect(encodeBoard(board.tiles)).toBe('SSSSSSSSBBSSSBSBBBSBSSSBSSSSSSSSBSS')
  })

  it('matches a known shield vector', () => {
    const board = deriveMinesBoard(serverSeed, clientSeeds, 3)
    expect(board.shieldRoll).toBe(0)
    expect(board.shieldTriggered).toBe(true)
    expect(board.shieldIndex).toBe(31)
    expect(board.tiles[31]).toBe('SAFE')
    expect(encodeBoard(board.tiles)).toBe('SSSSSSSSSSSSBBSBSBSBSSSSSSSSBBSSBBS')
  })

  it('changes when the nonce changes', () => {
    const first = deriveMinesBoard(serverSeed, clientSeeds, 0)
    const second = deriveMinesBoard(serverSeed, clientSeeds, 1)
    expect(encodeBoard(first.tiles)).not.toBe(encodeBoard(second.tiles))
  })

  it('uses seat order: clientSeed1 + clientSeed2', () => {
    const forward = deriveMinesBoard(serverSeed, clientSeeds, 3)
    const reversed = deriveMinesBoard(serverSeed, [...clientSeeds].reverse(), 3)
    expect(encodeBoard(forward.tiles)).not.toBe(encodeBoard(reversed.tiles))
  })

  it(`always places exactly ${MINES_BOMB_COUNT} bombs and ${MINES_SAFE_COUNT} safe tiles`, () => {
    for (let nonce = 0; nonce < 40; nonce += 1) {
      const board = deriveMinesBoard(serverSeed, clientSeeds, nonce)
      const bombs = board.tiles.filter((tile) => tile === 'BOMB').length
      expect(bombs).toBe(MINES_BOMB_COUNT)
      expect(board.tiles.length).toBe(MINES_BOARD_SIZE)
      expect(board.tiles.filter((tile) => tile === 'SAFE').length).toBe(MINES_SAFE_COUNT)
    }
  })

  it('only places the shield inside a safe tile', () => {
    for (let nonce = 0; nonce < 200; nonce += 1) {
      const board = deriveMinesBoard(serverSeed, clientSeeds, nonce)
      if (board.shieldIndex != null) {
        expect(board.tiles[board.shieldIndex]).toBe('SAFE')
        expect(board.shieldTriggered).toBe(true)
      }
    }
  })

  it('rolls the shield about one board in six', () => {
    let triggered = 0
    const rounds = 3_000
    for (let index = 0; index < rounds; index += 1) {
      const seed = hashServerSeed(`shield-${index}`)
      if (deriveMinesBoard(seed, clientSeeds, index).shieldTriggered) triggered += 1
    }
    const ratio = triggered / rounds
    expect(ratio).toBeGreaterThan(0.14)
    expect(ratio).toBeLessThan(0.195)
  })

  it('verifies a stored board and shield', () => {
    const board = deriveMinesBoard(serverSeed, clientSeeds, 7)
    const check = verifyMinesBoard({
      serverSeed,
      serverSeedHash: hashServerSeed(serverSeed),
      clientSeeds,
      nonce: 7,
      storedBoard: encodeBoard(board.tiles),
      storedShieldIndex: board.shieldIndex,
      reveal: true,
    })
    expect(check.hashMatches).toBe(true)
    expect(check.boardMatches).toBe(true)
    expect(check.shieldMatches).toBe(true)
    expect(check.derived?.hmacHex).toBe(board.hmacHex)
  })

  it('detects a tampered board', () => {
    const board = deriveMinesBoard(serverSeed, clientSeeds, 9)
    const tampered = encodeBoard(board.tiles).replace('B', 'S')
    const check = verifyMinesBoard({
      serverSeed,
      serverSeedHash: hashServerSeed(serverSeed),
      clientSeeds,
      nonce: 9,
      storedBoard: tampered,
      storedShieldIndex: board.shieldIndex,
      reveal: true,
    })
    expect(check.hashMatches).toBe(true)
    expect(check.boardMatches).toBe(false)
  })

  it('round-trips the durable board encoding', () => {
    const board = deriveMinesBoard(serverSeed, clientSeeds, 11)
    expect(decodeBoard(encodeBoard(board.tiles))).toEqual(board.tiles)
  })

  it('generates distinct 32-byte seeds', () => {
    expect(generateServerSeed()).toHaveLength(64)
    expect(generateClientSeed()).toHaveLength(32)
    expect(generateServerSeed()).not.toBe(generateServerSeed())
  })
})

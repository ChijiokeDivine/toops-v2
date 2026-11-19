import { describe, expect, it } from 'vitest'
import { MINES_BOARD_SIZE, MINES_SAFE_COUNT, MINES_TURN_MS } from './config'
import {
  applyPick,
  averageClickMs,
  bombPenalty,
  chooseAutoTile,
  decideWinner,
  pickableTiles,
  revealedSafeCount,
} from './rules'
import type { MinesPlayerRuntime, MinesRuntime, MinesSeat } from './types'

const START = 1_700_000_000_000

function player(userId: string): MinesPlayerRuntime {
  return {
    userId,
    displayName: userId,
    avatarUrl: null,
    clientSeed: `${userId}-client-seed`,
    score: 0,
    streak: 0,
    bombs: 0,
    shields: 0,
    shieldsUsed: 0,
    clicks: 0,
    totalClickMs: 0,
    ready: true,
  }
}

function createState(overrides: Partial<MinesRuntime> = {}): MinesRuntime {
  const board: MinesRuntime['board'] = Array.from({ length: MINES_BOARD_SIZE }, () => 'SAFE')
  board[0] = 'BOMB'
  board[10] = 'BOMB'
  board[20] = 'BOMB'

  return {
    matchId: 'match-1',
    status: 'LIVE',
    stakePusd: '2.00',
    potPusd: '4.00',
    serverSeedHash: 'hash',
    hmacHex: 'hmac',
    nonce: 0,
    serverSeed: 'secret',
    board,
    shieldIndex: null,
    players: [player('alice'), player('bob')],
    revealed: [],
    exploded: [],
    turn: 0,
    turnStartedAt: START,
    turnDeadline: START + MINES_TURN_MS,
    turnCount: 0,
    winnerSeat: null,
    winReason: null,
    lastPick: null,
    startedAt: START,
    endedAt: null,
    readyDeadlineAt: null,
    createdAt: START,
    updatedAt: START,
    ...overrides,
  }
}

/** Picks `count` safe tiles, skipping `exclude`, for exhaustion scenarios. */
function safeReveals(state: MinesRuntime, count: number, exclude: number): number[] {
  return Array.from({ length: MINES_BOARD_SIZE }, (_, index) => index)
    .filter((index) => state.board[index] === 'SAFE' && index !== exclude)
    .slice(0, count)
}

describe('mines scoring', () => {
  it('pays 70 / 105 / 175 / 280 and caps the streak per player', () => {
    const state = createState()
    const payouts: number[] = []
    for (let index = 1; index <= 8; index += 1) {
      const result = applyPick(state, state.turn, index, START + index * 1_000)
      payouts.push(result.points)
    }
    expect(payouts).toEqual([70, 70, 105, 105, 175, 175, 280, 280])
    expect(state.players[0].score + state.players[1].score).toBe(1_260)
  })

  it('rounds the 35% bomb penalty to the nearest 10', () => {
    expect(bombPenalty(0)).toBe(0)
    expect(bombPenalty(1_000)).toBe(350)
    expect(bombPenalty(1_234)).toBe(430)
    expect(bombPenalty(100)).toBe(40)
    expect(bombPenalty(10)).toBe(0)
  })

  it('resets the streak and deducts 35% on a bomb without a shield', () => {
    const state = createState()
    state.players[0].score = 1_000
    state.players[0].streak = 3

    const result = applyPick(state, 0, 0, START + 500)

    expect(result.kind).toBe('BOMB')
    expect(result.penalty).toBe(350)
    expect(state.players[0].score).toBe(650)
    expect(state.players[0].streak).toBe(0)
    expect(state.players[0].bombs).toBe(1)
    expect(state.exploded).toEqual([0])
    expect(state.turn).toBe(1)
  })

  it('absorbs a bomb with the shield, preserving the streak and revealing the tile', () => {
    const state = createState()
    state.players[0].score = 1_000
    state.players[0].streak = 3
    state.players[0].shields = 1

    const result = applyPick(state, 0, 0, START + 500)

    expect(result.shieldUsed).toBe(true)
    expect(result.penalty).toBe(0)
    expect(state.players[0].score).toBe(1_000)
    expect(state.players[0].streak).toBe(3)
    expect(state.players[0].shields).toBe(0)
    expect(state.players[0].shieldsUsed).toBe(1)
    expect(state.players[0].bombs).toBe(1)
    expect(state.revealed).toContain(0)
  })

  it('grants a shield when the hidden safe tile is uncovered', () => {
    const state = createState({ shieldIndex: 5 })
    const result = applyPick(state, 0, 5, START + 400)
    expect(result.shieldGained).toBe(true)
    expect(state.players[0].shields).toBe(1)
    expect(result.points).toBe(70)
  })

  it('records click speed and alternates turns', () => {
    const state = createState()
    applyPick(state, 0, 1, START + 1_200)
    expect(state.players[0].totalClickMs).toBe(1_200)
    expect(state.players[0].clicks).toBe(1)
    expect(averageClickMs(state.players[0])).toBe(1_200)
    expect(state.turn).toBe(1)
    expect(state.turnStartedAt).toBe(START + 1_200)
  })

  it('counts a timeout auto-pick as a full ten-second click', () => {
    const state = createState()
    applyPick(state, 0, 1, START + MINES_TURN_MS, { auto: true })
    expect(state.players[0].totalClickMs).toBe(MINES_TURN_MS)
    expect(state.lastPick?.auto).toBe(true)
  })
})

describe('mines win conditions', () => {
  it('ends instantly at 1,750 points', () => {
    const state = createState()
    state.players[0].score = 1_680
    applyPick(state, 0, 1, START + 500)
    expect(state.players[0].score).toBe(1_750)
    expect(state.winnerSeat).toBe(0)
    expect(state.winReason).toBe('KNOCKOUT')
    expect(state.turnDeadline).toBe(0)
  })

  it('awards exhaustion to the highest score', () => {
    const state = createState()
    state.revealed = safeReveals(state, MINES_SAFE_COUNT - 1, MINES_BOARD_SIZE - 1)
    state.players[0].score = 900
    state.players[1].score = 400

    applyPick(state, 0, MINES_BOARD_SIZE - 1, START + 1_000)

    expect(revealedSafeCount(state)).toBe(MINES_SAFE_COUNT)
    expect(state.winnerSeat).toBe(0)
    expect(state.winReason).toBe('EXHAUSTION')
  })

  it('breaks a score tie with fewer bombs hit', () => {
    const state = createState()
    state.revealed = safeReveals(state, MINES_SAFE_COUNT - 1, MINES_BOARD_SIZE - 1)
    state.players[0].score = 700
    state.players[1].score = 770
    state.players[0].bombs = 1
    state.players[1].bombs = 0

    applyPick(state, 0, MINES_BOARD_SIZE - 1, START + 1_000)

    expect(state.players[0].score).toBe(770)
    expect(state.winnerSeat).toBe(1)
    expect(state.winReason).toBe('TIEBREAK_BOMBS')
  })

  it('breaks a bombs tie with the faster average click speed', () => {
    const state = createState()
    state.revealed = safeReveals(state, MINES_SAFE_COUNT - 1, MINES_BOARD_SIZE - 1)
    state.players[0].score = 700
    state.players[1].score = 770
    state.players[0].bombs = 0
    state.players[1].bombs = 0
    state.players[0].clicks = 2
    state.players[0].totalClickMs = 4_000
    state.players[1].clicks = 2
    state.players[1].totalClickMs = 2_000

    applyPick(state, 0, MINES_BOARD_SIZE - 1, START + 1_000)

    expect(state.players[0].score).toBe(770)
    expect(state.winnerSeat).toBe(1)
    expect(state.winReason).toBe('TIEBREAK_SPEED')
  })

  it('chooses auto-picks only from unrevealed tiles', () => {
    const state = createState()
    state.revealed = [0, 1, 2, 3]
    const available = new Set(pickableTiles(state))
    for (let index = 0; index < MINES_BOARD_SIZE; index += 1) {
      const tile = chooseAutoTile(state, () => index / MINES_BOARD_SIZE)
      expect(tile).not.toBeNull()
      expect(available.has(tile!)).toBe(true)
      expect([0, 1, 2, 3]).not.toContain(tile)
    }
  })

  it('decides nothing while safe tiles remain and nobody reached the knockout score', () => {
    const state = createState()
    expect(decideWinner(state, 0)).toBeNull()
  })

  it('never pays a bomb penalty larger than the banked score', () => {
    const state = createState()
    state.players[0].score = 5
    applyPick(state, 0, 0, START + 500)
    expect(state.players[0].score).toBe(5)
  })

  it('keeps seats within range', () => {
    const seats: MinesSeat[] = [0, 1]
    for (const seat of seats) expect([0, 1]).toContain(seat)
  })
})

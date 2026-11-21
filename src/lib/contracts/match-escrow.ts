import 'server-only'

import {
  Contract,
  SignatureTemplate,
  TransactionBuilder,
} from 'cashscript'
import type { SpendableUtxo } from 'cashscript'
import { binToHex, decodeCashAddress, encodeLockingBytecodeP2pkh, hexToBin } from '@bitauth/libauth'
import artifact from '@/contracts/MatchEscrow.json'
import { getAddressUtxos, type ElectrumUtxo } from '@/lib/bch/electrum'
import { derivePlatformPrivateKey } from '@/lib/wallet/platform-wallet'
import { getContractProvider } from './treasury'

const DUST_THRESHOLD_SATS = 546n
const FEE_RATE_SATS_PER_BYTE = 1
const FEE_INPUT_TARGET_SATS = 2_000n
const REFUND_TIMEOUT_BLOCKS = 144

export type MatchEscrowParams = {
  player1Pkh: string
  player2Pkh: string
  stake: bigint
  feeBps: bigint
  serverSeedHash: string
  timeoutBlock: number
  treasuryLockingBytecode: string
}

/** JSON-safe form stored on the match row. */
export type StoredMatchEscrowParams = {
  player1Pkh: string
  player2Pkh: string
  player1Address: string
  player2Address: string
  stakeSats: string
  feeBps: string
  serverSeedHash: string
  timeoutBlock: number
  treasuryLockingBytecode: string
  escrowAddress: string
}

export type PlatformSigner = {
  address: string
  derivationIndex: number
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function pkhFromAddress(address: string): string {
  const decoded = decodeCashAddress(address)
  if (typeof decoded === 'string') throw new Error(`Invalid address: ${decoded}`)
  if (decoded.type !== 'p2pkh' && decoded.type !== 'p2pkhWithTokens') {
    throw new Error('Escrow players must use P2PKH platform addresses')
  }
  return binToHex(decoded.payload)
}

function lockingBytecodeFor(address: string): string {
  const decoded = decodeCashAddress(address)
  if (typeof decoded === 'string') throw new Error(`Invalid address: ${decoded}`)
  if (decoded.type !== 'p2pkh' && decoded.type !== 'p2pkhWithTokens') {
    throw new Error('Escrow players must use P2PKH platform addresses')
  }
  return binToHex(encodeLockingBytecodeP2pkh(decoded.payload))
}

/** Instantiates MatchEscrow with all terms baked into the contract. */
export function createMatchEscrow(params: MatchEscrowParams): Contract {
  return new Contract(
    artifact as never,
    [
      params.player1Pkh,
      params.player2Pkh,
      params.stake,
      params.feeBps,
      params.serverSeedHash,
      BigInt(params.timeoutBlock),
      params.treasuryLockingBytecode,
    ] as never,
    { provider: getContractProvider() },
  )
}

export function instantiateStoredMatchEscrow(params: StoredMatchEscrowParams): Contract {
  return createMatchEscrow({
    player1Pkh: params.player1Pkh,
    player2Pkh: params.player2Pkh,
    stake: BigInt(params.stakeSats),
    feeBps: BigInt(params.feeBps),
    serverSeedHash: params.serverSeedHash,
    timeoutBlock: params.timeoutBlock,
    treasuryLockingBytecode: params.treasuryLockingBytecode,
  })
}

export function storedParams(
  contract: Contract,
  params: MatchEscrowParams,
  addresses: { player1Address: string; player2Address: string },
): StoredMatchEscrowParams {
  return {
    player1Pkh: params.player1Pkh,
    player2Pkh: params.player2Pkh,
    player1Address: addresses.player1Address,
    player2Address: addresses.player2Address,
    stakeSats: params.stake.toString(),
    feeBps: params.feeBps.toString(),
    serverSeedHash: params.serverSeedHash,
    timeoutBlock: params.timeoutBlock,
    treasuryLockingBytecode: params.treasuryLockingBytecode,
    escrowAddress: contract.address,
  }
}

export async function getEscrowTimeoutBlock(blocks = REFUND_TIMEOUT_BLOCKS): Promise<number> {
  const height = await getContractProvider().getBlockHeight()
  return height + blocks
}

function toSpendable(utxo: ElectrumUtxo, lockingBytecode: string): SpendableUtxo {
  return {
    txid: utxo.tx_hash,
    vout: utxo.tx_pos,
    satoshis: BigInt(utxo.value),
    lockingBytecode,
  }
}

async function selectUtxos(
  address: string,
  target: bigint,
): Promise<{ utxos: ElectrumUtxo[]; total: bigint }> {
  const lockingBytecode = lockingBytecodeFor(address)
  const candidates = (await getAddressUtxos(address))
    .filter((utxo) => !utxo.token)
    .sort((a, b) => b.value - a.value)

  const selected: ElectrumUtxo[] = []
  let total = 0n
  for (const utxo of candidates) {
    selected.push(utxo)
    total += BigInt(utxo.value)
    if (total >= target) break
  }

  if (total < target) {
    throw new Error(`Platform wallet ${address} does not have enough BCH (${lockingBytecode})`)
  }
  return { utxos: selected, total }
}

/**
 * Builds and broadcasts the funding transaction. Both players contribute
 * `stakeSats`; the escrow output is always index 0.
 */
export async function fundMatchEscrow(params: {
  contract: Contract
  player1: PlatformSigner
  player2: PlatformSigner
  stakeSats: bigint
}): Promise<{ txid: string; outpoint: string }> {
  const { contract, player1, player2, stakeSats } = params

  const [first, second] = await Promise.all([
    selectUtxos(player1.address, stakeSats),
    selectUtxos(player2.address, stakeSats),
  ])

  const inputCount = first.utxos.length + second.utxos.length
  const feeSats = BigInt(10 + inputCount * 148 + 3 * 34 + 100)

  let change1 = first.total - stakeSats
  let change2 = second.total - stakeSats
  if (change1 + change2 < feeSats) {
    throw new Error('Not enough BCH to cover the escrow funding fee')
  }

  change1 -= feeSats
  if (change1 < 0n) {
    change2 += change1
    change1 = 0n
  }
  if (change1 < DUST_THRESHOLD_SATS) change1 = 0n
  if (change2 < DUST_THRESHOLD_SATS) change2 = 0n

  const builder = new TransactionBuilder({ provider: contract.provider })
  for (const utxo of first.utxos) {
    builder.addInput(
      toSpendable(utxo, lockingBytecodeFor(player1.address)),
      new SignatureTemplate(derivePlatformPrivateKey(player1.derivationIndex)).unlockP2PKH(),
    )
  }
  for (const utxo of second.utxos) {
    builder.addInput(
      toSpendable(utxo, lockingBytecodeFor(player2.address)),
      new SignatureTemplate(derivePlatformPrivateKey(player2.derivationIndex)).unlockP2PKH(),
    )
  }

  builder.addOutput({ to: hexToBin(contract.lockingBytecode), amount: stakeSats * 2n })
  if (change1 > 0n) builder.addOutput({ to: player1.address, amount: change1 })
  if (change2 > 0n) builder.addOutput({ to: player2.address, amount: change2 })

  const transaction = await builder.send()
  return { txid: transaction.txid, outpoint: `${transaction.txid}:0` }
}

async function contractUtxo(contract: Contract, outpoint: string): Promise<SpendableUtxo> {
  const [txid, index] = outpoint.split(':')
  const vout = Number(index)
  const utxos = await contract.provider.getUtxos(contract.address)
  const match = utxos.find((utxo) => utxo.txid === txid && utxo.vout === vout)
  if (match) return match

  // The outpoint is authoritative even if the provider has not indexed it yet.
  return {
    txid: txid ?? '',
    vout,
    satoshis: 0n,
    lockingBytecode: contract.lockingBytecode,
  }
}

async function addFeeInput(params: {
  builder: TransactionBuilder
  signer: PlatformSigner
}): Promise<void> {
  const { builder, signer } = params
  const selected = await selectUtxos(signer.address, FEE_INPUT_TARGET_SATS)
  const template = new SignatureTemplate(derivePlatformPrivateKey(signer.derivationIndex))

  for (const utxo of selected.utxos) {
    builder.addInput(toSpendable(utxo, lockingBytecodeFor(signer.address)), template.unlockP2PKH())
  }
  builder.addBchChangeOutputIfNeeded({
    to: signer.address,
    feeRate: FEE_RATE_SATS_PER_BYTE,
  })
}

export async function settleMatchEscrow(params: {
  contract: Contract
  outpoint: string
  serverSeed: string
  winnerSeat: number
  winnerAddress: string
  treasuryLockingBytecode: string
  feeSats: bigint
  payoutSats: bigint
  feeSigner: PlatformSigner
}): Promise<string> {
  const utxo = await contractUtxo(params.contract, params.outpoint)
  if (utxo.satoshis === 0n) {
    throw new Error(`Escrow outpoint ${params.outpoint} was not found`)
  }

  const builder = new TransactionBuilder({ provider: params.contract.provider })
  builder.addInput(
    utxo,
    params.contract.unlock.settle(hexToBin(params.serverSeed), BigInt(params.winnerSeat)),
  )
  builder.addOutput({ to: params.winnerAddress, amount: params.payoutSats })
  builder.addOutput({ to: hexToBin(params.treasuryLockingBytecode), amount: params.feeSats })

  await addFeeInput({ builder, signer: params.feeSigner })

  const transaction = await builder.send()
  return transaction.txid
}

export async function refundMatchEscrow(params: {
  contract: Contract
  outpoint: string
  player1Address: string
  player2Address: string
  stakeSats: bigint
  timeoutBlock: number
  feeSigner: PlatformSigner
}): Promise<string> {
  const height = await params.contract.provider.getBlockHeight()
  if (height < params.timeoutBlock) {
    throw new Error(`Refund is available at block ${params.timeoutBlock} (current ${height})`)
  }

  const utxo = await contractUtxo(params.contract, params.outpoint)
  if (utxo.satoshis === 0n) {
    throw new Error(`Escrow outpoint ${params.outpoint} was not found`)
  }

  const builder = new TransactionBuilder({ provider: params.contract.provider })
  builder.addInput(utxo, params.contract.unlock.refund(), { sequence: 0xfffffffe })
  builder.setLocktime(params.timeoutBlock)
  builder.addOutput({ to: params.player1Address, amount: params.stakeSats })
  builder.addOutput({ to: params.player2Address, amount: params.stakeSats })

  await addFeeInput({ builder, signer: params.feeSigner })

  const transaction = await builder.send()
  return transaction.txid
}

export function escrowErrorMessage(error: unknown): string {
  return errorMessage(error)
}

import 'server-only'

import { Contract, ElectrumNetworkProvider } from 'cashscript'
import artifact from '@/contracts/PlatformTreasury.json'
import { getBchNetwork } from '@/lib/bch/network'

export type TreasuryInstance = {
  contract: Contract
  /** Hex-encoded P2SH locking bytecode of the treasury instance. */
  lockingBytecode: string
}

let provider: ElectrumNetworkProvider | null = null

export function getContractProvider(): ElectrumNetworkProvider {
  if (!provider) provider = new ElectrumNetworkProvider(getBchNetwork())
  return provider
}

/**
 * Instantiates PlatformTreasury for an admin public key. The same key always
 * produces the same locking bytecode, so the deployment can pin it in
 * PLATFORM_TREASURY_LOCKING_BYTECODE.
 */
export function createPlatformTreasury(adminPubkey: string): TreasuryInstance {
  const contract = new Contract(
    artifact as never,
    [adminPubkey] as never,
    { provider: getContractProvider() },
  )

  return { contract, lockingBytecode: contract.lockingBytecode }
}

let cached: TreasuryInstance | null = null

/** Returns the deployment's treasury instance, pinned by the environment. */
export function getPlatformTreasury(): TreasuryInstance {
  if (cached) return cached

  const adminPubkey = process.env.PLATFORM_TREASURY_PUBLIC_KEY?.trim()
  if (!adminPubkey) {
    throw new Error('PLATFORM_TREASURY_PUBLIC_KEY is not configured')
  }

  const instance = createPlatformTreasury(adminPubkey)
  const pinned = process.env.PLATFORM_TREASURY_LOCKING_BYTECODE?.trim()
  if (pinned && pinned !== instance.lockingBytecode) {
    throw new Error(
      'PLATFORM_TREASURY_LOCKING_BYTECODE does not match PLATFORM_TREASURY_PUBLIC_KEY',
    )
  }

  cached = instance
  return instance
}

export function getPlatformTreasuryLockingBytecode(): string {
  return (
    process.env.PLATFORM_TREASURY_LOCKING_BYTECODE?.trim() ||
    getPlatformTreasury().lockingBytecode
  )
}

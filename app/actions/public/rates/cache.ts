// Last-known-good rates cache + staleness tiers (FR-11).

import { type KVStore, readJSON, writeJSON } from './persisted.ts'

export type Staleness = 'live' | 'stale' | 'expired' | 'none'

const LIVE_MS = 12_000
const STALE_MS = 120_000

export function staleness(fetchedAt: number | null, now: number): Staleness {
  if (fetchedAt == null) return 'none'
  let age = now - fetchedAt
  if (age <= LIVE_MS) return 'live'
  if (age <= STALE_MS) return 'stale'
  return 'expired'
}

export interface RatesCache {
  rates: Record<string, { usd: number; btc: number }>
  fetchedAt: number
  history: Record<string, number[]>
}

export const CACHE_KEY = 'nocturne.rates.cache.v1'

function isRatesCache(value: unknown): value is RatesCache | null {
  if (value === null) return true
  if (typeof value !== 'object') return false
  let candidate = value as Partial<RatesCache>
  return (
    typeof candidate.rates === 'object' &&
    candidate.rates !== null &&
    typeof candidate.fetchedAt === 'number' &&
    typeof candidate.history === 'object' &&
    candidate.history !== null
  )
}

export function readCache(kv: KVStore): RatesCache | null {
  return readJSON<RatesCache | null>(kv, CACHE_KEY, null, isRatesCache)
}

export function writeCache(kv: KVStore, cache: RatesCache): void {
  writeJSON(kv, CACHE_KEY, cache)
}

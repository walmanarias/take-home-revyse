// Versioned, lock-protected order record (ADR 0007, T3). `order.v1` (a bare
// `string[]`, still read by `persisted.ts`'s `readOrder`) is migrated from,
// once, into `order.v2` (`{ schemaVersion, updatedAt, order }`) and then left
// in place, untouched, for rollback safety.

import type { LocksPort } from './locks.ts'
import { type KVStore, readJSON, readOrder, writeJSON } from './persisted.ts'

export interface OrderRecord {
  schemaVersion: number
  updatedAt: number
  order: string[]
}

export const ORDER_KEY = 'nocturne.rates.order.v1'
export const ORDER_V2_KEY = 'nocturne.rates.order.v2'

const LOCK_NAME = 'nocturne.rates.order'
const SCHEMA_VERSION = 2

export function isOrderRecord(value: unknown): value is OrderRecord | null {
  if (value === null) return true
  if (typeof value !== 'object') return false
  let candidate = value as Partial<OrderRecord>
  return (
    typeof candidate.schemaVersion === 'number' &&
    typeof candidate.updatedAt === 'number' &&
    Array.isArray(candidate.order) &&
    candidate.order.every((item) => typeof item === 'string')
  )
}

function readStoredRecord(kv: KVStore): OrderRecord | null {
  return readJSON<OrderRecord | null>(kv, ORDER_V2_KEY, null, isOrderRecord)
}

/**
 * Reads the current order record, preferring `order.v2`. Falls back to a
 * one-time migration from legacy `order.v1` (or the default `validSymbols`
 * order when neither exists), writing the migrated result to `.v2` so every
 * subsequent read is a `.v2` read. `.v1` is never deleted.
 */
export function readOrderRecord(
  kv: KVStore,
  validSymbols: readonly string[],
  clock: () => number,
): OrderRecord {
  let stored = readStoredRecord(kv)
  if (stored) {
    let order = stored.order.filter((symbol) => validSymbols.includes(symbol))
    let missing = validSymbols.filter((symbol) => !order.includes(symbol))
    return { schemaVersion: stored.schemaVersion, updatedAt: stored.updatedAt, order: [...order, ...missing] }
  }

  let migratedOrder = readOrder(kv, ORDER_KEY, [...validSymbols], [...validSymbols])
  let record: OrderRecord = { schemaVersion: SCHEMA_VERSION, updatedAt: clock(), order: migratedOrder }
  writeJSON(kv, ORDER_V2_KEY, record)
  return record
}

/**
 * Persists `record` as the new `order.v2`, optionally serialized through a
 * `LocksPort` critical section. Only commits when `record.updatedAt` is
 * strictly greater than whatever is currently stored — last-write-wins made
 * deterministic by `updatedAt`, not by call/resolution order; a tie favors
 * the value already in storage. With no `LocksPort` (SSR, or a browser
 * without the Web Locks API), commits directly — today's shipped behavior,
 * unguarded but never throwing.
 *
 * Resolves `true` when the record was committed, `false` when a fresher
 * stored record won and the write was rejected — the caller (e.g.
 * `rates-dashboard.tsx`'s `persistOrder`) uses this to resync its own
 * optimistic state to the durable record on rejection (AC-98) instead of
 * silently drifting from what's actually stored.
 */
export async function writeOrder(kv: KVStore, record: OrderRecord, locks?: LocksPort): Promise<boolean> {
  let commit = () => {
    let current = readStoredRecord(kv)
    if (current && current.updatedAt >= record.updatedAt) return false
    writeJSON(kv, ORDER_V2_KEY, record)
    return true
  }

  if (locks) {
    return await locks.request(LOCK_NAME, commit)
  }
  return commit()
}

/**
 * Pure newer-wins adoption rule for a `storage`-event-delivered record: a
 * strictly newer `updatedAt` is adopted; a tie or older `updatedAt` keeps
 * the local record.
 */
export function adoptOrderRecord(local: OrderRecord, incoming: OrderRecord): OrderRecord {
  return incoming.updatedAt > local.updatedAt ? incoming : local
}

/**
 * Parses a raw `storage`-event payload for `ORDER_V2_KEY` with the same
 * validator the mount-time read uses. Malformed JSON is treated like no
 * update.
 */
export function parseOrderRecordPayload(raw: string): OrderRecord | null {
  try {
    let value: unknown = JSON.parse(raw)
    return isOrderRecord(value) ? value : null
  } catch {
    return null
  }
}

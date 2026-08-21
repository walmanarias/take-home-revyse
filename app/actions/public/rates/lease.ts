// Single-poller cross-tab lease (FR-10). A tab is leader when it already
// holds the lease, no one holds it, or the holder has been silent past
// LEASE_TTL.

import { type KVStore, readJSON, writeJSON } from './persisted.ts'

export interface LeaseStore {
  isLeader(now: number, tabId: string): boolean
  heartbeat(now: number, tabId: string): void
  release(tabId: string): void
}

export const LEASE_KEY = 'nocturne.rates.lease.v1'
export const LEASE_TTL = 2500

interface LeaseRecord {
  id: string | null
  ts: number
}

function isLeaseRecord(value: unknown): value is LeaseRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof (value as { ts?: unknown }).ts === 'number'
  )
}

export function createLeaseStore(kv: KVStore, _clock: () => number): LeaseStore {
  function readLease(): LeaseRecord {
    return readJSON<LeaseRecord>(kv, LEASE_KEY, { id: null, ts: 0 }, isLeaseRecord)
  }

  return {
    isLeader(now, tabId) {
      let lease = readLease()
      return !lease.id || lease.id === tabId || now - lease.ts > LEASE_TTL
    },
    heartbeat(now, tabId) {
      writeJSON(kv, LEASE_KEY, { id: tabId, ts: now })
    },
    release(tabId) {
      let lease = readLease()
      if (lease.id === tabId) {
        writeJSON(kv, LEASE_KEY, { id: null, ts: 0 })
      }
    },
  }
}

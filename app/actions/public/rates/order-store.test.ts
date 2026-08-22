import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import {
  ORDER_KEY,
  ORDER_V2_KEY,
  T0,
  createFakeKV,
  createSerializingLocksPort,
  manualClock,
} from '../../../../test/support/fakes.ts'
import { adoptOrderRecord, readOrderRecord, writeOrder, type OrderRecord } from './order-store.ts'

describe('order-store.ts: readOrderRecord()', () => {
  it('AC-92 migrates legacy order.v1 to a validated v2 record, writes it, and leaves v1 intact', () => {
    let clock = manualClock(T0)
    let kv = createFakeKV({ [ORDER_KEY]: ['B', 'C', 'A'] })
    let validSymbols = ['A', 'B', 'C', 'D']

    let record = readOrderRecord(kv, validSymbols, clock.now)

    assert.deepEqual(record, { schemaVersion: 2, updatedAt: T0, order: ['B', 'C', 'A', 'D'] })
    assert.deepEqual(JSON.parse(kv.getItem(ORDER_V2_KEY) ?? 'null'), record)
    // Rollback safety: v1 is never deleted, only migrated from.
    assert.deepEqual(JSON.parse(kv.getItem(ORDER_KEY) ?? 'null'), ['B', 'C', 'A'])
  })
})

describe('order-store.ts: writeOrder()', () => {
  it('AC-93 resolves two concurrent writeOrder calls deterministically by updatedAt, not call order', async () => {
    let kv = createFakeKV()
    let locks = createSerializingLocksPort()

    let newer: OrderRecord = { schemaVersion: 2, updatedAt: T0 + 100, order: ['A', 'B'] }
    let older: OrderRecord = { schemaVersion: 2, updatedAt: T0 + 50, order: ['B', 'A'] }

    // Submit the *newer* record first and the *older* one second — a correct
    // strictly-greater-updatedAt guard keeps `newer` regardless of submission
    // order; a naive "last write wins" implementation would incorrectly let
    // `older` clobber it.
    let first = writeOrder(kv, newer, locks)
    let second = writeOrder(kv, older, locks)
    await Promise.all([first, second])

    assert.deepEqual(JSON.parse(kv.getItem(ORDER_V2_KEY) ?? 'null'), newer)
  })

  it('AC-95 persists correctly, without throwing, when no LocksPort is available (SSR/unsupported browser)', async () => {
    let kv = createFakeKV()
    let record: OrderRecord = { schemaVersion: 2, updatedAt: T0, order: ['A', 'B'] }

    await assert.doesNotReject(() => writeOrder(kv, record))

    assert.deepEqual(JSON.parse(kv.getItem(ORDER_V2_KEY) ?? 'null'), record)
  })
})

describe('order-store.ts: readOrderRecord() — corrupt-value fallback', () => {
  it('AC-95 falls back to v1 migration, or the default order, without throwing when the v2 record is corrupt', () => {
    let clock = manualClock(T0)
    let validSymbols = ['A', 'B', 'C']

    let corruptKv = createFakeKV()
    corruptKv.setItem(ORDER_V2_KEY, '{not json')
    corruptKv.setItem(ORDER_KEY, JSON.stringify(['B', 'A']))
    assert.doesNotThrow(() => readOrderRecord(corruptKv, validSymbols, clock.now))
    assert.deepEqual(readOrderRecord(corruptKv, validSymbols, clock.now).order, ['B', 'A', 'C'])

    let emptyKv = createFakeKV()
    assert.doesNotThrow(() => readOrderRecord(emptyKv, validSymbols, clock.now))
    assert.deepEqual(readOrderRecord(emptyKv, validSymbols, clock.now).order, validSymbols)
  })
})

describe('order-store.ts: adoptOrderRecord()', () => {
  it('AC-94 adopts an incoming record only when its updatedAt is strictly newer than the local one', () => {
    let local: OrderRecord = { schemaVersion: 2, updatedAt: T0, order: ['A', 'B'] }

    let newer: OrderRecord = { schemaVersion: 2, updatedAt: T0 + 1, order: ['B', 'A'] }
    assert.deepEqual(adoptOrderRecord(local, newer), newer)

    let sameInstant: OrderRecord = { schemaVersion: 2, updatedAt: T0, order: ['C'] }
    assert.deepEqual(adoptOrderRecord(local, sameInstant), local)

    let older: OrderRecord = { schemaVersion: 2, updatedAt: T0 - 1, order: ['D'] }
    assert.deepEqual(adoptOrderRecord(local, older), local)
  })
})

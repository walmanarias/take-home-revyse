import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createFakeKV } from '../../../../test/support/fakes.ts'
import { readJSON, readOrder, writeJSON } from './persisted.ts'

describe('persisted.ts: readJSON()/writeJSON()', () => {
  it('AC-48 round-trips a value written with writeJSON back out through readJSON', () => {
    let kv = createFakeKV()
    let value = { tokens: 7, ts: 123 }

    writeJSON(kv, 'a-key', value)

    assert.deepEqual(readJSON(kv, 'a-key', { tokens: 0, ts: 0 }), value)
  })

  it('AC-49 falls back instead of throwing when the stored value is malformed JSON', () => {
    let kv = createFakeKV()
    kv.setItem('a-key', '{not json')

    assert.deepEqual(readJSON(kv, 'a-key', { fallback: true }), { fallback: true })
  })

  it('AC-50 falls back when the stored value fails the supplied validate predicate', () => {
    let kv = createFakeKV()
    kv.setItem('a-key', JSON.stringify({ version: 0 }))
    let isCurrentVersion = (v: unknown): v is { version: 1 } =>
      typeof v === 'object' && v !== null && (v as { version?: unknown }).version === 1

    assert.deepEqual(readJSON(kv, 'a-key', { version: 1 }, isCurrentVersion), { version: 1 })
  })
})

describe('persisted.ts: readOrder()', () => {
  it('AC-51 drops an unknown symbol and appends a missing valid symbol', () => {
    let kv = createFakeKV()
    let validSymbols = ['BTC', 'ETH', 'SOL', 'ADA']
    kv.setItem('order-key', JSON.stringify(['BTC', 'ETH', 'SOL', 'XYZ']))

    assert.deepEqual(readOrder(kv, 'order-key', validSymbols, validSymbols), [
      'BTC',
      'ETH',
      'SOL',
      'ADA',
    ])
  })
})

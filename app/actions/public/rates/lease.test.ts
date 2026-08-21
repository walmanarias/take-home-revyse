import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createFakeKV, manualClock } from '../../../../test/support/fakes.ts'
import { createLeaseStore } from './lease.ts'

const T0 = 1_700_000_000_000
// Per FR-10 / the design brief: LEASE_TTL = 2500ms. Not imported from lease.ts
// because the module's exported surface (docs/design/crypto-dashboard.md)
// doesn't commit to exporting the constant under a specific name.
const LEASE_TTL = 2500

describe('lease.ts: createLeaseStore()', () => {
  it('AC-14 elects the first tab to ask when no lease record exists', () => {
    let store = createLeaseStore(createFakeKV(), manualClock(T0).now)

    assert.equal(store.isLeader(T0, 'A'), true)
  })

  it("AC-15 refuses a second tab while the holder's heartbeat is still fresh", () => {
    let store = createLeaseStore(createFakeKV(), manualClock(T0).now)

    store.heartbeat(T0, 'A')

    assert.equal(store.isLeader(T0 + 1000, 'B'), false)
  })

  it('AC-16 hands the lease to another tab once the holder is silent past LEASE_TTL', () => {
    let store = createLeaseStore(createFakeKV(), manualClock(T0).now)

    store.heartbeat(T0, 'A')

    assert.equal(store.isLeader(T0 + LEASE_TTL + 100, 'B'), true)
  })

  it('AC-17 keeps the current holder leader regardless of elapsed time when it checks itself again', () => {
    let store = createLeaseStore(createFakeKV(), manualClock(T0).now)

    store.heartbeat(T0, 'A')

    assert.equal(store.isLeader(T0 + LEASE_TTL + 10_000, 'A'), true)
  })

  it('AC-18 frees the lease immediately for another tab once the holder releases it', () => {
    let store = createLeaseStore(createFakeKV(), manualClock(T0).now)

    store.heartbeat(T0, 'A')
    store.release('A')

    assert.equal(store.isLeader(T0, 'B'), true)
  })
})

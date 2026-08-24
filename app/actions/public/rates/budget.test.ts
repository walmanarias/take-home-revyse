import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { BUDGET_KEY, createFakeKV, manualClock } from '../../../../test/support/fakes.ts'
import { createBudgetStore } from './budget.ts'

const T0 = 1_700_000_000_000
const WINDOW = 60_000

/** The stamps a run of `trySpend` calls actually persisted. */
function storedStamps(kv: { getItem(key: string): string | null }): number[] {
  return JSON.parse(kv.getItem(BUDGET_KEY) ?? '{"stamps":[]}').stamps
}

describe('budget.ts: createBudgetStore()', () => {
  it('AC-107 grants exactly 10 requests from an empty log, then refuses the 11th at the same instant', () => {
    let kv = createFakeKV()
    let clock = manualClock(T0)
    let store = createBudgetStore(kv, clock.now)

    for (let i = 0; i < 10; i++) {
      assert.equal(store.trySpend(T0), true)
    }
    assert.equal(store.trySpend(T0), false)
    assert.deepEqual(storedStamps(kv), Array.from({ length: 10 }, () => T0))
  })

  it('AC-108 refuses every request inside the 60s window after a 10-request burst (the reviewed overshoot)', () => {
    let kv = createFakeKV()
    let clock = manualClock(T0)
    let store = createBudgetStore(kv, clock.now)
    let granted: number[] = []

    // The measured probe: 10 requests spread over 5.6s, from a full budget.
    for (let i = 0; i < 10; i++) {
      let at = T0 + i * 560
      if (store.trySpend(at)) granted.push(at)
    }
    assert.equal(granted.length, 10)

    // A leaky bucket hands one back every 6s; a sliding window hands back nothing
    // until the oldest grant actually leaves it.
    for (let at = T0 + 6_000; at < T0 + WINDOW; at += 6_000) {
      assert.equal(store.trySpend(at), false, `expected refusal at +${at - T0}ms`)
    }
    assert.equal(store.trySpend(T0 + WINDOW - 1), false)
    assert.equal(store.trySpend(T0 + WINDOW), true)
    granted.push(T0 + WINDOW)

    // The bound itself: no trailing 60s window over the whole run holds >10 grants.
    for (let at of granted) {
      let inWindow = granted.filter((stamp) => stamp > at - WINDOW && stamp <= at)
      assert.ok(inWindow.length <= 10, `${inWindow.length} grants in the window ending at +${at - T0}ms`)
    }
  })

  it('AC-109 slides per stamp: 5 grants come back at +60s, the other 5 only at +90s', () => {
    let kv = createFakeKV()
    let clock = manualClock(T0)
    let store = createBudgetStore(kv, clock.now)

    for (let i = 0; i < 5; i++) assert.equal(store.trySpend(T0), true)
    for (let i = 0; i < 5; i++) assert.equal(store.trySpend(T0 + 30_000), true)

    assert.equal(store.trySpend(T0 + 59_999), false)
    for (let i = 0; i < 5; i++) {
      assert.equal(store.trySpend(T0 + 60_000), true, `grant ${i + 1} of 5 at +60s`)
    }
    assert.equal(store.trySpend(T0 + 60_000), false)

    assert.equal(store.trySpend(T0 + 89_999), false)
    assert.equal(store.trySpend(T0 + 90_000), true)
  })

  it('AC-110 reports what is left and when the oldest grant leaves the window', () => {
    let kv = createFakeKV({ [BUDGET_KEY]: { stamps: [T0, T0 + 1_000, T0 + 2_000] } })
    let clock = manualClock(T0)
    let store = createBudgetStore(kv, clock.now)

    let reading = store.read(T0 + 20_000)
    assert.equal(reading.remaining, 7)
    assert.equal(reading.slotFreesInMs, 40_000)

    let empty = createBudgetStore(createFakeKV(), clock.now).read(T0)
    assert.equal(empty.remaining, 10)
    assert.equal(empty.slotFreesInMs, 0)
  })

  it('AC-111 prunes expired stamps on write and falls back to an empty window on any unusable record', () => {
    let kv = createFakeKV({
      [BUDGET_KEY]: { stamps: [T0 - 120_000, T0 - 61_000, T0 - 1_000] },
    })
    let clock = manualClock(T0)
    assert.equal(createBudgetStore(kv, clock.now).trySpend(T0), true)
    assert.deepEqual(storedStamps(kv), [T0 - 1_000, T0])

    // A legacy v1 bucket record written under the v2 key, a corrupt value, and a
    // stamps array with non-numeric entries all degrade to a fresh window (FR-8).
    for (let unusable of [{ tokens: 0, ts: T0 }, { stamps: ['x', 5] }, { stamps: 3 }]) {
      let legacyKv = createFakeKV({ [BUDGET_KEY]: unusable })
      assert.equal(createBudgetStore(legacyKv, clock.now).trySpend(T0), true)
    }

    let corruptKv = createFakeKV()
    corruptKv.setItem(BUDGET_KEY, '{not json')
    assert.equal(createBudgetStore(corruptKv, clock.now).trySpend(T0), true)
  })

  it('AC-112 discards stamps dated after now, so a backwards clock jump cannot lock the budget out', () => {
    let kv = createFakeKV({ [BUDGET_KEY]: { stamps: Array.from({ length: 10 }, () => T0 + 3_600_000) } })
    let clock = manualClock(T0)
    let store = createBudgetStore(kv, clock.now)

    assert.equal(store.read(T0).remaining, 10)
    assert.equal(store.trySpend(T0), true)
  })

  it('AC-116 documents the accepted T1 overdraw race: two stores sharing one pre-write snapshot both win a grant', () => {
    let snapshot = JSON.stringify({ stamps: Array.from({ length: 9 }, (_, i) => T0 - i * 100) })
    let kv = {
      getItem: () => snapshot,
      setItem: () => {},
    }
    let clock = manualClock(T0)
    let tabA = createBudgetStore(kv, clock.now)
    let tabB = createBudgetStore(kv, clock.now)

    assert.equal(tabA.trySpend(T0), true)
    assert.equal(tabB.trySpend(T0), true)
  })
})

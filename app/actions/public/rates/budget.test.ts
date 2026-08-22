import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { BUDGET_KEY, createFakeKV, manualClock } from '../../../../test/support/fakes.ts'
import { createBudgetStore } from './budget.ts'

const T0 = 1_700_000_000_000

describe('budget.ts: createBudgetStore()', () => {
  it('AC-5 allows exactly 10 spends from a fresh 10-token bucket, then refuses the 11th at the same instant', () => {
    let kv = createFakeKV({ [BUDGET_KEY]: { tokens: 10, ts: T0 } })
    let clock = manualClock(T0)
    let store = createBudgetStore(kv, clock.now)

    for (let i = 0; i < 10; i++) {
      assert.equal(store.trySpend(T0), true)
    }
    assert.equal(store.trySpend(T0), false)
  })

  it('AC-6 refuses just before the 6000ms refill mark and allows exactly at it', () => {
    let kv = createFakeKV({ [BUDGET_KEY]: { tokens: 0, ts: T0 } })
    let clock = manualClock(T0)
    let store = createBudgetStore(kv, clock.now)

    assert.equal(store.trySpend(T0 + 5999), false)
    assert.equal(store.trySpend(T0 + 6000), true)
  })

  it('AC-7 documents the accepted T1 overdraw race: two stores sharing one pre-write snapshot both win a spend', () => {
    let snapshot = JSON.stringify({ tokens: 1, ts: T0 })
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

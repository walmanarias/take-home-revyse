import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'
import { render } from 'remix/ui/test'

import {
  BUDGET_KEY,
  CACHE_KEY,
  LEASE_KEY,
  T0,
  createFakeKV,
  manualClock,
  pendingFetch,
  type FakeFetchedRates,
  type KVStore,
} from '../../../../test/support/fakes.ts'
import { RatesDashboard } from './rates-dashboard.tsx'

describe('RatesDashboard: budget', () => {
  it('AC-8 shows 7 filled pips, 3 empty pips, and the "7/10 left this minute" label', async (t) => {
    let kv = createFakeKV({ [BUDGET_KEY]: { tokens: 7, ts: T0 } })
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    let pips = [...result.$$('[data-testid="budget-pip"]')]
    assert.equal(pips.length, 10)
    assert.equal(pips.filter((p) => p.getAttribute('data-filled') === 'true').length, 7)
    assert.equal(pips.filter((p) => p.getAttribute('data-filled') === 'false').length, 3)
    assert.match(
      result.$('[data-testid="budget-label"]')?.textContent ?? '',
      /7\/10 left this minute/,
    )
  })

  it('AC-9 disables Refresh and reads "Wait 6s" when the budget is empty', async (t) => {
    let kv = createFakeKV({ [BUDGET_KEY]: { tokens: 0, ts: T0 } })
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    let button = result.$('[data-testid="refresh-button"]') as HTMLButtonElement
    assert.equal(button.disabled, true)
    assert.match(button.textContent ?? '', /Wait 6s/)
  })

  it('AC-10 ignores a second Refresh click while a fetch is already in flight', async (t) => {
    let kv = createFakeKV({ [BUDGET_KEY]: { tokens: 10, ts: T0 } })
    let calls = 0
    let resolveFetch!: (value: FakeFetchedRates) => void
    let fetchImpl = () =>
      new Promise<FakeFetchedRates>((resolve) => {
        calls++
        resolveFetch = resolve
      })
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={fetchImpl} />)
    t.after(result.cleanup)

    let button = () => result.$('[data-testid="refresh-button"]') as HTMLButtonElement

    await result.act(() => button().click())
    assert.equal(calls, 1)
    assert.equal(button().disabled, true)

    await result.act(() => button().click())
    assert.equal(calls, 1)

    resolveFetch!({ rates: {}, fetchedAt: T0 })
  })

  it('AC-11 calls fetchImpl exactly once on Refresh and spends one budget token on success', async (t) => {
    let kv = createFakeKV({ [BUDGET_KEY]: { tokens: 10, ts: T0 } })
    let calls = 0
    let fetchImpl = async () => {
      calls++
      return { rates: {}, fetchedAt: T0 }
    }
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={fetchImpl} />)
    t.after(result.cleanup)

    await result.act(() =>
      (result.$('[data-testid="refresh-button"]') as HTMLButtonElement).click(),
    )

    assert.equal(calls, 1)
    let budget = JSON.parse(kv.getItem(BUDGET_KEY) ?? '{}')
    assert.equal(budget.tokens, 9)
  })

  it('AC-12 never calls fetchImpl from a tab that does not hold the poll lease', async (t) => {
    let timers = t.useFakeTimers()
    let clock = manualClock(T0)
    let kv = neverLeaderKV(clock)
    let calls = 0
    let fetchImpl = async () => {
      calls++
      return { rates: {}, fetchedAt: clock.now() }
    }
    let result = render(<RatesDashboard kv={kv} clock={clock.now} fetchImpl={fetchImpl} />)
    t.after(result.cleanup)

    let checkbox = result.$('[data-testid="auto-checkbox"]') as HTMLInputElement
    if (!checkbox.checked) {
      await result.act(() => checkbox.click())
    }

    for (let i = 0; i < 8; i++) {
      clock.advance(1000)
      await result.act(() => timers.advance(1000))
    }

    assert.equal(calls, 0)
  })

  it('AC-13 reads "off" while auto-refresh is unchecked and shows a countdown once checked', async (t) => {
    let timers = t.useFakeTimers()
    let clock = manualClock(T0)
    let kv = createFakeKV({ [BUDGET_KEY]: { tokens: 10, ts: T0 } })
    let calls = 0
    let fetchImpl = async () => {
      calls++
      return { rates: {}, fetchedAt: clock.now() }
    }
    let result = render(<RatesDashboard kv={kv} clock={clock.now} fetchImpl={fetchImpl} />)
    t.after(result.cleanup)

    let checkbox = () => result.$('[data-testid="auto-checkbox"]') as HTMLInputElement
    let label = () => result.$('[data-testid="auto-label"]')?.textContent ?? ''

    if (checkbox().checked) {
      await result.act(() => checkbox().click())
    }
    assert.match(label(), /off/)

    for (let i = 0; i < 8; i++) {
      clock.advance(1000)
      await result.act(() => timers.advance(1000))
    }
    assert.equal(calls, 0)

    await result.act(() => checkbox().click())
    assert.match(label(), /\d+s/)
  })

  it("AC-19 adopts a leader tab's cache write via the storage event, without ever calling fetchImpl", async (t) => {
    let kv = createFakeKV({ [LEASE_KEY]: { id: 'other-tab', ts: T0 } })
    let calls = 0
    let fetchImpl = async () => {
      calls++
      return { rates: {}, fetchedAt: T0 }
    }
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={fetchImpl} />)
    t.after(result.cleanup)

    let payload = {
      rates: { BTC: { usd: 65000, btc: 1 } },
      fetchedAt: T0,
      history: { BTC: [65000] },
    }

    await result.act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: CACHE_KEY,
          newValue: JSON.stringify(payload),
          storageArea: window.localStorage,
        }),
      )
    })

    assert.equal(calls, 0)
    assert.equal(
      result.$(
        '[data-testid="asset-card"][data-symbol="BTC"] [data-testid="usd-value"]',
      )?.textContent,
      '$65,000',
    )
  })
})

/**
 * A KVStore whose lease record always reports a *different*, perpetually
 * fresh holder relative to whatever the injected clock currently reads —
 * simulating another tab that keeps heartbeating throughout the test, so
 * this tab never becomes leader no matter how far the clock advances.
 */
function neverLeaderKV(clock: { now(): number }): KVStore {
  let base = createFakeKV()
  return {
    getItem(key) {
      if (key === LEASE_KEY) {
        return JSON.stringify({ id: 'other-tab', ts: clock.now() })
      }
      return base.getItem(key)
    },
    setItem(key, value) {
      base.setItem(key, value)
    },
  }
}

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
  it('AC-113 shows 7 filled pips, 3 empty pips, and counts down the oldest grant\'s exit', async (t) => {
    let kv = createFakeKV({ [BUDGET_KEY]: { stamps: [T0, T0 + 1_000, T0 + 2_000] } })
    let result = render(
      <RatesDashboard kv={kv} clock={() => T0 + 20_000} fetchImpl={pendingFetch()} />,
    )
    t.after(result.cleanup)

    let pips = [...result.$$('[data-testid="budget-pip"]')]
    assert.equal(pips.length, 10)
    assert.equal(pips.filter((p) => p.getAttribute('data-filled') === 'true').length, 7)
    assert.equal(pips.filter((p) => p.getAttribute('data-filled') === 'false').length, 3)
    assert.equal(
      result.$('[data-testid="budget-label"]')?.textContent,
      '7/10 left this minute · +1 in 40s',
    )
  })

  it('AC-114 disables Refresh and reads the true wait for the oldest grant to leave the window', async (t) => {
    let kv = createFakeKV({ [BUDGET_KEY]: { stamps: Array.from({ length: 10 }, () => T0) } })
    let result = render(
      <RatesDashboard kv={kv} clock={() => T0 + 1_000} fetchImpl={pendingFetch()} />,
    )
    t.after(result.cleanup)

    let button = result.$('[data-testid="refresh-button"]') as HTMLButtonElement
    assert.equal(button.disabled, true)
    assert.match(button.textContent ?? '', /Wait 59s/)
  })

  it('AC-117 states the shared cap in the mechanism\'s own terms — a rolling minute, not a bucket', async (t) => {
    let kv = createFakeKV({ [BUDGET_KEY]: { stamps: [] } })
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    let footnote = [...result.$$('p')].map((p) => p.textContent ?? '').join(' ')
    assert.match(footnote, /10 requests per rolling minute/)
    assert.doesNotMatch(footnote, /bucket/i)
  })

  it('AC-10 ignores a second Refresh click while a fetch is already in flight', async (t) => {
    let kv = createFakeKV({ [BUDGET_KEY]: { stamps: [] } })
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

  it('AC-115 calls fetchImpl exactly once on Refresh and logs exactly one grant stamp', async (t) => {
    let kv = createFakeKV({ [BUDGET_KEY]: { stamps: [] } })
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
    assert.deepEqual(budget.stamps, [T0])
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
    let kv = createFakeKV({ [BUDGET_KEY]: { stamps: [] } })
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

import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'
import { render } from 'remix/ui/test'

import {
  BUDGET_KEY,
  CACHE_KEY,
  T0,
  createFakeKV,
  manualClock,
  pendingFetch,
} from '../../../../test/support/fakes.ts'
import { RatesDashboard } from './rates-dashboard.tsx'

describe('RatesDashboard: BTC self-rate', () => {
  it('AC-60 always shows "—" in BTC\'s own BTC column, regardless of the computed cross-rate', async (t) => {
    let kv = createFakeKV({
      [CACHE_KEY]: { rates: { BTC: { usd: 65000, btc: 1 } }, fetchedAt: T0, history: {} },
    })
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    let btcCard = result.$('[data-testid="asset-card"][data-symbol="BTC"]')
    assert.equal(btcCard?.querySelector('[data-testid="btc-value"]')?.textContent, '—')
  })
})

describe('RatesDashboard: session Δ', () => {
  it('AC-63 shows "—" for Δ when a symbol has fewer than 2 samples this session', async (t) => {
    let kv = createFakeKV()
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    let card = result.$('[data-testid="asset-card"]')
    assert.equal(card?.querySelector('[data-testid="delta-value"]')?.textContent, '—')
  })

  it('AC-64 marks a positive Δ, a negative Δ, and a "—" Δ with distinct sign markers', async (t) => {
    let positive = render(
      <RatesDashboard
        kv={createFakeKV({
          [CACHE_KEY]: {
            rates: { BTC: { usd: 100, btc: 1 } },
            fetchedAt: T0,
            history: { BTC: [90, 100] },
          },
        })}
        clock={() => T0}
        fetchImpl={pendingFetch()}
      />,
    )
    t.after(positive.cleanup)
    assert.equal(
      positive
        .$('[data-testid="asset-card"][data-symbol="BTC"] [data-testid="delta-value"]')
        ?.getAttribute('data-sign'),
      'positive',
    )

    let negative = render(
      <RatesDashboard
        kv={createFakeKV({
          [CACHE_KEY]: {
            rates: { BTC: { usd: 100, btc: 1 } },
            fetchedAt: T0,
            history: { BTC: [110, 100] },
          },
        })}
        clock={() => T0}
        fetchImpl={pendingFetch()}
      />,
    )
    t.after(negative.cleanup)
    assert.equal(
      negative
        .$('[data-testid="asset-card"][data-symbol="BTC"] [data-testid="delta-value"]')
        ?.getAttribute('data-sign'),
      'negative',
    )

    let neutral = render(
      <RatesDashboard kv={createFakeKV()} clock={() => T0} fetchImpl={pendingFetch()} />,
    )
    t.after(neutral.cleanup)
    assert.equal(
      neutral
        .$('[data-testid="asset-card"][data-symbol="BTC"] [data-testid="delta-value"]')
        ?.getAttribute('data-sign'),
      'neutral',
    )
  })
})

describe('RatesDashboard: history + session Δ derivation', () => {
  it('AC-65 keeps only the most recent 48 of many sequential USD samples per symbol (FIFO)', async (t) => {
    let clock = manualClock(T0)
    let kv = createFakeKV({ [BUDGET_KEY]: { stamps: [] } })
    let sample = 0
    let symbol = ''
    let fetchImpl = async () => {
      sample++
      let rates: Record<string, { usd: number; btc: number }> = {
        [symbol]: { usd: 100 + sample, btc: 0.001 },
      }
      return { rates, fetchedAt: clock.now() }
    }

    let result = render(<RatesDashboard kv={kv} clock={clock.now} fetchImpl={fetchImpl} />)
    t.after(result.cleanup)
    symbol = result.$('[data-testid="asset-card"]')!.getAttribute('data-symbol')!

    let refresh = () => result.$('[data-testid="refresh-button"]') as HTMLButtonElement
    for (let i = 0; i < 50; i++) {
      // Pace the cycles at the app's own 8s poll period. The sliding-window
      // budget (AC-108) admits a sustained 6s cadence, but at that spacing the
      // *rendered* remaining is 0 at the instant of every grant — the window is
      // genuinely full until the oldest stamp ages out a moment later — so the
      // Refresh button is legitimately disabled between cycles. The real UI
      // re-enables it on the next 1s `tick()`; this test never runs that timer,
      // so it paces above the boundary instead of asserting through it.
      clock.advance(8000)
      await result.act(() => refresh().click())
      // Yield a real macrotask between refresh cycles. Each cycle legitimately renders
      // twice (pending-disabled per AC-10, then resolved), and the UI runtime's
      // MAX_CASCADING_UPDATES=50 safety net only resets per task turn — 50 clicks
      // chained purely on microtasks is unreachable by any real interaction.
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    let card = result.$(`[data-testid="asset-card"][data-symbol="${symbol}"]`)
    assert.equal(card?.getAttribute('data-history-length'), '48')
  })

  it("AC-66 renders \"+10.00%\" when a symbol's usd rises from its first session sample of 100 to 110", async (t) => {
    let clock = manualClock(T0)
    let kv = createFakeKV({ [BUDGET_KEY]: { stamps: [] } })
    let symbol = ''
    let usd = 100
    let fetchImpl = async () => {
      let rates: Record<string, { usd: number; btc: number }> = {
        [symbol]: { usd, btc: 0.001 },
      }
      return { rates, fetchedAt: clock.now() }
    }

    let result = render(<RatesDashboard kv={kv} clock={clock.now} fetchImpl={fetchImpl} />)
    t.after(result.cleanup)
    symbol = result.$('[data-testid="asset-card"]')!.getAttribute('data-symbol')!

    // Whatever fetch(es) happen first (including a possible mount-time
    // fetch) settle at usd=100, so the session's *first* sample is 100.
    clock.advance(6000)
    await result.act(() =>
      (result.$('[data-testid="refresh-button"]') as HTMLButtonElement).click(),
    )

    usd = 110
    clock.advance(6000)
    await result.act(() =>
      (result.$('[data-testid="refresh-button"]') as HTMLButtonElement).click(),
    )

    let card = result.$(`[data-testid="asset-card"][data-symbol="${symbol}"]`)
    assert.equal(card?.querySelector('[data-testid="delta-value"]')?.textContent, '+10.00%')
  })
})

describe('RatesDashboard: single `now` tick', () => {
  it('AC-67 updates the staleness label, auto-refresh countdown, and budget countdown together on one clock tick', async (t) => {
    let timers = t.useFakeTimers()
    let clock = manualClock(T0)
    let kv = createFakeKV({
      [CACHE_KEY]: { rates: {}, fetchedAt: T0 - 12_000, history: {} },
      [BUDGET_KEY]: { stamps: [T0] },
    })
    let result = render(<RatesDashboard kv={kv} clock={clock.now} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    let checkbox = result.$('[data-testid="auto-checkbox"]') as HTMLInputElement
    if (!checkbox.checked) {
      await result.act(() => checkbox.click())
    }

    let statusBefore = result.$('[data-testid="status-label"]')?.textContent
    let autoBefore = result.$('[data-testid="auto-label"]')?.textContent
    let budgetBefore = result.$('[data-testid="budget-label"]')?.textContent

    clock.advance(1000)
    await result.act(() => timers.advance(1000))

    let statusAfter = result.$('[data-testid="status-label"]')?.textContent
    let autoAfter = result.$('[data-testid="auto-label"]')?.textContent
    let budgetAfter = result.$('[data-testid="budget-label"]')?.textContent

    assert.notEqual(statusAfter, statusBefore)
    assert.notEqual(autoAfter, autoBefore)
    assert.notEqual(budgetAfter, budgetBefore)
  })
})

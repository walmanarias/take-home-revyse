import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'
import { render } from 'remix/ui/test'

import { CACHE_KEY, T0, createFakeKV, pendingFetch } from '../../../../test/support/fakes.ts'
import { RatesDashboard } from './rates-dashboard.tsx'

describe('RatesDashboard: staleness tiers', () => {
  it('AC-25 renders all 15 cards with "—" placeholders and "Fetching first rates…" before any fetch resolves', async (t) => {
    let kv = createFakeKV()
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    let cards = [...result.$$('[data-testid="asset-card"]')]
    assert.equal(cards.length, 15)
    for (let card of cards) {
      assert.equal(card.querySelector('[data-testid="usd-value"]')?.textContent, '—')
      assert.equal(card.querySelector('[data-testid="btc-value"]')?.textContent, '—')
      assert.equal(card.querySelector('[data-testid="delta-value"]')?.textContent, '—')
    }
    assert.match(result.$('[data-testid="status-label"]')?.textContent ?? '', /Fetching first rates…/)
    assert.equal(result.$('[data-testid="status-dot"]')?.getAttribute('data-tier'), 'none')
  })

  it('AC-26 shows the "live" tier and no banner for fresh cached data', async (t) => {
    let kv = createFakeKV({
      [CACHE_KEY]: { rates: {}, fetchedAt: T0 - 5000, history: {} },
    })
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    assert.equal(result.$('[data-testid="status-dot"]')?.getAttribute('data-tier'), 'live')
    assert.match(result.$('[data-testid="status-label"]')?.textContent ?? '', /live/i)
    assert.equal(result.$('[data-testid="banner"]'), null)
  })

  it('AC-27 shows the "stale" tier at full opacity and no banner', async (t) => {
    let kv = createFakeKV({
      [CACHE_KEY]: {
        rates: { BTC: { usd: 100, btc: 1 } },
        fetchedAt: T0 - 60_000,
        history: {},
      },
    })
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    assert.equal(result.$('[data-testid="status-dot"]')?.getAttribute('data-tier'), 'stale')
    assert.equal(result.$('[data-testid="banner"]'), null)
    let card = result.$('[data-testid="asset-card"][data-symbol="BTC"]')
    assert.notEqual(card?.getAttribute('data-dimmed'), 'true')
  })

  it('AC-28 dims values, shows "expired", and shows the banner for expired cached data', async (t) => {
    let kv = createFakeKV({
      [CACHE_KEY]: {
        rates: { BTC: { usd: 100, btc: 1 } },
        fetchedAt: T0 - 121_000,
        history: {},
      },
    })
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    assert.equal(result.$('[data-testid="status-dot"]')?.getAttribute('data-tier'), 'expired')
    assert.ok(result.$('[data-testid="banner"]'))
    let card = result.$('[data-testid="asset-card"][data-symbol="BTC"]')
    assert.equal(card?.getAttribute('data-dimmed'), 'true')
  })

  it('AC-29 shows an explicit retry message and the banner when the first-ever fetch fails', async (t) => {
    let kv = createFakeKV()
    let fetchImpl = () => Promise.reject(new Error('network down'))
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={fetchImpl} />)
    t.after(result.cleanup)

    await result.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    assert.ok(result.$('[data-testid="banner"]'))
    assert.match(
      result.container.textContent ?? '',
      /no cached rates on this device yet.*retrying every 8s/i,
    )
  })
})

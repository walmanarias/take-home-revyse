// AC-105: conditional top-level slots must land at their authored position
// after hydration, not wherever positional sibling-pairing puts them.
//
// `diff-dom.ts` key-matches siblings on a `data-key` attribute and pairs the
// rest *positionally* among the units it could not key-match. A conditional
// <p>/<div> that turns on after the first render is therefore free to pair
// with a same-tag sibling further down (the footnote <p>) and be inserted
// after it. Every existing assertion only asks whether the node exists, so
// the defect is invisible below the E2E layer (CONV-testing-4) — and it only
// manifests on the real hydration path, whose SSR boundary markers change the
// sibling-unit set a client-only mount never sees.

import * as assert from 'remix/assert'
import { createTestServer } from 'remix/node-fetch-server/test'
import { describe, it } from 'remix/test'

import { router } from '../../../router.ts'
import { SYMBOLS } from './currencies.ts'

const CACHE_KEY = 'nocturne.rates.cache.v1'

/** Index of `selector` among the dashboard root's element children. */
async function slotIndex(page: { evaluate: (fn: (s: string) => number, a: string) => Promise<number> }, selector: string) {
  return page.evaluate((sel: string) => {
    let root = document.querySelector('[data-testid="rates-dashboard"]')
    let el = document.querySelector(sel)
    if (!root || !el) return -1
    return [...root.children].indexOf(el)
  }, selector)
}

describe('RatesDashboard: conditional slot ordering (E2E)', () => {
  it('AC-105 places the filter notice and the staleness banner above the list region, not after the footnote', async (t) => {
    let server = await createTestServer(router.fetch)
    let page = await t.serve(server)

    // Seed an EXPIRED cache so the staleness banner slot turns on after
    // hydration adopts persisted state (SSR's cold render has no banner).
    await page.addInitScript(
      (seed: { cacheKey: string; symbols: string[] }) => {
        let rates: Record<string, { usd: number; btc: number }> = {}
        for (let [index, symbol] of seed.symbols.entries()) {
          rates[symbol] = { usd: 100 + index, btc: (100 + index) / 78083 }
        }
        window.localStorage.setItem(
          seed.cacheKey,
          JSON.stringify({ rates, fetchedAt: Date.now() - 60 * 60 * 1000, history: {} }),
        )
      },
      { cacheKey: CACHE_KEY, symbols: [...SYMBOLS] },
    )

    // Keep the seeded cache expired: a successful live poll would refresh
    // `fetchedAt` and turn the banner slot back off mid-test.
    await page.route('**api.coinbase.com**', (route: { abort: () => void }) => route.abort())

    await page.goto('/')
    await page.waitForSelector('[data-testid="rates-dashboard"]')
    await page.waitForSelector('[data-testid="banner"]')

    let announcer = await slotIndex(page, '[data-testid="reorder-announcer"]')
    let banner = await slotIndex(page, '[data-testid="banner"]')
    assert.ok(banner !== -1, 'expected the expired-cache banner to render')
    assert.ok(
      banner < announcer,
      `staleness banner must precede the list region (banner=${banner}, announcer=${announcer})`,
    )

    // Now turn on the filter-notice slot the same way a user does.
    await page.fill('[data-testid="filter-input"]', 'eth')
    await page.waitForSelector('[data-testid="filter-notice"]')

    announcer = await slotIndex(page, '[data-testid="reorder-announcer"]')
    let notice = await slotIndex(page, '[data-testid="filter-notice"]')
    assert.ok(
      notice < announcer,
      `filter notice must precede the list region (notice=${notice}, announcer=${announcer})`,
    )

    // And the banner must not have been displaced by the second slot turning on.
    banner = await slotIndex(page, '[data-testid="banner"]')
    assert.ok(
      banner < notice,
      `banner must still precede the filter notice (banner=${banner}, notice=${notice})`,
    )
  })
})

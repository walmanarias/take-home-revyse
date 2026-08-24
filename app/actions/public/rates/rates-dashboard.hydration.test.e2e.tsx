import * as assert from 'remix/assert'
import { createTestServer } from 'remix/node-fetch-server/test'
import { describe, it } from 'remix/test'

import { router } from '../../../router.ts'
import { SYMBOLS } from './currencies.ts'

// Real localStorage keys written by rates-dashboard.tsx (VIEW_KEY/SCOPE_KEY/
// CACHE_KEY/BUDGET_KEY) — duplicated here rather than imported since this
// file drives a real served page/browser, not the component module directly.
const SCOPE_KEY = 'nocturne.rates.scope.v1'
const VIEW_KEY = 'nocturne.rates.view.v1'
const CACHE_KEY = 'nocturne.rates.cache.v1'
const BUDGET_KEY = 'nocturne.rates.budget.v2'

describe('RatesDashboard: hydration (E2E)', () => {
  it('AC-100 shows persisted All/table/warm-cache state after hydration, with exactly one dashboard tree and no hydration-mismatch console errors', async (t) => {
    let server = await createTestServer(router.fetch)
    let page = await t.serve(server)

    let consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    let pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))

    await page.addInitScript(
      (seed: {
        scopeKey: string
        viewKey: string
        cacheKey: string
        budgetKey: string
        symbols: string[]
      }) => {
        window.localStorage.setItem(seed.scopeKey, JSON.stringify('all'))
        window.localStorage.setItem(seed.viewKey, JSON.stringify('table'))

        // A warm cache (AC-100 residual): a valid {rates, fetchedAt, history}
        // for the curated symbols, "live" tier (recent fetchedAt), with
        // enough history for a session Δ — this is what QA's real
        // reload-with-warm-cache repro exercises.
        let now = Date.now()
        let rates: Record<string, { usd: number; btc: number }> = {}
        let history: Record<string, number[]> = {}
        for (let [index, symbol] of seed.symbols.entries()) {
          let usd = symbol === 'BTC' ? 78083 : 100 + index
          rates[symbol] = { usd, btc: symbol === 'BTC' ? 1 : usd / 78083 }
          history[symbol] = [usd - 1, usd]
        }
        window.localStorage.setItem(
          seed.cacheKey,
          JSON.stringify({ rates, fetchedAt: now - 2000, history }),
        )

        // A partially-spent budget (AC-100 residual): three granted requests
        // inside the trailing window, so the adopted pip/label text reads
        // "7/10 left this minute" where SSR's cold default rendered 10/10.
        window.localStorage.setItem(
          seed.budgetKey,
          JSON.stringify({ stamps: [now - 3000, now - 2000, now - 1000] }),
        )
      },
      {
        scopeKey: SCOPE_KEY,
        viewKey: VIEW_KEY,
        cacheKey: CACHE_KEY,
        budgetKey: BUDGET_KEY,
        symbols: [...SYMBOLS],
      },
    )

    await page.goto('/')
    await page.waitForSelector('[data-testid="rates-dashboard"][data-view="table"]')
    // Let the post-hydration mount task (and its follow-up render) settle
    // before checking the console — a mismatch could otherwise be logged
    // after this test's own assertions already ran.
    await page.waitForTimeout(200)

    let dashboards = await page.$$('[data-testid="rates-dashboard"]')
    assert.equal(dashboards.length, 1, 'expected exactly one rendered dashboard tree, no duplicate/ghost fragments')

    let dataView = await page.getAttribute('[data-testid="rates-dashboard"]', 'data-view')
    assert.equal(dataView, 'table')

    let allPressed = await page.getAttribute('[data-testid="scope-toggle-all"]', 'aria-pressed')
    assert.equal(allPressed, 'true')

    let viewportCount = await page.locator('[data-testid="table-viewport"]').count()
    assert.equal(viewportCount, 1)

    let btcUsd = await page.textContent(
      '[data-testid="asset-card"][data-symbol="BTC"] [data-testid="usd-value"]',
    )
    assert.match(btcUsd ?? '', /78,083/)

    // The adopted budget must actually reach the strip — a seeded record the
    // store no longer reads would leave this at the cold default's 10/10.
    let budgetLabel = await page.textContent('[data-testid="budget-label"]')
    assert.match(budgetLabel ?? '', /^7\/10 left this minute · \+1 in \d+s$/)

    let hydrationMismatches = consoleErrors.filter((text) => /Hydration mismatch/i.test(text))
    assert.deepEqual(
      hydrationMismatches,
      [],
      `expected no hydration-mismatch console errors across load+settle, got ${hydrationMismatches.length}: ${hydrationMismatches.slice(0, 5).join('; ')}`,
    )
    assert.deepEqual(pageErrors, [], `expected no uncaught page errors, got: ${pageErrors.join('; ')}`)
  })
})

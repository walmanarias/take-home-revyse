import * as assert from 'remix/assert'
import { createTestServer } from 'remix/node-fetch-server/test'
import { describe, it } from 'remix/test'

import { router } from '../../../router.ts'

// Real localStorage keys written by rates-dashboard.tsx (VIEW_KEY/SCOPE_KEY) —
// duplicated here rather than imported since this file drives a real served
// page/browser, not the component module directly.
const SCOPE_KEY = 'nocturne.rates.scope.v1'
const VIEW_KEY = 'nocturne.rates.view.v1'

describe('RatesDashboard: hydration (E2E)', () => {
  it('AC-100 shows persisted All/table state after hydration, with exactly one dashboard tree and no hydration-mismatch console errors', async (t) => {
    let server = await createTestServer(router.fetch)
    let page = await t.serve(server)

    let consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    let pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))

    await page.addInitScript(
      ([scopeKey, viewKey]) => {
        window.localStorage.setItem(scopeKey, JSON.stringify('all'))
        window.localStorage.setItem(viewKey, JSON.stringify('table'))
      },
      [SCOPE_KEY, VIEW_KEY],
    )

    await page.goto('/')
    await page.waitForSelector('[data-testid="rates-dashboard"][data-view="table"]')

    let dashboards = await page.$$('[data-testid="rates-dashboard"]')
    assert.equal(dashboards.length, 1, 'expected exactly one rendered dashboard tree, no duplicate/ghost fragments')

    let dataView = await page.getAttribute('[data-testid="rates-dashboard"]', 'data-view')
    assert.equal(dataView, 'table')

    let allPressed = await page.getAttribute('[data-testid="scope-toggle-all"]', 'aria-pressed')
    assert.equal(allPressed, 'true')

    let viewportCount = await page.locator('[data-testid="table-viewport"]').count()
    assert.equal(viewportCount, 1)

    let hydrationMismatches = consoleErrors.filter((text) => /Hydration mismatch/i.test(text))
    assert.deepEqual(hydrationMismatches, [], `expected no hydration-mismatch console errors, got: ${hydrationMismatches.join('; ')}`)
    assert.deepEqual(pageErrors, [], `expected no uncaught page errors, got: ${pageErrors.join('; ')}`)
  })
})

import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { router } from '../router.ts'
import { routes } from '../routes.ts'

describe('controller.tsx: home', () => {
  it('AC-68 renders full cold-start chrome, 200, with no error text ever', async () => {
    let response = await router.fetch(new Request('http://localhost' + routes.home.href()))
    let body = await response.text()

    assert.equal(response.status, 200)
    assertColdStartBody(body)
  })

  it('AC-69 makes zero network calls on first paint, even if fetch would throw', async (t) => {
    let stub = t.mock.method(globalThis, 'fetch', () => {
      throw new Error('fetch must not be called during server rendering')
    })

    let response = await router.fetch(new Request('http://localhost' + routes.home.href()))
    let body = await response.text()

    assert.equal(response.status, 200)
    assertColdStartBody(body)
    assert.equal(stub.mock.calls.length, 0)
  })
})

// Shared with AC-68/AC-69: the cold-start body must contain the "Coinbase ·
// 15 assets" caption, exactly 15 asset markers (see test/support/fakes.ts's
// documented `data-symbol` contract) each with at least one "—" placeholder,
// an aria-live region for the staleness label, and no error text or stack
// trace fragment — regardless of which 15 symbols currencies.ts curates.
function assertColdStartBody(body: string) {
  assert.match(body, /Coinbase · 15 assets/)
  assert.match(body, /aria-live="polite"/)

  let symbolCount = [...body.matchAll(/data-symbol="/g)].length
  assert.equal(symbolCount, 15)

  let dashCount = [...body.matchAll(/—/g)].length
  assert.ok(dashCount >= 15, `expected at least 15 "—" placeholders, found ${dashCount}`)

  assert.doesNotMatch(body, /Error/)
  assert.doesNotMatch(body, /Something went wrong/)
  assert.doesNotMatch(body, /\n\s*at [A-Za-z]/)
}

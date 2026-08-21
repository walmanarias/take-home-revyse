import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'
import { render } from 'remix/ui/test'

import { T0, accessibleName, createFakeKV, pendingFetch } from '../../../../test/support/fakes.ts'
import { RatesDashboard } from './rates-dashboard.tsx'

describe('RatesDashboard: SSR/hydration match', () => {
  it('AC-70 matches the cold-start markup synchronously, before the mount task resolves (no hydration flash)', () => {
    let kv = createFakeKV()
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    try {
      let cards = [...result.$$('[data-testid="asset-card"]')]
      assert.equal(cards.length, 15)
      for (let card of cards) {
        assert.equal(card.querySelector('[data-testid="usd-value"]')?.textContent, '—')
      }
      assert.match(
        result.$('[data-testid="status-label"]')?.textContent ?? '',
        /Fetching first rates…/,
      )
    } finally {
      result.cleanup()
    }
  })
})

describe('RatesDashboard: accessibility', () => {
  it('AC-71 gives every interactive control a focus-visible ring marker', async (t) => {
    let kv = createFakeKV()
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    let selectors = [
      '[data-testid="filter-input"]',
      '[data-testid="sort-custom"]',
      '[data-testid="sort-name"]',
      '[data-testid="sort-usd"]',
      '[data-testid="sort-delta"]',
      '[data-testid="refresh-button"]',
      '[data-testid="auto-checkbox"]',
      '[data-testid="pin-button"]',
      '[data-testid="drag-handle"]',
    ]

    for (let selector of selectors) {
      let element = result.$(selector) as HTMLElement
      assert.ok(element, `expected to find ${selector}`)
      assert.ok(
        element.classList.contains('focus-ring'),
        `expected ${selector} to carry the shared "focus-ring" style class`,
      )
    }
  })

  it('AC-72 keeps aria-live="polite" on the staleness label at mount and after updates', async (t) => {
    let kv = createFakeKV()
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    assert.equal(result.$('[data-testid="status-label"]')?.getAttribute('aria-live'), 'polite')

    await result.act(() => (result.$('[data-testid="sort-name"]') as HTMLButtonElement).click())

    assert.equal(result.$('[data-testid="status-label"]')?.getAttribute('aria-live'), 'polite')
  })

  it('AC-73 gives the filter input, pin buttons, and drag handles accessible names', async (t) => {
    let kv = createFakeKV()
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    let filterInput = result.$('[data-testid="filter-input"]') as HTMLElement
    assert.ok(accessibleName(filterInput).length > 0)

    let card = result.$('[data-testid="asset-card"]') as HTMLElement
    let name = card.getAttribute('data-name') ?? ''
    let pinButton = card.querySelector('[data-testid="pin-button"]') as HTMLElement
    assert.match(accessibleName(pinButton), /Pin/)
    assert.ok(accessibleName(pinButton).includes(name))

    await result.act(() => pinButton.click())
    assert.match(accessibleName(pinButton), /Unpin/)

    let dragHandle = card.querySelector('[data-testid="drag-handle"]') as HTMLElement
    assert.ok(accessibleName(dragHandle).length > 0)
  })
})

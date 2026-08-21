import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'
import { render } from 'remix/ui/test'

import {
  T0,
  cardOrder,
  createFakeKV,
  pendingFetch,
  setInputValue,
} from '../../../../test/support/fakes.ts'
import { RatesDashboard } from './rates-dashboard.tsx'

describe('RatesDashboard: filter', () => {
  it('AC-30 filters to only matching assets and shows a match counter', async (t) => {
    let kv = createFakeKV()
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    let input = result.$('[data-testid="filter-input"]') as HTMLInputElement
    await result.act(() => setInputValue(input, 'eth'))

    let counterText = result.$('[data-testid="match-counter"]')?.textContent ?? ''
    let match = counterText.match(/(\d+)\/15/)
    assert.ok(match, `expected a "n/15" match counter, got "${counterText}"`)

    let visibleCards = [...result.$$('[data-testid="asset-card"]')].filter(
      (card) => card.getAttribute('data-hidden') !== 'true',
    )
    assert.equal(visibleCards.length, Number(match![1]))
    for (let card of visibleCards) {
      let symbol = (card.getAttribute('data-symbol') ?? '').toLowerCase()
      let name = (card.getAttribute('data-name') ?? '').toLowerCase()
      assert.ok(
        symbol.includes('eth') || name.includes('eth'),
        `expected "${symbol}"/"${name}" to match "eth"`,
      )
    }
  })

  it('AC-31 shows the empty state when the filter matches nothing', async (t) => {
    let kv = createFakeKV()
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    let input = result.$('[data-testid="filter-input"]') as HTMLInputElement
    await result.act(() => setInputValue(input, 'xyz'))

    let visibleCards = [...result.$$('[data-testid="asset-card"]')].filter(
      (card) => card.getAttribute('data-hidden') !== 'true',
    )
    assert.equal(visibleCards.length, 0)
    assert.match(
      result.$('[data-testid="empty-state"]')?.textContent ?? '',
      /Nothing matches "xyz"\./,
    )
  })

  it('AC-32 shows all 15 assets and no match counter when the filter is empty', async (t) => {
    let kv = createFakeKV()
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    let visibleCards = [...result.$$('[data-testid="asset-card"]')].filter(
      (card) => card.getAttribute('data-hidden') !== 'true',
    )
    assert.equal(visibleCards.length, 15)
    assert.equal(result.$('[data-testid="match-counter"]'), null)
  })
})

describe('RatesDashboard: drag enablement follows the active sort', () => {
  it('AC-39 disables the drag handle under the "name", "usd", and "delta" sorts', async (t) => {
    let kv = createFakeKV()
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    for (let sortTestId of ['sort-name', 'sort-usd', 'sort-delta']) {
      await result.act(() =>
        (result.$(`[data-testid="${sortTestId}"]`) as HTMLButtonElement).click(),
      )

      let handle = result.$('[data-testid="drag-handle"]') as HTMLElement
      assert.equal(handle.getAttribute('draggable'), 'false')

      let before = cardOrder(result)
      await result.act(() => {
        handle.focus()
        handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      })
      assert.deepEqual(cardOrder(result), before)
    }
  })

  it('AC-40 makes the drag handle draggable under the "custom" sort', async (t) => {
    let kv = createFakeKV()
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    await result.act(() => (result.$('[data-testid="sort-custom"]') as HTMLButtonElement).click())

    let handle = result.$('[data-testid="drag-handle"]') as HTMLElement
    assert.equal(handle.getAttribute('draggable'), 'true')
  })
})

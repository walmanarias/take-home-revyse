import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'
import { render } from 'remix/ui/test'

import {
  FAVS_KEY,
  ORDER_KEY,
  T0,
  cardEntries,
  cardOrder,
  createFakeKV,
  pendingFetch,
  pickPartialMatchQuery,
  reorderExpectation,
  setInputValue,
} from '../../../../test/support/fakes.ts'
import { RatesDashboard } from './rates-dashboard.tsx'

describe('RatesDashboard: reorder while filtered (T5)', () => {
  it('AC-44 confines a drag-while-filtered reorder to the master order, leaving hidden neighbours untouched', async (t) => {
    let kv = createFakeKV()
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    await result.act(() => (result.$('[data-testid="sort-custom"]') as HTMLButtonElement).click())

    let entries = cardEntries(result)
    let filterQuery = pickPartialMatchQuery(entries)

    let input = result.$('[data-testid="filter-input"]') as HTMLInputElement
    await result.act(() => setInputValue(input, filterQuery))

    let visible = cardEntries(result).filter((e) => e.hidden !== 'true')
    assert.ok(
      visible.length >= 2,
      `expected the "${filterQuery}" filter to leave at least 2 assets visible`,
    )

    let dragged = visible[0]!.symbol
    let target = visible[visible.length - 1]!.symbol
    let expectedMasterOrder = reorderExpectation(
      entries.map((e) => e.symbol),
      dragged,
      target,
      'after',
    )

    let draggedHandle = result.$(
      `[data-testid="asset-card"][data-symbol="${dragged}"] [data-testid="drag-handle"]`,
    ) as HTMLElement
    let targetCard = result.$(
      `[data-testid="asset-card"][data-symbol="${target}"]`,
    ) as HTMLElement

    await result.act(() => {
      draggedHandle.dispatchEvent(
        new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }),
      )
      targetCard.dispatchEvent(
        new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer: new DataTransfer(),
        }),
      )
      targetCard.dispatchEvent(
        new DragEvent('drop', { bubbles: true, dataTransfer: new DataTransfer() }),
      )
    })

    await result.act(() => setInputValue(input, ''))

    assert.deepEqual(cardOrder(result), expectedMasterOrder)
  })
})

describe('RatesDashboard: keyboard reorder', () => {
  it('AC-45 ArrowUp moves the focused symbol one position earlier, persists it, and announces the move', async (t) => {
    let kv = createFakeKV()
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    await result.act(() => (result.$('[data-testid="sort-custom"]') as HTMLButtonElement).click())

    let before = cardOrder(result)
    let handles = [...result.$$('[data-testid="drag-handle"]')] as HTMLElement[]
    let secondHandle = handles[1]!

    await result.act(() => {
      secondHandle.focus()
      secondHandle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    })

    let expected = [...before]
    ;[expected[0], expected[1]] = [expected[1]!, expected[0]!]

    assert.deepEqual(cardOrder(result), expected)
    assert.deepEqual(JSON.parse(kv.getItem(ORDER_KEY) ?? '[]'), expected)
    assert.ok((result.$('[data-testid="reorder-announcer"]')?.textContent ?? '').length > 0)
  })

  it('AC-46 ArrowUp on the first symbol is a no-op: master order and persistence are unchanged', async (t) => {
    let kv = createFakeKV()
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    await result.act(() => (result.$('[data-testid="sort-custom"]') as HTMLButtonElement).click())

    let before = cardOrder(result)
    let firstHandle = result.$('[data-testid="drag-handle"]') as HTMLElement

    await result.act(() => {
      firstHandle.focus()
      firstHandle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    })

    assert.deepEqual(cardOrder(result), before)
    assert.equal(kv.getItem(ORDER_KEY), null)
  })
})

describe('RatesDashboard: pin/unpin', () => {
  it("AC-47 toggles pin membership, persists it, and flips the pin button's visual state", async (t) => {
    let kv = createFakeKV()
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    let pinButton = result.$('[data-testid="pin-button"]') as HTMLElement
    let symbol = pinButton
      .closest('[data-testid="asset-card"]')
      ?.getAttribute('data-symbol')

    assert.equal(pinButton.getAttribute('data-pinned'), 'false')

    await result.act(() => pinButton.click())
    assert.equal(pinButton.getAttribute('data-pinned'), 'true')
    assert.deepEqual(JSON.parse(kv.getItem(FAVS_KEY) ?? '[]'), [symbol])

    await result.act(() => pinButton.click())
    assert.equal(pinButton.getAttribute('data-pinned'), 'false')
    assert.deepEqual(JSON.parse(kv.getItem(FAVS_KEY) ?? '[]'), [])
  })
})

import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'
import { render } from 'remix/ui/test'

import {
  FAVS_KEY,
  ORDER_V2_KEY,
  T0,
  VIEW_KEY,
  accessibleName,
  cardEntries,
  cardOrder,
  createFakeKV,
  pendingFetch,
  reorderExpectation,
  setInputValue,
} from '../../../../test/support/fakes.ts'
import { RatesDashboard } from './rates-dashboard.tsx'

describe('RatesDashboard: view toggle (cards <-> table)', () => {
  it('AC-77 exposes a two-option Cards/Table view toggle and defaults to cards on a first visit', async (t) => {
    let kv = createFakeKV()
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    let toggle = result.$('[data-testid="view-toggle"]')
    assert.ok(toggle, 'expected a [data-testid="view-toggle"] control in the toolbar')

    let cardsOption = result.$('[data-testid="view-toggle-cards"]')
    let tableOption = result.$('[data-testid="view-toggle-table"]')
    assert.ok(cardsOption, 'expected a [data-testid="view-toggle-cards"] option')
    assert.ok(tableOption, 'expected a [data-testid="view-toggle-table"] option')
    assert.match(accessibleName(cardsOption!), /Cards/i)
    assert.match(accessibleName(tableOption!), /Table/i)

    assert.equal(result.$('[data-testid="rates-dashboard"]')?.getAttribute('data-view'), 'cards')
  })

  it('AC-78 renders a table header + one row per asset (still carrying the asset-card contract) when Table is selected', async (t) => {
    let kv = createFakeKV()
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    let tableOption = result.$('[data-testid="view-toggle-table"]') as HTMLElement
    assert.ok(tableOption, 'expected a [data-testid="view-toggle-table"] option')
    await result.act(() => tableOption.click())

    assert.equal(result.$('[data-testid="rates-dashboard"]')?.getAttribute('data-view'), 'table')

    let header = result.$('[data-testid="table-header"]')
    assert.ok(header, 'expected a [data-testid="table-header"] row in table view')
    let headerText = header?.textContent ?? ''
    for (let label of ['Asset', 'USD', 'BTC', 'Session Δ', 'Trend']) {
      assert.match(headerText, new RegExp(label, 'i'))
    }

    let rows = [...result.$$('[data-testid="asset-card"]')]
    assert.equal(rows.length, 15)
    for (let row of rows) {
      assert.ok(row.querySelector('[data-testid="usd-value"]'))
      assert.ok(row.querySelector('[data-testid="pin-button"]'))
      assert.ok(row.querySelector('[data-testid="drag-handle"]'))
    }
  })

  it('AC-79 persists the view choice and falls back to cards without throwing on a corrupt/unknown value', async (t) => {
    let kv = createFakeKV()
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    let tableOption = result.$('[data-testid="view-toggle-table"]') as HTMLElement
    assert.ok(tableOption, 'expected a [data-testid="view-toggle-table"] option')
    await result.act(() => tableOption.click())

    assert.equal(kv.getItem(VIEW_KEY), JSON.stringify('table'))

    let corruptKv = createFakeKV()
    corruptKv.setItem(VIEW_KEY, '{not json')
    let corrupt = render(
      <RatesDashboard kv={corruptKv} clock={() => T0} fetchImpl={pendingFetch()} />,
    )
    t.after(corrupt.cleanup)
    assert.equal(corrupt.$('[data-testid="rates-dashboard"]')?.getAttribute('data-view'), 'cards')

    let unknownKv = createFakeKV({ [VIEW_KEY]: 'chart' })
    let unknown = render(
      <RatesDashboard kv={unknownKv} clock={() => T0} fetchImpl={pendingFetch()} />,
    )
    t.after(unknown.cleanup)
    assert.equal(unknown.$('[data-testid="rates-dashboard"]')?.getAttribute('data-view'), 'cards')
  })

  it('AC-80 keeps drag, pin, and keyboard-reorder behavior identical in table view under "custom" sort', async (t) => {
    let kv = createFakeKV()
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    let tableOption = result.$('[data-testid="view-toggle-table"]') as HTMLElement
    assert.ok(tableOption, 'expected a [data-testid="view-toggle-table"] option')
    await result.act(() => tableOption.click())
    assert.equal(result.$('[data-testid="rates-dashboard"]')?.getAttribute('data-view'), 'table')
    await result.act(() => (result.$('[data-testid="sort-custom"]') as HTMLButtonElement).click())

    // Drag-and-drop: identical master-order semantics/persistence to cards view (AC-41/44).
    let orderBeforeDrag = cardOrder(result)
    assert.equal(orderBeforeDrag.length, 15)
    let draggedSymbol = orderBeforeDrag[0]!
    let targetSymbol = orderBeforeDrag[2]!
    let draggedHandle = result.$(
      `[data-testid="asset-card"][data-symbol="${draggedSymbol}"] [data-testid="drag-handle"]`,
    ) as HTMLElement
    let targetRow = result.$(
      `[data-testid="asset-card"][data-symbol="${targetSymbol}"]`,
    ) as HTMLElement
    assert.ok(draggedHandle, 'expected a drag handle for the dragged row in table view')
    assert.ok(targetRow, 'expected the drop-target row in table view')

    await result.act(() => {
      draggedHandle.dispatchEvent(
        new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }),
      )
      targetRow.dispatchEvent(
        new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer: new DataTransfer(),
        }),
      )
      targetRow.dispatchEvent(
        new DragEvent('drop', { bubbles: true, dataTransfer: new DataTransfer() }),
      )
    })

    let expectedAfterDrag = reorderExpectation(orderBeforeDrag, draggedSymbol, targetSymbol, 'after')
    assert.deepEqual(cardOrder(result), expectedAfterDrag)
    // Persistence moved to the order.v2 record per the T3 amendment (AC-92..96).
    assert.deepEqual(JSON.parse(kv.getItem(ORDER_V2_KEY) ?? '{}').order, expectedAfterDrag)

    // Keyboard reorder: identical master-order semantics/persistence to cards view (AC-45).
    let orderBeforeKeyboard = cardOrder(result)
    let handles = [...result.$$('[data-testid="drag-handle"]')] as HTMLElement[]
    assert.equal(handles.length, 15, 'expected 15 drag handles in table view')
    let secondHandle = handles[1]!
    await result.act(() => {
      secondHandle.focus()
      secondHandle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    })
    let expectedAfterKeyboard = [...orderBeforeKeyboard]
    ;[expectedAfterKeyboard[0], expectedAfterKeyboard[1]] = [
      expectedAfterKeyboard[1]!,
      expectedAfterKeyboard[0]!,
    ]
    assert.deepEqual(cardOrder(result), expectedAfterKeyboard)
    assert.deepEqual(JSON.parse(kv.getItem(ORDER_V2_KEY) ?? '{}').order, expectedAfterKeyboard)

    // Pin: identical contract/persistence to cards view (AC-47).
    let pinButton = result.$('[data-testid="pin-button"]') as HTMLElement
    assert.ok(pinButton, 'expected a [data-testid="pin-button"] in table view')
    let pinnedSymbol = pinButton.closest('[data-testid="asset-card"]')?.getAttribute('data-symbol')
    await result.act(() => pinButton.click())
    assert.deepEqual(JSON.parse(kv.getItem(FAVS_KEY) ?? '[]'), [pinnedSymbol])
  })

  it('AC-81 filters rows in table view exactly like cards view (visibility, match counter, empty state)', async (t) => {
    let kv = createFakeKV()
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    let tableOption = result.$('[data-testid="view-toggle-table"]') as HTMLElement
    assert.ok(tableOption, 'expected a [data-testid="view-toggle-table"] option')
    await result.act(() => tableOption.click())
    assert.equal(result.$('[data-testid="rates-dashboard"]')?.getAttribute('data-view'), 'table')

    let input = result.$('[data-testid="filter-input"]') as HTMLInputElement
    await result.act(() => setInputValue(input, 'eth'))

    let counterText = result.$('[data-testid="match-counter"]')?.textContent ?? ''
    let match = counterText.match(/(\d+)\/15/)
    assert.ok(match, `expected a "n/15" match counter in table view, got "${counterText}"`)

    let visibleRows = [...result.$$('[data-testid="asset-card"]')].filter(
      (row) => row.getAttribute('data-hidden') !== 'true',
    )
    assert.equal(visibleRows.length, Number(match![1]))

    await result.act(() => setInputValue(input, 'xyz'))
    let stillVisible = [...result.$$('[data-testid="asset-card"]')].filter(
      (row) => row.getAttribute('data-hidden') !== 'true',
    )
    assert.equal(stillVisible.length, 0)
    assert.match(
      result.$('[data-testid="empty-state"]')?.textContent ?? '',
      /Nothing matches "xyz"\./,
    )
  })

  it('AC-82 preserves filter, sort, pins, and custom order unchanged when switching view in either direction', async (t) => {
    let kv = createFakeKV()
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    // Establish non-default state: a reordered master order, a pin, a
    // non-custom sort, and an active filter.
    await result.act(() => (result.$('[data-testid="sort-custom"]') as HTMLButtonElement).click())
    let handles = [...result.$$('[data-testid="drag-handle"]')] as HTMLElement[]
    await result.act(() => {
      handles[1]!.focus()
      handles[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    })
    let pinButton = result.$('[data-testid="pin-button"]') as HTMLElement
    await result.act(() => pinButton.click())
    await result.act(() => (result.$('[data-testid="sort-name"]') as HTMLButtonElement).click())
    let input = result.$('[data-testid="filter-input"]') as HTMLInputElement
    await result.act(() => setInputValue(input, 'e'))

    // Raw-string capture of the v2 record: any write (even a same-order rewrite
    // bumping updatedAt) would fail the byte-equality checks below (AC-82).
    let orderBefore = kv.getItem(ORDER_V2_KEY)
    let favsBefore = JSON.parse(kv.getItem(FAVS_KEY) ?? '[]')
    let visibleBefore = cardEntries(result)
      .filter((e) => e.hidden !== 'true')
      .map((e) => e.symbol)
    let sortActiveBefore = result.$('[data-testid="sort-name"]')?.getAttribute('aria-pressed')
    let filterValueBefore = input.value

    let tableOption = result.$('[data-testid="view-toggle-table"]') as HTMLElement
    assert.ok(tableOption, 'expected a [data-testid="view-toggle-table"] option')
    await result.act(() => tableOption.click())
    assert.equal(result.$('[data-testid="rates-dashboard"]')?.getAttribute('data-view'), 'table')

    assert.equal(kv.getItem(ORDER_V2_KEY), orderBefore)
    assert.deepEqual(JSON.parse(kv.getItem(FAVS_KEY) ?? '[]'), favsBefore)
    assert.deepEqual(
      cardEntries(result)
        .filter((e) => e.hidden !== 'true')
        .map((e) => e.symbol),
      visibleBefore,
    )
    assert.equal(
      result.$('[data-testid="sort-name"]')?.getAttribute('aria-pressed'),
      sortActiveBefore,
    )
    assert.equal(
      (result.$('[data-testid="filter-input"]') as HTMLInputElement).value,
      filterValueBefore,
    )

    let cardsOption = result.$('[data-testid="view-toggle-cards"]') as HTMLElement
    assert.ok(cardsOption, 'expected a [data-testid="view-toggle-cards"] option')
    await result.act(() => cardsOption.click())
    assert.equal(result.$('[data-testid="rates-dashboard"]')?.getAttribute('data-view'), 'cards')

    assert.equal(kv.getItem(ORDER_V2_KEY), orderBefore)
    assert.deepEqual(JSON.parse(kv.getItem(FAVS_KEY) ?? '[]'), favsBefore)
    assert.deepEqual(
      cardEntries(result)
        .filter((e) => e.hidden !== 'true')
        .map((e) => e.symbol),
      visibleBefore,
    )
  })
})

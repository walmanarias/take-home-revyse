import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'
import { render } from 'remix/ui/test'

import {
  BUDGET_KEY,
  FAVS_KEY,
  ORDER_V2_KEY,
  SCOPE_KEY,
  T0,
  accessibleName,
  cardOrder,
  createFakeKV,
  manualClock,
  pendingFetch,
  setInputValue,
} from '../../../../test/support/fakes.ts'
import { SYMBOLS } from './currencies.ts'
import { RatesDashboard } from './rates-dashboard.tsx'

// A 300-symbol universe (the curated 15 + 285 synthetic "uncurated" ones),
// built locally so AC-86/88/89/90 can exercise "All" scope without a real
// 300-currency Coinbase response. Synthetic symbols use a "ZZZ"-prefixed code
// that cannot collide with any real curated ticker, and sort alphabetically
// last among themselves (ZZZ000 first, ZZZ284 last) so tests can reason about
// their position without depending on which 15 symbols are actually curated.
const UNCURATED_COUNT = 300 - SYMBOLS.length

function build300SymbolRates(): Record<string, { usd: number; btc: number }> {
  let rates: Record<string, { usd: number; btc: number }> = {}
  for (let symbol of SYMBOLS) {
    rates[symbol] = { usd: 100, btc: 0.001 }
  }
  for (let i = 0; i < UNCURATED_COUNT; i++) {
    rates[`ZZZ${String(i).padStart(3, '0')}`] = { usd: 1 + i, btc: 0.0001 }
  }
  return rates
}

function fetch300(clock: () => number) {
  return async () => ({ rates: build300SymbolRates(), fetchedAt: clock() })
}

describe('RatesDashboard: scope toggle (Curated 15 <-> All)', () => {
  it('AC-85 exposes a Curated 15/All scope toggle, defaults to curated, and persists/falls back safely', async (t) => {
    let kv = createFakeKV()
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    let toggle = result.$('[data-testid="scope-toggle"]')
    assert.ok(toggle, 'expected a [data-testid="scope-toggle"] control')

    let curatedOption = result.$('[data-testid="scope-toggle-curated"]')
    let allOption = result.$('[data-testid="scope-toggle-all"]')
    assert.ok(curatedOption, 'expected a [data-testid="scope-toggle-curated"] option')
    assert.ok(allOption, 'expected a [data-testid="scope-toggle-all"] option')
    assert.match(accessibleName(curatedOption!), /Curated/i)
    assert.match(accessibleName(allOption!), /All/i)
    assert.equal(curatedOption!.getAttribute('aria-pressed'), 'true')

    await result.act(() => (allOption as HTMLElement).click())
    assert.equal(kv.getItem(SCOPE_KEY), JSON.stringify('all'))

    let corruptKv = createFakeKV()
    corruptKv.setItem(SCOPE_KEY, '{not json')
    let corrupt = render(
      <RatesDashboard kv={corruptKv} clock={() => T0} fetchImpl={pendingFetch()} />,
    )
    t.after(corrupt.cleanup)
    assert.equal(
      corrupt.$('[data-testid="scope-toggle-curated"]')?.getAttribute('aria-pressed'),
      'true',
    )

    let unknownKv = createFakeKV({ [SCOPE_KEY]: 'planets' })
    let unknown = render(
      <RatesDashboard kv={unknownKv} clock={() => T0} fetchImpl={pendingFetch()} />,
    )
    t.after(unknown.cleanup)
    assert.equal(
      unknown.$('[data-testid="scope-toggle-curated"]')?.getAttribute('aria-pressed'),
      'true',
    )
  })

  it('AC-86 reflects the full 300-symbol universe (row count, match-counter denominator, uncurated name/Δ) in All scope', async (t) => {
    let clock = manualClock(T0)
    let kv = createFakeKV({ [BUDGET_KEY]: { tokens: 10, ts: T0 } })
    let result = render(<RatesDashboard kv={kv} clock={clock.now} fetchImpl={fetch300(clock.now)} />)
    t.after(result.cleanup)

    await result.act(() =>
      (result.$('[data-testid="refresh-button"]') as HTMLButtonElement).click(),
    )

    let allOption = result.$('[data-testid="scope-toggle-all"]') as HTMLElement
    assert.ok(allOption, 'expected a [data-testid="scope-toggle-all"] option')
    await result.act(() => allOption.click())

    let renderedRows = [...result.$$('[data-testid="asset-card"]')].length
    let topSpacer = result.$('[data-testid="window-spacer-top"]')
    let bottomSpacer = result.$('[data-testid="window-spacer-bottom"]')
    let topRows = Number(topSpacer?.getAttribute('data-row-count') ?? 0)
    let bottomRows = Number(bottomSpacer?.getAttribute('data-row-count') ?? 0)
    assert.equal(topRows + renderedRows + bottomRows, 300)

    let input = result.$('[data-testid="filter-input"]') as HTMLInputElement
    await result.act(() => setInputValue(input, 'zzz'))
    let counterText = result.$('[data-testid="match-counter"]')?.textContent ?? ''
    assert.match(counterText, /\/300$/)

    await result.act(() => setInputValue(input, ''))
    let uncuratedRow = result.$('[data-testid="asset-card"][data-symbol="ZZZ000"]')
    assert.ok(uncuratedRow, 'expected the uncurated ZZZ000 row to be reachable in the default window')
    assert.equal(uncuratedRow?.getAttribute('data-name'), 'ZZZ000')
    assert.equal(uncuratedRow?.querySelector('[data-testid="delta-value"]')?.textContent, '—')
  })

  it('AC-87 forces+locks table view in All scope and restores the prior view choice back in Curated scope', async (t) => {
    let kv = createFakeKV()
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={pendingFetch()} />)
    t.after(result.cleanup)

    let cardsOption = result.$('[data-testid="view-toggle-cards"]') as HTMLElement
    assert.ok(cardsOption, 'expected a [data-testid="view-toggle-cards"] option')
    await result.act(() => cardsOption.click())
    assert.equal(result.$('[data-testid="rates-dashboard"]')?.getAttribute('data-view'), 'cards')

    let allOption = result.$('[data-testid="scope-toggle-all"]') as HTMLElement
    assert.ok(allOption, 'expected a [data-testid="scope-toggle-all"] option')
    await result.act(() => allOption.click())

    assert.equal(result.$('[data-testid="rates-dashboard"]')?.getAttribute('data-view'), 'table')
    assert.equal((result.$('[data-testid="view-toggle-cards"]') as HTMLButtonElement).disabled, true)

    let curatedOption = result.$('[data-testid="scope-toggle-curated"]') as HTMLElement
    assert.ok(curatedOption, 'expected a [data-testid="scope-toggle-curated"] option')
    await result.act(() => curatedOption.click())

    assert.equal(result.$('[data-testid="rates-dashboard"]')?.getAttribute('data-view'), 'cards')
    assert.equal((result.$('[data-testid="view-toggle-cards"]') as HTMLButtonElement).disabled, false)
  })

  it('AC-88 renders at most ~40 rows for a 300-row All-scope list, spacers preserve the scroll extent, and scrolling advances the slice', async (t) => {
    let clock = manualClock(T0)
    let kv = createFakeKV({ [BUDGET_KEY]: { tokens: 10, ts: T0 } })
    let result = render(<RatesDashboard kv={kv} clock={clock.now} fetchImpl={fetch300(clock.now)} />)
    t.after(result.cleanup)

    await result.act(() =>
      (result.$('[data-testid="refresh-button"]') as HTMLButtonElement).click(),
    )

    let allOption = result.$('[data-testid="scope-toggle-all"]') as HTMLElement
    assert.ok(allOption, 'expected a [data-testid="scope-toggle-all"] option')
    await result.act(() => allOption.click())

    let viewport = result.$('[data-testid="table-viewport"]') as HTMLElement
    assert.ok(viewport, 'expected a [data-testid="table-viewport"] scroll container')
    await result.act(() => {
      viewport.style.height = '600px'
      viewport.style.overflow = 'auto'
    })

    let rows = [...result.$$('[data-testid="asset-card"]')]
    assert.ok(rows.length <= 40, `expected at most 40 rendered rows, got ${rows.length}`)

    let topSpacer = result.$('[data-testid="window-spacer-top"]')
    let bottomSpacer = result.$('[data-testid="window-spacer-bottom"]')
    assert.ok(topSpacer, 'expected a [data-testid="window-spacer-top"] element')
    assert.ok(bottomSpacer, 'expected a [data-testid="window-spacer-bottom"] element')
    let topRows = Number(topSpacer?.getAttribute('data-row-count') ?? 0)
    let bottomRows = Number(bottomSpacer?.getAttribute('data-row-count') ?? 0)
    assert.equal(topRows + rows.length + bottomRows, 300)
    assert.equal(topRows, 0, 'expected no rows skipped above an unscrolled viewport')

    let firstSymbolBefore = rows[0]?.getAttribute('data-symbol')

    await result.act(() => {
      viewport.scrollTop = 2000
      viewport.dispatchEvent(new Event('scroll', { bubbles: true }))
    })

    let firstSymbolAfter = result.$('[data-testid="asset-card"]')?.getAttribute('data-symbol')
    assert.notEqual(firstSymbolAfter, firstSymbolBefore)
  })

  it('AC-89 filters against the full All-scope universe (an uncurated-only match is found) and restores the windowed list when cleared', async (t) => {
    let clock = manualClock(T0)
    let kv = createFakeKV({ [BUDGET_KEY]: { tokens: 10, ts: T0 } })
    let result = render(<RatesDashboard kv={kv} clock={clock.now} fetchImpl={fetch300(clock.now)} />)
    t.after(result.cleanup)

    await result.act(() =>
      (result.$('[data-testid="refresh-button"]') as HTMLButtonElement).click(),
    )

    let allOption = result.$('[data-testid="scope-toggle-all"]') as HTMLElement
    assert.ok(allOption, 'expected a [data-testid="scope-toggle-all"] option')
    await result.act(() => allOption.click())

    let input = result.$('[data-testid="filter-input"]') as HTMLInputElement
    await result.act(() => setInputValue(input, 'zzz284'))

    let visible = [...result.$$('[data-testid="asset-card"]')].filter(
      (row) => row.getAttribute('data-hidden') !== 'true',
    )
    assert.equal(visible.length, 1)
    assert.equal(visible[0]?.getAttribute('data-symbol'), 'ZZZ284')

    await result.act(() => setInputValue(input, 'nonexistentquery'))
    assert.match(
      result.$('[data-testid="empty-state"]')?.textContent ?? '',
      /Nothing matches "nonexistentquery"\./,
    )

    await result.act(() => setInputValue(input, ''))
    let rowsAfterClear = [...result.$$('[data-testid="asset-card"]')]
    assert.ok(rowsAfterClear.length <= 40)
  })

  it('AC-90 exposes drag handles only on curated/pinned rows in All scope, and pinning an uncurated symbol makes it reorderable', async (t) => {
    let clock = manualClock(T0)
    let kv = createFakeKV({ [BUDGET_KEY]: { tokens: 10, ts: T0 } })
    let result = render(<RatesDashboard kv={kv} clock={clock.now} fetchImpl={fetch300(clock.now)} />)
    t.after(result.cleanup)

    await result.act(() =>
      (result.$('[data-testid="refresh-button"]') as HTMLButtonElement).click(),
    )

    let allOption = result.$('[data-testid="scope-toggle-all"]') as HTMLElement
    assert.ok(allOption, 'expected a [data-testid="scope-toggle-all"] option')
    await result.act(() => allOption.click())
    await result.act(() => (result.$('[data-testid="sort-custom"]') as HTMLButtonElement).click())

    let uncuratedRow = result.$('[data-testid="asset-card"][data-symbol="ZZZ000"]')
    assert.ok(uncuratedRow, 'expected the uncurated ZZZ000 row to be reachable in the default window')
    assert.equal(uncuratedRow?.querySelector('[data-testid="drag-handle"]'), null)

    let pinButton = uncuratedRow?.querySelector('[data-testid="pin-button"]') as HTMLElement
    assert.ok(pinButton, 'expected a pin button on the uncurated row')
    await result.act(() => pinButton.click())

    let pinnedRow = result.$('[data-testid="asset-card"][data-symbol="ZZZ000"]')
    assert.ok(
      pinnedRow?.querySelector('[data-testid="drag-handle"]'),
      'expected a drag handle once ZZZ000 is pinned',
    )

    let curatedRow = result.$('[data-testid="asset-card"]')
    assert.ok(
      curatedRow?.querySelector('[data-testid="drag-handle"]'),
      'expected curated rows to keep their drag handle',
    )
  })
})

describe('RatesDashboard: durable order record (T3, order.v2)', () => {
  it('AC-96 writes an optimistic v2 order record on reorder and adopts a newer v2 record from a storage event without fetching', async (t) => {
    let kv = createFakeKV()
    let calls = 0
    let fetchImpl = async () => {
      calls++
      return { rates: {}, fetchedAt: T0 }
    }
    let result = render(<RatesDashboard kv={kv} clock={() => T0} fetchImpl={fetchImpl} />)
    t.after(result.cleanup)

    await result.act(() => (result.$('[data-testid="sort-custom"]') as HTMLButtonElement).click())

    let before = cardOrder(result)
    let handles = [...result.$$('[data-testid="drag-handle"]')] as HTMLElement[]
    await result.act(() => {
      handles[1]!.focus()
      handles[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    })

    let expected = [...before]
    ;[expected[0], expected[1]] = [expected[1]!, expected[0]!]
    assert.deepEqual(cardOrder(result), expected)

    let v2Raw = kv.getItem(ORDER_V2_KEY)
    assert.ok(v2Raw, 'expected a nocturne.rates.order.v2 record to be written on reorder')
    let v2 = JSON.parse(v2Raw!)
    assert.deepEqual(v2.order, expected)
    assert.equal(kv.getItem(FAVS_KEY), null, 'reorder must not touch favs')
    assert.equal(kv.getItem(BUDGET_KEY), null, 'reorder must not spend/touch the budget key')

    let incoming = {
      schemaVersion: 2,
      updatedAt: (v2.updatedAt ?? 0) + 1000,
      order: [...expected].reverse(),
    }
    await result.act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: ORDER_V2_KEY,
          newValue: JSON.stringify(incoming),
          storageArea: window.localStorage,
        }),
      )
    })

    assert.equal(calls, 0)
    assert.deepEqual(cardOrder(result), incoming.order)
  })
})

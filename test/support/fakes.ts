// Shared test doubles + DOM-contract helpers for the crypto-dashboard feature.
//
// Deliberately dependency-free: nothing here imports from
// `app/actions/public/rates/*`, so unit and component tests can use these
// helpers even while those modules don't exist yet.
//
// DOM contract assumed by every `rates-dashboard.*.test.tsx` file (the
// implementer should honor this exactly):
//   - Root: [data-testid="rates-dashboard"]
//   - Per asset: [data-testid="asset-card"][data-symbol="X"][data-name="Full Name"],
//     with `data-hidden="true"` while filtered out, `data-dimmed="true"` while
//     the tier is "expired", and `data-history-length="N"` reflecting
//     `history[symbol].length`.
//     Children: [data-testid="usd-value"], [data-testid="btc-value"],
//     [data-testid="delta-value"] (carries `data-sign="positive"|"negative"|"neutral"`),
//     [data-testid="pin-button"] (`aria-label="Pin {name}"`/`"Unpin {name}"`,
//     `data-pinned="true"|"false"`), [data-testid="drag-handle"]
//     (`draggable="true"|"false"`, an accessible name reflecting the symbol/name).
//   - Toolbar: [data-testid="filter-input"] (accessible name via aria-label),
//     [data-testid="match-counter"] ("n/15", present only while filtering),
//     [data-testid="sort-custom"|"sort-name"|"sort-usd"|"sort-delta"],
//     [data-testid="refresh-button"], [data-testid="auto-checkbox"],
//     [data-testid="auto-label"].
//   - Budget strip: 10x [data-testid="budget-pip"] (`data-filled="true"|"false"`),
//     [data-testid="budget-label"].
//   - Status: [data-testid="status-dot"] (`data-tier="live"|"stale"|"expired"|"none"`),
//     [data-testid="status-label"] (always `aria-live="polite"`).
//   - Conditional: [data-testid="banner"], [data-testid="empty-state"],
//     [data-testid="filter-notice"], [data-testid="reorder-announcer"]
//     (`aria-live="polite"`).
//   - Every interactive control also carries a literal `focus-ring` CSS class
//     (AC-71 permits a "class or computed style assertion"; this repo uses the
//     class form since Nocturne's tokens aren't loaded into an isolated
//     component-test render).
//
// View toggle (AC-77..82, cards <-> table):
//   - Root [data-testid="rates-dashboard"] also carries `data-view="cards"|"table"`
//     reflecting the active view.
//   - Toolbar: [data-testid="view-toggle"] wraps exactly two option controls,
//     [data-testid="view-toggle-cards"] and [data-testid="view-toggle-table"],
//     each with an accessible name containing "Cards"/"Table" respectively and
//     an `aria-pressed` reflecting the active option.
//   - Table view only: [data-testid="table-header"] renders once, containing
//     (case-insensitively) the column labels Asset, USD, BTC, "Session Δ",
//     and Trend.
//   - The per-asset contract above (`asset-card`, `usd-value`, `pin-button`,
//     `drag-handle`, ...) is identical in both views — table view renders one
//     `[data-testid="asset-card"]` per row rather than a second markup shape.

export interface KVStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface FakeKVStore extends KVStore {
  removeItem(key: string): void
  raw(): Record<string, string>
}

export function createFakeKV(initial: Record<string, unknown> = {}): FakeKVStore {
  let store = new Map<string, string>()
  for (let [key, value] of Object.entries(initial)) {
    store.set(key, JSON.stringify(value))
  }

  return {
    getItem(key) {
      return store.has(key) ? store.get(key)! : null
    },
    setItem(key, value) {
      store.set(key, value)
    },
    removeItem(key) {
      store.delete(key)
    },
    raw() {
      return Object.fromEntries(store)
    },
  }
}

export interface ManualClock {
  now(): number
  set(value: number): void
  advance(ms: number): number
}

export function manualClock(start: number): ManualClock {
  let current = start
  return {
    now: () => current,
    set(value) {
      current = value
    },
    advance(ms) {
      current += ms
      return current
    },
  }
}

// A fixed instant used across tests so assertions read consistently.
export const T0 = 1_700_000_000_000

// Versioned localStorage keys per FR-8 / the design brief's data model table.
export const CACHE_KEY = 'nocturne.rates.cache.v1'
export const ORDER_KEY = 'nocturne.rates.order.v1'
export const FAVS_KEY = 'nocturne.rates.favs.v1'
export const LEASE_KEY = 'nocturne.rates.lease.v1'
export const BUDGET_KEY = 'nocturne.rates.budget.v1'
export const VIEW_KEY = 'nocturne.rates.view.v1'

export type FakeFetchedRates = {
  rates: Record<string, { usd: number; btc: number }>
  fetchedAt: number
}

/** A `fetchImpl` stand-in whose promise never settles, for cold-start/pending-fetch tests. */
export function pendingFetch(): () => Promise<FakeFetchedRates> {
  return () => new Promise(() => {})
}

export function setInputValue(input: HTMLInputElement, value: string): void {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

interface QueryableResult {
  $(selector: string): Element | null
  $$(selector: string): NodeListOf<Element>
}

export interface CardEntry {
  symbol: string
  name: string
  hidden: string | null
}

/** Reads the rendered master order (DOM order) of `data-symbol` attributes. */
export function cardOrder(result: QueryableResult): string[] {
  return [...result.$$('[data-testid="asset-card"]')].map(
    (card) => card.getAttribute('data-symbol') ?? '',
  )
}

/** Reads `{symbol, name, hidden}` for every rendered asset card, in DOM order. */
export function cardEntries(result: QueryableResult): CardEntry[] {
  return [...result.$$('[data-testid="asset-card"]')].map((card) => ({
    symbol: card.getAttribute('data-symbol') ?? '',
    name: card.getAttribute('data-name') ?? '',
    hidden: card.getAttribute('data-hidden'),
  }))
}

/**
 * Finds a single-letter, case-insensitive filter query that (per the real
 * symbol/name data discovered from an unfiltered render) matches a proper
 * subset of the given entries — at least 2, but not all of them. Used so
 * filter/reorder tests don't need to hardcode which 15 symbols are curated
 * (an explicit open question in the spec).
 */
export function pickPartialMatchQuery(entries: CardEntry[]): string {
  for (let code = 97; code <= 122; code++) {
    let letter = String.fromCharCode(code)
    let matches = entries.filter(
      (e) => e.symbol.toLowerCase().includes(letter) || e.name.toLowerCase().includes(letter),
    )
    if (matches.length >= 2 && matches.length < entries.length) return letter
  }
  throw new Error('No single-letter filter isolates a partial subset of the curated assets')
}

/** Mirrors order.ts's `reorder()` T5 semantics, for computing test expectations. */
export function reorderExpectation(
  order: string[],
  dragged: string,
  target: string,
  position: 'before' | 'after',
): string[] {
  if (dragged === target) return [...order]
  let withoutDragged = order.filter((s) => s !== dragged)
  let targetIndex = withoutDragged.indexOf(target)
  let insertAt = position === 'after' ? targetIndex + 1 : targetIndex
  withoutDragged.splice(insertAt, 0, dragged)
  return withoutDragged
}

export function accessibleName(element: Element): string {
  return element.getAttribute('aria-label') ?? element.textContent ?? ''
}

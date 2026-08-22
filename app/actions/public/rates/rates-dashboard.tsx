// The single client-hydrated composition root for the crypto rates
// dashboard (ADR 0005). `RatesDashboard` owns every piece of feature state
// as setup-scope variables and wires the pure modules (budget/lease/cache/
// order/sort/format/persisted/status/window) to the presentational render
// helpers (toolbar/card/table/budget-strip). It holds state and decides;
// it renders almost no markup itself.
//
// `RatesDashboardEntry` is the thin, fully-serializable `clientEntry`
// wrapper actually mounted by `home-page.tsx`; `RatesDashboard` itself stays
// a plain (non-entry) component so its `kv`/`clock`/`fetchImpl` test seams
// (functions, not serializable) can be passed directly by `remix/ui/test`'s
// `render(...)` without ever crossing the prop-serialization boundary.

import { addEventListeners, clientEntry, type Handle } from 'remix/ui'

import { BUDGET_CAP, createBudgetStore } from './budget.ts'
import { CACHE_KEY, parseCachePayload, staleness, writeCache, type Staleness } from './cache.ts'
import { renderAssetCard, type CardHandlers, type MoveDirection } from './card.tsx'
import { fetchRates, type FetchedRates } from './coinbase.ts'
import { displayNameFor } from './currencies.ts'
import { appendHistory } from './history.ts'
import { createLeaseStore } from './lease.ts'
import { createLocksPort, type LocksPort } from './locks.ts'
import { reorder } from './order.ts'
import {
  ORDER_V2_KEY,
  adoptOrderRecord,
  parseOrderRecordPayload,
  readOrderRecord,
  writeOrder,
  type OrderRecord,
} from './order-store.ts'
import { type KVStore, writeJSON } from './persisted.ts'
import { renderBudgetStrip } from './budget-strip.tsx'
import type { RatesMap } from './rate.ts'
import { buildSearchIndex, matchesQuery } from './search-index.ts'
import {
  CURATED_SYMBOLS,
  FAVS_KEY,
  SCOPE_KEY,
  VIEW_KEY,
  coldSnapshot,
  readPersistedSnapshot,
  validSymbolsForOrder,
  type Scope,
  type ViewMode,
} from './snapshot.ts'
import { sortSymbols, type SortMode } from './sort.ts'
import {
  POLL_MS,
  computeAutoLabel,
  computeBanner,
  computeBudgetView,
  computeStatus,
  formatAge,
} from './status.ts'
import {
  DEFAULT_VIEWPORT_HEIGHT_PX,
  computeTableWindow,
  createAutoScroller,
  renderPlainTable,
  renderWindowedTable,
  sameWindow,
} from './table.tsx'
import {
  bannerCss,
  captionCss,
  emptyStateCss,
  footnoteCss,
  gridCss,
  h4Css,
  headerCss,
  ledeCss,
  noticeCss,
  rootCss,
  titleRowCss,
  visuallyHiddenCss,
} from './styles.ts'
import { renderToolbar, type ToolbarHandlers } from './toolbar.tsx'
import type { WindowRange } from './window.ts'

export interface RatesDashboardProps {
  kv?: KVStore
  clock?: () => number
  fetchImpl?: () => Promise<FetchedRates>
  // Test/production seam, like kv/clock/fetchImpl: `RatesDashboard` itself
  // never reaches for `navigator.locks` on its own — `RatesDashboardEntry`
  // (the production clientEntry wrapper) is the one place that constructs a
  // real `LocksPort` and passes it down. Left unset, `writeOrder` takes its
  // fully-synchronous unlocked path (AC-95) — correct in tests (which never
  // supply one) and a safe, documented degrade in a browser without the Web
  // Locks API.
  locks?: LocksPort
  // Set only by `RatesDashboardEntry` (AC-100). A real client hydration's
  // very first render must match the server's cold-start markup exactly —
  // reading real persisted `view`/`scope` synchronously at setup would
  // otherwise hand hydration a structurally different tree (a table instead
  // of the SSR'd cards grid) and trigger a framework hydration-mismatch.
  // Direct test mounts (`render(<RatesDashboard kv={...}/>)`) never set
  // this, so they keep reading `view`/`scope` synchronously (AC-25..28/70,
  // AC-77..96 all depend on that).
  hydrating?: boolean
}

export function RatesDashboard(handle: Handle<RatesDashboardProps>) {
  let kv = handle.props.kv ?? createDefaultKv()
  let clock = handle.props.clock ?? Date.now
  let fetchImpl = handle.props.fetchImpl ?? (() => fetchRates())
  let locksPort = handle.props.locks
  let hydrating = handle.props.hydrating ?? false

  let tabId = randomTabId()
  let budgetStore = createBudgetStore(kv, clock)
  let leaseStore = createLeaseStore(kv, clock)
  let autoScroller = createAutoScroller()

  // AC-100: a real hydration's very first render must match the server's
  // cold-start markup (SSR never has localStorage, so it's always the same
  // fixed defaults) — reading real persisted state synchronously here would
  // hand hydration different rendered TEXT (a warm cache's prices, a spent
  // budget's pip count, a reordered/pinned list, "all"/"table" scope/view)
  // and trigger a framework hydration-mismatch. While hydrating, every
  // persisted read is deferred to `start()`, applied together in one
  // `handle.update()`. A direct test mount reads them synchronously here
  // instead, as every other test already depends on (AC-25..29, AC-77..96).
  let persistedAdopted = !hydrating
  let snapshot = persistedAdopted ? readPersistedSnapshot(kv, clock) : coldSnapshot(clock)

  let cache = snapshot.cache
  let rates: RatesMap | null = cache?.rates ?? null
  let fetchedAt: number | null = cache?.fetchedAt ?? null
  let history: Record<string, number[]> = cache?.history ?? {}
  let favs = snapshot.favs
  let order = snapshot.order
  let orderUpdatedAt = snapshot.orderUpdatedAt
  let view = snapshot.view
  let scope = snapshot.scope

  let filter = ''
  let sort: SortMode = 'custom'
  let auto = true
  let pending = false
  let failures = 0
  let now = clock()
  let lastAttempt: number | null = null
  let isLeaderNow = false
  let dragSym: string | null = null
  let overSym: string | null = null
  let announce = ''
  let started = false

  // Windowing (ADR 0006, T2) — only meaningful in "All" scope's forced table
  // view. `viewportHeightPx` starts at the SSR-safe default and is replaced
  // by the viewport's real measured height on its first post-mount frame.
  let scrollTop = 0
  let viewportHeightPx = DEFAULT_VIEWPORT_HEIGHT_PX
  // The window and item count the last render committed to, so a scroll or
  // resize can tell whether the rendered slice would actually move before
  // paying for an update.
  let renderedRange: WindowRange | null = null
  let renderedItemCount = 0

  // Search index (ADR 0006, T2) — rebuilt only when the active symbol
  // universe actually changes (scope toggle, or a fetch introducing symbols
  // not seen this session), not on every keystroke/render.
  let searchIndexCache: { key: string; index: Map<string, string> } | null = null

  function tick() {
    now = clock()
    isLeaderNow = leaseStore.isLeader(now, tabId)
    if (isLeaderNow) leaseStore.heartbeat(now, tabId)

    let age = now - (fetchedAt ?? 0)
    let sinceLastAttempt = now - (lastAttempt ?? 0)
    let shouldPoll = isLeaderNow && auto && !pending && age >= POLL_MS && sinceLastAttempt >= POLL_MS

    if (shouldPoll) void refresh()
    handle.update()
  }

  function start() {
    // AC-100: now that the first (cold-matching) render has committed, adopt
    // whatever was actually persisted — cache/rates/history, budget, favs,
    // order, view, and scope together in one update. A no-op unless
    // `hydrating` forced the cold start above.
    if (!persistedAdopted) {
      let persisted = readPersistedSnapshot(kv, clock)
      cache = persisted.cache
      rates = cache?.rates ?? null
      fetchedAt = cache?.fetchedAt ?? null
      history = cache?.history ?? {}
      favs = persisted.favs
      order = persisted.order
      orderUpdatedAt = persisted.orderUpdatedAt
      view = persisted.view
      scope = persisted.scope
      persistedAdopted = true
      handle.update()
    }

    addEventListeners(window, handle.signal, { storage: onStorage })

    // AC-102 safety net: a windowed All-scope drag can auto-scroll the
    // dragged row's own node out of the rendered slice (unmounted), and a
    // real `dragend` dispatched on an already-detached source node may never
    // reach any listener. `pointerup` always fires at the release point
    // regardless of what happened to the drag source, so it's the one
    // cleanup path guaranteed to run — a no-op whenever no drag is active.
    addEventListeners(document, handle.signal, { pointerup: () => cancelDrag() })

    // Defer the very first leadership/poll check to a real macrotask (not a
    // microtask) so a synchronous UI interaction immediately after mount
    // (e.g. unchecking "Auto") always wins the race against this initial
    // check, and so a test that only ever awaits microtask-level work never
    // observes this initial check firing at all.
    let initialCheck = setTimeout(tick, 0)
    let interval = setInterval(tick, 1000)

    handle.signal.addEventListener('abort', () => {
      clearTimeout(initialCheck)
      clearInterval(interval)
      leaseStore.release(tabId)
      autoScroller.stop()
    })
  }

  function onStorage(event: StorageEvent) {
    if (event.key === ORDER_V2_KEY) {
      if (event.newValue == null) return
      let incoming = parseOrderRecordPayload(event.newValue)
      if (!incoming) return
      let local: OrderRecord = { schemaVersion: 2, updatedAt: orderUpdatedAt, order }
      if (adoptOrderRecord(local, incoming) !== incoming) return
      order = incoming.order
      orderUpdatedAt = incoming.updatedAt
      handle.update()
      return
    }

    if (event.key !== CACHE_KEY || event.newValue == null) return
    let parsed = parseCachePayload(event.newValue)
    if (!parsed || parsed.fetchedAt === fetchedAt) return

    rates = parsed.rates
    fetchedAt = parsed.fetchedAt
    history = parsed.history ?? {}
    failures = 0
    now = clock()
    handle.update()
  }

  async function refresh() {
    if (pending) return
    let attemptAt = clock()

    if (!budgetStore.trySpend(attemptAt)) {
      now = attemptAt
      handle.update()
      return
    }

    pending = true
    lastAttempt = attemptAt
    handle.update()

    try {
      let result = await fetchImpl()
      // The component may have been disposed while this fetch was in flight
      // (e.g. a real-browser navigation away mid-request) — skip committing
      // state and re-rendering a component that's already gone.
      if (handle.signal.aborted) return
      now = clock()
      fetchedAt = result.fetchedAt
      rates = { ...(rates ?? {}), ...result.rates }
      // Bounded history/storage (ADR 0006): only the curated 15 plus current
      // pins accumulate session samples, regardless of how many symbols
      // Coinbase's response carries.
      history = appendHistory(history, result.rates, trackedSymbols())
      failures = 0
      writeCache(kv, { rates, fetchedAt, history })
    } catch {
      if (!handle.signal.aborted) failures++
    } finally {
      pending = false
      if (!handle.signal.aborted) handle.update()
    }
  }

  function togglePin(symbol: string) {
    let wasPinned = favs.includes(symbol)
    favs = wasPinned ? favs.filter((s) => s !== symbol) : [...favs, symbol]
    writeJSON(kv, FAVS_KEY, favs)
    // Pinning an uncurated symbol joins the reorderable/history-tracked set
    // (ADR 0006): it needs a slot in `order` to become draggable. Curated
    // symbols are always already present, so this never fires for them.
    if (!wasPinned && !order.includes(symbol)) persistOrder([...order, symbol])
    handle.update()
  }

  function setView(mode: ViewMode) {
    if (view === mode) return
    // Only the view key is written here — filter/sort/pins/order are
    // untouched setup-scope state, so switching views can never reset or
    // rewrite them (AC-82).
    view = mode
    writeJSON(kv, VIEW_KEY, view)
    handle.update()
  }

  function setScope(mode: Scope) {
    if (scope === mode) return
    // Only the scope key is written here, matching setView's discipline.
    scope = mode
    writeJSON(kv, SCOPE_KEY, scope)
    handle.update()
  }

  function persistOrder(nextOrder: string[]) {
    order = nextOrder
    // writeOrder's tie-break ("a tie favors the value already in storage",
    // ADR 0007) is meant for a genuine cross-tab collision — not for this
    // tab's own next deliberate write landing on the same clock tick as its
    // last one (a real risk with an injected/fixed clock, and possible even
    // with a real one at sub-millisecond precision). Strictly increasing
    // `updatedAt` for this tab's own writes keeps every local reorder from
    // ever losing to its own prior write.
    orderUpdatedAt = Math.max(clock(), orderUpdatedAt + 1)
    void writeOrder(kv, { schemaVersion: 2, updatedAt: orderUpdatedAt, order: nextOrder }, locksPort).then(
      (committed) => {
        // A rejected write means a fresher record was already durable in
        // storage by the time this one landed (AC-98) — keeping the local
        // optimistic order would silently diverge from what's persisted.
        // Resync to the record that won instead.
        if (!committed) resyncOrderFromStorage()
      },
    )
  }

  function resyncOrderFromStorage() {
    let stored = readOrderRecord(kv, validSymbolsForOrder(favs), clock)
    order = stored.order
    orderUpdatedAt = stored.updatedAt
    handle.update()
  }

  function applyReorder(dragged: string, target: string, position: 'before' | 'after') {
    persistOrder(reorder(order, dragged, target, position))
    let name = displayNameFor(dragged)
    announce = `Moved ${name} ${position === 'before' ? 'up' : 'down'}, now position ${order.indexOf(dragged) + 1} of ${order.length}.`
    handle.update()
  }

  function cancelDrag() {
    autoScroller.stop()
    if (!dragSym) return
    dragSym = null
    overSym = null
    handle.update()
  }

  let cardHandlers: CardHandlers = {
    onTogglePin: togglePin,
    onDragStart(symbol) {
      dragSym = symbol
      handle.update()
    },
    onDragEnd: cancelDrag,
    onDragOverRow(symbol) {
      if (!dragSym || overSym === symbol) return
      overSym = symbol
      handle.update()
    },
    onDragLeaveRow(symbol) {
      if (overSym !== symbol) return
      overSym = null
      handle.update()
    },
    onDropRow(target) {
      let dragged = dragSym
      if (!dragged) return
      dragSym = null
      overSym = null
      autoScroller.stop()
      if (dragged === target) {
        handle.update()
        return
      }
      // Drop semantics (T5): re-insert adjacent to the target — after it
      // when moving down the master order, before it when moving up.
      let position: 'before' | 'after' = order.indexOf(dragged) < order.indexOf(target) ? 'after' : 'before'
      applyReorder(dragged, target, position)
    },
    onKeyboardMove(symbol: string, direction: MoveDirection) {
      let index = order.indexOf(symbol)
      if (index === -1) return
      if (direction === 'up') {
        if (index <= 0) return
        applyReorder(symbol, order[index - 1]!, 'before')
      } else {
        if (index >= order.length - 1) return
        applyReorder(symbol, order[index + 1]!, 'after')
      }
    },
  }

  /** Curated ∪ pinned: the symbols that get a drag handle and session history. */
  function trackedSymbols(): string[] {
    return validSymbolsForOrder(favs)
  }

  function symbolUniverse(): string[] {
    if (scope !== 'all') return [...CURATED_SYMBOLS]
    let fetched = rates ? Object.keys(rates) : []
    return Array.from(new Set([...CURATED_SYMBOLS, ...fetched]))
  }

  function sortedSymbolsFor(universe: string[]): string[] {
    let deltas: Record<string, number> = {}
    for (let symbol of universe) {
      let samples = history[symbol] ?? []
      if (samples.length >= 2 && samples[0]) {
        deltas[symbol] = ((samples[samples.length - 1]! - samples[0]!) / samples[0]!) * 100
      }
    }
    // "My order" in All scope (ADR 0006): the reorderable set (`order`,
    // already curated-plus-pinned in master order) first, then every other
    // universe symbol alphabetically. sortSymbols' own pin-to-top partition
    // then yields: pinned (master order) → remaining curated (master order)
    // → uncurated (alphabetical) — for every sort mode, not just "custom".
    //
    // `order` can carry a symbol pinned while in All scope that isn't one of
    // the 15 curated symbols. Curated scope must never render it (AC-101) —
    // the curated branch intersects `order` with the curated list rather
    // than using it verbatim.
    let symbolsForSort =
      scope === 'all'
        ? [...order, ...universe.filter((s) => !order.includes(s)).sort((a, b) => a.localeCompare(b))]
        : order.filter((symbol) => CURATED_SYMBOLS.includes(symbol))
    return sortSymbols(sort, symbolsForSort, favs, rates, deltas)
  }

  function searchIndexFor(universe: string[]): Map<string, string> {
    let key = universe.join(',')
    if (searchIndexCache?.key === key) return searchIndexCache.index
    let index = buildSearchIndex(universe, displayNameFor)
    searchIndexCache = { key, index }
    return index
  }

  let toolbarHandlers: ToolbarHandlers = {
    onFilterChange(value) {
      filter = value
      handle.update()
    },
    onSortChange(mode) {
      sort = mode
      handle.update()
    },
    onScopeChange: setScope,
    onViewChange: setView,
    onRefresh() {
      void refresh()
    },
    onAutoChange(enabled) {
      auto = enabled
      handle.update()
    },
  }

  /** Re-render only when the rendered slice would actually move. */
  function updateIfWindowMoved() {
    let next = computeTableWindow(scrollTop, viewportHeightPx, renderedItemCount)
    if (!sameWindow(next, renderedRange)) handle.update()
  }

  function onViewportScroll(nextScrollTop: number, nextHeight: number) {
    scrollTop = nextScrollTop
    viewportHeightPx = nextHeight
    updateIfWindowMoved()
  }

  function onViewportMeasure(nextHeight: number) {
    if (nextHeight === viewportHeightPx) return
    viewportHeightPx = nextHeight
    updateIfWindowMoved()
  }

  return () => {
    if (!started) {
      started = true
      handle.queueTask(() => start())
    }

    let effectiveView: ViewMode = scope === 'all' ? 'table' : view
    let universe = symbolUniverse()
    let searchIndex = searchIndexFor(universe)
    let query = filter.trim().toLowerCase()

    let sortedSymbols = sortedSymbolsFor(universe)
    let visibleSymbols = sortedSymbols.filter((symbol) => matchesQuery(searchIndex, symbol, query))
    let visibleCount = visibleSymbols.length
    let hiddenCount = sortedSymbols.length - visibleCount
    let tracked = new Set(trackedSymbols())

    let tier: Staleness = staleness(fetchedAt, now)
    let dim = tier === 'expired'
    let ageMs = now - (fetchedAt ?? now)
    // AC-100: budgetStore re-reads its own kv record on every call (unlike
    // cache/order/favs/view/scope, captured once as setup-scope state) — the
    // cold default matches exactly what SSR's own `budgetStore.read(now)`
    // against an empty kv computes, so it's gated here rather than folded
    // into the snapshot.
    let budgetState = persistedAdopted ? budgetStore.read(now) : { tokens: BUDGET_CAP, ts: now }
    let budget = computeBudgetView(budgetState.tokens)
    let bannerText = computeBanner(tier, rates !== null, failures, formatAge(ageMs))

    let renderRow = (symbol: string) =>
      renderAssetCard({
        symbol,
        rate: rates?.[symbol],
        history: history[symbol] ?? [],
        view: effectiveView,
        pinned: favs.includes(symbol),
        hidden: !matchesQuery(searchIndex, symbol, query),
        dim,
        draggable: sort === 'custom',
        showHandle: tracked.has(symbol),
        isDragged: dragSym === symbol,
        isOver: overSym === symbol,
        handlers: cardHandlers,
      })

    // Windowing applies only to All scope's forced table view (ADR 0006);
    // curated-scope table view renders its full (small) list.
    let windowRange = scope === 'all' ? computeTableWindow(scrollTop, viewportHeightPx, visibleCount) : null
    renderedRange = windowRange
    renderedItemCount = visibleCount

    return (
      <div data-testid="rates-dashboard" data-view={effectiveView} mix={rootCss}>
        <header mix={headerCss}>
          <div mix={titleRowCss}>
            <h4 mix={h4Css}>Exchange Rates</h4>
            <span mix={captionCss}>Coinbase · {CURATED_SYMBOLS.length} assets</span>
          </div>
          <p mix={ledeCss}>
            Live USD and BTC rates. Cards stay usable when the feed slows or fails — last-known-good
            values remain, marked with their age.
          </p>
        </header>

        {renderToolbar({
          filter,
          query,
          visibleCount,
          universeSize: universe.length,
          sort,
          scope,
          effectiveView,
          auto,
          autoLabel: computeAutoLabel({ auto, pending, now, lastAttempt }),
          pending,
          budget,
          tier,
          status: computeStatus(tier, ageMs, failures),
          handlers: toolbarHandlers,
        })}

        {renderBudgetStrip(budget, isLeaderNow)}

        {bannerText && (
          <div data-testid="banner" mix={bannerCss}>
            {bannerText}
          </div>
        )}

        {query && hiddenCount > 0 && (
          <p data-testid="filter-notice" mix={noticeCss}>
            {`Filtered view — dragging reorders within what you see; the ${hiddenCount} hidden cards keep the neighbour they follow.`}
          </p>
        )}

        <div data-testid="reorder-announcer" aria-live="polite" mix={visuallyHiddenCss}>
          {announce}
        </div>

        {effectiveView === 'cards' ? (
          <div mix={gridCss}>{sortedSymbols.map(renderRow)}</div>
        ) : windowRange ? (
          renderWindowedTable({
            range: windowRange,
            rows: visibleSymbols.slice(windowRange.startIndex, windowRange.endIndex).map(renderRow),
            totalCount: visibleCount,
            isDragActive: () => sort === 'custom' && dragSym !== null,
            autoScroller,
            onScroll: onViewportScroll,
            onMeasure: onViewportMeasure,
            onDragCancel: cancelDrag,
          })
        ) : (
          renderPlainTable(sortedSymbols.map(renderRow))
        )}

        {visibleCount === 0 && query && (
          <p data-testid="empty-state" mix={emptyStateCss}>
            {`Nothing matches "${filter}".`}
          </p>
        )}

        <p mix={footnoteCss}>
          One tab holds the polling lease and every tab spends from the same 10-requests-per-minute
          bucket, so opening five tabs costs no more than one. Δ and trend are measured across this
          session's polls, not a rolling 24h window. Order and pins persist locally.
        </p>
      </div>
    )
  }

}

export const RatesDashboardEntry = clientEntry(import.meta.url, function RatesDashboardEntry(
  handle: Handle,
) {
  void handle
  // Constructed once per hydration, entirely client-side — never crosses the
  // clientEntry prop-serialization boundary (this call only ever happens in
  // the browser, after hydration; `createLocksPort()` itself is SSR-safe).
  let locks = createLocksPort()
  return () => <RatesDashboard locks={locks} hydrating />
})

// ----- helpers -----

function createDefaultKv(): KVStore {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  } catch {
    // Accessing localStorage can throw (e.g. private-browsing quota).
  }
  return { getItem: () => null, setItem: () => {} }
}

function randomTabId(): string {
  return Math.random().toString(36).slice(2)
}

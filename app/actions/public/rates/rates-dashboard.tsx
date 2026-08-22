// The single client-hydrated composition root for the crypto rates
// dashboard (ADR 0005). `RatesDashboard` owns every piece of feature state
// as setup-scope variables and wires the pure modules (budget/lease/cache/
// order/sort/format/persisted) together. `RatesDashboardEntry` is the thin,
// fully-serializable `clientEntry` wrapper actually mounted by `home-page.tsx`;
// `RatesDashboard` itself stays a plain (non-entry) component so its
// `kv`/`clock`/`fetchImpl` test seams (functions, not serializable) can be
// passed directly by `remix/ui/test`'s `render(...)` without ever crossing
// the `clientEntry` prop-serialization boundary.

import {
  addEventListeners,
  clientEntry,
  on,
  type ElementProps,
  type Handle,
  type MixinDescriptor,
} from 'remix/ui'

import { BUDGET_CAP, BUDGET_WINDOW_MS, createBudgetStore } from './budget.ts'
import {
  CACHE_KEY,
  isRatesCache,
  type RatesCache,
  type Staleness,
  readCache,
  staleness,
  writeCache,
} from './cache.ts'
import { type FetchedRates, fetchRates } from './coinbase.ts'
import { SYMBOLS, displayNameFor } from './currencies.ts'
import { appendHistory, computeDelta } from './history.ts'
import { createLeaseStore } from './lease.ts'
import { reorder } from './order.ts'
import {
  ORDER_V2_KEY,
  adoptOrderRecord,
  isOrderRecord,
  readOrderRecord,
  writeOrder,
  type LocksPort,
  type OrderRecord,
} from './order-store.ts'
import { formatBtc, formatDelta, formatUsd } from './format.ts'
import { type KVStore, readJSON, writeJSON } from './persisted.ts'
import { buildSearchIndex, matchesQuery } from './search-index.ts'
import { type SortMode, sortSymbols } from './sort.ts'
import { computeWindow } from './window.ts'
import {
  autoLabelCss,
  badgeCss,
  bannerCss,
  btcValueCss,
  btnCss,
  budgetCaptionCss,
  budgetLabelCss,
  budgetStripCss,
  cardCss,
  cardHeaderCss,
  captionCss,
  dragHandleCss,
  emptyStateCss,
  filterWrapCss,
  focusRingCss,
  footerRowCss,
  footnoteCss,
  gridCss,
  h4Css,
  headerCss,
  inputCss,
  ledeCss,
  matchCounterCss,
  nameCss,
  noticeCss,
  pinButtonCss,
  pipCss,
  pipsCss,
  priceRowCss,
  roleLabelCss,
  rootCss,
  segButtonCss,
  segCss,
  statusCss,
  statusDotCss,
  symbolCss,
  tableAssetCellCss,
  tableHeaderCss,
  tableInnerCss,
  tableRowCss,
  tableTrendCellCss,
  tableViewportCss,
  tableWrapCss,
  titleRowCss,
  titlesCss,
  toolbarCss,
  usdCaptionCss,
  usdValueCss,
  visuallyHiddenCss,
} from './styles.ts'

const ALL_SYMBOLS: string[] = [...SYMBOLS]

const FAVS_KEY = 'nocturne.rates.favs.v1'
const VIEW_KEY = 'nocturne.rates.view.v1'
const SCOPE_KEY = 'nocturne.rates.scope.v1'

type ViewMode = 'cards' | 'table'
type Scope = 'curated' | 'all'

// Windowing (ADR 0006, T2): rows are a fixed height so `computeWindow` never
// measures the DOM. `DEFAULT_VIEWPORT_HEIGHT_PX` matches `tableViewportCss`'s
// own default height and seeds the very first render, before any real
// `scroll` event has reported the viewport's actual `clientHeight`.
const ROW_HEIGHT_PX = 40
const OVERSCAN = 5
const DEFAULT_VIEWPORT_HEIGHT_PX = 480
const AUTO_SCROLL_EDGE_PX = 32
const AUTO_SCROLL_STEP_PX = 18

// The leaf pieces `renderCard` builds once per asset — shared, unmodified,
// between whichever container branch (table row / card tile) assembles them,
// so event wiring/data-testid/aria stay a single source of truth regardless
// of `currentView`. `dragHandle` is `null` for an untracked "All"-scope row
// (AC-90) — every other leaf always renders.
interface CardLeaves {
  badge: JSX.Element
  titles: JSX.Element
  pinButton: JSX.Element
  dragHandle: JSX.Element | null
  usdValue: JSX.Element
  btcValue: JSX.Element
  deltaValue: JSX.Element
  sparkline: JSX.Element
}

interface CardAssembly extends CardLeaves {
  symbol: string
  name: string
  hidden: boolean
  dim: boolean
  historyLength: number
  containerStyle: {
    opacity: number | undefined
    background: string | undefined
    boxShadow: string | undefined
  }
  dragMixins: ReadonlyArray<MixinDescriptor<HTMLElement, any, ElementProps>>
}

const POLL_MS = 8000
const POLL_SECONDS = 8

const NO_CACHE_BANNER =
  "No cached rates on this device yet, and the feed isn't answering. Values stay blank rather " +
  `than guessing — retrying every ${POLL_SECONDS}s.`

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
}

export function RatesDashboard(handle: Handle<RatesDashboardProps>) {
  let kv = handle.props.kv ?? createDefaultKv()
  let clock = handle.props.clock ?? Date.now
  let fetchImpl = handle.props.fetchImpl ?? (() => fetchRates())
  let locksPort = handle.props.locks

  let tabId = randomTabId()
  let budgetStore = createBudgetStore(kv, clock)
  let leaseStore = createLeaseStore(kv, clock)

  let cache = readCache(kv)
  let rates: Record<string, { usd: number; btc: number }> | null = cache?.rates ?? null
  let fetchedAt: number | null = cache?.fetchedAt ?? null
  let history: Record<string, number[]> = cache?.history ?? {}

  // A previously-pinned uncurated symbol (ADR 0006) is only "valid" to keep
  // across a reload if we have some evidence it's a real symbol — the
  // last-known-good cache's own fetched universe is the best guess available
  // synchronously at setup, before any fetch has run this session.
  let knownUniverseAtSetup = rates ? Object.keys(rates) : []
  let favs = readJSON<string[]>(kv, FAVS_KEY, [], isStringArray).filter(
    (symbol) => ALL_SYMBOLS.includes(symbol) || knownUniverseAtSetup.includes(symbol),
  )

  let validSymbolsForOrder = Array.from(new Set([...ALL_SYMBOLS, ...favs]))
  let orderRecord = readOrderRecord(kv, validSymbolsForOrder, clock)
  let order = orderRecord.order
  let orderUpdatedAt = orderRecord.updatedAt

  let view = readJSON<ViewMode>(kv, VIEW_KEY, 'cards', isViewMode)
  let scope = readJSON<Scope>(kv, SCOPE_KEY, 'curated', isScope)

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
  // view; seeded with a default viewport height and refreshed by the real
  // `scroll` handler once the viewport is mounted and measurable.
  let scrollTop = 0
  let viewportHeightPx = DEFAULT_VIEWPORT_HEIGHT_PX
  let autoScrollDirection: -1 | 0 | 1 = 0
  let autoScrollFrame: number | null = null

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
    addEventListeners(window, handle.signal, { storage: onStorage })

    // Defer the very first leadership/poll check to a real macrotask (not a
    // microtask) so a synchronous UI interaction immediately after mount
    // (e.g. unchecking "Auto") always wins the race against this initial
    // check, and so a test that only ever awaits microtask-level work (no
    // real timer wait) never observes this initial check firing at all.
    let initialCheck = setTimeout(tick, 0)
    let interval = setInterval(tick, 1000)

    handle.signal.addEventListener('abort', () => {
      clearTimeout(initialCheck)
      clearInterval(interval)
      leaseStore.release(tabId)
      stopAutoScroll()
    })
  }

  function onStorage(event: StorageEvent) {
    if (event.key === ORDER_V2_KEY) {
      if (event.newValue == null) return
      let incoming = parseOrderRecordPayload(event.newValue)
      if (!incoming) return
      let local: OrderRecord = { schemaVersion: 2, updatedAt: orderUpdatedAt, order }
      let adopted = adoptOrderRecord(local, incoming)
      if (adopted === incoming) {
        order = incoming.order
        orderUpdatedAt = incoming.updatedAt
        handle.update()
      }
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
      // The component may have been disposed while this fetch was in
      // flight (e.g. a real-browser navigation away mid-request) — skip
      // committing state and re-rendering a component that's already gone.
      if (handle.signal.aborted) return
      now = clock()
      fetchedAt = result.fetchedAt
      rates = { ...(rates ?? {}), ...result.rates }
      // Bounded history/storage (ADR 0006): only the curated 15 plus current
      // pins accumulate session samples, regardless of how many symbols
      // Coinbase's response carries.
      history = appendHistory(history, result.rates, Array.from(computeTrackedSet()))
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
    if (!wasPinned && !order.includes(symbol)) {
      persistOrder([...order, symbol])
    }
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
    // Only the scope key is written here — filter/sort/pins/order/view are
    // untouched, matching setView's own persistence discipline.
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
    void writeOrder(kv, { schemaVersion: 2, updatedAt: orderUpdatedAt, order: nextOrder }, locksPort)
  }

  function computeTrackedSet(): Set<string> {
    return new Set([...ALL_SYMBOLS, ...favs])
  }

  function computeUniverse(): string[] {
    if (scope !== 'all') return ALL_SYMBOLS
    let fetched = rates ? Object.keys(rates) : []
    return Array.from(new Set([...ALL_SYMBOLS, ...fetched]))
  }

  function computeSortedSymbols(universe: string[]): string[] {
    let deltas: Record<string, number> = {}
    for (let symbol of universe) {
      let delta = computeDelta(history[symbol] ?? [])
      if (delta !== null) deltas[symbol] = delta
    }
    // "My order" in All scope (ADR 0006): the reorderable set (`order`,
    // already curated-plus-pinned in master order) first, then every other
    // universe symbol alphabetically. sortSymbols' own pin-to-top partition
    // then yields: pinned (master order) → remaining curated (master order)
    // → uncurated (alphabetical) — for every sort mode, not just "custom".
    let symbolsForSort =
      scope === 'all'
        ? [...order, ...universe.filter((symbol) => !order.includes(symbol)).sort((a, b) => a.localeCompare(b))]
        : order
    return sortSymbols(sort, symbolsForSort, favs, rates, deltas)
  }

  function getSearchIndex(universe: string[]): Map<string, string> {
    let key = universe.join(',')
    if (searchIndexCache && searchIndexCache.key === key) return searchIndexCache.index
    let index = buildSearchIndex(universe, displayNameFor)
    searchIndexCache = { key, index }
    return index
  }

  function stopAutoScroll() {
    autoScrollDirection = 0
    if (autoScrollFrame !== null) {
      cancelAnimationFrame(autoScrollFrame)
      autoScrollFrame = null
    }
  }

  // Drag edge auto-scroll (ADR 0006): dragging near the windowed viewport's
  // top/bottom edge nudges `scrollTop` every animation frame, so a user can
  // drag toward a target currently outside the rendered slice. Visual-QA'd,
  // not covered by component assertions (scope-semantics preamble).
  function startAutoScroll(node: HTMLElement, direction: -1 | 1) {
    if (autoScrollDirection === direction) return
    stopAutoScroll()
    autoScrollDirection = direction
    let step = () => {
      node.scrollTop += direction * AUTO_SCROLL_STEP_PX
      autoScrollFrame = requestAnimationFrame(step)
    }
    autoScrollFrame = requestAnimationFrame(step)
  }

  function applyReorder(dragged: string, target: string, position: 'before' | 'after') {
    persistOrder(reorder(order, dragged, target, position))
    let name = displayNameFor(dragged)
    announce = `Moved ${name} ${position === 'before' ? 'up' : 'down'}, now position ${order.indexOf(dragged) + 1} of ${order.length}.`
    handle.update()
  }

  function applyDrop(dragged: string, target: string) {
    let fromIndex = order.indexOf(dragged)
    let toIndex = order.indexOf(target)
    let position: 'before' | 'after' = fromIndex < toIndex ? 'after' : 'before'
    applyReorder(dragged, target, position)
  }

  function computeAutoLabel(): string {
    if (!auto) return 'off'
    if (pending) return 'now'
    let elapsed = now - (lastAttempt ?? now)
    let remaining = Math.max(0, Math.ceil((POLL_MS - elapsed) / 1000))
    return `${remaining}s`
  }

  // Shared segmented-control button shape used by the sort, view, and scope
  // toggles: `sortButton`/`viewButton`/`scopeButton` stay thin, domain-named
  // adapters over this one markup/event-wiring definition.
  function segButton(
    testId: string,
    label: string,
    pressed: boolean,
    onClick: () => void,
    disabled = false,
  ) {
    return (
      <button
        key={testId}
        type="button"
        data-testid={testId}
        class="focus-ring"
        aria-pressed={pressed}
        disabled={disabled}
        mix={[focusRingCss, segButtonCss, on('click', onClick)]}
      >
        {label}
      </button>
    )
  }

  function sortButton(mode: SortMode, label: string) {
    return segButton(`sort-${mode}`, label, sort === mode, () => {
      sort = mode
      handle.update()
    })
  }

  function viewButton(mode: ViewMode, label: string) {
    // "All" scope forces (and locks) table view — cards can't window a
    // reflowing grid (ADR 0006). The Cards option disables while locked;
    // Table stays clickable (already the effective view, a harmless no-op).
    let effective: ViewMode = scope === 'all' ? 'table' : view
    let disabled = mode === 'cards' && scope === 'all'
    return segButton(`view-toggle-${mode}`, label, effective === mode, () => setView(mode), disabled)
  }

  function scopeButton(mode: Scope, label: string) {
    return segButton(`scope-toggle-${mode}`, label, scope === mode, () => setScope(mode))
  }

  // Shared between curated-scope table view (unwindowed) and All-scope table
  // view (windowed) — one header markup definition either way.
  function renderTableHeader() {
    return (
      <div data-testid="table-header" mix={tableHeaderCss}>
        <span aria-hidden="true" />
        <span>Asset</span>
        <span>USD</span>
        <span>BTC</span>
        <span>Session Δ</span>
        <span>Trend</span>
        <span aria-hidden="true" />
      </div>
    )
  }

  function renderCard(
    symbol: string,
    dim: boolean,
    query: string,
    currentView: ViewMode,
    showHandle: boolean,
  ) {
    let name = displayNameFor(symbol)
    let rate = rates?.[symbol]
    let hidden =
      query.length > 0 &&
      !(symbol.toLowerCase().includes(query) || name.toLowerCase().includes(query))
    let historyForSymbol = history[symbol] ?? []
    let delta = computeDelta(historyForSymbol)
    let pinned = favs.includes(symbol)
    let usdText = rate ? formatUsd(rate.usd) : '—'
    let btcText = symbol === 'BTC' ? '—' : rate ? formatBtc(rate.btc) : '—'
    let deltaText = delta === null ? '—' : formatDelta(delta)
    let deltaSign: 'positive' | 'negative' | 'neutral' =
      delta === null || delta === 0 ? 'neutral' : delta > 0 ? 'positive' : 'negative'
    let deltaColor =
      deltaSign === 'positive'
        ? 'var(--color-accent-400)'
        : deltaSign === 'negative'
          ? 'var(--color-negative)'
          : 'var(--color-neutral-700)'
    let draggable = sort === 'custom'
    let isDragged = dragSym === symbol
    let isDropTarget = overSym === symbol && !!dragSym && dragSym !== symbol

    // One row/card per asset, shared across both views: the same leaf
    // pieces (badge/titles/pin/handle/values/sparkline) with the identical
    // data-testid/aria/event contract either way — only their grouping and
    // the container's layout css differ, driven by `currentView`.
    let badge = (
      <span mix={badgeCss}>{symbol.slice(0, 3)}</span>
    )
    let titles = (
      <span mix={titlesCss}>
        <span mix={nameCss}>{name}</span>
        <span mix={symbolCss}>{symbol}</span>
      </span>
    )
    let pinButton = (
      <button
        type="button"
        data-testid="pin-button"
        class="focus-ring"
        data-pinned={pinned ? 'true' : 'false'}
        aria-label={`${pinned ? 'Unpin' : 'Pin'} ${name}`}
        mix={[focusRingCss, pinButtonCss(pinned), on('click', () => togglePin(symbol))]}
      >
        ★
      </button>
    )
    // Drag/keyboard handles exist only on curated or pinned rows (AC-90) —
    // an untracked "All"-scope row renders no handle at all, not merely a
    // non-draggable one.
    let dragHandle = !showHandle ? null : (
      <span
        data-testid="drag-handle"
        class="focus-ring"
        role="button"
        tabIndex={0}
        aria-label={`Reorder ${name} (${symbol})`}
        draggable={draggable}
        mix={[
          focusRingCss,
          dragHandleCss(draggable),
          on('dragstart', () => {
            if (sort !== 'custom') return
            dragSym = symbol
            handle.update()
          }),
          on('dragend', () => {
            dragSym = null
            overSym = null
            stopAutoScroll()
            handle.update()
          }),
          on('keydown', (event) => {
            if (sort !== 'custom') return
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
            event.preventDefault()
            let index = order.indexOf(symbol)
            if (event.key === 'ArrowUp') {
              if (index <= 0) return
              applyReorder(symbol, order[index - 1]!, 'before')
            } else {
              if (index === -1 || index >= order.length - 1) return
              applyReorder(symbol, order[index + 1]!, 'after')
            }
          }),
        ]}
      >
        ⠿
      </span>
    )
    let usdValue = (
      <span
        data-testid="usd-value"
        mix={usdValueCss}
        style={{ color: dim ? 'var(--color-neutral-500)' : 'var(--color-text)' }}
      >
        {usdText}
      </span>
    )
    let btcValue = (
      <span data-testid="btc-value" mix={btcValueCss}>
        {btcText}
      </span>
    )
    let deltaValue = (
      <span data-testid="delta-value" data-sign={deltaSign} style={{ color: deltaColor }}>
        {deltaText}
      </span>
    )
    let sparkline = renderSparkline(sparkPoints(historyForSymbol), deltaColor)

    let containerStyle = {
      // Handoff drag feedback: the dragged card/row drops to opacity .35;
      // the hovered drop target fills with a translucent accent tint plus
      // an inset accent edge.
      opacity: isDragged ? 0.35 : undefined,
      background: isDropTarget
        ? 'color-mix(in srgb, var(--color-accent-500) 12%, var(--color-surface))'
        : undefined,
      boxShadow: isDropTarget ? 'inset 0 0 0 1px var(--color-accent-700)' : undefined,
    }
    let dragMixins = [
      on<HTMLElement, 'dragenter'>('dragenter', (event) => {
        if (sort !== 'custom' || !dragSym) return
        event.preventDefault()
        if (overSym !== symbol) {
          overSym = symbol
          handle.update()
        }
      }),
      on<HTMLElement, 'dragover'>('dragover', (event) => {
        if (sort !== 'custom' || !dragSym) return
        event.preventDefault()
        if (overSym !== symbol) {
          overSym = symbol
          handle.update()
        }
      }),
      on<HTMLElement, 'dragleave'>('dragleave', (event) => {
        if (overSym !== symbol) return
        let related = event.relatedTarget as Node | null
        if (related && event.currentTarget.contains(related)) return
        overSym = null
        handle.update()
      }),
      on<HTMLElement, 'drop'>('drop', (event) => {
        if (sort !== 'custom' || !dragSym) return
        event.preventDefault()
        let dragged = dragSym
        dragSym = null
        overSym = null
        stopAutoScroll()
        if (dragged && dragged !== symbol) applyDrop(dragged, symbol)
        else handle.update()
      }),
    ]

    let assembly: CardAssembly = {
      symbol,
      name,
      hidden,
      dim,
      historyLength: historyForSymbol.length,
      containerStyle,
      dragMixins,
      badge,
      titles,
      pinButton,
      dragHandle,
      usdValue,
      btcValue,
      deltaValue,
      sparkline,
    }

    return currentView === 'table' ? renderTableRow(assembly) : renderCardTile(assembly)
  }

  return () => {
    if (!started) {
      started = true
      handle.queueTask(() => start())
    }

    let effectiveView: ViewMode = scope === 'all' ? 'table' : view
    let universe = computeUniverse()
    let searchIdx = getSearchIndex(universe)
    let query = filter.trim().toLowerCase()

    let sortedSymbols = computeSortedSymbols(universe)
    let visibleSymbols = sortedSymbols.filter((symbol) => matchesQuery(searchIdx, symbol, query))
    let visibleCount = visibleSymbols.length
    let hiddenCount = sortedSymbols.length - visibleCount

    let trackedSet = computeTrackedSet()

    let tier: Staleness = staleness(fetchedAt, now)
    let dim = tier === 'expired'
    let ageMs = now - (fetchedAt ?? now)
    let status = computeStatus(tier, ageMs, failures)
    let budgetState = budgetStore.read(now)
    let budgetView = computeBudgetView(budgetState.tokens)
    let bannerText = computeBanner(tier, rates !== null, failures, formatAge(ageMs))
    let autoLabel = computeAutoLabel()

    // Windowing only applies to All scope's forced table view (ADR 0006) —
    // curated-scope table view still renders its full (small) list.
    let windowRange =
      scope === 'all'
        ? computeWindow({
            scrollTop,
            viewportHeight: viewportHeightPx,
            rowHeight: ROW_HEIGHT_PX,
            overscan: OVERSCAN,
            itemCount: visibleCount,
          })
        : null
    let windowedSymbols = windowRange ? visibleSymbols.slice(windowRange.startIndex, windowRange.endIndex) : []

    return (
      <div data-testid="rates-dashboard" data-view={effectiveView} mix={rootCss}>
        <header mix={headerCss}>
          <div mix={titleRowCss}>
            <h4 mix={h4Css}>Exchange Rates</h4>
            <span mix={captionCss}>Coinbase · {ALL_SYMBOLS.length} assets</span>
          </div>
          <p mix={ledeCss}>
            Live USD and BTC rates. Cards stay usable when the feed slows or fails — last-known-good
            values remain, marked with their age.
          </p>
        </header>

        <div mix={toolbarCss}>
          <div mix={filterWrapCss}>
            <input
              type="text"
              data-testid="filter-input"
              class="focus-ring"
              aria-label="Filter by name or symbol"
              placeholder='Filter by name or symbol — try "eth"'
              value={filter}
              mix={[
                focusRingCss,
                inputCss,
                on<HTMLInputElement>('input', (event) => {
                  filter = event.currentTarget.value
                  handle.update()
                }),
              ]}
            />
            {query && (
              <span data-testid="match-counter" mix={matchCounterCss}>
                {`${visibleCount}/${universe.length}`}
              </span>
            )}
          </div>

          <div role="group" aria-label="Sort" mix={segCss}>
            {sortButton('custom', 'My order')}
            {sortButton('name', 'Name')}
            {sortButton('usd', 'Price')}
            {sortButton('delta', 'Change')}
          </div>

          <div role="group" aria-label="Scope" data-testid="scope-toggle" mix={segCss}>
            {scopeButton('curated', 'Curated 15')}
            {scopeButton('all', 'All')}
          </div>

          <div role="group" aria-label="View" data-testid="view-toggle" mix={segCss}>
            {viewButton('cards', 'Cards')}
            {viewButton('table', 'Table')}
          </div>

          <button
            type="button"
            data-testid="refresh-button"
            class="focus-ring"
            disabled={pending || budgetView.whole < 1}
            title={
              budgetView.whole < 1
                ? `Budget spent — a request frees up in ${budgetView.nextTokenIn}s`
                : 'Spend one request now'
            }
            mix={[focusRingCss, btnCss, on('click', () => void refresh())]}
          >
            {budgetView.whole < 1 ? `Wait ${budgetView.nextTokenIn}s` : 'Refresh'}
          </button>

          <label mix={autoLabelCss}>
            <input
              type="checkbox"
              data-testid="auto-checkbox"
              class="focus-ring"
              checked={auto}
              mix={[
                focusRingCss,
                on<HTMLInputElement>('change', (event) => {
                  auto = event.currentTarget.checked
                  handle.update()
                }),
              ]}
            />
            Auto · <span data-testid="auto-label">{autoLabel}</span>
          </label>

          <div mix={statusCss}>
            <span
              data-testid="status-dot"
              data-tier={tier}
              mix={statusDotCss}
              style={{ background: status.color, boxShadow: `0 0 8px ${status.color}` }}
            />
            <span data-testid="status-label" aria-live="polite">
              {status.label}
            </span>
          </div>
        </div>

        <div mix={budgetStripCss}>
          <span mix={budgetCaptionCss}>Request budget</span>
          <div aria-label="Requests left this minute" mix={pipsCss}>
            {Array.from({ length: BUDGET_CAP }, (_, i) => (
              <span key={i} data-testid="budget-pip" data-filled={i < budgetView.whole ? 'true' : 'false'} mix={pipCss} />
            ))}
          </div>
          <span data-testid="budget-label" mix={budgetLabelCss}>
            {budgetView.whole >= BUDGET_CAP
              ? `${budgetView.whole}/${BUDGET_CAP} left this minute`
              : `${budgetView.whole}/${BUDGET_CAP} left this minute · +1 in ${budgetView.nextTokenIn}s`}
          </span>
          <span mix={roleLabelCss}>
            {isLeaderNow ? 'this tab polls for all tabs' : 'another tab is polling — results arrive here free'}
          </span>
        </div>

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
          <div mix={gridCss}>
            {sortedSymbols.map((symbol) => renderCard(symbol, dim, query, effectiveView, true))}
          </div>
        ) : scope === 'all' && windowRange ? (
          <div
            data-testid="table-viewport"
            mix={[
              tableViewportCss,
              on<HTMLElement, 'scroll'>('scroll', (event) => {
                let node = event.currentTarget
                let nextScrollTop = node.scrollTop
                let nextHeight = node.clientHeight || viewportHeightPx
                let nextRange = computeWindow({
                  scrollTop: nextScrollTop,
                  viewportHeight: nextHeight,
                  rowHeight: ROW_HEIGHT_PX,
                  overscan: OVERSCAN,
                  itemCount: visibleCount,
                })
                scrollTop = nextScrollTop
                viewportHeightPx = nextHeight
                if (
                  nextRange.startIndex !== windowRange!.startIndex ||
                  nextRange.endIndex !== windowRange!.endIndex
                ) {
                  handle.update()
                }
              }),
              on<HTMLElement, 'dragover'>('dragover', (event) => {
                if (sort !== 'custom' || !dragSym) return
                let rect = event.currentTarget.getBoundingClientRect()
                let y = event.clientY
                if (y - rect.top < AUTO_SCROLL_EDGE_PX) startAutoScroll(event.currentTarget, -1)
                else if (rect.bottom - y < AUTO_SCROLL_EDGE_PX) startAutoScroll(event.currentTarget, 1)
                else stopAutoScroll()
              }),
              on<HTMLElement, 'dragleave'>('dragleave', () => stopAutoScroll()),
              on<HTMLElement, 'drop'>('drop', () => stopAutoScroll()),
            ]}
          >
            <div mix={tableInnerCss}>
              {renderTableHeader()}
              <div
                data-testid="window-spacer-top"
                data-row-count={String(windowRange.startIndex)}
                style={{ height: `${windowRange.topSpacerPx}px` }}
              />
              {windowedSymbols.map((symbol) =>
                renderCard(symbol, dim, '', effectiveView, trackedSet.has(symbol)),
              )}
              <div
                data-testid="window-spacer-bottom"
                data-row-count={String(visibleCount - windowRange.endIndex)}
                style={{ height: `${windowRange.bottomSpacerPx}px` }}
              />
            </div>
          </div>
        ) : (
          <div mix={tableWrapCss}>
            <div mix={tableInnerCss}>
              {renderTableHeader()}
              {sortedSymbols.map((symbol) => renderCard(symbol, dim, query, effectiveView, true))}
            </div>
          </div>
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

// The two `renderCard` branch assemblies: same shared leaves (built once by
// `renderCard`), different container element/grouping/layout css per view.
function renderTableRow(card: CardAssembly) {
  return (
    <div
      key={card.symbol}
      data-testid="asset-card"
      data-symbol={card.symbol}
      data-name={card.name}
      data-hidden={card.hidden ? 'true' : undefined}
      data-dimmed={card.dim ? 'true' : undefined}
      data-history-length={String(card.historyLength)}
      style={card.containerStyle}
      mix={[tableRowCss, ...card.dragMixins]}
    >
      {card.dragHandle}
      <span mix={tableAssetCellCss}>
        {card.badge}
        {card.titles}
      </span>
      {card.usdValue}
      {card.btcValue}
      {card.deltaValue}
      <span mix={tableTrendCellCss}>{card.sparkline}</span>
      {card.pinButton}
    </div>
  )
}

function renderCardTile(card: CardAssembly) {
  return (
    <div
      key={card.symbol}
      data-testid="asset-card"
      data-symbol={card.symbol}
      data-name={card.name}
      data-hidden={card.hidden ? 'true' : undefined}
      data-dimmed={card.dim ? 'true' : undefined}
      data-history-length={String(card.historyLength)}
      style={card.containerStyle}
      mix={[cardCss, ...card.dragMixins]}
    >
      <div mix={cardHeaderCss}>
        {card.badge}
        {card.titles}
        {card.pinButton}
        {card.dragHandle}
      </div>

      <div mix={priceRowCss}>
        <span>
          <span mix={usdCaptionCss}>USD</span>
          {card.usdValue}
        </span>
        {card.sparkline}
      </div>

      <div mix={footerRowCss}>
        {card.btcValue}
        {card.deltaValue}
      </div>
    </div>
  )
}

export const RatesDashboardEntry = clientEntry(import.meta.url, function RatesDashboardEntry(
  handle: Handle,
) {
  void handle
  // Constructed once per hydration, entirely client-side — never crosses the
  // clientEntry prop-serialization boundary (this call only ever happens in
  // the browser, after hydration; `createLocksPort()` itself is SSR-safe).
  let locks = createLocksPort()
  return () => <RatesDashboard locks={locks} />
})

// ----- helpers -----

function createDefaultKv(): KVStore {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  } catch {
    // Accessing localStorage can throw (e.g. private-browsing quota).
  }
  return {
    getItem: () => null,
    setItem: () => {},
  }
}

function randomTabId(): string {
  return Math.random().toString(36).slice(2)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isViewMode(value: unknown): value is ViewMode {
  return value === 'cards' || value === 'table'
}

function isScope(value: unknown): value is Scope {
  return value === 'curated' || value === 'all'
}

// Reuses cache.ts's own validator (isRatesCache) rather than a second,
// weaker shape check, so the storage-event adoption path and the mount-time
// localStorage read agree on exactly what a valid cache payload looks like.
function parseCachePayload(raw: string): RatesCache | null {
  try {
    let value: unknown = JSON.parse(raw)
    return isRatesCache(value) ? value : null
  } catch {
    // Ignore malformed storage payloads — treated like no update.
    return null
  }
}

// Mirrors parseCachePayload's shape: reuse order-store.ts's own validator
// rather than a second, weaker check.
function parseOrderRecordPayload(raw: string): OrderRecord | null {
  try {
    let value: unknown = JSON.parse(raw)
    return isOrderRecord(value) ? value : null
  } catch {
    return null
  }
}

// Web Locks API port (ADR 0007): guarded so SSR and browsers without the API
// silently degrade to writeOrder's unlocked path — no crash, no feature loss
// beyond the lock's collision protection ("no error page, ever").
function createLocksPort(): LocksPort | undefined {
  if (typeof navigator === 'undefined') return undefined
  let manager = (navigator as unknown as { locks?: LocksPort }).locks
  if (!manager) return undefined
  return {
    request<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
      return manager!.request(name, fn)
    },
  }
}

function sparkPoints(history: number[]): string {
  let recent = history.slice(-24)
  if (recent.length < 2) return '0,10 68,10'

  let min = Math.min(...recent)
  let max = Math.max(...recent)
  let span = max - min || 1

  return recent
    .map((value, index) => {
      let x = (index / (recent.length - 1)) * 68
      let y = 18 - ((value - min) / span) * 16
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function formatAge(ms: number): string {
  let seconds = ms / 1000
  return seconds < 60 ? `${Math.round(seconds)}s ago` : `${Math.round(seconds / 60)}m ago`
}

function computeStatus(tier: Staleness, ageMs: number, failures: number): { label: string; color: string } {
  if (tier === 'none') {
    return failures > 0
      ? { label: 'Feed unreachable', color: 'var(--color-negative)' }
      : { label: 'Fetching first rates…', color: 'var(--color-neutral-500)' }
  }

  let ageText = formatAge(ageMs)
  if (tier === 'live') return { label: `Live · ${ageText}`, color: 'var(--color-accent-400)' }
  if (tier === 'stale') return { label: `Stale · ${ageText}`, color: 'var(--color-warning)' }
  return { label: `Last known good · ${ageText}`, color: 'var(--color-negative)' }
}

function computeBanner(
  tier: Staleness,
  hasRates: boolean,
  failures: number,
  ageText: string,
): string | null {
  if (tier === 'expired') {
    return (
      `Showing the last values we trust, from ${ageText}. Past two minutes we stop treating them ` +
      'as prices: figures dim and the dot turns red. Nothing here is an error page.'
    )
  }
  if (!hasRates && failures > 0) return NO_CACHE_BANNER
  return null
}

function computeBudgetView(tokens: number): { whole: number; nextTokenIn: number } {
  let whole = Math.floor(tokens)
  let fractional = tokens - whole
  let nextTokenIn = Math.ceil(((1 - fractional) * (BUDGET_WINDOW_MS / BUDGET_CAP)) / 1000)
  return { whole, nextTokenIn }
}

function renderSparkline(points: string, color: string) {
  return (
    <svg
      viewBox="0 0 68 20"
      preserveAspectRatio="none"
      style={{ width: '68px', height: '20px', display: 'block', overflow: 'visible' }}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        stroke-width="1.25"
        stroke-linejoin="round"
        stroke-linecap="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>
  )
}

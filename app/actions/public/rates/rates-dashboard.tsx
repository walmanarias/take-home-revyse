// The single client-hydrated composition root for the crypto rates
// dashboard (ADR 0005). `RatesDashboard` owns every piece of feature state
// as setup-scope variables and wires the pure modules (budget/lease/cache/
// order/sort/format/persisted) together. `RatesDashboardEntry` is the thin,
// fully-serializable `clientEntry` wrapper actually mounted by `home-page.tsx`;
// `RatesDashboard` itself stays a plain (non-entry) component so its
// `kv`/`clock`/`fetchImpl` test seams (functions, not serializable) can be
// passed directly by `remix/ui/test`'s `render(...)` without ever crossing
// the `clientEntry` prop-serialization boundary.

import { addEventListeners, clientEntry, css, on, type Handle } from 'remix/ui'

import { BUDGET_CAP, BUDGET_WINDOW_MS, createBudgetStore } from './budget.ts'
import { CACHE_KEY, type RatesCache, type Staleness, readCache, staleness, writeCache } from './cache.ts'
import { type FetchedRates, fetchRates } from './coinbase.ts'
import { DISPLAY_NAMES, SYMBOLS } from './currencies.ts'
import { createLeaseStore } from './lease.ts'
import { reorder } from './order.ts'
import { formatBtc, formatDelta, formatUsd } from './format.ts'
import { type KVStore, readJSON, readOrder, writeJSON } from './persisted.ts'
import { type SortMode, sortSymbols } from './sort.ts'

const NAMES = DISPLAY_NAMES as Record<string, string>
const ALL_SYMBOLS: string[] = [...SYMBOLS]

const ORDER_KEY = 'nocturne.rates.order.v1'
const FAVS_KEY = 'nocturne.rates.favs.v1'

const POLL_MS = 8000
const POLL_SECONDS = 8
const HISTORY_LIMIT = 48

const NO_CACHE_BANNER =
  "No cached rates on this device yet, and the feed isn't answering. Values stay blank rather " +
  `than guessing — retrying every ${POLL_SECONDS}s.`

export interface RatesDashboardProps {
  kv?: KVStore
  clock?: () => number
  fetchImpl?: () => Promise<FetchedRates>
}

export function RatesDashboard(handle: Handle<RatesDashboardProps>) {
  let kv = handle.props.kv ?? createDefaultKv()
  let clock = handle.props.clock ?? Date.now
  let fetchImpl = handle.props.fetchImpl ?? (() => fetchRates())

  let tabId = randomTabId()
  let budgetStore = createBudgetStore(kv, clock)
  let leaseStore = createLeaseStore(kv, clock)

  let order = readOrder(kv, ORDER_KEY, ALL_SYMBOLS, ALL_SYMBOLS)
  let favs = readJSON<string[]>(kv, FAVS_KEY, [], isStringArray).filter((symbol) =>
    ALL_SYMBOLS.includes(symbol),
  )

  let cache = readCache(kv)
  let rates: Record<string, { usd: number; btc: number }> | null = cache?.rates ?? null
  let fetchedAt: number | null = cache?.fetchedAt ?? null
  let history: Record<string, number[]> = cache?.history ?? {}

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
    setTimeout(tick, 0)

    let interval = setInterval(tick, 1000)
    handle.signal.addEventListener('abort', () => {
      clearInterval(interval)
      leaseStore.release(tabId)
    })
  }

  function onStorage(event: StorageEvent) {
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
      now = clock()
      fetchedAt = result.fetchedAt
      rates = { ...(rates ?? {}), ...result.rates }
      history = appendHistory(history, result.rates)
      failures = 0
      writeCache(kv, { rates, fetchedAt, history })
    } catch {
      failures++
    } finally {
      pending = false
      handle.update()
    }
  }

  function togglePin(symbol: string) {
    favs = favs.includes(symbol) ? favs.filter((s) => s !== symbol) : [...favs, symbol]
    writeJSON(kv, FAVS_KEY, favs)
    handle.update()
  }

  function applyReorder(dragged: string, target: string, position: 'before' | 'after') {
    order = reorder(order, dragged, target, position)
    writeJSON(kv, ORDER_KEY, order)
    let name = NAMES[dragged] ?? dragged
    announce = `Moved ${name} ${position === 'before' ? 'up' : 'down'}, now position ${order.indexOf(dragged) + 1} of ${order.length}.`
    handle.update()
  }

  function applyDrop(dragged: string, target: string) {
    let fromIndex = order.indexOf(dragged)
    let toIndex = order.indexOf(target)
    let position: 'before' | 'after' = fromIndex < toIndex ? 'after' : 'before'
    applyReorder(dragged, target, position)
  }

  function matches(symbol: string, query: string): boolean {
    if (!query) return true
    let name = (NAMES[symbol] ?? '').toLowerCase()
    return symbol.toLowerCase().includes(query) || name.includes(query)
  }

  function computeAutoLabel(): string {
    if (!auto) return 'off'
    if (pending) return 'now'
    let elapsed = now - (lastAttempt ?? now)
    let remaining = Math.max(0, Math.ceil((POLL_MS - elapsed) / 1000))
    return `${remaining}s`
  }

  function sortButton(mode: SortMode, label: string) {
    return (
      <button
        key={mode}
        type="button"
        data-testid={`sort-${mode}`}
        class="focus-ring"
        aria-pressed={sort === mode}
        mix={[focusRingCss, segButtonCss, on('click', () => {
          sort = mode
          handle.update()
        })]}
      >
        {label}
      </button>
    )
  }

  function renderCard(symbol: string, dim: boolean, query: string) {
    let name = NAMES[symbol] ?? symbol
    let rate = rates?.[symbol]
    let hidden = !matches(symbol, query)
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
          ? '#d98484'
          : 'var(--color-neutral-700)'
    let draggable = sort === 'custom'

    return (
      <div
        key={symbol}
        data-testid="asset-card"
        data-symbol={symbol}
        data-name={name}
        data-hidden={hidden ? 'true' : undefined}
        data-dimmed={dim ? 'true' : undefined}
        data-history-length={String(historyForSymbol.length)}
        mix={[
          cardCss,
          on('dragover', (event) => {
            if (sort !== 'custom' || !dragSym) return
            event.preventDefault()
            if (overSym !== symbol) {
              overSym = symbol
              handle.update()
            }
          }),
          on('drop', (event) => {
            if (sort !== 'custom' || !dragSym) return
            event.preventDefault()
            let dragged = dragSym
            dragSym = null
            overSym = null
            if (dragged && dragged !== symbol) applyDrop(dragged, symbol)
            else handle.update()
          }),
        ]}
      >
        <div mix={cardHeaderCss}>
          <span mix={badgeCss}>{symbol.slice(0, 3)}</span>
          <span mix={titlesCss}>
            <span mix={nameCss}>{name}</span>
            <span mix={symbolCss}>{symbol}</span>
          </span>
          <button
            type="button"
            data-testid="pin-button"
            class="focus-ring"
            data-pinned={pinned ? 'true' : 'false'}
            aria-label={`${pinned ? 'Unpin' : 'Pin'} ${name}`}
            mix={[
              focusRingCss,
              pinButtonCss(pinned),
              on('click', () => togglePin(symbol)),
            ]}
          >
            ★
          </button>
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
        </div>

        <div mix={priceRowCss}>
          <span>
            <span mix={usdCaptionCss}>USD</span>
            <span
              data-testid="usd-value"
              mix={usdValueCss}
              style={{ color: dim ? 'var(--color-neutral-500)' : 'var(--color-text)' }}
            >
              {usdText}
            </span>
          </span>
          {renderSparkline(sparkPoints(historyForSymbol), deltaColor)}
        </div>

        <div mix={footerRowCss}>
          <span data-testid="btc-value" mix={btcValueCss}>
            {btcText}
          </span>
          <span data-testid="delta-value" data-sign={deltaSign} style={{ color: deltaColor }}>
            {deltaText}
          </span>
        </div>
      </div>
    )
  }

  return () => {
    if (!started) {
      started = true
      handle.queueTask(() => start())
    }

    let query = filter.trim().toLowerCase()
    let deltas: Record<string, number> = {}
    for (let symbol of ALL_SYMBOLS) {
      let delta = computeDelta(history[symbol] ?? [])
      if (delta !== null) deltas[symbol] = delta
    }

    let sortedSymbols = sortSymbols(sort, order, favs, rates, deltas)
    let visibleCount = sortedSymbols.filter((symbol) => matches(symbol, query)).length
    let hiddenCount = sortedSymbols.length - visibleCount

    let tier: Staleness = staleness(fetchedAt, now)
    let dim = tier === 'expired'
    let ageMs = now - (fetchedAt ?? now)
    let status = computeStatus(tier, ageMs, failures)
    let budgetState = budgetStore.read(now)
    let budgetView = computeBudgetView(budgetState.tokens)
    let bannerText = computeBanner(tier, rates !== null, failures, formatAge(ageMs))
    let autoLabel = computeAutoLabel()

    return (
      <div data-testid="rates-dashboard" mix={rootCss}>
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
                {`${visibleCount}/${ALL_SYMBOLS.length}`}
              </span>
            )}
          </div>

          <div role="group" aria-label="Sort" mix={segCss}>
            {sortButton('custom', 'My order')}
            {sortButton('name', 'Name')}
            {sortButton('usd', 'Price')}
            {sortButton('delta', 'Change')}
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
            <span data-testid="status-dot" data-tier={tier} style={{ background: status.color }} />
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
            {`${budgetView.whole}/${BUDGET_CAP} left this minute · +1 in ${budgetView.nextTokenIn}s`}
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

        <div mix={gridCss}>{sortedSymbols.map((symbol) => renderCard(symbol, dim, query))}</div>

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
  return () => <RatesDashboard />
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

function appendHistory(
  history: Record<string, number[]>,
  newRates: Record<string, { usd: number; btc: number }>,
): Record<string, number[]> {
  let next: Record<string, number[]> = { ...history }
  for (let symbol of Object.keys(newRates)) {
    let previous = next[symbol] ?? []
    next[symbol] = [...previous, newRates[symbol]!.usd].slice(-HISTORY_LIMIT)
  }
  return next
}

function parseCachePayload(raw: string): RatesCache | null {
  try {
    let value = JSON.parse(raw) as Partial<RatesCache> | null
    if (value && typeof value === 'object' && typeof value.fetchedAt === 'number' && value.rates) {
      return { rates: value.rates, fetchedAt: value.fetchedAt, history: value.history ?? {} }
    }
  } catch {
    // Ignore malformed storage payloads — treated like no update.
  }
  return null
}

function computeDelta(history: number[]): number | null {
  if (history.length < 2) return null
  let first = history[0]!
  let last = history[history.length - 1]!
  if (!first) return null
  return ((last - first) / first) * 100
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
      ? { label: 'Feed unreachable', color: '#d98484' }
      : { label: 'Fetching first rates…', color: 'var(--color-neutral-500)' }
  }

  let ageText = formatAge(ageMs)
  if (tier === 'live') return { label: `Live · ${ageText}`, color: 'var(--color-accent-400)' }
  if (tier === 'stale') return { label: `Stale · ${ageText}`, color: '#d9c184' }
  return { label: `Last known good · ${ageText}`, color: '#d98484' }
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

// ----- styles (Nocturne tokens via css() mixins — ADR 0002) -----

const focusRingCss = css({
  '&:focus-visible': {
    outline: '2px solid var(--color-accent)',
    outlineOffset: '2px',
  },
})

const rootCss = css({
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  fontFamily: 'var(--font-body)',
  padding: '22px clamp(12px, 4vw, 48px) 64px',
  minHeight: '100vh',
})

const headerCss = css({ marginBottom: '4px' })
const titleRowCss = css({ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' })
const h4Css = css({ margin: 0, letterSpacing: '-0.02em' })
const captionCss = css({
  fontSize: '11px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-neutral-500)',
})
const ledeCss = css({ margin: '0 0 18px', fontSize: '13px', color: 'var(--color-neutral-500)', maxWidth: '62ch' })

const toolbarCss = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '10px',
  marginBottom: '14px',
})
const filterWrapCss = css({ position: 'relative', flex: '1 1 240px', maxWidth: '340px' })
const inputCss = css({
  width: '100%',
  minHeight: '36px',
  padding: '6px 30px 6px 10px',
  font: 'inherit',
  fontSize: '14px',
  color: 'var(--color-text)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-divider)',
  borderRadius: 'var(--radius-md)',
})
const matchCounterCss = css({
  position: 'absolute',
  right: '9px',
  top: '50%',
  transform: 'translateY(-50%)',
  fontSize: '11px',
  color: 'var(--color-neutral-600)',
})
const segCss = css({
  display: 'inline-flex',
  overflow: 'hidden',
  border: '1px solid var(--color-divider)',
  borderRadius: 'var(--radius-md)',
})
const segButtonCss = css({
  appearance: 'none',
  cursor: 'pointer',
  background: 'transparent',
  border: 0,
  padding: '7px 12px',
  fontSize: '13px',
  color: 'var(--color-text)',
  '&[aria-pressed="true"]': { color: 'var(--color-accent)', boxShadow: 'inset 0 0 0 1px var(--color-accent)' },
})
const btnCss = css({
  display: 'inline-flex',
  alignItems: 'center',
  cursor: 'pointer',
  background: 'transparent',
  border: '1px solid var(--color-divider)',
  borderRadius: 'var(--radius-md)',
  padding: '6px 12px',
  fontSize: '14px',
  color: 'var(--color-text)',
  '&:disabled': { opacity: 0.45, cursor: 'not-allowed' },
})
const autoLabelCss = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '7px',
  fontSize: '13px',
  color: 'var(--color-neutral-400)',
})
const statusCss = css({ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' })

const budgetStripCss = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '10px 18px',
  padding: '8px 12px',
  marginBottom: '14px',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-surface)',
  boxShadow: 'var(--shadow-sm)',
})
const budgetCaptionCss = css({
  fontSize: '11px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-neutral-600)',
})
const pipsCss = css({ display: 'flex', alignItems: 'center', gap: '4px' })
const pipCss = css({
  width: '12px',
  height: '5px',
  borderRadius: '2px',
  background: 'var(--color-neutral-800)',
  '&[data-filled="true"]': { background: 'var(--color-accent-500)' },
})
const budgetLabelCss = css({
  fontSize: '12px',
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--color-neutral-400)',
})
const roleLabelCss = css({ fontSize: '12px', color: 'var(--color-neutral-500)' })

const bannerCss = css({
  padding: '10px 12px',
  marginBottom: '12px',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-accent-900)',
  color: 'var(--color-accent-300)',
  fontSize: '12px',
  lineHeight: 1.5,
})
const noticeCss = css({ margin: '0 0 10px', fontSize: '12px', color: 'var(--color-neutral-500)' })
const emptyStateCss = css({ margin: '26px 4px', fontSize: '13px', color: 'var(--color-neutral-600)' })
const footnoteCss = css({
  margin: '22px 4px 0',
  fontSize: '11px',
  lineHeight: 1.7,
  color: 'var(--color-neutral-700)',
  maxWidth: '78ch',
})
const visuallyHiddenCss = css({
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
})

const gridCss = css({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(248px, 1fr))',
  gap: '11px',
  alignItems: 'start',
})

const cardCss = css({
  display: 'flex',
  flexDirection: 'column',
  padding: '12px 13px 11px',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-surface)',
  boxShadow: 'var(--shadow-sm)',
  transition: 'background 120ms ease, opacity 120ms ease, box-shadow 120ms ease',
  '&[data-hidden="true"]': { display: 'none' },
})
const cardHeaderCss = css({ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '12px' })
const badgeCss = css({
  width: '30px',
  height: '30px',
  flex: 'none',
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  fontSize: '10px',
  fontWeight: 600,
  color: 'var(--color-accent-300)',
  background: 'var(--color-accent-900)',
  boxShadow: 'inset 0 0 0 1px var(--color-accent-800)',
})
const titlesCss = css({ minWidth: 0, flex: 1 })
const nameCss = css({
  display: 'block',
  fontSize: '14px',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})
const symbolCss = css({
  display: 'block',
  fontSize: '11px',
  color: 'var(--color-neutral-600)',
  letterSpacing: '0.06em',
})
function pinButtonCss(pinned: boolean) {
  return css({
    width: '26px',
    height: '26px',
    flex: 'none',
    padding: 0,
    marginLeft: 'auto',
    background: 'transparent',
    border: 0,
    cursor: 'pointer',
    fontSize: '13px',
    color: pinned ? 'var(--color-accent)' : 'var(--color-neutral-700)',
  })
}
function dragHandleCss(draggable: boolean) {
  return css({
    flex: 'none',
    fontSize: '13px',
    letterSpacing: '2px',
    color: 'var(--color-neutral-700)',
    userSelect: 'none',
    cursor: draggable ? 'grab' : 'default',
  })
}
const priceRowCss = css({ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '10px' })
const usdCaptionCss = css({
  display: 'block',
  fontSize: '10px',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--color-neutral-600)',
  marginBottom: '2px',
})
const usdValueCss = css({
  display: 'block',
  fontWeight: 500,
  fontSize: '22px',
  letterSpacing: '-0.02em',
  fontVariantNumeric: 'tabular-nums',
})
const footerRowCss = css({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '10px',
  marginTop: '10px',
  paddingTop: '9px',
  background:
    'linear-gradient(to right, transparent, var(--color-divider) 24px, var(--color-divider) calc(100% - 24px), transparent) no-repeat top / 100% 1px',
})
const btcValueCss = css({ fontSize: '13px', fontVariantNumeric: 'tabular-nums', color: 'var(--color-neutral-500)' })

# ADR 0006: T2 implemented — "All" scope via the existing response, hand-rolled windowing

## Context

`designs/README.md`'s T2 ("Scale vs. interactivity") was previously decided-but-not-built: curate
15 assets, and for 500+, virtualize with `@tanstack/react-virtual` and `@dnd-kit`. Both are React
libraries and unusable in Remix 3 (ADR 0001/0003). New scope requires T2 actually implemented,
with **no new dependencies** and **T1's budget treated as sacred** (no new request path may be
added without spending a token).

Ground truth from the shipped code (`app/actions/public/rates/`):
- `coinbase.ts`'s `fetchRates()` already maps **every** symbol in Coinbase's response
  (`mapRates` iterates `Object.entries(raw)`), not just the curated 15 — the 500+-key universe
  is already sitting in memory on every successful fetch, at zero extra request cost.
- `rates-dashboard.tsx` currently only ever renders `ALL_SYMBOLS` (the curated 15,
  `[...SYMBOLS]`) — `order`/`favs`/`sortSymbols` are all scoped to that constant. `rates` and
  `history` are silently merged/persisted for *every* symbol Coinbase returns
  (`rates = {...rates, ...result.rates}`; `history = appendHistory(history, result.rates)`),
  even though nothing beyond the curated 15 is ever displayed today — an existing,
  unintentional storage-growth gap this ADR closes rather than inherits.
- A cards/table view toggle already shipped (AC-77–82, `VIEW_KEY = 'nocturne.rates.view.v1'`),
  independent of this decision.

## Decision

**Scope, not a new fetch.** Add a toolbar segmented control, "Curated 15 · All", backed by a
new key `nocturne.rates.scope.v1` (`'curated' | 'all'`, default `'curated'`), read/written
through the existing `readJSON`/`writeJSON` (CONV-persistence-1). "All" only ever draws from the
`rates` object the leader tab already fetched — there is no second request path, so T1's budget
is untouched by construction, not by discipline.

**Display names.** `DISPLAY_NAMES` stays the 15-entry curated map. A new `displayNameFor(symbol):
string` in `currencies.ts` returns `DISPLAY_NAMES[symbol] ?? symbol` — every uncurated symbol's
"name" is its own code. Rejected: a static extension map for the next N best-known coins. Coinbase
has no names endpoint reachable without spending a budget token, and a hand-curated list of
hundreds of symbol→name pairs is an immediate maintenance trap (drifts the moment Coinbase adds
or removes a currency, with no signal that it has). Symbol-as-name is honest about what we
actually know and costs nothing to keep correct.

**Fiat symbols: included, not filtered.** The rates endpoint has no field distinguishing fiat
from crypto — filtering would require a hardcoded ISO-4217-ish denylist, which is exactly the
same maintenance trap as a names list, and misclassifying anything (a new fiat code, a
fiat-pegged token) silently drops a mathematically-valid quote for no functional benefit (its
USD/BTC numbers are just as correct as any crypto symbol's). "All" is labeled neutrally ("All
Coinbase currencies"), not "all crypto."

**Windowing (table view only).** A new pure module, `window.ts`, computes the render slice:

```
export interface WindowMetrics {
  scrollTop: number
  viewportHeight: number
  rowHeight: number
  overscan: number
  itemCount: number
}
export interface WindowRange {
  startIndex: number
  endIndex: number          // exclusive
  topSpacerPx: number
  bottomSpacerPx: number
}
export function computeWindow(metrics: WindowMetrics): WindowRange
```

Rows are a fixed height (a constant, e.g. `ROW_HEIGHT_PX = 40`, tuned during implementation) so
`computeWindow` never measures the DOM — pure arithmetic over `scrollTop`/`viewportHeight`,
fully unit-testable with injected metrics. The scroll container is a fixed-height, `overflow:
auto` element around a top spacer, the visible row slice, and a bottom spacer; an `on('scroll',
...)` handler recomputes the range and calls `handle.update()` **only when `startIndex`/
`endIndex` actually changed** from the last computed range, to avoid a re-render per pixel of
scroll.

**Windowing does not extend to the cards/grid view.** Cards use a reflowing CSS grid
(`auto-fill, minmax(248px, 1fr)`), where "row height" isn't a stable 1D index without either
fixing the column count (breaking the responsive 4-to-1-column layout) or measuring the
container's width (a real per-resize measurement, which the "fixed-height, no measurement"
premise was written for a single-column list, not a reflowing grid). Rather than half-solve grid
virtualization, **switching scope to "All" forces (and locks) table view**; switching view back
to "cards" is disabled while scope is "All" (control shows why). This is the same trade-off the
original T2 text already implicitly accepted ("cards stay fixed-height so the virtualiser needs
no measurement" describes a list, not a grid) made explicit and honest rather than glossed over.

**Filtering off the render path.** A new `search-index.ts` builds a lowercased
`Map<symbol, searchableText>` once per symbol-universe change (scope toggle, or when a fetch
introduces symbols not seen this session) rather than recomputing `toLowerCase()` concatenation
per keystroke per row:

```
export function buildSearchIndex(
  symbols: readonly string[], displayNameFor: (symbol: string) => string,
): Map<string, string>
export function matchesQuery(index: Map<string, string>, symbol: string, query: string): boolean
```

**Minimal re-render strategy under `handle.update()`.** Remix 3 has no memoization primitive to
reach for (unlike React); the actual defenses are (1) windowing caps the number of DOM nodes any
`handle.update()` ever touches to the overscan window (tens of rows), regardless of universe
size, and (2) `sortSymbols` still runs once over the *full* active universe (a single O(n log n)
pass is cheap even at a few hundred symbols) but **`formatUsd`/`formatBtc`/`formatDelta`/sparkline
generation run only for the sliced, currently-rendered subset** — never eagerly for the whole
universe before slicing.

**Drag-and-drop across the window.** `order.ts`'s `reorder()` needs **no changes**: it already
operates on symbol identity within the full master array, never on rendered-list indices, so
windowing (like filtering before it) is transparent to it. `dragover` near the scroll
container's top/bottom edge (within a small pixel threshold) drives a `requestAnimationFrame`
loop that nudges `scrollTop`, recomputing the window each frame, so a user can drag toward a
target currently outside the rendered slice. Keyboard reorder (`ArrowUp`/`ArrowDown`) needs no
change at all: its target is always the currently-focused row's rendered neighbor, which is by
construction inside the rendered window.

**Reorderable universe stays bounded.** Only symbols already in `order` — the curated 15 plus
any symbol the user has pinned from "All" scope (pinning appends it to `order` at that moment)
— are draggable/keyboard-reorderable. Unpinned "All"-scope rows show their live rate but have no
drag handle. This matches T2's own original "given up" text (dragging across 500 items by hand
isn't a real interaction) and keeps `order`/the new `order.v2` record (ADR 0007) small regardless
of how many symbols Coinbase returns.

**Bounded history/storage.** `history.ts`'s `appendHistory` gains a third parameter,
`trackedSymbols: readonly string[]`, and only records samples for symbols in that set:

```
export function appendHistory(
  history: Record<string, number[]>,
  newRates: Record<string, { usd: number; btc: number }>,
  trackedSymbols: readonly string[],
): Record<string, number[]>
```

`trackedSymbols` is the curated 15 plus current pins — the same bounded set that's
draggable/reorderable. An "All"-scope symbol outside that set shows a live USD/BTC price (from
the same already-fetched response) but Δ is `null` → renders `—`, and its sparkline is flat,
exactly signaling "not tracked" rather than fabricating a trend. This closes the existing
unbounded-history gap: `history`'s size is now bounded by curated+pinned count, not by however
many currencies Coinbase happens to return. `rates`/the cache's full merged rates object is left
as-is (bounded by Coinbase's own currency count, not user-driven growth — a materially different,
acceptable cost from unbounded per-symbol history arrays).

## Consequences

- Zero new requests, zero new dependencies — T1's budget is structurally untouched.
- Uncurated symbols carry no human name (symbol-as-name) and no session Δ/trend (flat
  sparkline, `—` for Δ) — an honest "we don't track this one closely" signal, not a bug.
- Fiat currencies appear in "All" scope alongside crypto, labeled neutrally; no denylist to
  maintain, no misclassification risk.
- "All" scope is table-view only; cards/grid virtualization is not attempted. A user who wants
  the card layout must stay in "Curated 15."
- Dragging is still only meaningful for the curated+pinned set, matching the original T2 text's
  own acknowledgment that hand-dragging 500 items isn't a real interaction; a "move to top/move
  to position" affordance for the rest remains unbuilt, flagged as future work if ever needed.
- `window.ts` and `search-index.ts` are new pure modules, unit-testable with injected metrics —
  no DOM, no real scroll events required for their core logic; `rates-dashboard.tsx` (already
  flagged by CONV-structure-3 as trending toward a god module) grows further and should be
  re-checked against the module split during REFACTOR, not left as one larger file.

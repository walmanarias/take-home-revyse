# Crypto Dashboard

A single-route Remix 3 dashboard (`/`) listing 15 curated cryptocurrencies with live USD and BTC
rates from Coinbase's public exchange-rates endpoint. See `specs/crypto-dashboard.spec.md` for
the full functional contract and `docs/design/crypto-dashboard.md` plus `docs/adr/` for the
system design and key decisions.

## App Shape

- `app/actions/controller.tsx` owns the top-level route actions.
- `app/actions/home-page.tsx` and `app/actions/document.tsx` render the route-owned server chrome.
- `app/actions/public/entry.ts` is the generic browser hydration entry.
- `app/actions/public/rates/` is the whole crypto-dashboard feature tree: the `RatesDashboard`
  client-hydrated component plus its pure budget/lease/cache/order/sort/format/persisted modules,
  `currencies.ts` (the curated symbol list), `coinbase.ts` (the one network adapter), and
  `tokens.css` (Nocturne design tokens, ADR 0002).
- `app/routes.ts` defines the shared route contract used by server and browser modules for
  type-safe hrefs.
- `app/router.ts` wires routes to handlers.
- `app/middleware/render.tsx` installs the request-scoped renderer used by actions.
- `app/assets.ts` owns the server-side asset pipeline used by the asset route and renderer.
- Root `public/` contains static files served unchanged from the app root.

## Commands

```sh
npm i
npm run dev
npm run hmr
npm run start
npm test
npm run typecheck
```

## Tension Decisions

Adapted from `designs/README.md`'s handoff (written for a Remix + React + shadcn stack) to this
repository's actual Remix 3 implementation. All five tensions (T1–T5) are implemented; see ADR
0006 (T2) and ADR 0007 (T3) for the scope-toggle/windowing and versioned-order design decisions
added in a later pass.

### T1 — Freshness vs. rate limits — IMPLEMENTED

**Choice.** One shared **leaky-bucket budget** in `localStorage` (`budget.ts`, capacity 10,
refilling continuously at 10/minute) plus a **single-poller lease** (`lease.ts`). Every tab writes
a heartbeat claim to `nocturne.rates.lease.v1`; the holder is the only tab that fetches, on an 8s
period (7.5 req/min, comfortably inside the 12s freshness bar with ~2.5 req/min of headroom).
Other tabs adopt results for free via the native `storage` event, so N tabs cost the same as one.
If the leader closes or freezes, another tab takes the lease once the holder has been silent past
`LEASE_TTL = 2500ms`. Manual refresh spends from the same bucket; when it's empty the button
becomes "Wait Ns" and says why. The ten pips make the budget visible so throttling never feels
like a bug.

**Given up.** `localStorage` reads/writes are not truly atomic, so two tabs claiming a token in
the same millisecond can both win — the bucket can overdraw by ~1 in a rare race (AC-7 documents
this explicitly). Accepted because the cap is a soft budget with headroom; a `BroadcastChannel` +
`navigator.locks` upgrade (or a SharedWorker) closes it, and in production the right answer is a
server-side proxy that owns the key and the quota.

### T2 — Scale vs. interactivity — IMPLEMENTED

**Choice.** A toolbar scope toggle ("Curated 15" · "All") reveals every symbol in the
already-fetched Coinbase response — zero new requests, since `coinbase.ts` already mapped every
returned symbol, not just the curated 15 (T1's budget stays untouched by construction). Uncurated
symbols show their own code as their display name (`currencies.ts`'s `displayNameFor`), and fiat
currencies are included, not filtered — the endpoint carries no metadata to filter by, and a
hand-curated names/denylist would drift out of sync with Coinbase's own list the moment it
changed. Filtering runs against a lowercased index built once per symbol-universe change
(`search-index.ts`), not recomputed per keystroke per row. "All" scope's list is windowed
(`window.ts`'s pure `computeWindow`): rows are a fixed height, so the rendered slice is pure
arithmetic over `scrollTop`/`viewportHeight` — at most a few dozen rows are ever in the DOM
regardless of universe size — with a `dragover`-driven edge auto-scroll so a drop target outside
the rendered slice stays reachable.

**Given up.** Dragging is still only offered for the curated 15 plus pinned symbols, not the full
"All" universe — a "move to top" affordance for the rest remains unbuilt. Uncurated symbols show
their own code as their name (no names endpoint reachable without spending a budget token) and
carry no session Δ/trend (flat sparkline, `—`) unless pinned. Fiat currencies are included, not
filtered — the endpoint carries no type metadata to filter by. Cards/grid view is not
virtualized; "All" scope is table-view only.

### T3 — Instant feel vs. durable order — IMPLEMENTED

**Choice.** Optimistic local reorder (state updates on drop or keyboard move, before any write)
with the write persisted to a versioned record, `nocturne.rates.order.v2`
(`order-store.ts`'s `{ schemaVersion, updatedAt, order }`), so the visible reorder is still
instant. The durable write is serialized through `navigator.locks.request()` when available
(guarded for SSR and browsers without the Web Locks API, degrading to today's unlocked write, no
crash either way); inside the lock, a write only commits when its `updatedAt` is strictly greater
than what's currently stored — a deterministic last-write-wins outcome rather than an unordered
race between two independent `getItem`/`setItem` calls, with a tie favoring the value already in
storage. A `storage`-event listener adopts a newer `order.v2` record from another tab the same
way, without ever fetching. Legacy `nocturne.rates.order.v1` is migrated from once (never
deleted, for rollback safety) and validated on read exactly as before (unknown symbols dropped,
missing ones appended).

**Given up.** The lock makes the last-write-wins outcome deterministic, not a merge — a genuine
same-instant collision across two tabs still discards one tab's intended order rather than
combining both. `favs` deliberately keeps the simpler, unlocked scheme; losing a pin race is
cheap to notice and redo, unlike losing a multi-step reorder.

### T4 — Resilience vs. simplicity — IMPLEMENTED

**Choice.** No error page, ever. Every successful response is written to a last-known-good cache
(`cache.ts`) that renders before the first fetch resolves, so a returning user sees numbers
immediately. Staleness is tiered, and the tier is always on screen (dot + label + banner):
`≤12s` **live** (accent) · `≤120s` **stale** (amber, values still trusted) · `>120s` **expired**
(red, numeric values dim to `--color-neutral-500`, banner explains that these are no longer
prices). A first-time visitor with no cache sees the full chrome, `—` in every cell, and
"Fetching first rates…"; if the feed is unreachable they get an explicit "no cached rates on this
device yet… retrying every 8s" — blank rather than a guess.

**Given up.** Complexity: three staleness tiers, a cache-shape version key, and a "dim the
numbers" state to test. Also honesty over comfort — an expired dashboard looks visibly degraded,
which is uglier than showing confident stale numbers, and deliberately so.

### T5 — Filtering × reordering semantics — IMPLEMENTED

**Choice.** Drag works with a filter active. Reordering happens on the **master order**, not the
visible slice: the dragged symbol is removed and re-inserted **adjacent to the drop target**
(after it when moving down, before it when moving up — the same pure `reorder()` function used by
both the native HTML5 drag path and the keyboard `ArrowUp`/`ArrowDown` path). Hidden rows are
never touched, so each keeps the visible neighbour it sits behind. Clear the filter and the moved
card is exactly where you'd predict; everything else is untouched. Drag is disabled under
Name/Price/Change sorts for the same reason: a computed order has no slots, so a drop would
either be discarded or would silently switch the user back to custom.

**Given up.** You cannot use the filter to move a card *between* two hidden neighbours in one
gesture — it lands next to a visible card. Rare; recoverable by clearing the filter.

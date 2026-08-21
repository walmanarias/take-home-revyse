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
repository's actual Remix 3 implementation. T1, T4, and T5 are implemented as part of this
feature; T2 and T3 are decided design directions, not built in this pass.

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

### T2 — Scale vs. interactivity — decided, not implemented

**Status:** decided, not implemented.

**Choice.** Curate 15 assets by default and, for a hypothetical full 500+ list, virtualise
rendering over the filtered array (windowed rendering, no library available in Remix 3's
ecosystem — this would be hand-rolled), keep filtering off the interaction path, memoise cards on
their own values, and restrict the drag interaction to the rendered window plus edge auto-scroll.
Cards would stay fixed-height so the virtualiser needs no measurement.

**Given up.** Dragging across a 500-card list is slow by hand, so the honest fix is a "move to
top / move to position" affordance rather than more DnD polish; virtualisation also breaks native
find-in-page and complicates the fading divider rules. Not implemented because 15 cards is the
real product for this pass, and virtualisation adds machinery the current design doesn't need.

### T3 — Instant feel vs. durable order — decided, not implemented

**Status:** decided, not implemented.

**Choice.** Optimistic local reorder (state updates on drop or keyboard move, before any write)
with the write happening synchronously in the same handler (`order.ts`'s `reorder()` plus
`persisted.ts`'s `writeJSON`), so a reload immediately after a drop can't lose it. For durability
across tabs the plan is a versioned record — `{ version, updatedAt, order }` — written under
`navigator.locks.request()` with last-write-wins on `updatedAt`, a `storage`-event listener
adopting a newer version, and validation on read (unknown symbols dropped, missing ones appended,
already implemented today via `readOrder()`).

**Implemented today:** the optimistic update plus the synchronous validated write — order
survives an instant reload. **Not implemented:** the lock and version fields, so two tabs
reordering at the same instant settle on whichever wrote last rather than merging.

**Given up.** True convergence needs a server-side order per user (or a CRDT); both are the wrong
weight for a client-only dashboard where the loser of a race can re-drag one card.

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

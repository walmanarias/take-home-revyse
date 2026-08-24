# Crypto Dashboard

A single-route Remix 3 dashboard (`/`) listing 15 curated cryptocurrencies with live USD and BTC
rates from Coinbase's public exchange-rates endpoint. Filter, sort, pin favourites, drag (or
arrow-key) rows into a persisted custom order, switch between a card grid and a dense table, and
always see exactly how fresh the numbers are. The app shares one budget of 10 requests per rolling
minute across every open tab — enforced as a sliding window, so no 60-second span anywhere ever
holds more than 10 — and never shows an error page.

- Full functional contract: `specs/crypto-dashboard.spec.md` (AC-1..117, incl. Amendments)
- System design + decisions: `docs/design/crypto-dashboard.md`, `docs/adr/0001`–`0008`
- Original handoff + prototype + Nocturne design system: `designs/`

## Setup

Requires **Node ≥ 24.3.0** (TypeScript runs natively via `--import remix/node-tsx`; there is no
build step). No environment variables, API keys, or backend — Coinbase's endpoint is public and
all state is browser-local (`localStorage`).

```sh
npm install
npm run dev          # http://localhost:44100 (restarts on change)
npm run hmr          # same port, behind the HMR proxy (server + browser hot reload)
npm run start        # production mode
npm test             # 153 tests: unit + router + Chromium component + 2 E2E (remix test)
npm run typecheck    # tsc --noEmit
```

`npm test` runs Remix's own `remix test` CLI. Browser and E2E tests need a Chromium build, which
the `playwright` devDependency does *not* download on install — run `npx playwright install
chromium` once after `npm install`. Run a single file (or glob) with
`NODE_ENV=test npx remix test path/to/file.test.ts`. Don't use raw `node --test` — it reports
the file as one passing test without executing its `remix/test` suite bodies.

### Where things live

- `app/actions/public/rates/` — the whole feature, split by layer:
  - **State + wiring:** `rates-dashboard.tsx` — the only stateful module.
  - **Presentation:** `toolbar.tsx`, `card.tsx`, `table.tsx`, `budget-strip.tsx`,
    `sparkline.tsx` — pure render helpers over an explicit props object.
  - **Derived rules:** `status`, `sort`, `format`, `order`, `history`, `window`, `search-index`
    — pure functions over plain data, unit-tested with no DOM.
  - **Persistence:** `persisted`, `snapshot`, `cache`, `budget`, `lease`, `order-store`, `locks`
    — versioned keys behind validating, fallback-safe helpers.
  - **I/O + types:** `coinbase.ts` (the one network adapter), `rate.ts` (shared `Rate`/`RatesMap`),
    `currencies.ts` (the curated list), `tokens.css` / `styles.ts` (Nocturne tokens).

  CLAUDE.md's "dashboard feature tree" table says which layer new code belongs in, and records
  the two traps this split has (live state vs. render snapshots; the shared row-height invariant).
- `app/actions/controller.tsx`, `home-page.tsx`, `document.tsx` — the server-rendered route chrome.
- `app/routes.ts` / `app/router.ts` / `app/middleware/render.tsx` / `app/assets.ts` — routing,
  the request-scoped renderer, and the browser asset pipeline (unchanged scaffold).
- `test/` — shared fakes (injected clock, `KVStore`, `fetch`, `LocksPort`) and the README test.

## Decisions & trade-offs

- **Remix 3, not React.** The handoff was written for Remix + React + shadcn/Tailwind/dnd-kit.
  This repo is a Remix 3 scaffold, and the repo owner settled the stack on Remix 3 in 2026-08
  (`CLAUDE.md`, "Stack decision") — a self-imposed constraint, not one the handoff asked for. The
  design's *intent* — layout, copy, tokens, and the budget/lease/staleness/reorder algorithms —
  was ported into Remix 3 idioms (setup-scope state, explicit `handle.update()`, no hooks). The
  cost is worth stating plainly: nothing here demonstrates React, which is what a "Remix + React"
  handoff is written to exercise. (ADR 0001)
- **Tokens as a CSS asset, styling via `css()` descriptors.** Nocturne's `:root` variables ship
  verbatim in `tokens.css`; every component style references `var(--color-*)`, never a literal
  hex. Two semantic tokens (`--color-negative`, `--color-warning`) were added rather than
  inlining values. (ADR 0002)
- **Native HTML5 drag-and-drop + a keyboard path, no DnD library.** Both paths call the same
  pure `reorder()`, so keyboard users get identical semantics and the reorder logic is tested
  without a DOM. Trade-off: native HTML5 DnD is mouse-only — touch-screen users have the keyboard path, not drag. (ADR 0003)
- **Remix-native testing only.** Unit tests inject a clock, a `KVStore`, `fetch`, and a
  `LocksPort` — no real timers, network, `localStorage`, or `navigator.locks`. Component tests
  run in real Chromium; one E2E test guards SSR↔hydration parity. Finding along the way: the
  scaffold's `node --test` script silently skipped `remix/test` suite bodies, so `npm test` was
  switched to the real `remix test` runner. (ADR 0004)
- **Server renders the chrome; one client component owns all IO.** The cold-start page (15 rows
  of `—`) renders with zero network calls and zero storage reads, so the first hydrated render
  matches SSR exactly; persisted view/scope/cache are adopted in one post-mount update. (ADR 0005)
- **Session-scoped Δ / sparkline, no invented history.** The rates endpoint has no history, so
  the change column and sparkline are built from samples taken this session rather than a
  synthesised 24h series. They start flat and grow honestly.
- **No error page, anywhere.** Every failure mode degrades in place: last-known-good values with
  an explicit age, or chrome with placeholders and a plain "retrying every 8s" message.

## Tension Decisions

The handoff posed five design tensions and asked for two to be implemented, the rest decided.
**T1 (freshness vs. rate limits) and T4 (resilience vs. simplicity) were the two chosen** — they
are the product's core promise (never exceed the shared budget; never show an error page). T5 was
small enough to include in the same pass, and T2 and T3 were implemented in a follow-up pass
(ADR 0006, ADR 0007), so all five are live today. Each entry below records the choice and what it
gives up.

### T1 — Freshness vs. rate limits — IMPLEMENTED (chosen)

**Choice.** One shared **sliding-window request log** in `localStorage` (`budget.ts`: the
timestamps of granted requests; a request is refused while 10 already fall inside the trailing 60s)
plus a **single-poller lease** (`lease.ts`). Every tab writes a
heartbeat claim; only the holder fetches, on an 8s period (7.5 req/min, inside the 12s freshness
bar with headroom). Other tabs adopt results free via the native `storage` event, so N tabs cost
the same as one. If the leader closes or freezes, another tab takes over after
`LEASE_TTL = 2500ms` of silence. Manual refresh spends from the same window; when it is full the
button reads "Wait Ns" — counting down to the moment the oldest request leaves the window — and
ten pips keep the budget visible so throttling never looks like a bug.

**Given up.** `localStorage` writes are not atomic, so two tabs reading the same snapshot in the
same millisecond can both append a stamp and one write clobbers the other — the window can
overdraw by ~1 per racing pair (AC-116). Accepted because it is bounded and rare; the real fix is a
server-side proxy that owns the key and the quota.

*This started as a leaky bucket* (capacity 10, continuous refill at 10/min), which caps the
sustained average but not a sliding window — an external review measured **16 requests in one 60s
window** by spamming manual refresh in a second tab while the leader polled, against a stated hard
10/min. The mechanism is now a request log and AC-108 replays that exact probe. See ADR 0008 and
`docs/curation/2026-08-24-external-review.md`.

### T2 — Scale vs. interactivity — IMPLEMENTED

**Choice.** A "Curated 15 · All" scope toggle reveals every symbol in the response the leader tab
already fetched — zero extra requests, so T1's budget is untouched by construction. Filtering runs
against a lowercased index built once per symbol universe (`search-index.ts`). "All" scope is
**windowed** (`window.ts`): rows are fixed-height, so the rendered slice is pure arithmetic over
`scrollTop`, at most a few dozen rows are in the DOM at once, and drag auto-scrolls at the edges so
off-screen drop targets stay reachable. Session history is bounded to curated ∪ pinned symbols.

**Given up.** "All" scope is table-view only (the card grid is not virtualized); uncurated symbols
show their ticker as their name (no names endpoint without spending budget) and carry no Δ/trend
unless pinned; fiat currencies are included because the endpoint has no type metadata and a
hand-maintained denylist would drift; dragging stays limited to curated ∪ pinned rows.

### T3 — Instant feel vs. durable order — IMPLEMENTED

**Choice.** Reorders update the UI optimistically in the drop/keydown handler, then persist to a
versioned `nocturne.rates.order.v2` record (`order-store.ts`: `{ schemaVersion, updatedAt, order }`).
The write runs under `navigator.locks.request()` where available and commits only if its
`updatedAt` is strictly newer than what is stored — deterministic last-write-wins instead of an
unordered `getItem`/`setItem` race. A `storage` listener adopts a newer record from another tab
without fetching; a losing tab resyncs to the stored order. The legacy `order.v1` key is migrated
once and kept for rollback.

**Given up.** Deterministic, not merged — a genuine same-instant collision still discards one
tab's intent (true convergence needs a server-side order or a CRDT, the wrong weight for a
client-only app). Browsers without Web Locks degrade to the unlocked write. `favs` deliberately
keeps the simpler unlocked scheme; losing a pin race is cheap to notice and redo.

### T4 — Resilience vs. simplicity — IMPLEMENTED (chosen)

**Choice.** No error page, ever. Every successful response is written to a last-known-good cache
(`cache.ts`) that renders before the first fetch resolves, so a returning user sees numbers
immediately. Staleness is tiered and always on screen (dot + label + banner): **live** ≤12s ·
**stale** ≤120s (amber, still trusted) · **expired** >120s (red, values dimmed, banner explains
these are no longer prices). A first-time visitor with no cache sees the full chrome with `—` in
every cell and "Fetching first rates…"; if the feed is unreachable they get an explicit
"no cached rates on this device yet… retrying every 8s" — blank rather than a guess.

**Given up.** Complexity — three tiers, a versioned cache key, and a dimmed state to test — and
comfort: an expired dashboard looks visibly degraded on purpose, rather than showing confident
stale numbers.

### T5 — Filtering × reordering semantics — IMPLEMENTED

**Choice.** Dragging works with a filter active and edits the **master order**, not the visible
slice: the dragged symbol is re-inserted adjacent to the drop target (after it moving down, before
it moving up), and hidden rows are never touched. Clear the filter and the moved card is exactly
where you'd predict. Drag is disabled under Name/Price/Change sorts because a computed order has
no slots to drop into.

**Given up.** You cannot use a filter to place a card *between* two hidden neighbours in one
gesture — it lands next to a visible one. Rare, and recoverable by clearing the filter.

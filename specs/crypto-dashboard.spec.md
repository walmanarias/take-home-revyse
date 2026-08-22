# Crypto Rates Dashboard Specification

> Status: Draft · Owner: walmanarias · Linked design: `docs/design/crypto-dashboard.md`,
> `docs/adr/0001`–`0005`, `designs/README.md`

## Summary

A single-route (`/`) Remix 3 dashboard lists 15 curated cryptocurrencies with live USD and BTC
rates pulled from Coinbase's public exchange-rates endpoint. Users filter, sort, pin, and
drag-reorder the list; every persisted preference and cached rate lives in `localStorage`. The
app enforces one shared 10-requests/minute budget and a single-poller lease across every open
tab, stays honest about data age via tiered staleness (live/stale/expired), and never renders an
error page — degraded states are always chrome plus explicit, dimmed, or last-known-good data.
This spec covers `app/actions/public/rates/*` (the whole feature tree) plus the cold-start
contract of `app/actions/controller.tsx`/`home-page.tsx`, and the repository `README.md`'s
required "Tension Decisions" section.

## User stories

- As a visitor, I want to see 15 assets' USD/BTC rates at a glance, so I can scan the market
  without navigating anywhere.
- As a visitor, I want to filter by name or symbol, so I can find one asset quickly.
- As a visitor, I want to sort by name, price, or session change, so I can rank the list to my
  current question.
- As a visitor, I want to pin favourites and drag the list into my own order, so the dashboard
  matches how I think about my portfolio, and have that persist across visits.
- As a visitor, I want to know exactly how fresh the numbers are, so I never mistake a stale
  price for a live one.
- As a visitor with multiple tabs open, I want all tabs to feel live without the app blowing
  through Coinbase's rate limit, so the app keeps working no matter how many tabs I have open.
- As a visitor on a slow or dead connection, I want the dashboard to keep showing me the last
  good numbers (clearly aged) instead of an error page, so the app never feels broken.

## Functional requirements

- FR-1 — Render exactly the 15 curated assets from `currencies.ts` (symbol, display name, USD
  rate, BTC cross-rate).
- FR-2 — Fetch `GET https://api.coinbase.com/v2/exchange-rates?currency=USD` with a 7s
  `AbortController` timeout; `usd = 1 / rates[sym]`, `btc = rates.BTC / rates[sym]`; the BTC
  row/card's own BTC column always shows `—`.
- FR-3 — Filter by case-insensitive substring match on symbol or display name; show a match
  counter (`n/15`) only while filtering; show an empty state when zero assets match.
- FR-4 — Sort modes: My order (custom/drag order, default) · Name (A→Z) · Price (USD desc) ·
  Change (session Δ desc). Pinned assets always sort to the top, ordered among themselves by the
  same active comparator; unpinned assets follow, also ordered by the active comparator.
- FR-5 — Drag-and-drop (native HTML5 DnD) and keyboard reorder (`ArrowUp`/`ArrowDown` on the
  drag handle) share one pure `reorder()` function. Both are enabled only under the "custom"
  sort and disabled under Name/Price/Change.
- FR-6 — Reordering always operates on the MASTER order, never the filtered/visible slice: the
  dragged/moved symbol is removed and reinserted immediately adjacent to the drop target (after
  it when moving down, before it when moving up); symbols hidden by the active filter are never
  moved.
- FR-7 — Pin/unpin toggles membership in a persisted favourites array; the toggle is reflected
  immediately and survives reload.
- FR-8 — All order/favourites/cache/lease/budget state persists to `localStorage` under
  versioned keys `nocturne.rates.{cache,order,favs,lease,budget}.v1`, each read through a
  validating helper that falls back to a default instead of throwing on missing, corrupt, or
  version-mismatched data; unknown symbols are dropped from `order`/`favs`, missing valid
  symbols are appended.
- FR-9 — A shared leaky-bucket budget (capacity 10, continuous refill over a 60,000ms window,
  i.e. 1 token per 6,000ms) is spent by both the leader's 8s auto-poll and any tab's manual
  refresh click. When the bucket is empty, Refresh is disabled and its label reads `Wait Ns`.
- FR-10 — A single-poller lease (`LEASE_TTL = 2500ms`) elects exactly one tab to poll Coinbase;
  every other tab adopts the leader's fetched cache for free via the native `storage` event and
  never calls `fetchRates` itself.
- FR-11 — Staleness tiers from `fetchedAt`: `live` (≤12,000ms) · `stale` (≤120,000ms, values
  still shown at full opacity, no banner) · `expired` (>120,000ms, values dimmed to
  `--color-neutral-500`, banner shown) · `none` (no cache yet, cold-start copy). The tier is
  always visible (dot + label), never an error page.
- FR-12 — The server renders full cold-start chrome (header, toolbar, all 15 rows/cards with
  `—` placeholders) with zero network calls and zero `localStorage` reads, sourced only from
  `currencies.ts`; the client's first render before the mount task's fetch resolves matches this
  exactly (no hydration flash).
- FR-13 — Session-scoped Δ (percent change from the first sample recorded this session to the
  latest) and up to 48 USD samples per symbol (oldest dropped, FIFO) drive the sparkline; one 1s
  `now` tick drives every time-derived label app-wide (staleness label, auto-refresh countdown,
  budget refill countdown).
- FR-14 — USD/BTC/Δ values render using the exact formatting tiers below (see AC-46..AC-58).
- FR-15 — Every interactive control is keyboard-operable, carries an accessible name, and shows
  a 2px accent `:focus-visible` ring with 2px offset; the staleness label carries
  `aria-live="polite"`.
- FR-16 — The repository `README.md` contains a "Tension Decisions" section covering T1–T5,
  all five marked implemented, content adapted from `designs/README.md`. *(Amended 2026-08-21;
  originally T2/T3 were decided-only.)*
- FR-17 — *(T2 amendment, ADR 0006)* A persisted Curated 15 / All scope toggle; "All" renders
  every symbol from the already-fetched response (symbol-as-name for uncurated, fiat included,
  zero extra requests) in a windowed, fixed-row-height table (cards disabled), with
  index-driven filtering over the full universe; history/Δ tracked only for curated ∪ pinned;
  reorder bounded to curated ∪ pinned.
- FR-18 — *(T3 amendment, ADR 0007)* Order durability via a versioned
  `{ schemaVersion: 2, updatedAt, order }` record under `nocturne.rates.order.v2` (v1 migrated,
  kept for rollback), written through an injectable `LocksPort` (`navigator.locks` in
  production, safe fallback without), adopted cross-tab by strictly-newer `updatedAt` with ties
  favoring the stored value; gestures stay optimistic.

## Acceptance criteria (Given/When/Then)

Test-layer tags: **(unit)** — pure module, injected `KVStore`/clock, no DOM; **(router)** —
`router.fetch(new Request(...))`; **(component)** — `remix/ui/test`'s `render(...)` mounting
`RatesDashboard` with fake `kv`/`clock`/`fetchImpl` props. Per ADR 0004/0005, no real-browser
E2E layer exists in this pass — see Out of scope.

**Data mapping & fetch failure (`coinbase.ts`)**

1. **AC-1 (unit)** — Given a Coinbase response `{ data: { currency: "USD", rates: { BTC:
   "0.00002000", ETH: "0.00035000" } } }` and clock at `T0`, when `fetchRates()` maps it, then
   `rates.ETH.usd === 1 / 0.00035` and `rates.ETH.btc === 0.00002 / 0.00035`, and
   `fetchedAt === T0`.
2. **AC-2 (unit)** — Given a fetch whose underlying request does not settle before 7,000ms,
   when `fetchRates(signal)` is driven with a fake timer past 7,000ms, then the request is
   aborted and the returned promise rejects (the caller treats this as one failed attempt, not a
   thrown/uncaught error).
3. **AC-3 (unit)** — Given the Coinbase endpoint responds with a non-2xx status, when
   `fetchRates()` runs, then the returned promise rejects and no partial/malformed `rates`
   object is returned.
4. **AC-4 (unit)** — Given the Coinbase endpoint responds with malformed JSON (not matching
   `CoinbaseRatesResponse`), when `fetchRates()` runs, then the returned promise rejects rather
   than returning `NaN`/`undefined` rate values.

**Budget (`budget.ts`)**

5. **AC-5 (unit)** — Given a fresh `BudgetState { tokens: 10, ts: T0 }` and clock held at `T0`,
   when `trySpend(T0)` is called 10 times in sequence, then all 10 calls return `true`, and an
   11th call at `T0` returns `false`.
6. **AC-6 (unit)** — Given `{ tokens: 0, ts: T0 }`, when `trySpend` is called at `T0 + 5999`,
   then it returns `false`; when instead called at `T0 + 6000`, then it returns `true` (1 token
   accrued at the 1-per-6,000ms refill rate).
7. **AC-7 (unit)** — Given two `BudgetStore` instances (simulating tab A and tab B) share one
   `KVStore` test double whose `getItem` returns a fixed pre-write snapshot `{ tokens: 1,
   ts: T0 }` to both callers (simulating a same-instant concurrent read before either writes),
   when both instances call `trySpend(T0)`, then both return `true` — documenting the accepted
   T1 overdraw race (last write wins; the bucket can be spent twice for one accrued token).

**Budget — dashboard wiring (component)**

8. **AC-8 (component)** — Given `BudgetState.tokens === 7`, when `RatesDashboard` renders the
   budget strip, then it shows 7 filled pips and 3 empty pips and the text `7/10 left this
   minute`.
9. **AC-9 (component)** — Given `BudgetState.tokens === 0` at `ts === now`, when the Refresh
   button renders, then it is disabled and its label reads `Wait 6s`.
10. **AC-10 (component)** — Given a fetch is currently pending (`fetchImpl`'s promise
    unresolved), when the user clicks Refresh again, then `fetchImpl` is not called a second
    time and the button is disabled.
11. **AC-11 (component)** — Given tokens are available and no fetch is in flight, when the user
    clicks Refresh, then `fetchImpl` is called exactly once and the budget's tokens decrement by
    1 on success.
12. **AC-12 (component)** — Given this tab does not hold the poll lease, when 8,000ms of
    injected clock time elapse, then `fetchImpl` is never called by this tab (no budget spend
    from a non-leader's auto-poll).
13. **AC-13 (component)** — Given the "Auto · 8s" checkbox is unchecked, when 8,000ms elapse
    while this tab holds the lease and has budget, then no auto-poll fetch occurs and the label
    reads `off`; given it is checked, the label shows a live countdown of whole seconds to the
    next poll.

**Lease (`lease.ts`)**

14. **AC-14 (unit)** — Given no lease record exists, when tab `"A"` calls `isLeader(now, "A")`,
    then it returns `true`.
15. **AC-15 (unit)** — Given tab `"A"` holds the lease with `heartbeat(T0, "A")`, when tab
    `"B"` calls `isLeader(T0 + 1000, "B")`, then it returns `false`.
16. **AC-16 (unit)** — Given tab `"A"`'s last heartbeat was at `T0` and no further heartbeat is
    sent, when tab `"B"` calls `isLeader(T0 + 2600, "B")` (past `LEASE_TTL = 2500ms`), then it
    returns `true`.
17. **AC-17 (unit)** — Given tab `"A"` already holds the lease, when `"A"` calls
    `isLeader(now, "A")` again immediately after its own heartbeat, then it returns `true`
    regardless of elapsed time since that heartbeat.
18. **AC-18 (unit)** — Given tab `"A"` holds the lease and calls `release("A")`, when tab `"B"`
    then calls `isLeader(now, "B")`, then it returns `true`.

**Cross-tab adoption (component)**

19. **AC-19 (component)** — Given a non-leader `RatesDashboard` instance is mounted, when a
    `storage` event fires on key `nocturne.rates.cache.v1` with a new `{ rates, fetchedAt,
    history }` value (simulating the leader tab's write), then the instance updates its
    displayed rates and `fetchedAt` from the event without ever calling `fetchImpl`.

**Staleness tiers (`cache.ts`)**

20. **AC-20 (unit)** — Given `fetchedAt = now - 12000`, `staleness(fetchedAt, now) === "live"`.
21. **AC-21 (unit)** — Given `fetchedAt = now - 12001`, `staleness(fetchedAt, now) === "stale"`.
22. **AC-22 (unit)** — Given `fetchedAt = now - 120000`, `staleness(fetchedAt, now) === "stale"`.
23. **AC-23 (unit)** — Given `fetchedAt = now - 120001`,
    `staleness(fetchedAt, now) === "expired"`.
24. **AC-24 (unit)** — Given `fetchedAt = null`, `staleness(fetchedAt, now) === "none"`.

**Staleness & cold start — rendering (component)**

25. **AC-25 (component)** — Given no cache exists in `kv` (first-ever visit) at mount, then
    every one of the 15 rows/cards renders `—` in every numeric cell, the status label reads
    `Fetching first rates…` with a neutral dot, and this is true synchronously on mount, before
    `fetchImpl`'s promise resolves.
26. **AC-26 (component)** — Given cached data with `staleness === "live"`, when rendered, then
    the status dot/label reflect "live" and no banner is shown.
27. **AC-27 (component)** — Given cached data with `staleness === "stale"`, when rendered, then
    the status dot/label reflect "stale" (amber), all numeric values render at full opacity
    (not dimmed), and no banner is shown.
28. **AC-28 (component)** — Given cached data with `staleness === "expired"`, when rendered,
    then numeric values render dimmed (`--color-neutral-500`), the status dot/label reflect
    "expired" (red), and the banner is shown.
29. **AC-29 (component)** — Given no cache exists and the first fetch attempt fails
    (`fetchImpl` rejects), when rendered, then an explicit "no cached rates on this device yet…
    retrying every 8s" message and the banner are shown — never a blank page or a thrown error
    boundary.

**Filter**

30. **AC-30 (component)** — Given filter text `"eth"`, when applied, then only assets whose
    symbol or display name contains `"eth"` case-insensitively remain visible, and the match
    counter reads `{n}/15`.
31. **AC-31 (component)** — Given filter text `"xyz"` matching zero assets, when applied, then
    zero cards/rows render and the empty state text `Nothing matches "xyz".` is shown.
32. **AC-32 (component)** — Given the filter input is empty, when rendered, then all 15 assets
    are visible and no match counter is shown.

**Sort & pin precedence (`sort.ts`)**

33. **AC-33 (unit)** — Given `sortSymbols("name", symbols, [], rates, deltas)`, then the result
    is every symbol's display name in ascending alphabetical order.
34. **AC-34 (unit)** — Given `sortSymbols("usd", symbols, [], rates, deltas)`, then the result
    is descending by `rates[sym].usd`.
35. **AC-35 (unit)** — Given `sortSymbols("delta", symbols, [], rates, deltas)`, then the
    result is descending by `deltas[sym]`.
36. **AC-36 (unit)** — Given `sortSymbols("custom", ["BTC","ETH","SOL","ADA"], [], rates,
    deltas)`, then the result equals `["BTC","ETH","SOL","ADA"]` unchanged (master order
    passthrough).
37. **AC-37 (unit)** — Given symbols `["BTC","ETH","SOL","ADA"]`, `favs = ["SOL","ADA"]`, mode
    `"name"` (alphabetical name order absent pinning would be `["ADA","BTC","ETH","SOL"]`), then
    `sortSymbols` returns `["ADA","SOL","BTC","ETH"]` — the pinned pair first, ordered
    alphabetically among themselves, followed by the unpinned pair, also ordered
    alphabetically.
38. **AC-38 (unit)** — Given master order `["BTC","ETH","SOL","ADA"]`, `favs = ["SOL"]`, mode
    `"custom"`, then `sortSymbols` returns `["SOL","BTC","ETH","ADA"]` — the pinned symbol
    first, the rest in master order.

**Drag enablement under sort mode (component)**

39. **AC-39 (component)** — Given the active sort is `"name"`, `"usd"`, or `"delta"`, when a
    card/row renders, then its drag handle is not draggable (`draggable="false"` /
    `cursor: default`) and `ArrowUp`/`ArrowDown` on the handle is a no-op.
40. **AC-40 (component)** — Given the active sort is `"custom"`, when a card/row renders, then
    its drag handle is draggable (`draggable="true"` / `cursor: grab`).

**Reorder — pure master-order semantics (`order.ts`)**

41. **AC-41 (unit)** — Given `order = ["A","B","C","D"]`, `reorder(order, "A", "C", "after")`
    returns `["B","C","A","D"]`.
42. **AC-42 (unit)** — Given `order = ["A","B","C","D"]`, `reorder(order, "D", "B", "before")`
    returns `["A","D","B","C"]`.
43. **AC-43 (unit)** — Given `order = ["A","B","C"]`, `reorder(order, "A", "A", "after")`
    (dropped on itself) returns `["A","B","C"]` unchanged.

**Reorder while filtered — T5 (component)**

44. **AC-44 (component)** — Given master order `["A","B","C","D"]` and a filter that shows only
    `["A","C"]`, when the user drags `A` and drops it after `C` in the filtered view, then the
    resulting persisted master order is `["B","C","A","D"]` (hidden symbols `B` and `D` keep the
    visible neighbour they sat behind), and clearing the filter afterward shows exactly that
    order — never a redistribution of hidden items.

**Keyboard reorder path (component)**

45. **AC-45 (component)** — Given sort is `"custom"` and keyboard focus is on symbol `X`'s drag
    handle (not first in master order), when the user presses `ArrowUp`, then `reorder()` is
    invoked moving `X` one position earlier in master order, the new order persists to
    `nocturne.rates.order.v2` *(originally v1; superseded by the T3 amendment, AC-92..96)*,
    and an `aria-live="polite"` region announces the move.
46. **AC-46 (component)** — Given sort is `"custom"` and focus is on the first symbol's drag
    handle, when the user presses `ArrowUp`, then the master order is unchanged and no reorder
    write occurs.

**Pin/unpin (component)**

47. **AC-47 (component)** — Given symbol `X` is unpinned, when the user clicks its pin button,
    then `favs` gains `X`, `nocturne.rates.favs.v1` is written, and the pin button switches to
    its pinned (accent) visual state; clicking it again removes `X` from `favs` and the button
    reverts.

**Persistence round-trip & corrupt-value fallback (`persisted.ts`)**

48. **AC-48 (unit)** — Given `writeJSON(kv, key, value)` followed by `readJSON(kv, key,
    fallback)`, then the read result deep-equals `value`.
49. **AC-49 (unit)** — Given `kv.getItem(key)` returns malformed JSON (e.g. `"{not json"`), when
    `readJSON(kv, key, fallback)` is called, then it returns `fallback` and does not throw.
50. **AC-50 (unit)** — Given `kv.getItem(key)` returns valid JSON that fails the supplied
    `validate` predicate (e.g. a stale schema version), when `readJSON` is called, then it
    returns `fallback`.
51. **AC-51 (unit)** — Given a persisted `order` value containing one symbol not present in the
    current `SYMBOLS` list and missing one symbol that is present, when the order is read at
    startup, then the effective order drops the unknown symbol and appends the missing valid
    symbol (rather than throwing or losing the rest of the order).

**Formatting — USD (`format.ts`)**

52. **AC-52 (unit)** — Given `usd = 118432.10`, `formatUsd(usd) === "$118,432"` (≥1000, 0dp,
    thousands-grouped).
53. **AC-53 (unit)** — Given `usd = 1000`, `formatUsd(usd) === "$1,000"` (tier boundary,
    inclusive of the ≥1000 tier).
54. **AC-54 (unit)** — Given `usd = 234.56`, `formatUsd(usd) === "$234.56"` (≥1 and <1000,
    2dp).
55. **AC-55 (unit)** — Given `usd = 1`, `formatUsd(usd) === "$1.00"` (tier boundary, inclusive
    of the ≥1 tier).
56. **AC-56 (unit)** — Given `usd = 0.4231`, `formatUsd(usd) === "$0.4231"` (<1, 4dp).

**Formatting — BTC (`format.ts`)**

57. **AC-57 (unit)** — Given `btc = 1.5`, `formatBtc(btc) === "1.5000 ₿"` (≥1, fixed 4dp).
58. **AC-58 (unit)** — Given `btc = 0.0234`, `formatBtc(btc) === "0.0234 ₿"` (<1, computed at
    8dp then trailing zeros trimmed).
59. **AC-59 (unit)** — Given `btc = 0.00012345`, `formatBtc(btc) === "0.00012345 ₿"` (<1, 8dp,
    no trailing zero to trim).
60. **AC-60 (component)** — Given a row/card whose symbol is `"BTC"`, when rendered, then its
    own BTC column/field always shows `—`, regardless of the computed cross-rate value.

**Formatting — session Δ (`format.ts` + component)**

61. **AC-61 (unit)** — Given `delta = 1.2387` (percent), `formatDelta(delta) === "+1.24%"`.
62. **AC-62 (unit)** — Given `delta = -0.0512`, `formatDelta(delta) === "-0.05%"`.
63. **AC-63 (component)** — Given a symbol has no Δ yet this session (fewer than 2 samples),
    when rendered, then its Δ field shows `—`.
64. **AC-64 (component)** — Given a positive Δ vs. a negative Δ, when rendered, then the
    positive value's text uses the `--color-accent-400` token and the negative value's text
    uses the negative/error token (`#d98484`); a `—` Δ uses `--color-neutral-700`.

**History & session Δ derivation (component)**

65. **AC-65 (component)** — Given 50 sequential successful fetches for a symbol with
    increasing USD values, when the 50th fetch completes, then `history[symbol].length === 48`
    (oldest samples dropped, FIFO) and the sparkline/Δ derive from the most recent 48 samples.
66. **AC-66 (component)** — Given the first fetch this session recorded `usd = 100` for a
    symbol and a later fetch records `usd = 110`, when Δ is rendered for that symbol, then it
    reads `+10.00%`.

**Single `now` tick (component)**

67. **AC-67 (component)** — Given the injected clock advances by exactly 1,000ms, when the
    single interval tick fires, then the staleness label, the auto-refresh countdown, and the
    budget `+1 in Ns` countdown all update together in the same render pass (no independent
    second timer is required to update any one of them).

**Cold start / "no error page, ever" (router)**

68. **AC-68 (router)** — Given `router.fetch(new Request('http://localhost' +
    routes.home.href()))` on a server with no prior state, then the response status is `200`
    and the body contains `Coinbase · 15 assets`, all 15 curated symbols each paired with a `—`
    placeholder, an `aria-live` region for the staleness label, and none of the strings
    `"Error"`, `"Something went wrong"`, or a stack trace fragment.
69. **AC-69 (router)** — Given a global `fetch` stub configured to throw if invoked, when the
    same `router.fetch` request is made, then the response is still `200` with the AC-68 body
    contents and the stub records zero calls — operationalizing "zero network calls on first
    paint."

**SSR/hydration match (component)**

70. **AC-70 (component)** — Given `RatesDashboard` is mounted via `remix/ui/test`'s
    `render(...)` with an empty `kv` (no cache) and default (unresolved) `fetchImpl`, then its
    synchronous first-render output (before the mount `queueTask` resolves) matches the cold-start
    markup asserted in AC-68/AC-25 exactly — no hydration flash.

**Accessibility (component)**

71. **AC-71 (component)** — Given any interactive control (filter input, each segmented sort
    button, Refresh, the Auto checkbox, each pin button, each drag handle), when it receives
    keyboard focus, then it exposes a 2px accent focus-visible ring with a 2px offset (class or
    computed style assertion).
72. **AC-72 (component)** — Given the staleness label element, when inspected at mount and
    after any state update, then it always carries `aria-live="polite"`.
73. **AC-73 (component)** — Given the filter input, each pin button, and each drag handle, when
    inspected, then each exposes an accessible name (e.g. the pin button's accessible name
    reflects pinned/unpinned state such as `Pin {name}` / `Unpin {name}`; the drag handle's
    reflects the symbol it reorders).

**README Tension Decisions section (unit — file content check)**

74. **AC-74 (unit)** — Given the repository's `README.md`, when read from disk, then it
    contains a `## Tension Decisions` heading (or equivalent) with five subsections identifiable
    as T1, T2, T3, T4, and T5.
75. **AC-75 (unit)** — Given the same `README.md`, then all five subsections T1–T5 are marked
    as implemented (e.g. an "IMPLEMENTED" marker). *(Amended 2026-08-21 with the T2/T3
    implementation, AC-83..96: originally required T2/T3 to be marked decided-only.)*

## Edge cases & error handling

- Empty/whitespace-only filter input behaves identically to no filter (AC-32).
- A symbol present in `SYMBOLS` but absent from a given Coinbase response's `rates` map renders
  `—` in that symbol's cells rather than crashing (`currencies.ts`/`format.ts` never assume every
  symbol resolves — see Open questions).
- `localStorage` throwing (e.g. private-browsing quota) on `getItem`/`setItem` is caught by
  `persisted.ts` and treated as if the key were absent — never an uncaught exception.
- A `storage` event for an unrelated key, or with `newValue === null` (key removed), is ignored
  by the dashboard's listener rather than clearing in-memory state.
- Rapid double-click on Refresh is covered by AC-10 (in-flight guard); rapid double-click after
  the budget hits zero is covered by AC-9 (disabled state, no queued retry).
- Two tabs reordering at the same instant settle last-write-wins (documented T3 trade-off, not
  tested beyond AC-48–AC-51's generic persistence contract — see ADR's T3 note).
- BTC's own row never divides by zero visibly to the user (AC-60 forces `—` regardless of the
  computed value, sidestepping a `rates.BTC / rates.BTC` display concern).

## Non-functional requirements

- **Performance/budget:** ≤10 Coinbase requests/minute app-wide, verified structurally by
  AC-5–AC-13 (no AC exercises real network timing beyond the 7s abort in AC-2).
- **Availability/resilience:** no render path may produce a blank page or an uncaught exception
  (AC-25, AC-29, AC-68, AC-69); every degraded state has explicit copy.
- **Accessibility:** AC-39/40 (drag), AC-45/46 (keyboard reorder), AC-71–AC-73 (focus ring,
  aria-live, accessible names).
- **Observability:** none specified beyond the staleness tier itself being the user-facing
  signal of feed health; no server-side logging/metrics are in scope for a client-only feature.
- **Security:** no secrets, no auth, no user data beyond browser-local preferences; Coinbase is a
  public, unauthenticated endpoint.

## Out of scope

- ~~**T2 — virtualization for 500+ assets.**~~ *In scope since the 2026-08-21 T2/T3 amendment
  (AC-83..91, ADR 0006): Curated/All scope toggle, windowed table rendering, bounded history.*
- ~~**T3 — locks/versioned order records.**~~ *In scope since the same amendment (AC-92..96,
  ADR 0007): `order.v2` versioned record, injectable `LocksPort`, LWW adoption.*
- **Full-list reordering.** Reorder (drag/keyboard) remains bounded to curated ∪ pinned
  symbols; arbitrary reordering of the 500+ uncurated tail is not supported (pin a symbol to
  make it reorderable).
- **Display-name metadata for uncurated symbols.** Symbol-as-name fallback per ADR 0006; no
  names endpoint is called (would spend T1 budget) and no hand-maintained name map is kept.
- **Cross-device order/favourites sync.** Explicitly out of scope; `localStorage` is
  per-browser-profile by design.
- **Real multi-browser-tab E2E.** Per ADR 0004, cross-tab races (lease, budget, cache adoption)
  are covered only by unit/component tests with injected storage and clock (AC-7, AC-14–AC-19),
  not by two real `window` objects or a Playwright-style runner. *(Amended 2026-08-21: AC-100
  is now the spec's single (E2E) criterion — single-tab reload/hydration only; multi-tab E2E
  remains out of scope.)*
- **Third-party icon/coin-logo assets.** Coin badges are the first three letters of the symbol
  on an accent-900 disc; no external image assets are fetched or tested.

## Definition of Done

- [ ] Every AC-1..AC-103 (including all Amendments) maps to at least one passing test at its
      tagged layer (unit / router / component / E2E).
- [ ] AC-100 is this spec's single (E2E) criterion (added 2026-08-21 for the hydration/reload
      defect class); all other real-browser coverage remains component-level.
- [ ] `npm test` passes with zero failing/skipped tests among the above.
- [ ] `npm run typecheck` passes with no new errors.
- [ ] `README.md` contains the "Tension Decisions" section per AC-74/AC-75 (checked by its own
      test, not just manual review).
- [ ] No new `denyFiles`/`allowFiles` violations in `app/assets.ts` (all rates logic stays under
      `app/actions/public/rates/`, all `*.test.*` files stay excluded from the browser bundle).

## Open questions

- **Coinbase symbol availability:** the exact 15 curated symbols' availability in
  `GET /v2/exchange-rates?currency=USD` is to be confirmed at implementation time; if a symbol
  from the prototype's list is absent from a live response, substitute it per the prototype's
  fallback list rather than crash (already covered structurally by the Edge cases entry above;
  the specific replacement symbol, if any, is not decided by this spec).

All other risks flagged in the design brief (unit-level cross-tab simulation sufficiency, no
cross-device sync) are settled decisions, not open questions, and are reflected directly in the
Out of scope section above.

## Amendments

76. **AC-76 (unit)** — Given the Coinbase response's own `BTC` rate is missing, zero, or
    negative, when `fetchRates()` maps the response, then every symbol's `btc` value is invalid
    (non-finite, rendering `—` via `format.ts`'s finiteness check) rather than a divide-by-zero
    or sign-flipped number, `usd` values are unaffected, and nothing throws.

**View toggle: cards ⇄ table (user-requested scope addition, 2026-08-21).** The brief requires
a card-based layout (the shipped default); `designs/README.md` specifies the dense table
anatomy (header row + columnar grid). A toolbar view toggle reconciles both. Table-view
*geometry* (column template `26px | minmax(150px,1.5fr) | minmax(96px,1fr) | minmax(96px,1fr)
| 92px | 74px | 30px`, fading hairline under the header, row anatomy) is validated by visual
QA per CONV-testing-4, not by component assertions.

77. **AC-77 (component)** — Given a first visit (no persisted view value in `kv`), when the
    dashboard renders, then the toolbar exposes a two-option view toggle (Cards · Table) with
    an accessible name per option, and the card layout is active by default.
78. **AC-78 (component)** — Given the user selects Table, when the list re-renders, then a
    header row with the uppercase column labels Asset · USD · BTC · Session Δ · Trend is
    present, each asset renders as one row (container marked `data-view="table"`), and every
    row still carries the established `data-testid`/`data-*` contract (`asset-card`,
    `usd-value`, pin, handle, …).
79. **AC-79 (component)** — Given a view choice, when it is made, then it persists to
    `nocturne.rates.view.v1` through the validating helper; a corrupt or unknown persisted
    value falls back to cards without throwing.
80. **AC-80 (component)** — Given table view with sort `"custom"`, when the user pins via the
    row's pin button, drags a row onto another, or uses `ArrowUp`/`ArrowDown` on a row's
    handle, then pin/reorder behavior is identical to cards view (same master-order semantics,
    same persistence writes).
81. **AC-81 (component)** — Given table view and filter text, when applied, then row
    visibility, the match counter, and the empty state behave exactly as in cards view
    (AC-30..32).
82. **AC-82 (component)** — Given any combination of filter text, sort mode, pins, and a
    custom order, when the user switches view in either direction, then all of that state is
    preserved unchanged (no resets, no persistence writes other than the view key).

**T2 + T3 implementation (user-requested scope addition, 2026-08-21; ADR 0006 + ADR 0007).**
Scope semantics: "Curated 15" (default) shows `currencies.ts`'s list; "All" shows every symbol
in the already-fetched Coinbase response (zero extra requests — T1 untouched), uncurated
symbols display symbol-as-name, fiat included. "All" forces and locks table view (cards cannot
window a reflowing grid). Under "My order" in All scope: pinned symbols first (master-order
among themselves), then remaining curated in master order, then uncurated alphabetically by
symbol. Pin is available on every row; pinned symbols join the reorderable + history-tracked
set (`tracked = curated ∪ favs`). Drag/keyboard handles exist only on curated or pinned rows.
Windowed-scroll *smoothness* and drag edge auto-scroll are validated by visual QA per
CONV-testing-4.

83. **AC-83 (unit)** — Given `computeWindow({ rowHeight: H, viewportHeight: V, scrollTop: S,
    total: N, overscan: O })`, then it returns `start = max(0, floor(S/H) − O)`,
    `end = min(N, ceil((S+V)/H) + O)`, `topPad = start·H`, `bottomPad = (N − end)·H` — verified
    with concrete values (e.g. H=38, V=600, S=1900, N=300, O=5).
84. **AC-84 (unit)** — Given boundary inputs, `computeWindow` clamps: `S = 0` → `start = 0`,
    `topPad = 0`; `S` at maximum scroll → `end = N`, `bottomPad = 0`; `N·H ≤ V` → the full
    range renders with both pads `0`; `N = 0` → empty range, both pads `0`, nothing throws.
85. **AC-85 (component)** — Given a first visit, then the toolbar exposes a scope toggle
    (Curated 15 · All) with accessible names, curated active by default; a choice persists to
    `nocturne.rates.scope.v1` via the validating helper, and a corrupt/unknown persisted value
    falls back to curated without throwing.
86. **AC-86 (component)** — Given a fetched response containing 300 symbols and scope All,
    then the list's total (spacer-inclusive) row count reflects all 300, the filter match
    counter's denominator becomes the full count, and an uncurated row renders its symbol as
    its display name with Δ `—` (untracked ⇒ no history).
87. **AC-87 (component)** — Given scope All is selected, then `data-view="table"` is forced
    and the Cards view option is disabled; when scope returns to Curated, the previously
    persisted view choice is restored and Cards re-enables.
88. **AC-88 (component)** — Given 300 symbols in All scope inside a fixed-height scroll
    viewport, then the number of rendered asset rows in the DOM is at most 40 (window +
    overscan), top/bottom spacer heights preserve the full scroll extent, and after
    programmatically scrolling the container the rendered slice's first visible symbol
    advances accordingly.
89. **AC-89 (component)** — Given All scope and filter text, then matches come from the FULL
    symbol list via the prebuilt lowercase index (a query matching only an uncurated symbol
    finds it), the empty state renders for zero matches, and clearing the filter restores the
    windowed full list.
90. **AC-90 (component)** — Given All scope, then drag handles and `ArrowUp`/`ArrowDown`
    reordering exist only on curated or pinned rows (uncurated rows expose no draggable
    handle); pinning an uncurated symbol makes its row reorderable; curated-scope reorder
    semantics (AC-41..46) are unchanged.
91. **AC-91 (unit)** — Given `appendHistory(history, rates, trackedSymbols)`, then samples are
    recorded only for symbols in `trackedSymbols` (48-FIFO behavior for tracked symbols
    unchanged), untracked symbols gain no entries, and previously-tracked symbols' existing
    entries are preserved untouched when they leave the tracked set.
92. **AC-92 (unit)** — Given only legacy `nocturne.rates.order.v1` (bare `string[]`) exists,
    when the order store reads, then it returns the validated order, writes a
    `nocturne.rates.order.v2` record `{ schemaVersion: 2, updatedAt: clock(), order }`, and
    leaves `order.v1` intact (rollback safety).
93. **AC-93 (unit)** — Given an injected `LocksPort` fake that serializes callers, when two
    concurrent `writeOrder` calls race, then both run inside the lock, the final stored v2
    record equals the later writer's order with the later `updatedAt`, and the record is never
    torn/merged.
94. **AC-94 (unit)** — Given a local v2 record with `updatedAt = T1`, when an incoming record
    arrives (storage event) with `updatedAt > T1`, then it is adopted; with `updatedAt ≤ T1`
    (equal or older), the local record is kept (ties favor the stored value).
95. **AC-95 (unit)** — Given no `LocksPort` is available (SSR/unsupported browser), then
    `writeOrder` still persists correctly without throwing; given a corrupt v2 record on read,
    then the store falls back to v1 migration or the default order without throwing.
96. **AC-96 (component)** — Given a reorder gesture, then the DOM order updates in the same
    interaction (optimistic) and the v2 record is written with only the order key touched;
    given a `storage` event delivering a newer v2 record from another tab, then the displayed
    order updates to it without any fetch.

**Hardening amendments (code-review findings on the T2/T3 implementation, 2026-08-21).**

97. **AC-97 (component)** — Given All scope with the table viewport scrolled deep (large
    `scrollTop`), when the visible item count shrinks for a non-scroll reason — typing a filter
    that matches only a few rows, or switching scope — then the matching rows render
    immediately in that same update (the window is clamped/recomputed against the new item
    count); a false-empty list state must never appear while matches exist, and no native
    `scroll` event is required to correct it.
98. **AC-98 (unit)** — Given `writeOrder` is called while the stored v2 record is strictly
    fresher than the candidate, then it reports non-committed (and reports committed in the
    normal case); **(component)** given a stored v2 record fresher than anything the tab's
    clock can produce, when the user reorders, then after the rejected write the displayed
    order resyncs to the stored (durable) record rather than silently keeping the divergent
    optimistic order.

**Hardening amendments (visual-QA findings on the T2/T3 implementation, 2026-08-21).** These
introduce this spec's first **(E2E)** test (AC-100): the reload/hydration defect class is
invisible to client-only component mounts, and `remix test` natively serves `*.test.e2e.*`
files through Playwright — the Out of scope "no E2E" entry is amended accordingly.

99. **AC-99 (component)** — Given an All-scope row whose symbol is neither curated nor pinned
    (no drag handle), when it renders in table view, then every cell occupies its correct grid
    column — the handle slot renders an empty placeholder (not a missing child), so
    badge/name, USD, BTC, Δ, trend, and pin cells never shift columns relative to a
    handle-bearing row.
100. **AC-100 (E2E)** — Given a served page whose browser has persisted `scope = "all"` and
    `view = "table"` (set via `localStorage` in a real browser context), when the page is
    loaded/reloaded, then after hydration the dashboard shows the persisted All/table state,
    the DOM contains exactly one rendered dashboard tree (no duplicate/ghost row fragments),
    and the console records no framework hydration-mismatch errors.
101. **AC-101 (component)** — Given an uncurated symbol pinned while in All scope, when the
    user switches to Curated scope, then exactly the 15 `currencies.ts` symbols render (the
    pinned uncurated symbol does not leak in), and returning to All scope still shows it
    pinned.
102. **AC-102 (component)** — Given a drag in the windowed All-scope table where edge
    auto-scroll has engaged and the dragged row's node has scrolled out of the rendered
    window (unmounted), when the drag ends without a valid drop (dragend/cancel outside any
    row), then auto-scroll stops, drag state resets (no row remains dimmed at reduced
    opacity), and the next interaction behaves normally — cleanup listeners must live on an
    always-mounted ancestor, not only on the dragged row's own node.
103. **AC-103 (component)** — Given All scope forces table view, then the disabled Cards
    option is visibly distinct from an enabled inactive segmented button (the segmented
    control's `:disabled` treatment matches the Refresh button's: reduced opacity,
    `not-allowed` cursor).

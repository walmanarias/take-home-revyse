# Handoff: Crypto Rates Dashboard (Remix + React + shadcn)

## Overview
A dense, dark dashboard — switchable card-grid or table view — listing 15 cryptocurrencies with live USD and BTC
exchange rates from Coinbase's public rates endpoint. Users can filter by name or symbol,
sort, pin favourites to the top, drag rows into a custom order that persists, and see
exactly how fresh the data is. It is built to stay useful when the feed is slow or down,
and to respect a hard 10-requests-per-minute API budget shared across browser tabs.

## About the Design Files
The files in \`design/\` are **design references created in HTML** — a working prototype of
the intended look and behaviour, not production code to copy. \`Crypto Dashboard.dc.html\`
is a single-file streaming component format (its own tiny runtime, \`support.js\`); the
markup uses inline styles and the design system's CSS classes.

**Your task:** recreate this design in a **Remix + React + TypeScript** app using **shadcn/ui**
and Tailwind, following the target repo's existing conventions. Read the prototype for exact
layout, copy, formatting and the resilience/budget logic — then implement it idiomatically:
typed modules, route loaders where appropriate, small components, no \`any\`.

## Fidelity
**High fidelity.** Colors, type, spacing, radii and copy are final and come from the Nocturne
design system (\`design/nocturne/styles.css\` + \`readme.md\` — both included). Reproduce the
visual result pixel-closely, but source values from tokens, not literals: port the \`:root\`
variables in \`nocturne/styles.css\` into your Tailwind theme / CSS variables and map shadcn's
\`background\`, \`foreground\`, \`card\`, \`primary\`, \`border\`, \`ring\`, \`muted\` to them.

Nocturne rules that must survive the port:
- Dark ground \`#161826\`, surface \`#232532\`, text \`#e9e9ed\`, single accent \`#9184d9\`.
- Buttons are **outlined**, never filled (shadcn \`variant="outline"\`; accent border for primary).
- Horizontal rules **fade to transparent over 48px at each end** (see \`.table\` and \`.hr\` in
  \`styles.css\` — implement as a \`linear-gradient\` background strip on the row, not a border).
- No pure black or white; keep chroma low outside the accent; elevation is a hairline edge plus
  ambient darkness (\`--shadow-sm/md/lg\`), never stacked shadows.
- Headings stay at weight 500. Inter for everything. Density is 0.70× — this UI is dense on purpose.
- Icons: Phosphor (\`@phosphor-icons/react\`). The prototype used two text glyphs as stand-ins:
  the drag handle (\`⠿\` → \`DotsSixVertical\`) and the pin (\`★\` → \`PushPin\` / \`PushPinSlash\`).

## Screens / Views

### 1. Dashboard (single route, \`/\`)
**Purpose:** scan rates, find an asset, arrange the list to taste, and judge whether the numbers
can be trusted right now.

**Layout** (top to bottom, all flush-left; page padding \`22px clamp(12px, 4vw, 48px) 64px\`):
1. **Header** — \`h4\` "Exchange Rates" (20px/500/-0.02em) with an uppercase 11px, 0.08em-tracked
   caption beside it: "Coinbase · 15 assets". Below, a 13px muted lede, max-width \`62ch\`:
   "Live USD and BTC rates. Cards stay usable when the feed slows or fails — last-known-good
   values remain, marked with their age."
2. **Toolbar** — one wrapping flex row, \`gap: 10px\`:
   - Filter input (\`.input\`, flex \`1 1 240px\`, max 340px), placeholder
     \`Filter by name or symbol — try "eth"\`, with a right-aligned 11px match counter (\`7/15\`)
     inside the field, shown only while filtering.
   - Segmented control (\`.seg\`), 4 exclusive options: **My order** (default) · Name · Price · Change.
   - **Refresh** button (outline). Disabled while a request is in flight *or* the budget is spent;
     when spent the label becomes \`Wait 4s\` and the tooltip explains why.
   - **Auto · 8s** checkbox — toggles auto-refresh; the label counts down to the next poll, or reads \`off\`.
   - Right-aligned status: a 7px dot with a matching \`0 0 8px\` glow plus a 12px label.
3. **Budget strip** — surface-filled bar (\`--color-surface\`, \`--radius-md\`, \`--shadow-sm\`,
   padding \`8px 12px\`): uppercase label "Request budget", ten 12×5px pips (radius 2px; filled
   \`--color-accent-500\`, empty \`--color-neutral-800\`), then \`7/10 left this minute · +1 in 4s\`,
   then the tab's role: "this tab polls for all tabs" / "another tab is polling — results arrive here free".
4. **Banner** (conditional) — accent-900 fill, \`--radius-md\`, 12px \`--color-accent-300\` text.
   Shown when data is expired or the feed is unreachable. Copy is in the prototype's \`bannerText\`.
5. **Filter notice** (conditional, while a filter hides rows) — 12px muted:
   "Filtered view — dragging reorders within what you see; the 8 hidden cards keep the neighbour they follow."
6. **The list**, in one of two views:
   - **Grid view (default)** — `display: grid; grid-template-columns: repeat(auto-fill, minmax(248px, 1fr)); gap: 11px; align-items: start`.
     Responsive by intrinsic sizing, no media queries: 4-5 columns on a wide desktop, 1 column on a phone.
   - **Table view** — a CSS grid (not a `<table>`, so rows can be drag targets) inside an
     `overflow-x: auto` wrapper around a `min-width: 660px` inner. Columns, identical on the header
     row and every data row:
     `26px | minmax(150px,1.5fr) | minmax(96px,1fr) | minmax(96px,1fr) | 92px | 74px | 30px`, `gap: 10px`.
     Header row: uppercase 11px/0.08em `--color-neutral-600` labels — (blank) · Asset · USD · BTC ·
     Session Δ · Trend · (blank) — with the fading 1px rule painted as its bottom background.
     Rows: `padding: 9px 4px`, `--radius-sm`, no surface fill, hover tint
     `color-mix(in srgb, var(--color-text) 5%, transparent)`; drag target fill
     `color-mix(in srgb, var(--color-accent) 12%, transparent)` + `inset 0 0 0 1px var(--color-accent-700)`.
     Same fields as the card, one line each: handle · badge(26px)+name+symbol · USD(14px) ·
     BTC(13px neutral-500) · Δ(13px) · 68×20 sparkline · pin.
7. **Empty state** — 13px muted: \`Nothing matches "xyz".\`
8. **Footnote** — 11px, \`line-height 1.7\`, \`--color-neutral-700\`, max \`78ch\`, explaining the
   shared budget, that Δ/trend are session-scoped, and that order persists locally.

### Card anatomy (grid view — the one component worth extracting)
`.card` surface (`--color-surface`, `--radius-md`, `--shadow-sm`), `padding: 12px 13px 11px`,
`cursor: grab` when draggable, 120ms ease transitions on background, opacity and box-shadow.
Three stacked zones:
- **Header row** (`margin-bottom: 12px`) — 30px circular badge (`--color-accent-900` fill,
  `inset 0 0 0 1px var(--color-accent-800)`, 10px/600 `--color-accent-300` text = first 3 letters of
  the symbol), then name (14px, heading font, weight 500, ellipsised) over symbol
  (11px `--color-neutral-600`, 0.06em tracking); right-aligned pin button (26px ghost icon, accent
  when pinned, `--color-neutral-700` when not) and drag handle (`⠿` → Phosphor `DotsSixVertical`,
  13px, 2px letter-spacing, `--color-neutral-700`, `user-select: none`).
- **Price row** — baseline-aligned pair: an uppercase 10px/0.1em "USD" caption over the price at
  22px heading font, weight 500, `-0.02em`, tabular-nums; and a right-aligned 68×22 sparkline
  (SVG polyline, `stroke-width 1.25`, non-scaling stroke, coloured like Δ; last 24 samples
  normalised into the box, flat at y=10 before there's data).
- **Footer row** — separated by a rule that **fades to transparent over 24px at each end** (a
  `linear-gradient` top background strip, not a border): BTC rate left (13px `--color-neutral-500`),
  session Δ right (13px, `+1.24%` accent-400 / negative `#d98484` / `—` neutral-700).
- **Number formats** — USD: `$118,432` (≥1000, 0 dp) / `$1,234.56` (≥1, 2 dp) / `$0.4231` (<1, 4-5 dp).
  BTC: `0.0234 ₿` (≥1 → 4 dp) else 8 dp with trailing zeros trimmed; BTC's own card shows `—`.
- **Drag feedback** — dragged card drops to `opacity: .35`; the hovered target fills
  `color-mix(in srgb, var(--color-accent) 12%, var(--color-surface))` with an
  `inset 0 0 0 1px var(--color-accent-700)` edge.

## Interactions & Behavior
- **Filter** — case-insensitive substring on symbol *or* name; instant, controlled input.
- **Sort** — "My order" = the user's drag order. Name (A→Z), Price (USD desc), Change (Δ desc).
  Pinned assets always sort to the top, keeping their relative order. Drag is **disabled** under the
  computed sorts (a computed order has no slots to drop into) — the card loses \`cursor: grab\`.
- **Drag & drop** — HTML5 DnD in the prototype; in the app prefer \`@dnd-kit/core\` +
  \`@dnd-kit/sortable\` (keyboard-accessible, which the prototype is not — please add that).
  Semantics: the dragged symbol is removed from the master order and re-inserted immediately
  after the drop target when moving down, immediately before it when moving up.
- **Pin/unpin** — toggles membership in the favourites array; persisted.
- **Auto-refresh** — 1s ticker drives the countdown, staleness label and budget refill display;
  a fetch fires when the poll period has elapsed *and* this tab holds the lease.
- **Loading** — first-ever visit shows the full chrome with \`—\` in every numeric cell and
  "Fetching first rates…" beside a neutral dot. Never a spinner-only page, never an error page.
- **Responsive** — toolbar and budget strip wrap; the card grid reflows from four columns to one; table view scrolls horizontally below 660px.
- **Focus** — 2px accent \`:focus-visible\` ring, 2px offset, on every control (shadcn's \`ring\` token).

## State Management
Client-side, in one hook (\`useRates\`) plus a small sortable-list hook. Nothing needs a server
loader except optionally the first paint (see Notes).

| State | Type | Notes |
| --- | --- | --- |
| \`order\` | \`string[]\` | master symbol order; persisted \`nocturne.rates.order.v1\` |
| \`favs\` | \`string[]\` | pinned symbols; persisted \`nocturne.rates.favs.v1\` |
| \`rates\` | \`Record<string, { usd: number; btc: number }> \| null\` | last-known-good |
| \`fetchedAt\` | \`number \| null\` | epoch ms of the newest good response |
| \`history\` | \`Record<string, number[]>\` | up to 48 USD samples per symbol, for Δ and sparkline |
| \`filter\` | \`string\` | |
| \`sort\` | \`"custom" \| "name" \| "usd" \| "delta"\` | |
| \`auto\` | \`boolean\` | |
| \`failures\` | \`number\` | consecutive failed attempts |
| \`now\` | \`number\` | 1s tick, drives all derived time labels |
| \`dragSym\` / \`overSym\` | \`string \| null\` | transient drag state |

**Data fetching:** \`GET https://api.coinbase.com/v2/exchange-rates?currency=USD\`, 7s
\`AbortController\` timeout. The response gives units-per-USD, so
\`usd = 1 / rates[sym]\` and \`btc = rates.BTC / rates[sym]\`. Persist
\`{ rates, fetchedAt, history }\` to \`localStorage["nocturne.rates.cache.v1"]\` on every success.

**Cross-tab persistence keys** (all JSON, all guarded by try/catch):
\`nocturne.rates.cache.v1\`, \`…order.v1\`, \`…favs.v1\`, \`…lease.v1\`, \`…budget.v1\`.

## Design Tokens
Ported verbatim from \`design/nocturne/styles.css\` — use that file as the source of truth.

- **Core:** bg \`#161826\`, surface \`#232532\`, text \`#e9e9ed\`, accent \`#9184d9\`,
  divider \`color-mix(in srgb, #e9e9ed 16%, transparent)\`.
- **Neutral ramp 100→900:** \`#f3f5fe #e4e7f5 #cfd3e5 #b2b6ca #9397ab #75798c #595d6c #3f424d #292b31\`
- **Accent ramp 100→900:** \`#f5f4ff #e7e5fe #d2cefd #b5abfc #968ae0 #796cbf #5d5294 #423a6a #2b2741\`
- **Semantic additions (only two, both from the prototype):** warning/stale \`#d9c184\`,
  negative/error \`#d98484\`. Positive change uses \`--color-accent-400\`.
- **Spacing (0.70× density):** 2.8 · 5.6 · 8.4 · 11.2 · 16.8 · 22.4 px
- **Radii:** sm 4 · md 8 · lg 14
- **Shadows:** sm \`0 0 0 1px #3f424d\`; md \`0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,.55)\`;
  lg \`0 0 0 1px #9397ab, 0 16px 40px rgba(0,0,0,.65)\`
- **Type:** Inter 400/500/600/700; body 15px/1.55; h4 20px; row 14px; meta 11–13px;
  headings \`line-height 1.12\`, \`letter-spacing -0.015em\`, weight 500 (never bolder).

## Assets
None. No images, no logos. Coin badges are the first three letters of the symbol on an accent-900
disc — no third-party coin icons are needed. Fonts come from Google Fonts (Inter, in the
stylesheet's \`@import\`); self-host via \`@fontsource-variable/inter\` in production.

## Suggested file layout (Remix)

\`\`\`
app/
  routes/_index.tsx                 # page shell, renders <RatesDashboard/>
  components/rates/
    RatesDashboard.tsx              # toolbar + budget strip + list composition
    RateCard.tsx                    # grid view, one card (memoised)
    RateRow.tsx                     # table view, one row (memoised)
    ViewToggle.tsx
    Sparkline.tsx                   # 68x20 polyline
    StatusDot.tsx  BudgetMeter.tsx
  lib/rates/
    coinbase.ts                     # fetchRates(): typed client + response mapping
    currencies.ts                   # SYMBOLS + display names (single source of truth)
    format.ts                       # formatUsd / formatBtc / formatDelta
    budget.ts                       # leaky-bucket token store (localStorage)
    lease.ts                        # cross-tab polling lease
    cache.ts                        # last-known-good read/write + staleness tiers
    useRates.ts                     # the hook that wires all of the above
  lib/persisted.ts                  # typed localStorage helpers
\`\`\`

## Tension Decisions

### T1 — Freshness vs. rate limits — **IMPLEMENTED**
**Choice.** One shared **leaky-bucket budget** in \`localStorage\` (capacity 10, refilling
continuously at 10/minute) plus a **single-poller lease**. Every tab writes a heartbeat claim to
\`nocturne.rates.lease.v1\`; the holder is the only tab that fetches, on an 8s period (7.5 req/min,
comfortably inside the 10s freshness bar with ~2.5 req/min of headroom). Other tabs adopt results
for free via the \`storage\` event, so N tabs cost the same as one. If the leader closes or freezes,
another tab takes the lease on its next tick (\`> 2.5s\` stale). Manual refresh spends from the same
bucket; when it's empty the button becomes "Wait Ns" and says why. The ten pips make the budget
visible so throttling never feels like a bug.
**Given up.** \`localStorage\` reads/writes are not truly atomic, so two tabs claiming a token in
the same millisecond can both win — the bucket can overdraw by ~1 in a rare race. Accepted because
the cap is a soft budget with headroom; a \`BroadcastChannel\` + \`navigator.locks\` upgrade (or a
SharedWorker) closes it, and in production the right answer is a server-side proxy that owns the
key and the quota. Also given up: per-tab independence — a background tab throttled by the browser
can hold the lease up to 2.5s before handoff, briefly stretching the interval.

### T4 — Resilience vs. simplicity — **IMPLEMENTED**
**Choice.** No error page, ever. Every successful response is written to a last-known-good cache
that renders **before** the first fetch resolves, so a returning user sees numbers immediately.
Staleness is tiered, and the tier is always on screen (dot + label + banner):
\`≤12s\` **live** (accent) · \`≤120s\` **stale** (amber, values still trusted) · \`>120s\` **expired**
(red, numeric values dim to \`--color-neutral-500\`, banner explains that these are no longer prices).
Two minutes is the line because a rate you'd act on shouldn't be older than the time it takes to
notice it's old. A first-time visitor with no cache sees the full chrome, \`—\` in every cell, and
"Fetching first rates…"; if the feed is unreachable they get an explicit "no cached rates on this
device yet… retrying every 8s" — blank rather than a guess.
**Given up.** Complexity: three staleness tiers, a cache-shape version key, and a "dim the numbers"
state to test. Also honesty over comfort — an expired dashboard looks visibly degraded, which is
uglier than showing confident stale numbers, and deliberately so.

### T5 — Filtering × reordering semantics — **IMPLEMENTED (bonus)**
**Choice.** Drag works with a filter active. Reordering happens on the **master order**, not the
visible slice: the dragged symbol is removed and re-inserted **adjacent to the drop target**
(after it when moving down, before it when moving up). Hidden rows are never touched, so each keeps
the visible neighbour it sits behind. Clear the filter and the moved card is exactly where you'd
predict; everything else is untouched.
**Why least surprising.** The alternative — treating the visible list as the whole list and
redistributing hidden items across the new gaps — silently rewrites cards the user can't see, which
is the one outcome nobody can predict. "Only what I dragged moved" is the promise, and a one-line
notice above the table states it while a filter is active. Drag is disabled under Name/Price/Change
sorts for the same reason: a computed order has no slots, so a drop would either be discarded or
would silently switch the user back to custom.
**Given up.** You cannot use the filter to move a card *between* two hidden neighbours in one
gesture — it lands next to a visible card. Rare; recoverable by clearing the filter.

### T2 — Scale vs. interactivity — decided, not implemented
**Choice.** Curate 15 assets by default and, for the full 500+ list, virtualise with
\`@tanstack/react-virtual\` over the filtered array, keep filtering off the render path
(\`useDeferredValue\` + a lowercased search index built once per currency list), memoise cards on
their own values, and use \`@dnd-kit\` with a sortable context restricted to the rendered window
plus auto-scroll at the edges. Cards stay fixed-height so the virtualiser needs no measurement.
**Given up.** Dragging across a 500-card list is slow by hand, so the honest fix is a "move to top /
move to position" affordance rather than more DnD polish; virtualisation also breaks native
find-in-page and complicates the fading divider rules. Not implemented because 15 cards is the real
product, and virtualisation adds machinery that the current design can't show off.

### T3 — Instant feel vs. durable order — decided, not implemented
**Choice.** Optimistic local reorder (state updates on drop, before any write) with the write
happening synchronously in the same handler, so a reload immediately after a drop can't lose it.
For durability across tabs the plan is a versioned record — \`{ version, updatedAt, order }\` — written
under \`navigator.locks.request()\` with last-write-wins on \`updatedAt\`, a \`storage\`-event listener
adopting a newer version, and validation on read (unknown symbols dropped, missing ones appended)
so a corrupt or partial value degrades to the default order instead of throwing.
**Implemented today:** the optimistic update plus the synchronous validated write — order survives
an instant reload. **Not implemented:** the lock and version fields, so two tabs reordering at the
same time settle on whichever wrote last rather than merging.
**Given up.** True convergence needs a server-side order per user (or a CRDT); both are the wrong
weight for a client-only dashboard where the loser of a race can re-drag one card.

## Guidelines for AI follow-up work
- **Types first.** \`currencies.ts\` is the single source of truth for the symbol union
  (\`export type Symbol = typeof SYMBOLS[number]\`). No \`any\`, no non-null \`!\` on API data —
  parse and narrow at the boundary (zod is fine) and keep the rest of the app on a clean shape.
- **Never let a formatter or a fetch live in a component.** Presentation components take
  already-formatted strings; \`lib/rates/*\` owns all math, IO and time logic and stays testable
  without a DOM.
- **All time-derived labels come from one \`now\` tick.** Don't add a second interval; don't call
  \`Date.now()\` during render.
- **Every new request path must spend a budget token** via \`budget.ts\`. Adding a fetch that
  bypasses it breaks T1 — if a feature needs more requests, lower the poll rate to pay for it.
- **Every new persisted key is versioned** (\`…​.v2\`) and read through a validating helper that
  falls back to a default rather than throwing.
- **Styling:** tokens only — no new hex values, no filled buttons, no extra accent colors, no
  shadow stacking, headings never past weight 500. New surfaces use \`--color-surface\` + \`--shadow-sm\`.
- **Accessibility is a requirement, not a follow-up:** keyboard-operable reordering (dnd-kit),
  \`aria-live="polite"\` on the staleness label, labelled controls, and the 2px accent focus ring
  on everything interactive.
- **Don't add a spinner-only or error-only screen.** Degradation is in-place: last-known-good
  values plus an explicit age.
- **Ask before inventing data.** Δ and the sparkline are session-scoped because the rates endpoint
  has no history; if 24h change is wanted, add a real historical source (e.g. Coinbase candles
  per product) rather than synthesising a series.

## Files
- \`design/Crypto Dashboard.dc.html\` — the full working prototype (markup + logic in one file).
  Read the logic class for the budget, lease, staleness and reorder algorithms.
- \`design/support.js\` — the prototype's runtime; open the HTML directly in a browser to interact
  with it. **Do not port this file.**
- \`design/nocturne/styles.css\` — the design system: tokens and component classes. Port the tokens.
- \`design/nocturne/readme.md\` — the design system's written rules.

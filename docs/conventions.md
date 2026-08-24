# Project conventions

> Living document, curated by `curator` after each feature. Advisory — describes how this repo
> actually builds software; supersede stale entries rather than appending duplicates.

## Structure

### CONV-structure-1: Browser-reachable logic lives under `app/**/public/**`, not `app/utils/`
- Why: `app/assets.ts`'s `allowFiles: ['app/routes.ts', 'app/**/public/**']` is the browser
  bundle's security boundary. Any module imported (directly or transitively) by a hydrated
  `clientEntry` component must physically live under a `public/` directory or the browser's
  request for it 404s at runtime. This overrides the generic "pure helpers go in `app/utils/`"
  guidance whenever the helper ships to the browser.
- Example: `budget.ts`, `lease.ts`, `cache.ts`, `order.ts`, `sort.ts`, `format.ts`,
  `persisted.ts` all live in `app/actions/public/rates/` because they're real dependencies of
  the hydrated `RatesDashboard` bundle — not because of a stylistic preference for route-local
  code.
- From: crypto-dashboard (ADR 0005, design brief "Project structure"), 2026-08-21.

### CONV-structure-2: Wrap injectable/test-seam components in a zero-prop `clientEntry` shell
- Why: `clientEntry` component props must be serializable across the SSR→hydration boundary.
  When a component needs non-serializable test seams (injected functions like `clock`,
  `fetchImpl`, or a `KVStore`), keep the seam-accepting component a plain (non-entry) export and
  wrap it in a thin, zero-prop `<Name>Entry = clientEntry(...)` component that production
  actually mounts. Tests mount the inner component directly via `render(...)`, bypassing
  serialization entirely.
- Example: `RatesDashboard` accepts optional `kv?`/`clock?`/`fetchImpl?`; `RatesDashboardEntry =
  clientEntry(import.meta.url, () => () => <RatesDashboard />)` is the only thing `home-page.tsx`
  mounts, so production hydration only ever serializes zero props.
- From: crypto-dashboard (ADR 0004 consequence, `rates-dashboard.tsx`), 2026-08-21.

### CONV-structure-3: Watch composition-root size against the design's planned module split
- Why: A single stateful composition root (one component owning all setup-scope state) is a
  deliberate pattern here (Remix 3 has no hooks), but it drifts into a god module if the design
  brief's planned extractions (status/banner computation, style descriptors, derived-state
  helpers) aren't actually pulled out during REFACTOR. Re-check module size against the design
  doc's file list before calling a feature done.
- Example: the design brief planned `toolbar.tsx`, `card.tsx`, `row.tsx`, `sparkline.tsx`, etc.
  as separate files; the shipped `rates-dashboard.tsx` (705 lines) only partially extracted
  (`history.ts`, `styles.ts`) — flagged by review as god-module drift, not blocking, but a
  recurring risk worth watching on the next pass.
- From: crypto-dashboard (review finding, `rates-dashboard.tsx` vs design brief), 2026-08-21.

### CONV-structure-4: Presentational modules take explicit props; anything that can change mid-event-turn is read live, not snapshotted
- Why: `rates-dashboard.tsx` is the only stateful module; the render helpers it composes
  (`card.tsx`, `toolbar.tsx`, `table.tsx`, ...) receive a plain props object and call back into
  the root for every decision. But props are a snapshot of the *last* render, so a flag like "a
  drag is currently in flight" goes stale the moment a gesture starts and completes inside one
  event turn — exactly what a `dragstart`/`dragover`/`drop` burst does. Guard on live state in
  the root, or pass a predicate (`isDragActive()`); reserve boolean props for values that can
  only change *between* renders (e.g. `draggable`, derived from the sort mode).
- Example: caught by AC-44/AC-80 during the module-split refactor — every drag test dispatches
  its whole gesture inside a single `result.act(...)`, so a snapshotted `dragActive` prop made
  every drop a silent no-op.
- From: crypto-dashboard (module-split refactor), 2026-08-22.

### CONV-structure-5: Guard conditional JSX slots with strict booleans, never a possibly-empty string
- Why: `{query && <p/>}` does not render "nothing" when `query` is `''` — it renders the empty
  string as a real text node in the parent's child list. `diff-dom.ts` key-matches siblings on
  `data-key` and pairs everything else *positionally* among the units it could not match, so a
  stray text node shifts that pairing and a slot that turns on later is inserted at the wrong
  position entirely. Write `{query !== '' && …}`, `{text !== null && …}`, or `{Boolean(x) && …}`.
- Example: the staleness banner and the filter notice both rendered *below the footnote* instead
  of above the list. Only reproducible on the real hydration path (SSR boundary markers change
  the sibling-unit set), and invisible to every existing assertion because the node did exist —
  just in the wrong place. Caught by visual QA, pinned by AC-105.
- From: crypto-dashboard (compliance pass, `rates-dashboard.tsx`), 2026-08-22.

## Testing

### CONV-testing-1: Real-DOM/browser component tests use the `*.test.browser.tsx` suffix, run via `remix test`
- Why: `remix test` distinguishes server-type tests (router/unit, no DOM) from browser-type
  tests (real Chromium via Playwright) by filename convention. Running tests through
  `node --test` directly (bypassing the `remix test` CLI) silently skips discovering `.tsx` test
  files — see CONV-testing-2.
- Example: `rates-dashboard.a11y.test.browser.tsx`, `rates-dashboard.reorder.test.browser.tsx`,
  etc.; `package.json`'s `test` script is `NODE_ENV=test remix test`, not `node --test`.
- From: crypto-dashboard (ADR 0004, `package.json` diff), 2026-08-21.

### CONV-testing-2: Verify the test harness actually executes a deliberately-failing test before scaling up a suite
- Why: the scaffold's original `npm test` (`node --test`) never executed `remix/test`-authored
  suite bodies for `.tsx` files — every component test passed vacuously (the files weren't even
  discovered), which would have shipped a feature with zero real component coverage if not
  caught during RED. A one-line intentionally-failing test at the target layer, run through the
  real command, is the cheapest way to catch a broken harness before investing in 75+ tests.
- From: crypto-dashboard (process history — test-harness discovery during RED), 2026-08-21.

### CONV-testing-3: Pure domain modules take an injected `clock: () => number` and `KVStore`, never call `Date.now()`/`localStorage` directly
- Why: enables deterministic, DOM-free unit tests, including cross-tab race simulation (same
  store instance, two `tabId`s, hand-set `now` values) with no real timers and no flakiness.
- Example: `budget.ts`/`lease.ts` export `create*Store(kv: KVStore, clock: () => number)`;
  production wires real `localStorage`/`Date.now`, tests wire `createFakeKV()`/`manualClock()`.
- From: crypto-dashboard (design brief "Testability notes", `budget.ts`, `lease.ts`,
  `test/support/fakes.ts`), 2026-08-21.

### CONV-testing-4: DOM/attribute assertions don't catch rendered-geometry defects — run a real-browser visual QA pass before shipping
- Why: component tests correctly asserted `data-*` attributes and `getComputedStyle` color
  values, yet missed a 0×0 status dot, a toolbar overlap, and missing drag-feedback styling —
  all only visible once real layout/geometry was rendered in an actual browser. Treat visual QA
  as a distinct, required check layer for any user-facing UI change, not a redundant re-check of
  what component tests already cover.
- From: crypto-dashboard (process history — QA visual catches), 2026-08-21.

## Persistence

### CONV-persistence-1: Every persisted `localStorage` key is versioned and read through a validating, fallback-safe helper
- Why: `localStorage` can hold missing, corrupt, or version-mismatched data (schema changes
  across deploys, private-browsing quota errors on `getItem`/`setItem`). A helper that always
  degrades to a supplied default instead of throwing keeps every render path crash-free.
- Example: keys follow `nocturne.rates.{cache,order,favs,lease,budget}.v1`; `persisted.ts`'s
  `readJSON`/`writeJSON` catch storage exceptions and validate shape before trusting parsed JSON;
  `readOrder` additionally drops unknown symbols and appends missing valid ones rather than
  losing the rest of the order.
- From: crypto-dashboard (FR-8, `persisted.ts`, AC-48–AC-51), 2026-08-21.

## Styling

### CONV-styling-1: Component styles reference design tokens (`var(--color-*)`) exclusively — no literal hex in component code
- Why: keeps the styling layer traceable to one source of truth (`tokens.css`) and prevents
  drift from the design system. When the token sheet is missing a needed semantic state color,
  add it to `tokens.css` next to the base ramps rather than inlining a hex value at the call
  site.
- Example: this feature added two semantic tokens beyond the base Nocturne palette —
  `--color-warning` and `--color-negative` — used by `computeStatus`/Δ formatting instead of
  inline hex; a review pass flagged (and fixed) remaining hardcoded hexes before merge.
- From: crypto-dashboard (ADR 0002, review should-fix finding, `computeStatus`), 2026-08-21.

### CONV-styling-3: A layout constant the render math depends on is declared once, in the stylesheet that applies it
- Why: the windowed table's spacer arithmetic assumes a fixed row height. When that height lived
  as a bare constant in the windowing module while CSS sized the row from its content, the two
  silently disagreed (40px assumed vs. 56.7px rendered) — the spacers understated the scroll
  extent by ~10,000px and the tail of the list was unreachable. Every DOM/attribute test stayed
  green, because the spacer counts were self-consistent with the wrong constant; only a real
  browser measurement exposed it.
- Rule: export the constant from the stylesheet that also applies it (`styles.ts`'s
  `TABLE_ROW_HEIGHT_PX` both sets `height` on `tableRowCss` and feeds `computeWindow`), so the
  rendered geometry and the arithmetic cannot drift. Measure row pitch in a real browser after
  touching row styling.
- From: crypto-dashboard (visual-QA catch during the module-split refactor), 2026-08-22.

### CONV-styling-2: The base/token stylesheet sets `box-sizing: border-box` globally
- Why: without it, padding/border silently inflate an element's rendered footprint beyond its
  declared width/height — invisible to `getComputedStyle`-based tests but visible as a toolbar
  overlap in a real browser.
- From: crypto-dashboard (process history — QA visual catch, fixed in `tokens.css`),
  2026-08-21.

## API / Error handling

### CONV-api-1: Validate external numeric API fields before using them as a divisor
- Why: a missing, zero, or negative denominator field from a third-party response produces
  `Infinity`, `NaN`, or a sign-flipped result if divided without a guard; map an invalid divisor
  explicitly to a well-defined "invalid" value (`NaN`) so the formatting layer's existing
  finiteness check renders it as `—` rather than a wrong or nonsensical number.
- Example: `coinbase.ts`'s `mapRates` checks `Number.isFinite(btcPerUsd) && btcPerUsd > 0` before
  computing any symbol's `btc` cross-rate; `usd` values (no such divisor) are unaffected. Found
  by review, closed via spec Amendment AC-76 (see CONV-process-2).
- From: crypto-dashboard (review finding — unvalidated BTC divisor, `coinbase.ts`, AC-76),
  2026-08-21.

### CONV-api-2: Every numeric formatter needs an explicit precision floor
- Why: a fixed-decimal tier silently turns any value below its own resolution into a *false
  zero*. `$0.0000` and especially `0 ₿` read as real quantities, not as "too small to show" —
  and unlike a divide-by-zero (CONV-api-1) nothing throws, so only a human looking at the
  rendered value ever notices. Decide what the smallest representable value is, and render
  anything below it as an explicit bounded placeholder (`< $0.00000001`).
- Example: AC-56's `< 1 → 4dp` tier was specified against the curated 15 (cheapest ~$0.22). In
  "All" scope it rendered ~16 real Coinbase assets — SHIB, PEPE, BONK, FLOKI — as an identical
  `$0.0000`, and their BTC cross-rates as `0 ₿`. Fixed by AC-104/AC-106.
- Corollary: when a formatting tier is specified against a curated sample, re-check it against
  the widest input set the feature can actually reach before shipping.
- From: crypto-dashboard (compliance pass, `format.ts`), 2026-08-22.

### CONV-api-3: State a rate limit in the terms its mechanism actually enforces — and say it the same way everywhere
- Why: a leaky bucket with capacity `C` and continuous refill of `C` per window bounds the
  *long-run average* at `C`/window; it does **not** bound the count inside any single sliding
  window. Starting from a full bucket, a burst of `C` plus refill-paced spends yields up to ~`2C`
  requests in one window — `budget.ts` (cap 10, +1 token per 6,000ms) permits ~20 requests in a
  moving 60s span against a stated "10 requests per minute". Pick the mechanism that matches the
  promise: fixed window or sliding-window log for a hard cap; leaky bucket only when a
  sustained-average cap *with* burst tolerance is genuinely what is meant.
- Then say it in the same words in all three places it appears — the NFR/FR, the README
  trade-off section, and the user-facing copy. `n/10 left this minute` and
  `aria-label="Requests left this minute"` (`budget-strip.tsx`) assert a fixed-window model the
  bucket never implemented, so the UI is more specific than the guarantee.
- Example: measured by an external reviewer — manual refresh spammed in a second tab while the
  leader polled produced **16 Coinbase requests in one 60-second window** (10 burst in 5.6s, then
  6 refill-paced). The common path (N tabs behind one lease, ~7.5 req/min) never shows this; only
  the adversarial path does. AC-7 documented the ~1-request overdraw race but not the window
  overshoot, which is an order of magnitude larger.
- Resolved: `budget.ts` is now a sliding-window request log (ADR 0008, AC-107..AC-117), so the
  stated cap, the mechanism, and every piece of copy finally agree. The convention stands as the
  general rule, not as an open defect.
- From: crypto-dashboard (external review, `budget.ts`, `budget-strip.tsx`, FR-9), 2026-08-24.

## Process / Workflow

### CONV-process-1: Spec example values must satisfy the tier/condition they're illustrating
- Why: an illustrative value copied literally from a design handoff into a spec AC, without
  checking it actually satisfies that AC's own stated boundary, produces a self-contradictory
  acceptance criterion that can't be implemented as written. Verify each example against its own
  stated condition before finalizing a spec, not just against the handoff it was copied from.
- Example: AC-54's original example value contradicted its own tier boundary; caught and fixed
  during GREEN without weakening the AC.
- From: crypto-dashboard (process history — AC-54 defect), 2026-08-21.

### CONV-process-2: Defects found after spec approval are recorded as numbered `## Amendments`, not silent edits to existing ACs
- Why: preserves traceability — a reviewer or future reader can see exactly which acceptance
  criteria were added post-hoc and why, instead of a spec that silently changed shape after
  "approval."
- Example: the unvalidated-BTC-divisor finding (CONV-api-1) became `AC-76` under
  `specs/crypto-dashboard.spec.md`'s `## Amendments` section rather than rewriting AC-1/AC-2.
- From: crypto-dashboard (spec `## Amendments` section, AC-76), 2026-08-21.

### CONV-process-3: Tests simulating rapid sequential interaction bursts yield a macrotask per cycle, not a chained-microtask loop
- Why: framework-level update-cascade limits (e.g. `remix/ui`'s `MAX_CASCADING_UPDATES = 50`)
  exist to catch runaway synchronous update loops in production code, and a test that drives many
  rapid interactions via chained microtasks can trip that same limit — not because the feature is
  broken, but because the test doesn't mirror how a real event loop paces the interactions.
  Yielding a macrotask per cycle makes the test representative of real usage instead of gaming
  (or fighting) the framework's safety limit.
- Example: AC-65 (50 sequential fetches) tripped `MAX_CASCADING_UPDATES=50` until the test was
  changed to yield a macrotask per cycle.
- From: crypto-dashboard (process history — AC-65 defect), 2026-08-21.

### CONV-process-4: An NFR counts as "verified by AC-n" only when some AC exercises the bound itself
- Why: `specs/crypto-dashboard.spec.md` claims "≤10 Coinbase requests/minute app-wide, verified
  structurally by AC-5–AC-13". Those ACs verify the *machinery underneath* the bound — a spend
  decrements, a refill lands at 6,000ms, two tabs can overdraw by one — and every one of them
  passes while the app serves 16 requests in a 60-second window. Nothing counts requests over a
  moving window under adversarial input, which is the claim. The words "verified structurally"
  are what stopped the question being asked again.
- Rule: for each quantified NFR, name the single test that fails if the bound is violated. If it
  doesn't exist, either write it — drive the adversarial path (burst from a full/idle state,
  multiple actors, the manual path racing the automatic one) — or reword the NFR down to what is
  actually verified ("sustained average ≤10/min; bursts up to 20 in a 60s window are permitted").
- Corollary: the headline claim — whatever the README calls the product's core promise — is the
  first thing an outside reviewer probes, and the happy path is not where it breaks. Probe your
  own headline claim adversarially before shipping.
- From: crypto-dashboard (external review — T1 probe vs. NFR "Performance/budget"), 2026-08-24.

### CONV-process-5: An ADR cites the source of every constraint, and a deviation from the brief states what it costs
- Why: ADR 0001 records the Remix 3 decision as "superseded by an explicit product/user
  requirement". That constraint is real *inside this repo* (settled by the repo owner, 2026-08,
  recorded in `CLAUDE.md` "Stack decision") — but the brief it supersedes (`designs/README.md`)
  asks for "Remix + React", so a reader outside the repo reads "product requirement" as coming
  from the brief and finds nothing there. A self-imposed constraint written as an external one
  turns a defensible trade-off into an apparent misattribution, which costs more credibility than
  the deviation itself ever would.
- Rule: name who decided, when, and which artifact records it. Never attribute a constraint to a
  source that does not contain it. When the decision departs from something the brief actually
  asked for, add a Consequence stating what the deviation makes *unobservable* — here, every
  capability the brief specified React to exercise is now undemonstrated, which is a real cost to
  whoever the brief was written for, not just an ecosystem trade-off.
- From: crypto-dashboard (external review, ADR 0001 vs `designs/README.md`), 2026-08-24.

### CONV-process-6: Every number in a shipped doc is regenerated from the command that produces it
- Why: the README advertised "117 tests: unit + router + Chromium component + 1 E2E" against an
  actual 148 tests / 25 files / 2 E2E, and told a fresh cloner that the first `npm test` run
  "downloads a Chromium build via the `playwright` devDependency" — `playwright@1.62.1` publishes
  no install script and ships no `install.js`, so browsers arrive only via
  `npx playwright install chromium`. Both are small; both are precisely the drift the repo's own
  docs discipline exists to prevent, and setup instructions are the first thing a reviewer runs.
- Rule: at `/ship`, re-run the command behind each quantified claim and paste its real output;
  verify claims about third-party tool behavior against the installed package (`package.json`
  scripts, the files actually present), not from memory. A number you are not willing to
  re-verify at ship time should be written unquantified instead.
- From: crypto-dashboard (external review — README setup/test claims), 2026-08-24.

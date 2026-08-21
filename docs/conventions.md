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

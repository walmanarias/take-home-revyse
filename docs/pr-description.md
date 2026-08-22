# ✨ Implement crypto rates dashboard (Remix 3) with shared rate-limit budget

## 📋 Summary

Implements the full crypto rates dashboard from the `designs/` handoff on the existing Remix 3 scaffold: 15 curated assets with live USD/BTC rates from Coinbase's public endpoint, filter/sort/pin/drag-reorder, and a cross-tab request budget. The dashboard never shows an error page — last-known-good rates render instantly with tiered staleness (live/stale/expired), and all tabs share one 10-requests/minute budget through a leaky bucket plus a single-poller lease in `localStorage`. Built spec-first: 82 numbered acceptance criteria, each encoded as a failing test before implementation.

## 📸 Demo

_Screenshots/videos to be added_

## 🎨 What's Changed

- ✨ **`app/actions/public/rates/`** — the feature tree: eight pure modules (`coinbase`, `budget`, `lease`, `cache`, `order`, `sort`, `format`, `persisted`, plus `history` and `currencies`) with injected clock/storage/fetch, composed by one hydrated `RatesDashboard` component (`clientEntry` wrapper for serializable-props compliance).
- 🎨 **`tokens.css` + `styles.ts`** — Nocturne design system ported verbatim as CSS custom properties (incl. new `--color-negative`/`--color-warning`); all component styling via `css()` descriptors referencing tokens only; global `box-sizing: border-box` reset.
- ✨ **Server-rendered chrome** — `home` route renders the full cold-start dashboard (15 rows of `—` placeholders) with zero network calls and exact SSR/hydration parity.
- ✨ **Cards ⇄ Table view toggle** — cards by default (brief requirement); the Table option renders the handoff's dense table anatomy (exact column template, fading header hairline) from one shared row renderer, persisted under `nocturne.rates.view.v1` (AC-77..82).
- 🧪 **Test harness fix** — `npm test` now runs the real `remix test` CLI (the scaffold's `node --test` script never executed `remix/test` suite bodies); `playwright` devDependency added; component tests follow the `*.test.browser.tsx` convention and run in Chromium.
- 📝 **`README.md`** — required "Tension Decisions" section covering T1–T5 (T1/T4/T5 implemented, T2/T3 decided-only).
- 📝 **`docs/`** — design brief, ADRs 0001–0005, and the approved spec with amendment protocol.

## 📐 Business Rules

- **T1 — Freshness vs. rate limits (implemented):** one shared leaky bucket (capacity 10, 1 token/6s refill) spent by both auto-poll and manual refresh; a single-poller lease (2.5s TTL) elects one tab to fetch on an 8s period while other tabs adopt results free via `storage` events. Budget exhaustion disables Refresh with a `Wait Ns` label — never a hidden throttle.
- **T4 — Resilience vs. simplicity (implemented):** staleness tiers — live ≤12s, stale ≤120s, expired >120s (values dimmed + banner). Last-known-good cache renders before the first fetch resolves; a first-time visitor with no cache sees full chrome with `—` placeholders. No error page exists.
- **T5 — Filtering × reordering (implemented):** dragging while filtered reorders the master order with adjacent-to-target insertion; hidden rows keep the visible neighbour they follow.
- **T2/T3** — decided in README, deliberately not implemented (virtualization; locked/versioned order records).
- Invalid API data never renders as numbers: an unparseable response rejects; a missing/zero/negative BTC divisor renders `—` (AC-76).

## 🧪 Test Coverage

- 90 tests / 90 passing (53 server + 37 browser via `remix test`), `tsc --noEmit` clean.
- Every AC-1..82 maps to at least one test titled with its AC id; unit tests use injected `KVStore`/clock doubles (deterministic cross-tab race simulation, incl. the documented T1 overdraw race), router tests pin the no-error-page cold start, Chromium component tests cover interaction and rendering.
- Visual QA pass (real browser, 1440/768/480) against the Nocturne fidelity rules; all findings fixed and re-verified.

## ♿ Accessibility

- Keyboard-operable reordering: `ArrowUp`/`ArrowDown` on each drag handle drives the same pure `reorder()` as HTML5 DnD, with `aria-live="polite"` move announcements.
- Staleness label carries `aria-live="polite"`; every control has an accessible name (pin buttons reflect pinned state, handles name their symbol).
- 2px accent `:focus-visible` ring with 2px offset on every interactive control.

## 📑 Spec & Acceptance Criteria

- Spec: `specs/crypto-dashboard.spec.md` — AC-1..75 approved at the gate; AC-76 (review finding) and AC-77..82 (user-requested view toggle) added via the spec's Amendments section.
- Design: `docs/design/crypto-dashboard.md`; decisions: `docs/adr/0001`–`0005` (Remix 3 stack, tokens-as-CSS-asset, native DnD + keyboard path, remix-native test stack, server-chrome/client-hydration split).

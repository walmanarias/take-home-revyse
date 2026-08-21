# ADR 0004: Test stack is Remix 3's own tooling exclusively

## Context

SDD/TDD needs fast unit coverage of the pure budget/lease/cache/order/sort/format modules (no
DOM), component-level coverage of the interactive dashboard (filter, sort, pin, drag, keyboard
reorder, staleness/budget display), and a cheap way to assert the "no error page, ever"
requirement. Remix 3 ships its own test framework (`remix/test`'s `describe`/`it`,
`remix/assert`, `remix/ui/test`'s `render(...)`) and its own router-testing pattern
(`router.fetch(new Request(...))`), documented in `testing-patterns.md`. Cross-tab logic
(`budget.ts`, `lease.ts`) must be testable without two real browser tabs.

## Decision

Use `remix/test` + `remix/assert` for everything, in three layers:

1. **Router tests** (`app/actions/controller.test.tsx`, per the skill's convention that root
   route behavior lives beside its controller): drive `router.fetch(new Request('http://
   localhost' + routes.home.href()))` and assert the cold-start HTML contains the expected
   chrome, all 15 symbols, `—` placeholders, and no error text — the cheapest possible
   assertion of "no error page, ever."
2. **Unit tests**, colocated next to each pure module in `app/actions/public/rates/`
   (`budget.test.ts`, `lease.test.ts`, `cache.test.ts`, `order.test.ts`, `sort.test.ts`,
   `format.test.ts`, `persisted.test.ts`), using an in-memory `KVStore` fake and a
   manually-advanced `clock: () => number`. Cross-tab races are simulated deterministically by
   calling the same store instance twice with different `tabId`s and hand-set `now` values.
3. **Component tests**, colocated next to `dashboard.tsx` and its children, using
   `remix/ui/test`'s `render(...)`, mounting `RatesDashboard` directly with its optional
   `kv`/`clock`/`fetchImpl` props overridden by fakes, and driving simulated
   `dragstart`/`dragover`/`drop`/`keydown`/`input`/`click` events through `result.act(...)`.

Existing `denyFiles: ['app/**/*.test.*']` in `app/assets.ts` already keeps all of these
colocated test files out of the browser bundle — no new asset-server configuration is needed.

## Consequences

- One test framework, one config — everything runs via the existing `npm test`
  (`node --test` through `remix/node-tsx`), now across two phases: `remix test --type server`
  (router + unit tests, no DOM) and `remix test --type browser` (component tests, real Chromium
  via Playwright). Component tests genuinely exercise real DOM APIs (drag events, focus,
  `localStorage`-shaped fakes) rather than a simulated DOM, at the cost of one new
  `devDependency`, `playwright`, plus its installed Chromium binary — accepted because
  `remix/ui/test`'s `render(...)` requires a real browser runtime, and this still avoids pulling
  in a second, non-Remix test framework.
- Deterministic, fast coverage of the hardest logic (budget/lease races) without any real
  timers or real `localStorage`.
- Explicit gap, accepted for this pass: no real two-*browser*-tab test exercises the actual
  `storage` event firing across two separate `window` objects — component tests run in one
  process/DOM. The lease/budget handover is verified only by direct simulation against the pure
  modules, which covers the algorithm but not the browser's real cross-tab event delivery. This
  is flagged as an open question in the design brief (manual QA or a future Playwright addition
  would close it), not built now, per the explicit scope of "Remix 3's own tooling."
- `RatesDashboard`'s test-injection props (`kv`, `clock`, `fetchImpl`) are safe against the
  "`clientEntry` props must be serializable" rule because `home-page.tsx` (production) never
  supplies them, and `remix/ui/test`'s `render(...)` mounts the component directly in-process
  rather than through the SSR-to-hydration prop-serialization boundary.

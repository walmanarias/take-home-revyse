# ADR 0005: Server renders static chrome; one client-hydrated dashboard owns all IO; pure logic lives in `public/rates/`, not `app/utils/`

## Context

The handoff says "nothing needs a server loader except optionally the first paint." All of this
feature's state (order, favourites, cache, budget, lease) is inherently browser-scoped
(`localStorage`, cross-tab coordination); a Remix 3 server has no access to a browser's
`localStorage`. Separately, the asset server in `app/assets.ts` restricts the browser-reachable
module graph to `allowFiles: ['app/routes.ts', 'app/**/public/**']` — any module imported,
directly or transitively, by a hydrated (`clientEntry`) component must resolve inside a
`public/` directory or the browser's request for it 404s. The skill's general placement guidance
(`SKILL.md`'s "Response Rendering And Utilities" section) suggests pure, router-free helpers
belong in `app/utils/<topic>.ts`; that guidance was written for helpers used by server-side
response assembly, not for logic that must ship to the browser.

## Decision

`app/actions/controller.tsx`'s `home` action does no data fetching; it renders `HomePage`
unchanged in shape. `HomePage` (server-only) renders the static header/lede/footnote and
mounts one `clientEntry` component, `RatesDashboard` (`app/actions/public/rates/dashboard.tsx`),
which owns the toolbar, budget strip, banner, and the list itself. All Coinbase fetching,
budget/lease accounting, cache reads/writes, and reorder/sort logic
(`currencies.ts`, `coinbase.ts`, `budget.ts`, `lease.ts`, `cache.ts`, `order.ts`, `sort.ts`,
`format.ts`, `persisted.ts`) live inside `app/actions/public/rates/`, **not** `app/utils/`,
because every one of them is a real dependency of the hydrated bundle and must be
browser-reachable. `home-page.tsx` (server code) is still free to `import` from
`currencies.ts` for its static "15 assets" caption — the allowlist restricts what the *browser*
can fetch, not what server-side source can import from disk.

`RatesDashboard`'s setup-phase defaults (`order` = the static symbol list, `rates = null`,
`fetchedAt = null`, ...) are rendered identically on the server and on the client's first paint
before hydration; its mount-time `handle.queueTask` reads the `localStorage` cache and starts
the poll/lease/budget cycle only in the browser, since a `queueTask` scheduled for "after the
next update" does not run meaningfully during `renderToStream`. This means the cold-start
skeleton (full chrome, `—` everywhere, "Fetching first rates…") comes from the same component
code path as production, not a duplicated server-only rendering of the empty state.

## Consequences

- No server-side Coinbase proxy to build or maintain in this pass — the "one shared budget
  across tabs" concept stays coherent and entirely tab-scoped, matching T1 as specified; the
  production-grade upgrade (a server proxy owning the Coinbase key and quota) remains a
  documented, deliberate follow-up rather than something half-built now.
- A deliberate, documented deviation from the general "pure helpers go in `app/utils/`"
  guidance: the reason is the asset allowlist's security boundary, not a stylistic preference.
  Widening `allowFiles` to include `app/utils/**` was considered and rejected — it would weaken
  the existing convention that `public/` is the only browser-reachable boundary, creating a
  foot-gun for future non-browser-intended utilities.
- Cold-start correctness (SSR output matches first client render) falls out of using one
  component function for both server and client renders, rather than needing a second,
  hand-synced "loading skeleton" implementation — but it must be watched in review, since any
  divergence between the two would cause a visible hydration flash. The router test's cold-start
  assertion (ADR 0004) is the cheapest regression guard for this.
- No SSR'd live numbers for a no-JS visitor — they see the specified em-dash chrome, which is
  the documented cold-start state per the handoff, not a defect.

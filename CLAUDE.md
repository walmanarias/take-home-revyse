# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Remix 3 (beta) app scaffolded with `remix new`, intended to become a crypto rates dashboard. The full product spec lives in `designs/README.md` (see "Design Handoff" below). Requires Node >= 24.3.0. TypeScript runs natively via `--import remix/node-tsx` — there is no build step, and relative imports keep their `.ts`/`.tsx` extensions.

## Commands

```sh
npm run dev          # dev server with --watch (http://localhost:44100)
npm run hmr          # dev server behind the HMR proxy (hmr.ts supervises server.ts)
npm run start        # production mode
npm test             # all tests (node --test runner)
npm run typecheck    # tsc --noEmit
```

Run a single test file:

```sh
NODE_ENV=test node --import remix/node-tsx --test path/to/file.test.ts
```

## Critical: This Is Remix 3, Not React

`remix/ui` looks like React but is not. Components receive a `handle` and return a zero-argument render function; state lives in setup-scope variables; updates are explicit via `handle.update()`; there are no hooks. All framework imports use subpaths (`remix/router`, `remix/ui`, ...) — a top-level `import from 'remix'` does not exist.

Before building or reviewing features, read `.agents/skills/remix/SKILL.md`. It is the authoritative guide for this repo: package map, canonical patterns, layout rules, and common mistakes. Load only the reference files under `.agents/skills/remix/references/` that the task needs. Fuller API docs live at `node_modules/remix/src/<subpath>/README.md`.

## Architecture

Request flow: `server.ts` (node:http + `createRequestListener`) → `app/router.ts` (middleware: `staticFiles('./public')`, then `render()`) → `app/actions/controller.tsx` (actions per route key) → page components.

- `app/routes.ts` is the single source of truth for URLs. Both server and browser code import it; use `routes.<name>.href(...)` for all internal URLs, redirects, and tests.
- `app/router.ts` maps route maps to controllers and derives the typed `AppContext` from the middleware stack.
- `app/actions/` owns route handlers and route-local UI. Top-level leaf actions go in `app/actions/controller.tsx`; a nested route map gets its own `app/actions/<route-key>/controller.tsx` mapped explicitly in `router.ts`. Directory names match route-map keys, not URL segments.
- `app/middleware/render.tsx` installs the request-scoped `context.render(...)` used by actions; it streams JSX to an HTML response and resolves `clientEntry(...)` references to asset URLs.
- `app/assets.ts` is the server-side asset pipeline (compiles browser modules under `/assets`, controls which files are browser-reachable via `allowFiles`, wires browser HMR). Browser-reachable source lives in `public/` directories, with the runtime entry at `app/actions/public/entry.ts`.
- Root `public/` is static files served as-is.

Two dev modes exist: `npm run dev` runs `server.ts` directly with `--watch` (full restarts); `npm run hmr` runs `hmr.ts`, a proxy on port 44100 that supervises `server.ts` as a child process and provides server + browser HMR.

Layout rules (from AGENTS.md): grow into `app/data/`, `app/ui/`, `test/` only when needed; put code in the narrowest owner first; shared cross-route UI goes in `app/ui/`; never create `app/lib/`, `app/components/`, or `app/controllers/`.

### The dashboard feature tree (`app/actions/public/rates/`)

Everything the browser bundle needs lives here (see CONV-structure-1 — `allowFiles` makes
`app/**/public/**` the bundle's security boundary, which is why these are route-local and not in
`app/utils/`). When adding a feature, extend the matching layer rather than growing the root:

| Layer | Modules | Rule |
| --- | --- | --- |
| State + wiring | `rates-dashboard.tsx` | The only stateful module. Owns setup-scope state, decides, and calls `handle.update()`. Add state here; add markup elsewhere. |
| Presentation | `card.tsx`, `toolbar.tsx`, `table.tsx`, `budget-strip.tsx`, `sparkline.tsx` | Pure render helpers over an explicit props object. No state, no persistence. Anything state-dependent is a callback back into the root. |
| Derived rules | `status.ts`, `sort.ts`, `format.ts`, `order.ts`, `history.ts`, `window.ts`, `search-index.ts` | Pure functions over plain data. Unit-tested directly, no DOM. |
| Persistence | `persisted.ts`, `snapshot.ts`, `cache.ts`, `budget.ts`, `lease.ts`, `order-store.ts`, `locks.ts` | Versioned keys read through validating, fallback-safe helpers; injected `KVStore`/`clock`/`LocksPort` (CONV-testing-3). |
| I/O + types | `coinbase.ts`, `rate.ts`, `currencies.ts` | `coinbase.ts` is the single network adapter. `rate.ts` holds the shared `Rate`/`RatesMap` types — don't re-spell the shape inline. |

Two traps specific to this tree:

- **Live state vs. render snapshots.** A render helper's props are a snapshot from the last
  render. Anything that can change *within a single event turn* — notably whether a drag is in
  flight — must be read live (guard in the root, or pass a predicate like `isDragActive()`), not
  captured as a boolean prop. A drag that starts and drops in one turn will otherwise see stale
  props and silently do nothing.
- **Row height is a shared invariant.** The windowed list's spacer arithmetic assumes every table
  row is exactly `TABLE_ROW_HEIGHT_PX` (`styles.ts`) tall, which is why that constant both sizes
  the row in CSS and feeds `computeWindow`. If the two ever drift, the spacers mis-state the
  scroll extent and the tail of the list becomes unreachable — and DOM/attribute tests stay green
  throughout, because the spacer counts remain self-consistent. Verify row geometry in a real
  browser after touching row styling.

## Design Handoff (`designs/`)

`designs/README.md` is the full spec for the dashboard to build: 15 crypto assets with live USD/BTC rates from Coinbase's public endpoint, filter/sort/pin/drag-reorder, a shared 10-requests-per-minute budget across tabs (leaky bucket + single-poller lease in localStorage), and tiered staleness with no error pages ever. Read it before implementing dashboard features — it specifies exact layout, formatting rules, state shape, and the reasoning behind resilience decisions.

- `designs/Crypto Dashboard.dc.html` is a working HTML prototype — a reference for layout, copy, and the budget/lease/staleness/reorder algorithms. Do not port `designs/support.js` (its runtime).
- `designs/nocturne/styles.css` + `readme.md` are the Nocturne design system. Source all styling from its tokens: dark ground `#161826`, single accent `#9184d9`, outlined buttons only (never filled), headings never past weight 500, no new hex values.
- Stack decision (settled by the user, 2026-08): this app is built on **Remix 3** — the handoff's React-specific suggestions (shadcn/ui, Tailwind, dnd-kit, @tanstack/react-virtual, its React file layout) are superseded. Port the design's intent, tokens, and behavior into Remix 3 idioms per AGENTS.md and the remix skill. Do not introduce React or propose switching stacks.

# ADR 0002: Nocturne tokens land as a CSS asset + `css()` mixins, not Tailwind/shadcn

## Context

The handoff requires a pixel-close, token-sourced port of the Nocturne design system
(`designs/nocturne/styles.css` + `readme.md`): a `:root` token sheet (color ramps, spacing at
0.7× density, radii, shadows), outlined-only buttons, headings capped at weight 500, and
fading-to-transparent hairline rules implemented as `linear-gradient` background strips. Remix 3
has no bundled component library; styling is done via the `css(...)` and `style` mixins
documented in `mixins-styling-events.md`, plus whatever CSS assets the app chooses to serve
through `remix/assets`' existing pipeline (already wired in `app/assets.ts`).

## Decision

Port `nocturne/styles.css`'s `:root` block (and its Inter `@import`) near-verbatim into one CSS
asset, `app/actions/public/rates/tokens.css`, served through the existing asset server and
linked from `Document`'s `<head>` via a `tokensHref` resolved the same way `entryHref` already
is in `app/assets.ts`. Every component-level visual rule (`.card`, `.btn-primary`, `.seg`, the
fading row/hairline gradients) is re-authored as a `css(...)` mixin descriptor in
`app/actions/public/rates/styles.ts`, referencing `var(--color-*)` tokens exclusively — never a
literal hex. Icons are hand-authored inline SVG components (Phosphor's `DotsSixVertical`,
`PushPin`, `PushPinSlash`), mirroring the pattern the starter's `home-page.tsx` already uses for
its own icons (`AtomIcon`, `GitHubIcon`, ...).

## Consequences

- No component-library dependency (no shadcn/Tailwind), so no new build tooling; the asset
  pipeline already compiles and serves CSS assets alongside scripts.
- Every Nocturne class the handoff references (`.btn`, `.seg`, `.table` row rules, `.card`) must
  be manually re-expressed once as a `css()` descriptor — more upfront work than importing a
  matching component library, but it stays reviewable against the token sheet and never drifts
  from a second copy of the design system.
- Global token variables and per-component visuals are deliberately split: `tokens.css` owns
  `:root` custom properties and `@font-face`/`@import`-level concerns (a natural fit for a plain
  stylesheet asset), while `css(...)` owns scoped, composable component rules (a natural fit for
  the mixin system) — this mirrors how the existing starter already separates global
  `<Document>`-level concerns from component-local `css()` blocks.
- Self-hosting Inter via `@fontsource-variable/inter` (per the handoff's production note) is
  deferred; `tokens.css` keeps the Google Fonts `@import` from the source stylesheet for now,
  flagged as a follow-up performance item.

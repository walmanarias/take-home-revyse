# ADR 0001: Stack is Remix 3 (existing scaffold), not React/RR7/Remix v2

## Context

The design handoff (`designs/README.md`) was written assuming "Remix + React + shadcn/Tailwind."
The repo, however, is scaffolded with `remix@3.0.0-beta.10` — a server-first framework that
ships its own non-React component model (`handle`, zero-argument render functions,
`handle.update()`, no hooks), documented in `.agents/skills/remix/SKILL.md`. An initial pass of
this brief adopted React Router v7 in framework mode to satisfy the handoff literally. That was
superseded by an explicit product/user requirement: the stack **must** be Remix 3, using the
scaffold already present in the repo.

## Decision

Build the dashboard as a Remix 3 application, keeping `server.ts`, `hmr.ts`, `app/router.ts`,
`app/routes.ts`, `app/middleware/render.tsx`, `app/assets.ts`, and the `app/actions/*`
conventions in `AGENTS.md`/`CLAUDE.md`/`.agents/skills/remix/*`. The handoff's React-specific
suggestions (shadcn/ui, Tailwind, `@dnd-kit`, `@tanstack/react-virtual`, its
`app/routes/_index.tsx` + `lib/` file layout) are treated as reference material for *intent*
(exact layout, copy, formatting, resilience algorithms) and are re-derived in Remix 3 idioms,
not ported as-is.

## Consequences

- No access to the React ecosystem: shadcn/ui, `@dnd-kit`, `@tanstack/react-virtual`, and
  React-specific testing tools (RTL) are all off the table; every UI primitive (outlined
  buttons, segmented control, drag-and-drop, sparkline) is hand-built against Remix 3's
  `remix/ui` mixins.
- Zero migration risk and zero framework-mismatch debt: the repo's own `CLAUDE.md` already
  flagged the handoff/stack mismatch before this ADR: "Note a stack mismatch: the handoff was
  written assuming Remix + React... The repo's conventions... govern implementation."
- The team must budget extra implementation time for things a React ecosystem would give for
  free (accessible drag-and-drop, a component library), in exchange for staying inside a single,
  consistent, already-documented framework with its own testing story (`remix test`,
  `remix/ui/test`).
- Any future contributor reading `designs/README.md` literally ("Remix + React") needs this ADR
  to understand why the actual implementation looks nothing like a React app.

## Addendum (2026-08-24, after external review)

The Context above says the React approach "was superseded by an explicit product/user
requirement." That is true *inside this repo* — the stack was settled by the repo owner in 2026-08
and is recorded in `CLAUDE.md` under "Stack decision" — but it is worth stating precisely, because
the phrasing invites a reader to look for the requirement in `designs/README.md`, which asks for
"Remix + React" and imposes nothing about Remix 3. The constraint was **self-imposed relative to
the handoff**; the decision stands, the attribution needed a source.

One Consequence was missing, and it is the one the handoff's audience cares about:

- **Everything the handoff named React to exercise is now unobservable.** A brief specifying
  Remix + React is, in part, a request to see React worked with; a non-React implementation cannot
  answer that, however well it performs otherwise. That cost belongs next to the ecosystem
  trade-offs listed above, not implied by them.

See `docs/curation/2026-08-24-external-review.md` and CONV-process-5.

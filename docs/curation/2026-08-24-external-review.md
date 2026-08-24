# Curation retrospective: external review of the shipped dashboard

- Date: 2026-08-24
- Input: an external human review of the shipped app (live probing, not a diff read)
- Scope: no production code, tests, or spec ACs changed by this pass — conventions, rules,
  README, ADR addendum, and this record only
- Verified against: `app/actions/public/rates/budget.ts`, `budget-strip.tsx`,
  `specs/crypto-dashboard.spec.md` (FR-9, NFR "Performance/budget"),
  `docs/adr/0001-stack-remix-3-per-explicit-constraint.md`, `README.md`, and a full `remix test`
  run on 2026-08-24

## The three findings, checked

### 1. T1's rate limit is not the limit the app claims (the sharp one)

Confirmed in code. `budget.ts` is a leaky bucket: capacity 10, `tokens += (elapsed / 60_000) * 10`
on every read. That bounds the **sustained average** at 10/min. It does not bound a sliding
60-second window: from a full bucket you can spend 10 immediately, then one more every 6s as it
refills — up to ~20 in a moving 60s span. The reviewer measured **16 requests in one 60s window**
(10 burst in 5.6s from a second tab spamming manual refresh, plus 6 refill-paced leader polls).

Three separate statements are wrong or too strong because of it:

- Spec NFR: "≤10 Coinbase requests/minute app-wide, verified structurally by AC-5–AC-13". AC-5
  (spend), AC-6 (refill at 6,000ms), AC-7 (two-tab overdraw of ~1) all pass during the overshoot.
  They test the machinery, not the bound.
- README T1: "capacity 10, continuous refill at 10/minute" is accurate about the mechanism, but
  the surrounding prose ("never exceed the shared budget", the ~1-request overdraw as the only
  admitted deviation) understates the real slack by an order of magnitude.
- UI copy: `n/10 left this minute` and `aria-label="Requests left this minute"` assert a fixed
  window the bucket never implemented.

The common case is genuinely good — N tabs behind one lease poll as a single leader at ~7.5/min,
well inside the cap — which is exactly why this survived: the happy path never exercises it. It
took a second tab and an adversarial finger to surface. That it cost no rubric points (best-two
scoring) is luck, not coverage.

### 2. Stack substitution left the brief's actual subject undemonstrated

The brief (`designs/README.md`) asks for Remix + React. The app is Remix 3 beta with zero React.
ADR 0001 frames this as "superseded by an explicit product/user requirement."

Inside this repo that sentence is true — `CLAUDE.md` records the stack as settled by the repo
owner in 2026-08, and the scaffold was already Remix 3. But the brief's reader has no way to see
that: nothing in `designs/README.md` imposes Remix 3, so "product/user requirement" reads as a
constraint from the brief and doesn't survive a look. The constraint was self-imposed relative to
the exercise, and the ADR should say so in those words.

The larger point is the one the ADR never states: the deviation makes React competence — the
thing a "Remix + React" brief exists to observe — impossible to observe. ADR 0001's Consequences
list ecosystem costs (no shadcn, no dnd-kit, hand-built primitives) and frames the trade as
"zero framework-mismatch debt." It never names the cost to the brief's audience.

### 3. README claims drifted from reality

- "117 tests: unit + router + Chromium component + 1 E2E" → actual, run today: **148 tests, 25
  files, 47 suites, 148 passing, 2 E2E** (AC-100 hydration, AC-105 slot ordering).
- "Full functional contract … (AC-1..103)" → the spec defines AC-1..**AC-106** (AC-104/106
  precision floors, AC-105 slot ordering, all added by Amendment). Same stale range appears in
  the spec's own Definition-of-Done checklist, which therefore does not require the last three
  ACs to map to a passing test — left untouched here, see open item 4.
- "the first run downloads a Chromium build via the `playwright` devDependency" → false.
  `playwright@1.62.1` publishes no `scripts` field and ships no `install.js`; the browsers on this
  machine came from an earlier global `npx playwright install`. A fresh clone gets no browser
  until it runs that. The suite passes here only because the cache already exists.

Small, but this is setup instructions and a verification claim — the two things a reviewer touches
first — and drift-prevention is what this repo's docs discipline is for.

## What changed in this pass

- `docs/conventions.md`: added CONV-api-3 (state a rate limit in the terms the mechanism
  enforces; keep FR, README, and UI copy in the same words), CONV-process-4 (an NFR is verified
  only by an AC that exercises the bound; probe the headline claim adversarially),
  CONV-process-5 (cite the source of every ADR constraint; a deviation from the brief states what
  it makes unobservable), CONV-process-6 (regenerate every number in a shipped doc).
- `.claude/rules/99-rate-limit-claims-match-mechanism.md`,
  `.claude/rules/100-verify-doc-claims-and-attribution.md`.
- `README.md`: corrected the test count (148/2 E2E), the AC range (AC-1..106), and the Chromium
  setup instruction; rewrote T1's "Given up" to lead with the window overshoot; attributed the
  stack decision to the repo owner and named what a non-React build cannot demonstrate; softened
  the intro's "10-requests-per-minute budget" to point at T1 rather than assert a cap the bucket
  does not enforce.
- `docs/adr/0001-...md`: an Addendum recording the correct attribution and the missing
  Consequence. The original Context/Decision text is left intact — ADRs are amended, not
  rewritten.

## Open items for the author (decisions, not curation)

1. ~~**T1 — pick one and make everything agree.**~~ **Done, 2026-08-24** — option (a). `budget.ts`
   is now a sliding-window request log under `nocturne.rates.budget.v2`; FR-9 and the NFR were
   revised, AC-107..AC-117 added as a numbered Amendment (superseding AC-5–AC-9/AC-11), and the
   footnote copy was corrected. **AC-108 replays the reviewer's exact probe** and fails if the
   bound is violated. Recorded in ADR 0008. Verified in a real browser: Refresh reads `Wait 50s`
   with all ten pips empty, not a 6s refill tick.
2. **ADR 0001** *(partly addressed — an Addendum now carries the attribution and the missing
   Consequence; the original Context sentence is left intact, as ADRs here are amended rather than
   rewritten)* — the open form of this would be to rewrite the Context sentence to attribute the constraint to the repo owner
   (`CLAUDE.md`, 2026-08) rather than to an unnamed product requirement, and add the Consequence
   naming what a non-React implementation cannot demonstrate to a brief that asked for React.
3. ~~**Spec DoD range**~~ **Done, 2026-08-24** — the Definition of Done now reads AC-1..AC-117,
   and its E2E line names both AC-100 and AC-105 (it claimed AC-100 was the only E2E criterion).
4. **AC-7's scope** — its comment claims the two-tab race is *the* T1 overdraw; it is one of two,
   and the smaller one. Worth a sentence either way, whichever route item 1 takes.

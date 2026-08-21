# Curation retrospective: crypto-dashboard

- Date: 2026-08-21
- Branch: `feature/crypto-dashboard` (baseline `main`)
- Spec: `specs/crypto-dashboard.spec.md` (AC-1..AC-75, Amendment AC-76)
- Design: `docs/design/crypto-dashboard.md`, `docs/adr/0001`–`0005`
- Commits reviewed: `7c92aa3` Design, `1bb8e17` Spec, `c3e9c90` Red+Green (75/75 ACs),
  `6f30e81` Fix pass (QA + review should-fixes, 84/84 ACs)

## What went well

- **Mid-flight stack correction handled cleanly.** The brief said "Remix + React"; the actual
  scaffold and an explicit user requirement said Remix 3 (non-React). The architect was
  redirected in flight and the decision — including *why* the handoff's React-specific
  suggestions were adapted rather than followed literally — is fully traceable in ADR 0001 and
  `CLAUDE.md`. Nothing was silently reinterpreted.
- **Two spec/test defects were fixed at the correct layer, not routed around.** AC-54's
  self-contradictory example and AC-65's cascading-update-limit trip were both root-caused and
  fixed (spec text, test pacing) rather than patched by weakening an assertion or adding a
  special case in production code.
- **A deliberate architectural deviation is documented, not silent.** ADR 0005 explains exactly
  why all client logic lives under `app/actions/public/rates/` instead of the generic
  `app/utils/` convention (the asset allowlist's security boundary), with the rejected
  alternative (widening `allowFiles`) recorded too.
- **Visual QA earned its keep.** It caught three real defects (0×0 status dot, toolbar overlap
  from a missing global `box-sizing`, missing drag-feedback styling) that 84 passing component
  tests did not and structurally could not catch, since those tests assert `data-*`
  attributes/computed styles, not rendered geometry.
- **Review found real, non-trivial issues without blocking.** Zero blocking findings, but three
  substantive should-fixes (unvalidated BTC divisor, god-module drift, hardcoded hexes) were
  surfaced and — per the diff — the divisor and hex issues were fixed in the "Fix pass" commit;
  the divisor fix was traced back into the spec as Amendment AC-76 rather than just patched
  silently.

## What to change next time

1. **Validate the test harness before writing the suite, not after.** The scaffold's `npm test`
   (`node --test`) never executed `.tsx`/`remix/test` suite bodies — component tests passed
   vacuously until this was caught during RED. A single deliberately-failing test run through the
   real `npm test` command, done *before* writing dozens of tests, would have caught this in
   minutes instead of after a chunk of the suite already existed. This is now `.claude/rules/
   90-verify-test-harness-before-scaling.md`.
2. **Run visual QA earlier, not just before shipping.** All three visual defects were geometry-
   level and invisible to the DOM-attribute-based component tests by construction — this isn't a
   gap in test rigor, it's a gap in test *kind*. A visual QA pass done once the toolbar/list
   layout first renders (not only as a pre-ship gate) would have caught the box-sizing and
   overlap issues while they were cheaper to fix, and before 6+ more component tests were written
   against the same (visually broken) layout.
3. **Spec examples need a self-consistency check, not just a source-fidelity check.** AC-54's
   example value was faithfully copied from the design handoff but contradicted its own AC's
   stated tier boundary. Copying a value from a prototype/handoff is not the same as verifying it
   satisfies the condition the AC is written to demonstrate — worth a specific spec-review pass
   step.

## Gaps / open items for the author

- `rates-dashboard.tsx` is still 705 lines after only a partial extraction (`history.ts`,
  `styles.ts`) against the design brief's planned split (`toolbar.tsx`, `card.tsx`, `row.tsx`,
  `sparkline.tsx`, ...). Not blocking, but flagged twice now (review + this retrospective) —
  worth a dedicated REFACTOR pass before the next feature adds to this file.
- No real two-*browser*-tab test exists for lease/budget/cache handover (ADR 0004's accepted
  gap) — deliberate and documented, not a defect, but still the single largest untested surface
  in cross-tab correctness. Revisit if a real production bug ever surfaces there.
- T2 (virtualization) and T3 (locked/versioned order records) remain decided-only per
  `README.md`'s Tension Decisions — no action needed now, just noting they're the two documented
  seams most likely to need real implementation if usage scales.

## Conventions and rules recorded

See `docs/conventions.md` (14 entries across Structure, Testing, Persistence, Styling,
API/Error handling, Process/Workflow) and `.claude/rules/90-*` through `96-*` (7 advisory rules,
each citing the `CONV-*` ids it encodes). Full list in the accompanying report.

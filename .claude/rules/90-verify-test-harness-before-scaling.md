# Rule: Verify the test harness executes before writing a large suite (advisory — curated)
> Enforces: CONV-testing-1, CONV-testing-2. Advisory — surfaced by /review and /ship, not a commit gate.

- Before writing more than a handful of tests at a given layer (unit/router/component), add one
  deliberately-failing test at that layer and run it through the *actual* project command
  (`npm test`, not a hand-rolled `node --test` invocation) to confirm it fails loudly.
- In this repo, run browser-layer component tests through `remix test`, not raw `node --test` —
  the latter silently skips discovering `*.test.browser.tsx`/`.tsx` suite bodies.
- If a suite "passes" suspiciously fast, or a `.tsx` test file shows zero assertions executed,
  treat that as a harness bug, not a green signal — fix discovery/execution before trusting any
  test written against it.

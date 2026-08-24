# Rule: Verify doc claims and attribute constraints to a real source (advisory — curated)
> Enforces: CONV-process-5, CONV-process-6. Advisory — surfaced by /review and /ship, not a commit gate.

- Re-run the command behind every number in README/docs before shipping and paste the real
  output (test counts, file counts, timings). Shipped drift found by an external reviewer: "117
  tests … + 1 E2E" vs. an actual 148/2, and a claimed automatic Chromium download that
  `playwright`'s published package (no install script, no `install.js`) never performs.
- Verify claims about third-party tool behavior against the installed package, not from memory.
- Every constraint in an ADR names who decided it, when, and which artifact records it. Never
  write a self-imposed constraint in language that implies it came from the brief or a client —
  check that the cited source actually contains it.
- When a decision departs from something the brief explicitly asked for, add a Consequence
  stating what the deviation makes **unobservable** to the brief's audience — not just the
  technical trade-off. Deviating from a specified stack removes the ability to demonstrate
  everything that stack was named to demonstrate.

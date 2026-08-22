# Rule: Pace rapid-interaction test bursts with macrotask yields (advisory — curated)
> Enforces: CONV-process-3. Advisory — surfaced by /review and /ship, not a commit gate.

- A test that drives many rapid sequential interactions (e.g. dozens of simulated clicks/fetches
  in a row) should yield a macrotask between cycles, not chain them as back-to-back microtasks.
- If such a test trips a framework-level cascading-update/render-loop safety limit, treat that
  as a signal the test isn't mirroring real event-loop pacing — fix the test's pacing before
  considering whether the limit itself needs to change.

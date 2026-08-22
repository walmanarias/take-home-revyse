# Rule: Re-check composition-root size against the design's planned module split (advisory — curated)
> Enforces: CONV-structure-3. Advisory — surfaced by /review and /ship, not a commit gate.

- Before calling a feature done, compare the shipped file layout against the design brief's
  planned module list. A single stateful composition root is fine by pattern in this codebase
  (no hooks), but planned extractions (presentational components, style descriptors,
  derived-state helpers) that never happened during REFACTOR are god-module drift, not a
  deliberate simplification.
- Flag it in review even when not blocking; leaving it undone twice in a row is a signal to
  actually extract, not to re-flag indefinitely.

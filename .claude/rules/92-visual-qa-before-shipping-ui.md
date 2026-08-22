# Rule: Run real-browser visual QA before shipping user-facing UI (advisory — curated)
> Enforces: CONV-testing-4. Advisory — surfaced by /review and /ship, not a commit gate.

- Component tests asserting `data-*` attributes, classes, or `getComputedStyle` values do not
  catch rendered-geometry defects (zero-size elements, overlapping regions, missing
  hover/drag-feedback styling). Treat a real-browser visual QA pass as a required, distinct
  check for any change touching layout or new interactive UI — not optional once DOM tests are
  green.
- Run it early enough in the pass (not only right before shipping) that geometry-level fixes
  don't compete with a deadline.

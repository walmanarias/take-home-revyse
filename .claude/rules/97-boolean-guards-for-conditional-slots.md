# Rule: Guard conditional JSX slots with strict booleans (advisory — curated)
> Enforces: CONV-structure-5. Advisory — surfaced by /review and /ship, not a commit gate.

- `{someString && <El/>}` renders the empty string as a real **text node** when the string is
  `''`. It is not "nothing". `diff-dom.ts` pairs unkeyed siblings positionally, so that stray
  node shifts pairing and a slot that turns on later lands in the wrong position — e.g. an error
  banner rendered below the footnote instead of above the list.
- Write `{s !== '' && …}`, `{x !== null && …}`, or `{Boolean(x) && …}`. Grep changed components
  for `{\w+ &&` and confirm each guard's left operand is genuinely boolean.
- Slot *position* is not covered by `data-testid` presence assertions — the node exists either
  way. Assert sibling order at the E2E/hydration layer when a slot is conditional; the defect
  only reproduces on the real hydration path, where SSR boundary markers change the sibling set.

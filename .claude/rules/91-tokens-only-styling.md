# Rule: Style with design tokens, never literal hex (advisory — curated)
> Enforces: CONV-styling-1, CONV-styling-2. Advisory — surfaced by /review and /ship, not a commit gate.

- Component/style code (`styles.ts`, inline `css()`/`style` descriptors) references
  `var(--color-*)` tokens only. If no existing token fits a needed state (warning, negative,
  etc.), add a new semantic token to `tokens.css` next to the base ramps — don't inline a hex.
- Before merging, grep the changed component/style files for `#[0-9a-fA-F]{3,6}` outside
  `tokens.css` and justify or remove any hit.
- Keep `box-sizing: border-box` in the global/base token stylesheet — its absence causes
  padding/border to silently inflate an element's footprint, which reads fine in
  attribute-based tests but overlaps visibly in a real browser.

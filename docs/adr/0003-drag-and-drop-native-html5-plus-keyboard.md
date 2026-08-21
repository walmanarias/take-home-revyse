# ADR 0003: Native HTML5 drag-and-drop + a keyboard reorder path, no DnD library

## Context

The handoff's prototype uses HTML5 drag-and-drop, which is not keyboard-accessible, and
explicitly calls that out as a gap to close ("in the app prefer `@dnd-kit/core` +
`@dnd-kit/sortable`... please add that"). `@dnd-kit` is a React library and is unusable in
Remix 3's non-React component model. Reorder must satisfy T5 (drag operates on the master
order, not the filtered slice) and must be disabled whenever a computed sort (`name`/`usd`/
`delta`) is active, since a computed order has no slots to drop into.

## Decision

Implement drag-and-drop with native HTML5 DnD (`draggable`, `on('dragstart' | 'dragover' |
'drop' | 'dragend', ...)` mixins from `remix/ui`), exactly matching the prototype's pointer
behavior. Add a parallel keyboard path: the drag handle is focusable (`tabIndex={0}`,
`role="button"`) and listens for `ArrowUp`/`ArrowDown` via `on('keydown', ...)`, calling the
same neighbor adjacent to the currently-focused item. Both the pointer path and the keyboard
path call the identical pure function, `order.ts`'s `reorder(order, dragged, target, position)`
— there is exactly one place the T5 semantics are implemented, and it is fully unit-testable
without simulating any DOM event. A shared `aria-live="polite"` region announces the new
position after a keyboard move. `remix/ui/animation`'s `animateLayout(...)` mixin, keyed by
symbol, gives the drop-settle reflow animation for free.

## Consequences

- No new dependency, and no risk of a React-only library being unusable in this framework.
- More manual wiring than a DnD library provides out of the box: no built-in pointer sensors,
  no auto-scroll, no virtualized-list integration. The T2 seam (500+ assets) would need
  hand-rolled windowing plus edge auto-scroll if the drag interaction must extend to it —
  documented as future work, not built now.
- Drag is disabled (no `draggable` attribute, no keyboard handler wiring, cursor left as
  default) whenever `sort !== "custom"`, satisfying the "drag is disabled under computed sorts"
  rule directly in the component that owns drag state, with no separate feature flag needed.
- Because reorder logic lives in one pure function independent of both interaction paths, a
  future addition (e.g., a "move to top" affordance for T2) is an additive call to the same
  function, not a parallel implementation.

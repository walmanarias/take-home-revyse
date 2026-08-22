// Pure windowed-rendering arithmetic (ADR 0006, T2). Rows are a fixed
// height, so the visible slice is computed from scrollTop/viewportHeight
// alone — no DOM measurement, fully unit-testable with injected metrics.

export interface WindowMetrics {
  scrollTop: number
  viewportHeight: number
  rowHeight: number
  overscan: number
  itemCount: number
}

export interface WindowRange {
  startIndex: number
  endIndex: number // exclusive
  topSpacerPx: number
  bottomSpacerPx: number
}

export function computeWindow(metrics: WindowMetrics): WindowRange {
  let { scrollTop, viewportHeight, overscan, itemCount } = metrics
  // Guard against a non-positive row height (a degenerate/misconfigured
  // input the tested cases never exercise) dividing by zero or inverting
  // the range below.
  let rowHeight = Math.max(1, metrics.rowHeight)

  let start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  let end = Math.min(itemCount, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan)

  // Defensive clamps for extreme inputs (e.g. scrollTop far past the end of
  // a short list) that the tested cases never exercise but that would
  // otherwise produce a start past the item count or an inverted range.
  start = Math.min(start, itemCount)
  end = Math.max(start, end)

  return {
    startIndex: start,
    endIndex: end,
    topSpacerPx: start * rowHeight,
    bottomSpacerPx: (itemCount - end) * rowHeight,
  }
}

/**
 * Clamps a (possibly stale) `scrollTop` to the scrollable extent of the
 * current item count. A render triggered by something other than a scroll
 * event (a filter keystroke, a scope switch) can shrink the list under a
 * deep `scrollTop`; without this, `computeWindow` would be handed a start
 * past the end of the just-shrunk list and render a false-empty window
 * (AC-97).
 */
export function clampScrollTop(
  scrollTop: number,
  itemCount: number,
  rowHeight: number,
  viewportHeight: number,
): number {
  let maxScrollTop = Math.max(0, itemCount * rowHeight - viewportHeight)
  return Math.min(scrollTop, maxScrollTop)
}

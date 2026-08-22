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
  let { scrollTop, viewportHeight, rowHeight, overscan, itemCount } = metrics

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

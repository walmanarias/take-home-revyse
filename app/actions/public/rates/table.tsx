// Table-view scaffolding: the shared header row, the windowed scroll
// viewport (ADR 0006, T2), and the drag edge auto-scroller that makes a
// drop target outside the rendered slice reachable. Row geometry lives here
// because it's the only thing that needs it — rows are a fixed height, so
// the visible slice is pure arithmetic over scrollTop, never a DOM
// measurement.

import { on, ref, type RemixNode } from 'remix/ui'

import { clampScrollTop, computeWindow, type WindowRange } from './window.ts'
import {
  TABLE_ROW_HEIGHT_PX,
  tableHeaderCss,
  tableInnerCss,
  tableViewportCss,
  tableWrapCss,
} from './styles.ts'

/** Re-exported from the stylesheet that actually sizes the rows, so the
 * window arithmetic and the rendered geometry can never drift apart. */
export const ROW_HEIGHT_PX = TABLE_ROW_HEIGHT_PX
export const OVERSCAN = 5
/**
 * Seeds the very first render only. The viewport's real height is
 * flexible (it fills whatever the chrome above it leaves), so SSR — which
 * cannot measure anything — and the hydrating client's first render both use
 * this fixed value, and the real measurement arrives from the `ResizeObserver`
 * below on the first post-mount frame (same deferral as the persisted
 * snapshot, AC-100).
 */
export const DEFAULT_VIEWPORT_HEIGHT_PX = 480

const AUTO_SCROLL_EDGE_PX = 32
const AUTO_SCROLL_STEP_PX = 18

/**
 * The window for the table's current metrics. `scrollTop` is clamped to the
 * item count's real scroll extent first: the count can shrink for reasons
 * that never fire a `scroll` event (typing a filter, switching scope), and
 * an unclamped stale `scrollTop` would produce a false-empty window (AC-97).
 */
export function computeTableWindow(
  scrollTop: number,
  viewportHeight: number,
  itemCount: number,
): WindowRange {
  return computeWindow({
    scrollTop: clampScrollTop(scrollTop, itemCount, ROW_HEIGHT_PX, viewportHeight),
    viewportHeight,
    rowHeight: ROW_HEIGHT_PX,
    overscan: OVERSCAN,
    itemCount,
  })
}

export function sameWindow(a: WindowRange | null, b: WindowRange | null): boolean {
  if (!a || !b) return a === b
  return a.startIndex === b.startIndex && a.endIndex === b.endIndex
}

/**
 * Nudges a scroll container while a drag hovers near its top/bottom edge, so
 * a user can drag toward a target currently outside the rendered slice.
 * Owns its own `requestAnimationFrame` handle; `stop()` is idempotent.
 */
export interface AutoScroller {
  /** Starts, redirects, or stops the nudge based on where `clientY` sits in `node`. */
  towardEdge(node: HTMLElement, clientY: number): void
  stop(): void
}

export function createAutoScroller(): AutoScroller {
  let direction: -1 | 0 | 1 = 0
  let frame: number | null = null

  function stop() {
    direction = 0
    if (frame !== null) {
      cancelAnimationFrame(frame)
      frame = null
    }
  }

  function start(node: HTMLElement, next: -1 | 1) {
    if (direction === next) return
    stop()
    direction = next
    let step = () => {
      node.scrollTop += next * AUTO_SCROLL_STEP_PX
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
  }

  return {
    towardEdge(node, clientY) {
      let rect = node.getBoundingClientRect()
      if (clientY - rect.top < AUTO_SCROLL_EDGE_PX) start(node, -1)
      else if (rect.bottom - clientY < AUTO_SCROLL_EDGE_PX) start(node, 1)
      else stop()
    },
    stop,
  }
}

/** Shared by curated-scope (unwindowed) and All-scope (windowed) table view. */
export function renderTableHeader() {
  return (
    <div data-testid="table-header" mix={tableHeaderCss}>
      <span aria-hidden="true" />
      <span>Asset</span>
      <span>USD</span>
      <span>BTC</span>
      <span>Session Δ</span>
      <span>Trend</span>
      <span aria-hidden="true" />
    </div>
  )
}

export function renderPlainTable(rows: RemixNode) {
  return (
    <div mix={tableWrapCss}>
      <div mix={tableInnerCss}>
        {renderTableHeader()}
        {rows}
      </div>
    </div>
  )
}

export interface WindowedTableProps {
  range: WindowRange
  rows: RemixNode
  /** Total rows the window stands in for — spacers must preserve the full scroll extent. */
  totalCount: number
  /**
   * Whether a reorder drag is live right now. A predicate, not a boolean:
   * a drag can start and end within one event turn, so a render-time
   * snapshot would be stale exactly when auto-scroll needs to engage.
   */
  isDragActive(): boolean
  autoScroller: AutoScroller
  onScroll(scrollTop: number, viewportHeight: number): void
  /** The viewport's real rendered height, on mount and on every resize. */
  onMeasure(viewportHeight: number): void
  /** A drag ended or left the viewport without a valid drop (AC-102). */
  onDragCancel(): void
}

export function renderWindowedTable(props: WindowedTableProps) {
  let { range, autoScroller } = props

  // AC-102: the viewport is always mounted for the lifetime of the windowed
  // table, unlike any individual row — auto-scroll can move the dragged
  // row's own node out of the rendered window, so `dragend`/`dragleave`/
  // `drop` reaching the dragged row's own (possibly already-unmounted)
  // handle is not a reliable cleanup path. These mirror that cleanup on an
  // ancestor that never unmounts.
  let cancelDrag = () => {
    autoScroller.stop()
    props.onDragCancel()
  }

  return (
    <div
      data-testid="table-viewport"
      mix={[
        tableViewportCss,
        // The viewport's height is CSS-driven (it fills the leftover column
        // space), so the row window has to follow the real rendered box
        // rather than a hardcoded guess — otherwise a tall screen renders a
        // short slice and leaves visible dead space below the last row.
        ref((node, signal) => {
          props.onMeasure(node.clientHeight || DEFAULT_VIEWPORT_HEIGHT_PX)
          if (typeof ResizeObserver === 'undefined') return
          let observer = new ResizeObserver(() => {
            props.onMeasure(node.clientHeight || DEFAULT_VIEWPORT_HEIGHT_PX)
          })
          observer.observe(node)
          signal.addEventListener('abort', () => observer.disconnect())
        }),
        on<HTMLElement, 'scroll'>('scroll', (event) => {
          let node = event.currentTarget
          props.onScroll(node.scrollTop, node.clientHeight || DEFAULT_VIEWPORT_HEIGHT_PX)
        }),
        on<HTMLElement, 'dragover'>('dragover', (event) => {
          if (!props.isDragActive()) return
          autoScroller.towardEdge(event.currentTarget, event.clientY)
        }),
        on<HTMLElement, 'dragend'>('dragend', cancelDrag),
        on<HTMLElement, 'dragleave'>('dragleave', (event) => {
          autoScroller.stop()
          let related = event.relatedTarget as Node | null
          if (related && event.currentTarget.contains(related)) return
          props.onDragCancel()
        }),
        on<HTMLElement, 'drop'>('drop', cancelDrag),
      ]}
    >
      <div mix={tableInnerCss}>
        {renderTableHeader()}
        <div
          data-testid="window-spacer-top"
          data-row-count={String(range.startIndex)}
          style={{ height: `${range.topSpacerPx}px` }}
        />
        {props.rows}
        <div
          data-testid="window-spacer-bottom"
          data-row-count={String(props.totalCount - range.endIndex)}
          style={{ height: `${range.bottomSpacerPx}px` }}
        />
      </div>
    </div>
  )
}

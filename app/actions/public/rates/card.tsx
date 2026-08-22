// One asset's row/tile. Both views render the identical leaf pieces —
// badge, titles, pin, drag handle, USD/BTC/Δ values, sparkline — with the
// same data-testid/aria/event contract; only their grouping and the
// container's layout css differ. Presentation and DOM event plumbing live
// here; every decision that needs app state is a callback on `CardHandlers`,
// so this module holds no state of its own (CONV-structure-3).

import { on } from 'remix/ui'

import { displayNameFor } from './currencies.ts'
import { computeDelta } from './history.ts'
import { formatBtc, formatDelta, formatUsd } from './format.ts'
import type { Rate } from './rate.ts'
import type { ViewMode } from './snapshot.ts'
import { renderSparkline, sparkPoints } from './sparkline.tsx'
import {
  badgeCss,
  btcValueCss,
  cardCss,
  cardHeaderCss,
  dragHandleCss,
  focusRingCss,
  footerRowCss,
  nameCss,
  pinButtonCss,
  priceRowCss,
  symbolCss,
  tableAssetCellCss,
  tableRowCss,
  tableTrendCellCss,
  titlesCss,
  usdCaptionCss,
  usdValueCss,
} from './styles.ts'

export type MoveDirection = 'up' | 'down'

/** Every state-dependent decision a card defers to the composition root. */
export interface CardHandlers {
  onTogglePin(symbol: string): void
  onDragStart(symbol: string): void
  onDragEnd(): void
  onDragOverRow(symbol: string): void
  onDragLeaveRow(symbol: string): void
  onDropRow(symbol: string): void
  onKeyboardMove(symbol: string, direction: MoveDirection): void
}

export interface AssetCardProps {
  symbol: string
  rate: Rate | undefined
  history: readonly number[]
  view: ViewMode
  pinned: boolean
  /** Filtered out: kept in the DOM (so master-order reorder stays intact) but visually hidden. */
  hidden: boolean
  /** Expired tier — numeric values dim to signal they're no longer prices. */
  dim: boolean
  /** Reordering is possible at all (sort is "custom"). */
  draggable: boolean
  /** This row participates in reordering (curated or pinned) — AC-90. */
  showHandle: boolean
  isDragged: boolean
  isOver: boolean
  handlers: CardHandlers
}

type DeltaSign = 'positive' | 'negative' | 'neutral'

function deltaSignOf(delta: number | null): DeltaSign {
  if (delta === null || delta === 0) return 'neutral'
  return delta > 0 ? 'positive' : 'negative'
}

function deltaColorOf(sign: DeltaSign): string {
  if (sign === 'positive') return 'var(--color-accent-400)'
  if (sign === 'negative') return 'var(--color-negative)'
  return 'var(--color-neutral-700)'
}

export function renderAssetCard(props: AssetCardProps) {
  let { symbol, rate, history, view, handlers } = props
  let name = displayNameFor(symbol)
  let delta = computeDelta(history)
  let sign = deltaSignOf(delta)
  let deltaColor = deltaColorOf(sign)
  let isDropTarget = props.isOver && !props.isDragged

  let badge = <span mix={badgeCss}>{symbol.slice(0, 3)}</span>

  let titles = (
    <span mix={titlesCss}>
      <span mix={nameCss}>{name}</span>
      <span mix={symbolCss}>{symbol}</span>
    </span>
  )

  let pinButton = (
    <button
      type="button"
      data-testid="pin-button"
      class="focus-ring"
      data-pinned={props.pinned ? 'true' : 'false'}
      aria-label={`${props.pinned ? 'Unpin' : 'Pin'} ${name}`}
      mix={[focusRingCss, pinButtonCss(props.pinned), on('click', () => handlers.onTogglePin(symbol))]}
    >
      ★
    </button>
  )

  // Drag/keyboard handles exist only on curated or pinned rows (AC-90) — an
  // untracked "All"-scope row renders no handle at all, not merely a
  // non-draggable one.
  let dragHandle = !props.showHandle ? null : (
    <span
      data-testid="drag-handle"
      class="focus-ring"
      role="button"
      tabIndex={0}
      aria-label={`Reorder ${name} (${symbol})`}
      draggable={props.draggable}
      mix={[
        focusRingCss,
        dragHandleCss(props.draggable),
        on('dragstart', () => {
          if (!props.draggable) return
          handlers.onDragStart(symbol)
        }),
        on('dragend', () => handlers.onDragEnd()),
        on('keydown', (event) => {
          if (!props.draggable) return
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
          event.preventDefault()
          handlers.onKeyboardMove(symbol, event.key === 'ArrowUp' ? 'up' : 'down')
        }),
      ]}
    >
      ⠿
    </span>
  )

  let usdValue = (
    <span
      data-testid="usd-value"
      mix={usdValueCss}
      style={{ color: props.dim ? 'var(--color-neutral-500)' : 'var(--color-text)' }}
    >
      {rate ? formatUsd(rate.usd) : '—'}
    </span>
  )

  let btcValue = (
    <span data-testid="btc-value" mix={btcValueCss}>
      {symbol === 'BTC' ? '—' : rate ? formatBtc(rate.btc) : '—'}
    </span>
  )

  let deltaValue = (
    <span data-testid="delta-value" data-sign={sign} style={{ color: deltaColor }}>
      {delta === null ? '—' : formatDelta(delta)}
    </span>
  )

  let sparkline = renderSparkline(sparkPoints(history), deltaColor)

  // Handoff drag feedback: the dragged card/row drops to opacity .35; the
  // hovered drop target fills with a translucent accent tint plus an inset
  // accent edge.
  let containerStyle = {
    opacity: props.isDragged ? 0.35 : undefined,
    background: isDropTarget
      ? 'color-mix(in srgb, var(--color-accent-500) 12%, var(--color-surface))'
      : undefined,
    boxShadow: isDropTarget ? 'inset 0 0 0 1px var(--color-accent-700)' : undefined,
  }

  let dragMixins = [
    // Only `draggable` is checked here: it's derived from the sort mode, so
    // it can't change without a re-render. Whether a drag is actually in
    // flight is live state the root owns — a render-time snapshot of it
    // would be stale for any gesture that starts and drops within a single
    // event turn, so these always delegate and the root guards.
    on<HTMLElement, 'dragenter'>('dragenter', (event) => {
      if (!props.draggable) return
      event.preventDefault()
      handlers.onDragOverRow(symbol)
    }),
    on<HTMLElement, 'dragover'>('dragover', (event) => {
      if (!props.draggable) return
      event.preventDefault()
      handlers.onDragOverRow(symbol)
    }),
    on<HTMLElement, 'dragleave'>('dragleave', (event) => {
      let related = event.relatedTarget as Node | null
      if (related && event.currentTarget.contains(related)) return
      handlers.onDragLeaveRow(symbol)
    }),
    on<HTMLElement, 'drop'>('drop', (event) => {
      if (!props.draggable) return
      event.preventDefault()
      handlers.onDropRow(symbol)
    }),
  ]

  let container = {
    key: symbol,
    'data-testid': 'asset-card',
    'data-symbol': symbol,
    'data-name': name,
    'data-hidden': props.hidden ? 'true' : undefined,
    'data-dimmed': props.dim ? 'true' : undefined,
    'data-history-length': String(history.length),
    style: containerStyle,
  }

  if (view === 'table') {
    return (
      <div {...container} mix={[tableRowCss, ...dragMixins]}>
        {/* A handle-less (untracked All-scope) row still needs a grid child
            occupying the handle column — an empty placeholder, not a missing
            child — or the grid's implicit auto-placement shifts every
            following cell one column left (AC-99). */}
        {dragHandle ?? <span aria-hidden="true" />}
        <span mix={tableAssetCellCss}>
          {badge}
          {titles}
        </span>
        {usdValue}
        {btcValue}
        {deltaValue}
        <span mix={tableTrendCellCss}>{sparkline}</span>
        {pinButton}
      </div>
    )
  }

  return (
    <div {...container} mix={[cardCss, ...dragMixins]}>
      <div mix={cardHeaderCss}>
        {badge}
        {titles}
        {pinButton}
        {dragHandle}
      </div>

      <div mix={priceRowCss}>
        <span>
          <span mix={usdCaptionCss}>USD</span>
          {usdValue}
        </span>
        {sparkline}
      </div>

      <div mix={footerRowCss}>
        {btcValue}
        {deltaValue}
      </div>
    </div>
  )
}


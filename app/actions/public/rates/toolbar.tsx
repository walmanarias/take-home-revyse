// The dashboard toolbar: filter box, the three segmented controls (sort ·
// scope · view), the budget-aware refresh button, the auto-poll checkbox,
// and the staleness dot. Pure presentation over already-derived values —
// every choice is a callback back into the composition root.

import { on } from 'remix/ui'

import type { Scope, ViewMode } from './snapshot.ts'
import type { SortMode } from './sort.ts'
import type { Staleness } from './cache.ts'
import type { BudgetView, StatusView } from './status.ts'
import {
  autoLabelCss,
  btnCss,
  filterWrapCss,
  focusRingCss,
  inputCss,
  matchCounterCss,
  segButtonCss,
  segCss,
  statusCss,
  statusDotCss,
  toolbarCss,
} from './styles.ts'

export interface ToolbarHandlers {
  onFilterChange(value: string): void
  onSortChange(mode: SortMode): void
  onScopeChange(scope: Scope): void
  onViewChange(view: ViewMode): void
  onRefresh(): void
  onAutoChange(enabled: boolean): void
}

export interface ToolbarProps {
  filter: string
  /** Normalized filter (trimmed + lowercased) — empty means "not filtering". */
  query: string
  visibleCount: number
  universeSize: number
  sort: SortMode
  scope: Scope
  /** The view actually in effect — "All" scope forces table (ADR 0006). */
  effectiveView: ViewMode
  auto: boolean
  autoLabel: string
  pending: boolean
  budget: BudgetView
  tier: Staleness
  status: StatusView
  handlers: ToolbarHandlers
}

const SORT_OPTIONS: ReadonlyArray<readonly [SortMode, string]> = [
  ['custom', 'My order'],
  ['name', 'Name'],
  ['usd', 'Price'],
  ['delta', 'Change'],
]

/**
 * Shared segmented-control button shape used by the sort, view, and scope
 * toggles, so event wiring and the aria-pressed contract stay a single
 * definition.
 */
function segButton(
  testId: string,
  label: string,
  pressed: boolean,
  onClick: () => void,
  disabled = false,
) {
  return (
    <button
      key={testId}
      type="button"
      data-testid={testId}
      class="focus-ring"
      aria-pressed={pressed}
      disabled={disabled}
      mix={[focusRingCss, segButtonCss, on('click', onClick)]}
    >
      {label}
    </button>
  )
}

export function renderToolbar(props: ToolbarProps) {
  let { handlers, budget } = props
  let budgetSpent = budget.whole < 1

  return (
    <div mix={toolbarCss}>
      <div mix={filterWrapCss}>
        <input
          type="text"
          data-testid="filter-input"
          class="focus-ring"
          aria-label="Filter by name or symbol"
          placeholder='Filter by name or symbol — try "eth"'
          value={props.filter}
          mix={[
            focusRingCss,
            inputCss,
            on<HTMLInputElement>('input', (event) => handlers.onFilterChange(event.currentTarget.value)),
          ]}
        />
        {props.query && (
          <span data-testid="match-counter" mix={matchCounterCss}>
            {`${props.visibleCount}/${props.universeSize}`}
          </span>
        )}
      </div>

      <div role="group" aria-label="Sort" mix={segCss}>
        {SORT_OPTIONS.map(([mode, label]) =>
          segButton(`sort-${mode}`, label, props.sort === mode, () => handlers.onSortChange(mode)),
        )}
      </div>

      <div role="group" aria-label="Scope" data-testid="scope-toggle" mix={segCss}>
        {segButton('scope-toggle-curated', 'Curated 15', props.scope === 'curated', () =>
          handlers.onScopeChange('curated'),
        )}
        {segButton('scope-toggle-all', 'All', props.scope === 'all', () => handlers.onScopeChange('all'))}
      </div>

      <div role="group" aria-label="View" data-testid="view-toggle" mix={segCss}>
        {/* "All" scope forces (and locks) table view — cards can't window a
            reflowing grid (ADR 0006). The Cards option disables while locked;
            Table stays clickable (already the effective view, a no-op). */}
        {segButton(
          'view-toggle-cards',
          'Cards',
          props.effectiveView === 'cards',
          () => handlers.onViewChange('cards'),
          props.scope === 'all',
        )}
        {segButton('view-toggle-table', 'Table', props.effectiveView === 'table', () =>
          handlers.onViewChange('table'),
        )}
      </div>

      <button
        type="button"
        data-testid="refresh-button"
        class="focus-ring"
        disabled={props.pending || budgetSpent}
        title={
          budgetSpent
            ? `Budget spent — a request frees up in ${budget.nextTokenIn}s`
            : 'Spend one request now'
        }
        mix={[focusRingCss, btnCss, on('click', () => handlers.onRefresh())]}
      >
        {budgetSpent ? `Wait ${budget.nextTokenIn}s` : 'Refresh'}
      </button>

      <label mix={autoLabelCss}>
        <input
          type="checkbox"
          data-testid="auto-checkbox"
          class="focus-ring"
          checked={props.auto}
          mix={[
            focusRingCss,
            on<HTMLInputElement>('change', (event) => handlers.onAutoChange(event.currentTarget.checked)),
          ]}
        />
        Auto · <span data-testid="auto-label">{props.autoLabel}</span>
      </label>

      <div mix={statusCss}>
        <span
          data-testid="status-dot"
          data-tier={props.tier}
          mix={statusDotCss}
          style={{ background: props.status.color, boxShadow: `0 0 8px ${props.status.color}` }}
        />
        <span data-testid="status-label" aria-live="polite">
          {props.status.label}
        </span>
      </div>
    </div>
  )
}

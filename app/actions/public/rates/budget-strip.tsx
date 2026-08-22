// The request-budget meter (FR-9): ten pips, the "n/10 left" label, and the
// polling-role caption. A pure render helper over already-derived values —
// the composition root passes `BudgetView` + leadership, nothing else.

import { BUDGET_CAP } from './budget.ts'
import { formatBudgetLabel, type BudgetView } from './status.ts'
import { budgetCaptionCss, budgetLabelCss, budgetStripCss, pipCss, pipsCss, roleLabelCss } from './styles.ts'

export function renderBudgetStrip(budget: BudgetView, isLeader: boolean) {
  return (
    <div mix={budgetStripCss}>
      <span mix={budgetCaptionCss}>Request budget</span>
      <div aria-label="Requests left this minute" mix={pipsCss}>
        {Array.from({ length: BUDGET_CAP }, (_, i) => (
          <span key={i} data-testid="budget-pip" data-filled={i < budget.whole ? 'true' : 'false'} mix={pipCss} />
        ))}
      </div>
      <span data-testid="budget-label" mix={budgetLabelCss}>
        {formatBudgetLabel(budget)}
      </span>
      <span mix={roleLabelCss}>
        {isLeader ? 'this tab polls for all tabs' : 'another tab is polling — results arrive here free'}
      </span>
    </div>
  )
}

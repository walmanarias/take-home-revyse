// Derived-state helpers for the dashboard's status/banner/budget/auto
// chrome (FR-9, FR-11, T4). Pure — every input is a plain value the
// composition root already holds, so each rule is unit-testable without a
// DOM and the root stays a wiring layer (CONV-structure-3).

import { BUDGET_CAP, BUDGET_WINDOW_MS } from './budget.ts'
import type { Staleness } from './cache.ts'

export const POLL_MS = 8000
export const POLL_SECONDS = POLL_MS / 1000

export const NO_CACHE_BANNER =
  "No cached rates on this device yet, and the feed isn't answering. Values stay blank rather " +
  `than guessing — retrying every ${POLL_SECONDS}s.`

export interface StatusView {
  label: string
  color: string
}

export interface BudgetView {
  whole: number
  nextTokenIn: number
}

export function formatAge(ms: number): string {
  let seconds = ms / 1000
  return seconds < 60 ? `${Math.round(seconds)}s ago` : `${Math.round(seconds / 60)}m ago`
}

export function computeStatus(tier: Staleness, ageMs: number, failures: number): StatusView {
  if (tier === 'none') {
    return failures > 0
      ? { label: 'Feed unreachable', color: 'var(--color-negative)' }
      : { label: 'Fetching first rates…', color: 'var(--color-neutral-500)' }
  }

  let ageText = formatAge(ageMs)
  if (tier === 'live') return { label: `Live · ${ageText}`, color: 'var(--color-accent-400)' }
  if (tier === 'stale') return { label: `Stale · ${ageText}`, color: 'var(--color-warning)' }
  return { label: `Last known good · ${ageText}`, color: 'var(--color-negative)' }
}

export function computeBanner(
  tier: Staleness,
  hasRates: boolean,
  failures: number,
  ageText: string,
): string | null {
  if (tier === 'expired') {
    return (
      `Showing the last values we trust, from ${ageText}. Past two minutes we stop treating them ` +
      'as prices: figures dim and the dot turns red. Nothing here is an error page.'
    )
  }
  if (!hasRates && failures > 0) return NO_CACHE_BANNER
  return null
}

export function computeBudgetView(tokens: number): BudgetView {
  let whole = Math.floor(tokens)
  let fractional = tokens - whole
  let nextTokenIn = Math.ceil(((1 - fractional) * (BUDGET_WINDOW_MS / BUDGET_CAP)) / 1000)
  return { whole, nextTokenIn }
}

export function formatBudgetLabel(view: BudgetView): string {
  return view.whole >= BUDGET_CAP
    ? `${view.whole}/${BUDGET_CAP} left this minute`
    : `${view.whole}/${BUDGET_CAP} left this minute · +1 in ${view.nextTokenIn}s`
}

export interface AutoLabelInputs {
  auto: boolean
  pending: boolean
  now: number
  lastAttempt: number | null
}

export function computeAutoLabel({ auto, pending, now, lastAttempt }: AutoLabelInputs): string {
  if (!auto) return 'off'
  if (pending) return 'now'
  let elapsed = now - (lastAttempt ?? now)
  let remaining = Math.max(0, Math.ceil((POLL_MS - elapsed) / 1000))
  return `${remaining}s`
}

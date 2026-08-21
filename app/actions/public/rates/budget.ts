// Shared leaky-bucket request budget (FR-9). Every persisted read/write goes
// through `persisted.ts` so a missing/corrupt record degrades to a fresh
// bucket instead of throwing.

import { type KVStore, readJSON, writeJSON } from './persisted.ts'

export interface BudgetState {
  tokens: number
  ts: number
}

export interface BudgetStore {
  read(now: number): BudgetState
  trySpend(now: number): boolean
}

export const BUDGET_KEY = 'nocturne.rates.budget.v1'
export const BUDGET_CAP = 10
export const BUDGET_WINDOW_MS = 60_000

function isBudgetState(value: unknown): value is BudgetState {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { tokens?: unknown }).tokens === 'number' &&
    typeof (value as { ts?: unknown }).ts === 'number'
  )
}

export function createBudgetStore(kv: KVStore, _clock: () => number): BudgetStore {
  function refill(now: number): BudgetState {
    let stored = readJSON<BudgetState>(kv, BUDGET_KEY, { tokens: BUDGET_CAP, ts: now }, isBudgetState)
    let elapsed = now - stored.ts
    let tokens = Math.min(BUDGET_CAP, stored.tokens + (elapsed / BUDGET_WINDOW_MS) * BUDGET_CAP)
    return { tokens: Math.max(0, tokens), ts: now }
  }

  return {
    read(now) {
      return refill(now)
    },
    trySpend(now) {
      let state = refill(now)
      if (state.tokens < 1) return false
      writeJSON(kv, BUDGET_KEY, { tokens: state.tokens - 1, ts: now })
      return true
    },
  }
}

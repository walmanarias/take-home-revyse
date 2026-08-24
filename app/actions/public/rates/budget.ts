// Shared sliding-window request log (FR-9, amendment AC-107..AC-116). A grant
// is allowed only while fewer than `BUDGET_CAP` grants fall inside the trailing
// `BUDGET_WINDOW_MS`, so no 60-second window anywhere on the timeline ever holds
// more than 10 requests. (The superseded leaky bucket capped the long-run
// average instead, which let a burst plus refill-paced spends reach ~2x the cap
// inside one window — see the 2026-08-24 amendment.)
//
// Every persisted read/write goes through `persisted.ts` so a missing, corrupt,
// or legacy-shaped record degrades to a fresh window instead of throwing. The
// v1 bucket record is never read or migrated: a budget is at most 60s of state.

import { type KVStore, readJSON, writeJSON } from './persisted.ts'

export interface BudgetState {
  /** Timestamps of granted requests, oldest first, pruned to the window on write. */
  stamps: number[]
}

export interface BudgetReading {
  /** Grants still available inside the trailing window. */
  remaining: number
  /** Time until the oldest in-window grant leaves it, freeing a slot; 0 when the window is empty. */
  slotFreesInMs: number
}

export interface BudgetStore {
  read(now: number): BudgetReading
  trySpend(now: number): boolean
}

export const BUDGET_KEY = 'nocturne.rates.budget.v2'
export const BUDGET_CAP = 10
export const BUDGET_WINDOW_MS = 60_000

function isBudgetState(value: unknown): value is BudgetState {
  let stamps = (value as { stamps?: unknown } | null)?.stamps
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray(stamps) &&
    stamps.every((stamp) => typeof stamp === 'number' && Number.isFinite(stamp))
  )
}

export function createBudgetStore(kv: KVStore, _clock: () => number): BudgetStore {
  function windowAt(now: number): number[] {
    let stored = readJSON<BudgetState>(kv, BUDGET_KEY, { stamps: [] }, isBudgetState)
    // A stamp dated after `now` came from a clock that has since moved backwards
    // (AC-112) — counting it would lock the budget out for far longer than one
    // window, so it is discarded rather than trusted.
    return stored.stamps.filter((stamp) => stamp <= now && now - stamp < BUDGET_WINDOW_MS)
  }

  return {
    read(now) {
      let stamps = windowAt(now)
      return {
        remaining: Math.max(0, BUDGET_CAP - stamps.length),
        slotFreesInMs: stamps.length === 0 ? 0 : Math.min(...stamps) + BUDGET_WINDOW_MS - now,
      }
    },
    trySpend(now) {
      let stamps = windowAt(now)
      if (stamps.length >= BUDGET_CAP) return false
      writeJSON(kv, BUDGET_KEY, { stamps: [...stamps, now] })
      return true
    },
  }
}

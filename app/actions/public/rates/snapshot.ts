// Everything localStorage-derived that can change what the very first
// render shows (AC-100), read in one place so both call sites in the
// composition root — the synchronous setup-time read of a direct test mount
// and the post-mount adoption of a real hydration — go through identical
// logic and apply the result together in one `handle.update()`.

import { readCache, type RatesCache } from './cache.ts'
import { SYMBOLS } from './currencies.ts'
import { readOrderRecord } from './order-store.ts'
import { isStringArray, readJSON, type KVStore } from './persisted.ts'

export type ViewMode = 'cards' | 'table'
export type Scope = 'curated' | 'all'

export const FAVS_KEY = 'nocturne.rates.favs.v1'
export const VIEW_KEY = 'nocturne.rates.view.v1'
export const SCOPE_KEY = 'nocturne.rates.scope.v1'

export const CURATED_SYMBOLS: readonly string[] = SYMBOLS

export interface PersistedSnapshot {
  cache: RatesCache | null
  favs: string[]
  order: string[]
  orderUpdatedAt: number
  view: ViewMode
  scope: Scope
}

export function isViewMode(value: unknown): value is ViewMode {
  return value === 'cards' || value === 'table'
}

export function isScope(value: unknown): value is Scope {
  return value === 'curated' || value === 'all'
}

/** The symbols an `order` record may legitimately carry: curated plus current pins. */
export function validSymbolsForOrder(favs: readonly string[]): string[] {
  return Array.from(new Set([...CURATED_SYMBOLS, ...favs]))
}

export function readPersistedSnapshot(kv: KVStore, clock: () => number): PersistedSnapshot {
  let cache = readCache(kv)
  // A previously-pinned uncurated symbol (ADR 0006) is only "valid" to keep
  // across a reload if we have some evidence it's a real symbol — the
  // last-known-good cache's own fetched universe is the best guess
  // available without a fetch having run this session yet.
  let knownUniverse = cache ? Object.keys(cache.rates) : []
  let favs = readJSON<string[]>(kv, FAVS_KEY, [], isStringArray).filter(
    (symbol) => CURATED_SYMBOLS.includes(symbol) || knownUniverse.includes(symbol),
  )
  let orderRecord = readOrderRecord(kv, validSymbolsForOrder(favs), clock)
  let view = readJSON<ViewMode>(kv, VIEW_KEY, 'cards', isViewMode)
  let scope = readJSON<Scope>(kv, SCOPE_KEY, 'curated', isScope)
  return {
    cache,
    favs,
    order: orderRecord.order,
    orderUpdatedAt: orderRecord.updatedAt,
    view,
    scope,
  }
}

/**
 * The fixed shape SSR always renders (no localStorage there, ever) — exactly
 * what `readPersistedSnapshot()` would compute against an empty kv, kept as
 * an explicit constant-shaped default rather than a real (if inert) round
 * trip.
 */
export function coldSnapshot(clock: () => number): PersistedSnapshot {
  return {
    cache: null,
    favs: [],
    order: [...CURATED_SYMBOLS],
    orderUpdatedAt: clock(),
    view: 'cards',
    scope: 'curated',
  }
}

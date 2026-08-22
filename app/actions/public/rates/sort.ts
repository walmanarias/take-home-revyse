// Sort strategies (Strategy pattern) + pin-to-top decorator. Pure — no DOM,
// no clock, no I/O.

import { displayNameFor } from './currencies.ts'

export type SortMode = 'custom' | 'name' | 'usd' | 'delta'

type RatesMap = Record<string, { usd: number; btc: number }> | null

function comparatorFor(
  mode: SortMode,
  rates: RatesMap,
  deltas: Record<string, number>,
): ((a: string, b: string) => number) | null {
  switch (mode) {
    case 'name':
      return (a, b) => displayNameFor(a).localeCompare(displayNameFor(b))
    case 'usd':
      return (a, b) => (rates?.[b]?.usd ?? 0) - (rates?.[a]?.usd ?? 0)
    case 'delta':
      return (a, b) => (deltas[b] ?? 0) - (deltas[a] ?? 0)
    case 'custom':
    default:
      return null
  }
}

export function sortSymbols(
  mode: SortMode,
  symbols: string[],
  favs: string[],
  rates: RatesMap,
  deltas: Record<string, number>,
): string[] {
  let ordered = [...symbols]
  let comparator = comparatorFor(mode, rates, deltas)
  if (comparator) ordered.sort(comparator)

  let pinned = ordered.filter((symbol) => favs.includes(symbol))
  let unpinned = ordered.filter((symbol) => !favs.includes(symbol))
  return [...pinned, ...unpinned]
}

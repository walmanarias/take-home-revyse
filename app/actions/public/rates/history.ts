// Session-scoped USD sample history: FIFO accumulation (capped) plus the
// session Δ derived from it. Pure — no DOM, no clock, no I/O.

export const HISTORY_LIMIT = 48

export function appendHistory(
  history: Record<string, number[]>,
  newRates: Record<string, { usd: number; btc: number }>,
): Record<string, number[]> {
  let next: Record<string, number[]> = { ...history }
  for (let symbol of Object.keys(newRates)) {
    let previous = next[symbol] ?? []
    next[symbol] = [...previous, newRates[symbol]!.usd].slice(-HISTORY_LIMIT)
  }
  return next
}

export function computeDelta(history: number[]): number | null {
  if (history.length < 2) return null
  let first = history[0]!
  let last = history[history.length - 1]!
  // A zero first sample would make percent-change undefined (division by
  // zero); treat it the same as "not enough signal yet" rather than ±Infinity.
  if (!first) return null
  return ((last - first) / first) * 100
}

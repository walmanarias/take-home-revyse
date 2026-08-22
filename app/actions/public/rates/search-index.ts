// Filtering off the render path (ADR 0006, T2): a lowercased search index
// built once per symbol-universe change (scope toggle, or a fetch
// introducing symbols not seen this session) rather than recomputing a
// lowercased concatenation per keystroke per row.

export function buildSearchIndex(
  symbols: readonly string[],
  displayNameFor: (symbol: string) => string,
): Map<string, string> {
  let index = new Map<string, string>()
  for (let symbol of symbols) {
    index.set(symbol, `${symbol} ${displayNameFor(symbol)}`.toLowerCase())
  }
  return index
}

export function matchesQuery(index: Map<string, string>, symbol: string, query: string): boolean {
  if (!query) return true
  return index.get(symbol)?.includes(query) ?? false
}

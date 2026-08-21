// Typed localStorage-shaped helpers. Every read degrades to a fallback
// instead of throwing on missing, corrupt, or version-mismatched data — see
// specs/crypto-dashboard.spec.md AC-48..AC-51.

export interface KVStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function readJSON<T>(
  kv: KVStore,
  key: string,
  fallback: T,
  validate?: (value: unknown) => value is T,
): T {
  let raw: string | null
  try {
    raw = kv.getItem(key)
  } catch {
    return fallback
  }
  if (raw == null) return fallback

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fallback
  }

  if (validate && !validate(parsed)) return fallback
  return parsed as T
}

export function writeJSON<T>(kv: KVStore, key: string, value: T): void {
  try {
    kv.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can throw (e.g. private-browsing quota) — treat as a no-op.
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/**
 * Reads a persisted symbol order, dropping symbols no longer in
 * `validSymbols` and appending any valid symbol missing from the stored
 * order (preserving `validSymbols`' own relative order for the appended
 * tail).
 */
export function readOrder(
  kv: KVStore,
  key: string,
  validSymbols: string[],
  fallback: string[],
): string[] {
  let stored = readJSON<string[] | null>(kv, key, null, isStringArray)
  let source = stored ?? fallback
  let filtered = source.filter((symbol) => validSymbols.includes(symbol))
  let missing = validSymbols.filter((symbol) => !filtered.includes(symbol))
  return [...filtered, ...missing]
}

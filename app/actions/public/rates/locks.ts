// Web Locks API port (ADR 0007). `LocksPort` is the structural seam
// `order-store.ts` writes through; `createLocksPort()` is the one real
// adapter, guarded so SSR and browsers without `navigator.locks` silently
// degrade to `writeOrder`'s unlocked path — no crash, no feature loss beyond
// the lock's collision protection ("no error page, ever").

/**
 * Structural port over `navigator.locks.request` so production code can
 * inject the real Web Locks API and tests can inject a deterministic fake —
 * see `test/support/fakes.ts`'s `createSerializingLocksPort()`. `fn`'s
 * signature mirrors `LockGrantedCallback` (`(lock) => ...`) so a real
 * `LockManager` can be passed through without a shape-widening cast; the
 * `lock` parameter is optional since callers here never need it.
 */
export interface LocksPort {
  request<T>(name: string, fn: (lock?: Lock | null) => Promise<T> | T): Promise<T>
}

export function createLocksPort(): LocksPort | undefined {
  if (typeof navigator === 'undefined') return undefined
  let manager = navigator.locks
  if (!manager) return undefined
  return {
    request<T>(name: string, fn: (lock?: Lock | null) => Promise<T> | T): Promise<T> {
      return manager.request(name, fn)
    },
  }
}

// Pure master-order reorder semantics (T5 — ADR 0003). Shared by both the
// HTML5 drag path and the keyboard path in rates-dashboard.tsx.

export function reorder<T>(order: T[], dragged: T, target: T, position: 'before' | 'after'): T[] {
  if (dragged === target) return [...order]

  let without = order.filter((symbol) => symbol !== dragged)
  let targetIndex = without.indexOf(target)
  let insertAt = position === 'after' ? targetIndex + 1 : targetIndex

  without.splice(insertAt, 0, dragged)
  return without
}

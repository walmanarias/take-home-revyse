// Pure USD/BTC/Δ formatting — no DOM, no I/O. See specs/crypto-dashboard.spec.md
// AC-52..AC-64 for the exact formatting contract.

export function formatUsd(usd: number): string {
  if (!Number.isFinite(usd)) return '—'
  if (usd >= 1000) {
    return '$' + usd.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }
  if (usd >= 1) {
    return '$' + usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  return '$' + usd.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

export function formatBtc(btc: number): string {
  if (!Number.isFinite(btc)) return '—'
  if (btc >= 1) return btc.toFixed(4) + ' ₿'
  return trimTrailingZeros(btc.toFixed(8)) + ' ₿'
}

export function formatDelta(delta: number): string {
  let sign = delta > 0 ? '+' : ''
  return sign + delta.toFixed(2) + '%'
}

function trimTrailingZeros(value: string): string {
  return value.replace(/0+$/, '').replace(/\.$/, '')
}

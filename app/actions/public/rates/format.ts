// Pure USD/BTC/Δ formatting — no DOM, no I/O. See specs/crypto-dashboard.spec.md
// AC-52..AC-64 for the exact formatting contract.

// AC-104: the tier below AC-56's 4dp range. The curated 15 never reach it, but
// "All" scope (ADR 0006) renders every Coinbase symbol — ~16 of which (SHIB,
// PEPE, BONK, FLOKI, MOG, …) price under $0.0001 and would otherwise all read
// as an identical, information-free "$0.0000".
const SIGNIFICANT_DIGITS_TIER = 0.0001
// Anything under half of the last representable 8dp step rounds to zero there.
// 8dp matches formatBtc's own precision floor and bounds the rendered width,
// which the table's `minmax(96px, 1fr)` USD column depends on.
const MIN_RENDERABLE_USD = 0.000000005

export function formatUsd(usd: number): string {
  if (!Number.isFinite(usd)) return '—'
  if (usd >= 1000) {
    return '$' + usd.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }
  if (usd >= 1) {
    return '$' + usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  if (usd >= SIGNIFICANT_DIGITS_TIER || usd <= 0) {
    return '$' + usd.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
  }
  if (usd < MIN_RENDERABLE_USD) return '< $0.00000001'
  return (
    '$' +
    usd.toLocaleString('en-US', {
      maximumSignificantDigits: 4,
      maximumFractionDigits: 8,
      // Without this, significant digits win outright and a value like 1.2e-7
      // renders 4 significant digits at 11dp, blowing past the width the USD
      // column is sized for. 'lessPrecision' makes the 8dp cap binding.
      roundingPriority: 'lessPrecision',
    })
  )
}

// AC-106: the BTC counterpart to AC-104's floor. Trimming the trailing zeros
// off a sub-satoshi cross-rate's "0.00000000" yields a literal "0 ₿" — a
// false claim that the asset is worth exactly zero bitcoin, which is what
// every sub-cent "All"-scope asset (SHIB, PEPE, BONK, …) rendered.
const MIN_RENDERABLE_BTC = 0.000000005

export function formatBtc(btc: number): string {
  if (!Number.isFinite(btc)) return '—'
  if (btc >= 1) return btc.toFixed(4) + ' ₿'
  if (btc > 0 && btc < MIN_RENDERABLE_BTC) return '< 0.00000001 ₿'
  return trimTrailingZeros(btc.toFixed(8)) + ' ₿'
}

export function formatDelta(delta: number): string {
  let sign = delta > 0 ? '+' : ''
  return sign + delta.toFixed(2) + '%'
}

function trimTrailingZeros(value: string): string {
  return value.replace(/0+$/, '').replace(/\.$/, '')
}

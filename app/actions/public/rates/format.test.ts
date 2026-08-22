import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { formatBtc, formatDelta, formatUsd } from './format.ts'

describe('format.ts: formatUsd()', () => {
  it('AC-52 formats >= 1000 with 0 decimals and thousands grouping', () => {
    assert.equal(formatUsd(118432.1), '$118,432')
  })

  it('AC-53 includes the >= 1000 boundary itself', () => {
    assert.equal(formatUsd(1000), '$1,000')
  })

  it('AC-54 formats >= 1 and < 1000 with 2 decimals', () => {
    // Spec originally said formatUsd(1234.56) === '$1,234.56', copying the handoff's
    // illustrative string whose example value contradicts the ≥1000/0dp tier (AC-52/53).
    // Amended to a value actually inside [1, 1000).
    assert.equal(formatUsd(234.56), '$234.56')
  })

  it('AC-55 includes the >= 1 boundary itself', () => {
    assert.equal(formatUsd(1), '$1.00')
  })

  it('AC-56 formats < 1 with 4 decimals', () => {
    assert.equal(formatUsd(0.4231), '$0.4231')
  })

  it('AC-104 keeps the 4dp tier down to its own floor', () => {
    assert.equal(formatUsd(0.0001), '$0.0001')
  })

  it('AC-104 renders sub-$0.0001 assets at 4 significant digits, not "$0.0000"', () => {
    // SHIB/PEPE/BONK-class prices, reachable in "All" scope (ADR 0006).
    assert.equal(formatUsd(0.00000551), '$0.00000551')
    assert.equal(formatUsd(0.00000411), '$0.00000411')
    assert.equal(formatUsd(0.0000272), '$0.0000272')
  })

  it('AC-104 caps significant digits at 8 decimal places', () => {
    assert.equal(formatUsd(0.00000012), '$0.00000012')
  })

  it('AC-104 renders a bounded placeholder below the 8dp floor', () => {
    // OOKI trades around 3.9e-12 — unrepresentable at 8dp.
    assert.equal(formatUsd(3.86e-12), '< $0.00000001')
  })

  it('AC-104 leaves zero on the 4dp tier', () => {
    assert.equal(formatUsd(0), '$0.0000')
  })
})

describe('format.ts: formatBtc()', () => {
  it('AC-57 formats >= 1 at a fixed 4 decimals', () => {
    assert.equal(formatBtc(1.5), '1.5000 ₿')
  })

  it('AC-58 formats < 1 at 8 decimals with trailing zeros trimmed', () => {
    assert.equal(formatBtc(0.0234), '0.0234 ₿')
  })

  it('AC-59 formats < 1 at 8 decimals with no trailing zeros to trim', () => {
    assert.equal(formatBtc(0.00012345), '0.00012345 ₿')
  })

  it('AC-106 never renders a false "0 ₿" for a sub-satoshi cross-rate', () => {
    // SHIB at ~$0.0000055 against BTC at ~$77k is ~7.1e-11 ₿ — trimming
    // "0.00000000" produced a literal "0 ₿", asserting the asset is worth
    // exactly zero bitcoin.
    assert.equal(formatBtc(7.1e-11), '< 0.00000001 ₿')
    assert.equal(formatBtc(1e-9), '< 0.00000001 ₿')
  })

  it('AC-106 still renders the smallest representable 8dp value exactly', () => {
    assert.equal(formatBtc(0.00000001), '0.00000001 ₿')
  })

  it('AC-106 leaves an exact zero cross-rate as "0 ₿"', () => {
    assert.equal(formatBtc(0), '0 ₿')
  })
})

describe('format.ts: formatDelta()', () => {
  it('AC-61 formats a positive percent with a leading "+" and 2 decimals', () => {
    assert.equal(formatDelta(1.2387), '+1.24%')
  })

  it('AC-62 formats a negative percent with 2 decimals', () => {
    assert.equal(formatDelta(-0.0512), '-0.05%')
  })
})

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
})

describe('format.ts: formatDelta()', () => {
  it('AC-61 formats a positive percent with a leading "+" and 2 decimals', () => {
    assert.equal(formatDelta(1.2387), '+1.24%')
  })

  it('AC-62 formats a negative percent with 2 decimals', () => {
    assert.equal(formatDelta(-0.0512), '-0.05%')
  })
})

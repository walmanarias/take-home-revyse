import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { staleness } from './cache.ts'

const NOW = 1_700_000_000_000

describe('cache.ts: staleness()', () => {
  it('AC-20 is "live" at exactly the 12,000ms boundary', () => {
    assert.equal(staleness(NOW - 12_000, NOW), 'live')
  })

  it('AC-21 is "stale" one millisecond past the live boundary', () => {
    assert.equal(staleness(NOW - 12_001, NOW), 'stale')
  })

  it('AC-22 is still "stale" at exactly the 120,000ms boundary', () => {
    assert.equal(staleness(NOW - 120_000, NOW), 'stale')
  })

  it('AC-23 is "expired" one millisecond past the stale boundary', () => {
    assert.equal(staleness(NOW - 120_001, NOW), 'expired')
  })

  it('AC-24 is "none" when there is no fetchedAt yet', () => {
    assert.equal(staleness(null, NOW), 'none')
  })
})

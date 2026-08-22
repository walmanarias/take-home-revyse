// Unit coverage for the derived-state rules extracted out of the
// composition root. These encode the same contract AC-9/AC-10/AC-26..29 and
// AC-67 assert through the rendered DOM; testing them directly pins the rule
// itself rather than one component's presentation of it.

import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import {
  NO_CACHE_BANNER,
  computeAutoLabel,
  computeBanner,
  computeBudgetView,
  computeStatus,
  formatAge,
  formatBudgetLabel,
} from './status.ts'

describe('status.ts: computeStatus()', () => {
  it('AC-25 reports "Fetching first rates…" before any fetch has ever resolved', () => {
    assert.match(computeStatus('none', 0, 0).label, /Fetching first rates/)
  })

  it('AC-29 reports the feed unreachable once a first-ever fetch has failed', () => {
    let status = computeStatus('none', 0, 1)
    assert.match(status.label, /unreachable/i)
    assert.equal(status.color, 'var(--color-negative)')
  })

  it('AC-26..28 labels and colors each staleness tier distinctly', () => {
    let live = computeStatus('live', 4_000, 0)
    let stale = computeStatus('stale', 30_000, 0)
    let expired = computeStatus('expired', 300_000, 0)

    assert.match(live.label, /^Live · /)
    assert.match(stale.label, /^Stale · /)
    assert.match(expired.label, /^Last known good · /)

    let colors = new Set([live.color, stale.color, expired.color])
    assert.equal(colors.size, 3, 'each tier must be visually distinguishable, not just textually')
  })
})

describe('status.ts: computeBanner()', () => {
  it('AC-28 explains an expired tier and names the age of the values on screen', () => {
    let banner = computeBanner('expired', true, 0, '3m ago')
    assert.ok(banner)
    assert.match(banner!, /3m ago/)
  })

  it('AC-29 explains a cold start with no cache and a failing feed', () => {
    assert.equal(computeBanner('none', false, 2, '0s ago'), NO_CACHE_BANNER)
  })

  it('AC-26/AC-27 stays silent while values are still trusted (live or stale)', () => {
    assert.equal(computeBanner('live', true, 0, '2s ago'), null)
    assert.equal(computeBanner('stale', true, 0, '40s ago'), null)
  })

  it('stays silent on a cold start that has not failed yet — blank is not an error', () => {
    assert.equal(computeBanner('none', false, 0, '0s ago'), null)
  })
})

describe('status.ts: computeBudgetView()', () => {
  it('AC-9 floors partial tokens so a fractional token never reads as a spendable one', () => {
    assert.equal(computeBudgetView(6.9).whole, 6)
    assert.equal(computeBudgetView(0.99).whole, 0)
  })

  it('AC-9 counts down the seconds until the next whole token refills', () => {
    // A full 60s window over 10 tokens => one token every 6s; 30% of the way
    // into the next token leaves 70% of 6s, rounded up.
    assert.equal(computeBudgetView(3.3).nextTokenIn, 5)
    assert.equal(computeBudgetView(3.0).nextTokenIn, 6)
  })

  it('AC-8 drops the refill hint only when the bucket is completely full', () => {
    assert.equal(formatBudgetLabel(computeBudgetView(10)), '10/10 left this minute')
    assert.match(formatBudgetLabel(computeBudgetView(7)), /^7\/10 left this minute · \+1 in \d+s$/)
  })
})

describe('status.ts: computeAutoLabel()', () => {
  it('AC-13 reads "off" whenever auto-polling is disabled, whatever the timers say', () => {
    assert.equal(computeAutoLabel({ auto: false, pending: false, now: 0, lastAttempt: null }), 'off')
  })

  it('AC-10 reads "now" while a fetch is in flight', () => {
    assert.equal(computeAutoLabel({ auto: true, pending: true, now: 0, lastAttempt: 0 }), 'now')
  })

  it('AC-67 counts down the seconds remaining until the next poll, never past zero', () => {
    assert.equal(computeAutoLabel({ auto: true, pending: false, now: 2_000, lastAttempt: 0 }), '6s')
    assert.equal(computeAutoLabel({ auto: true, pending: false, now: 99_000, lastAttempt: 0 }), '0s')
  })
})

describe('status.ts: formatAge()', () => {
  it('switches from seconds to minutes at the one-minute mark', () => {
    assert.equal(formatAge(4_000), '4s ago')
    assert.equal(formatAge(59_000), '59s ago')
    assert.equal(formatAge(60_000), '1m ago')
    assert.equal(formatAge(180_000), '3m ago')
  })
})

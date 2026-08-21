import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { appendHistory, computeDelta } from './history.ts'

describe('history.ts: appendHistory()', () => {
  it('AC-65-unit keeps only the most recent 48 of many sequential samples (FIFO)', () => {
    let history: Record<string, number[]> = {}
    for (let i = 0; i < 50; i++) {
      history = appendHistory(history, { BTC: { usd: 100 + i, btc: 1 } })
    }

    assert.equal(history.BTC?.length, 48)
    assert.equal(history.BTC?.[0], 102) // the oldest 2 of 50 samples were dropped
    assert.equal(history.BTC?.[47], 149)
  })

  it('AC-65-unit only appends symbols present in the new rates, leaving others untouched', () => {
    let history = { ETH: [1, 2, 3] }

    let next = appendHistory(history, { BTC: { usd: 100, btc: 1 } })

    assert.deepEqual(next.ETH, [1, 2, 3])
    assert.deepEqual(next.BTC, [100])
  })
})

describe('history.ts: computeDelta()', () => {
  it('AC-66-unit returns null when fewer than 2 samples exist', () => {
    assert.equal(computeDelta([]), null)
    assert.equal(computeDelta([100]), null)
  })

  it('AC-66-unit returns the percent change from the first sample to the last', () => {
    assert.equal(computeDelta([100, 110]), 10)
  })

  it('AC-66-unit returns null rather than dividing by zero when the first sample is 0', () => {
    assert.equal(computeDelta([0, 50]), null)
  })
})

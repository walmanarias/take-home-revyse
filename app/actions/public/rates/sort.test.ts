import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { sortSymbols } from './sort.ts'

// The spec (AC-37) states the alphabetical-by-display-name order for these
// four symbols, absent pinning, is ["ADA","BTC","ETH","SOL"] — reused here
// verbatim so this test doesn't need to duplicate currencies.ts's
// DISPLAY_NAMES to derive it independently.
const NAME_ORDER = ['ADA', 'BTC', 'ETH', 'SOL']

describe('sort.ts: sortSymbols()', () => {
  it('AC-33 "name" sorts symbols by ascending display name', () => {
    let symbols = ['BTC', 'ETH', 'SOL', 'ADA']

    assert.deepEqual(
      sortSymbols('name', symbols, [], ratesFixture(symbols), deltasFixture(symbols)),
      NAME_ORDER,
    )
  })

  it('AC-34 "usd" sorts symbols by descending USD price', () => {
    let symbols = ['ADA', 'BTC', 'ETH', 'SOL']
    let rates = {
      ADA: { usd: 2, btc: 0.00001 },
      BTC: { usd: 100, btc: 1 },
      ETH: { usd: 1, btc: 0.00002 },
      SOL: { usd: 500, btc: 0.005 },
    }

    assert.deepEqual(
      sortSymbols('usd', symbols, [], rates, deltasFixture(symbols)),
      ['SOL', 'BTC', 'ADA', 'ETH'],
    )
  })

  it('AC-35 "delta" sorts symbols by descending session change', () => {
    let symbols = ['ADA', 'BTC', 'ETH', 'SOL']
    let deltas = { ADA: -5, BTC: 10, ETH: 0, SOL: 3 }

    assert.deepEqual(
      sortSymbols('delta', symbols, [], ratesFixture(symbols), deltas),
      ['BTC', 'SOL', 'ETH', 'ADA'],
    )
  })

  it('AC-36 "custom" passes the master order through unchanged', () => {
    let symbols = ['BTC', 'ETH', 'SOL', 'ADA']

    assert.deepEqual(sortSymbols('custom', symbols, [], null, deltasFixture(symbols)), symbols)
  })

  it('AC-37 "name" sorts pinned symbols first (alphabetically among themselves), then unpinned (alphabetically)', () => {
    let symbols = ['BTC', 'ETH', 'SOL', 'ADA']

    assert.deepEqual(
      sortSymbols('name', symbols, ['SOL', 'ADA'], ratesFixture(symbols), deltasFixture(symbols)),
      ['ADA', 'SOL', 'BTC', 'ETH'],
    )
  })

  it('AC-38 "custom" sorts the pinned symbol first, then the rest in master order', () => {
    let symbols = ['BTC', 'ETH', 'SOL', 'ADA']

    assert.deepEqual(
      sortSymbols('custom', symbols, ['SOL'], null, deltasFixture(symbols)),
      ['SOL', 'BTC', 'ETH', 'ADA'],
    )
  })
})

function ratesFixture(symbols: string[]): Record<string, { usd: number; btc: number }> {
  let rates: Record<string, { usd: number; btc: number }> = {}
  symbols.forEach((sym, i) => {
    rates[sym] = { usd: i + 1, btc: (i + 1) / 1000 }
  })
  return rates
}

function deltasFixture(symbols: string[]): Record<string, number> {
  let deltas: Record<string, number> = {}
  symbols.forEach((sym, i) => {
    deltas[sym] = i
  })
  return deltas
}

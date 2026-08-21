import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { fetchRates } from './coinbase.ts'

const T0 = 1_700_000_000_000

describe('coinbase.ts: fetchRates()', () => {
  it('AC-1 maps a Coinbase response into per-symbol usd/btc rates at the current clock time', async (t) => {
    t.mock.method(Date, 'now', () => T0)
    t.mock.method(globalThis, 'fetch', async () =>
      jsonResponse({
        data: {
          currency: 'USD',
          rates: { BTC: '0.00002000', ETH: '0.00035000' },
        },
      }),
    )

    let result = await fetchRates()

    assert.equal(result.rates.ETH.usd, 1 / 0.00035)
    assert.equal(result.rates.ETH.btc, 0.00002 / 0.00035)
    assert.equal(result.fetchedAt, T0)
  })

  it('AC-2 rejects (one failed attempt, not an uncaught error) when the request outlives the 7000ms abort timeout', async (t) => {
    let timers = t.useFakeTimers()
    t.mock.method(globalThis, 'fetch', (_url: string, init?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        })
      })
    })

    let pending = fetchRates()
    // Observed via assert.rejects below; this just prevents an unhandled-
    // rejection warning from surfacing before that assertion runs.
    pending.catch(() => {})

    timers.advance(7000)

    await assert.rejects(() => pending)
  })

  it('AC-3 rejects and returns no partial/malformed rates when Coinbase responds non-2xx', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 500 }))

    await assert.rejects(() => fetchRates())
  })

  it('AC-4 rejects rather than returning NaN/undefined rates when the body does not match CoinbaseRatesResponse', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => jsonResponse({ nonsense: true }))

    await assert.rejects(() => fetchRates())
  })
})

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

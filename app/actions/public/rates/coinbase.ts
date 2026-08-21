// The one network I/O adapter in this feature tree. Everything else (budget,
// lease, cache, order, sort, format, persisted) is pure and DOM-free.

export interface FetchedRates {
  rates: Record<string, { usd: number; btc: number }>
  fetchedAt: number
}

interface CoinbaseRatesResponse {
  data: {
    currency: string
    rates: Record<string, string>
  }
}

const ENDPOINT = 'https://api.coinbase.com/v2/exchange-rates?currency=USD'
const TIMEOUT_MS = 7000

export async function fetchRates(signal?: AbortSignal): Promise<FetchedRates> {
  let controller = new AbortController()
  let timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', () => controller.abort())
  }

  try {
    let response = await fetch(ENDPOINT, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`Coinbase responded with HTTP ${response.status}`)
    }

    let json: unknown = await response.json()
    if (!isCoinbaseRatesResponse(json)) {
      throw new Error('Unexpected Coinbase response shape')
    }

    return { rates: mapRates(json.data.rates), fetchedAt: Date.now() }
  } finally {
    clearTimeout(timeout)
  }
}

function mapRates(raw: Record<string, string>): Record<string, { usd: number; btc: number }> {
  let btcPerUsd = Number(raw.BTC)
  let rates: Record<string, { usd: number; btc: number }> = {}

  for (let [sym, value] of Object.entries(raw)) {
    let perUsd = Number(value)
    if (Number.isFinite(perUsd) && perUsd > 0) {
      rates[sym] = { usd: 1 / perUsd, btc: btcPerUsd / perUsd }
    }
  }

  return rates
}

function isCoinbaseRatesResponse(value: unknown): value is CoinbaseRatesResponse {
  if (typeof value !== 'object' || value === null) return false
  let data = (value as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return false
  let rates = (data as { rates?: unknown }).rates
  return typeof rates === 'object' && rates !== null
}

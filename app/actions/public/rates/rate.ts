// The one domain value every module in this tree agrees on: a symbol's USD
// price and its BTC cross-rate. Named once here so coinbase.ts (producer),
// cache.ts (persistence), history.ts/sort.ts (pure derivations) and the
// dashboard all share a single definition instead of re-spelling the shape.

export interface Rate {
  usd: number
  btc: number
}

export type RatesMap = Record<string, Rate>

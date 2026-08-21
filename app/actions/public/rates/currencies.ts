// Single source of truth for the 15 curated cryptocurrencies rendered by the
// dashboard. Pure data, no I/O — safe to import from both server-side
// (home-page.tsx's "15 assets" caption) and the browser bundle.

export const SYMBOLS = [
  'BTC',
  'ETH',
  'SOL',
  'XRP',
  'ADA',
  'DOGE',
  'AVAX',
  'LINK',
  'DOT',
  'LTC',
  'BCH',
  'ATOM',
  'UNI',
  'XLM',
  'AAVE',
] as const

export type Symbol = (typeof SYMBOLS)[number]

// Display name shown in each card/row. Note: ADA's display name is "Ada"
// (the currency), not the "Cardano" platform name — a deliberate choice so
// that alphabetical "Name" sort matches the symbol's own alphabetical order
// for this curated set (see sort.test.ts's AC-33/AC-37 fixtures).
export const DISPLAY_NAMES: Record<Symbol, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  XRP: 'XRP',
  ADA: 'Ada',
  DOGE: 'Dogecoin',
  AVAX: 'Avalanche',
  LINK: 'Chainlink',
  DOT: 'Polkadot',
  LTC: 'Litecoin',
  BCH: 'Bitcoin Cash',
  ATOM: 'Cosmos',
  UNI: 'Uniswap',
  XLM: 'Stellar',
  AAVE: 'Aave',
}

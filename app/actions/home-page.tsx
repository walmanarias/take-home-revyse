import type { Handle } from 'remix/ui'

import { Document } from './document.tsx'
import { RatesDashboardEntry } from './public/rates/rates-dashboard.tsx'

export function HomePage(_handle: Handle) {
  return () => (
    <Document title="Crypto Rates Dashboard">
      <RatesDashboardEntry />
    </Document>
  )
}

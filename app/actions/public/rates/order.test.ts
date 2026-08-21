import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { reorder } from './order.ts'

describe('order.ts: reorder()', () => {
  it('AC-41 moves the dragged symbol to sit immediately after the drop target', () => {
    assert.deepEqual(reorder(['A', 'B', 'C', 'D'], 'A', 'C', 'after'), ['B', 'C', 'A', 'D'])
  })

  it('AC-42 moves the dragged symbol to sit immediately before the drop target', () => {
    assert.deepEqual(reorder(['A', 'B', 'C', 'D'], 'D', 'B', 'before'), ['A', 'D', 'B', 'C'])
  })

  it('AC-43 leaves the order unchanged when a symbol is dropped on itself', () => {
    assert.deepEqual(reorder(['A', 'B', 'C'], 'A', 'A', 'after'), ['A', 'B', 'C'])
  })
})

import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { clampScrollTop, computeWindow } from './window.ts'

describe('window.ts: computeWindow()', () => {
  it('AC-83 computes start/end/pads from scrollTop, viewport, row height, overscan, and item count', () => {
    let result = computeWindow({
      rowHeight: 38,
      viewportHeight: 600,
      scrollTop: 1900,
      itemCount: 300,
      overscan: 5,
    })

    assert.deepEqual(result, {
      startIndex: 45,
      endIndex: 71,
      topSpacerPx: 1710,
      bottomSpacerPx: 8702,
    })
  })

  it('AC-84 clamps start/topPad to 0 when scrollTop is 0', () => {
    let result = computeWindow({
      rowHeight: 38,
      viewportHeight: 600,
      scrollTop: 0,
      itemCount: 300,
      overscan: 5,
    })

    assert.equal(result.startIndex, 0)
    assert.equal(result.topSpacerPx, 0)
  })

  it('AC-84 clamps end/bottomPad to the item count at maximum scroll', () => {
    let itemCount = 300
    let rowHeight = 38
    let viewportHeight = 600
    let maxScrollTop = itemCount * rowHeight - viewportHeight // 10,800

    let result = computeWindow({
      rowHeight,
      viewportHeight,
      scrollTop: maxScrollTop,
      itemCount,
      overscan: 5,
    })

    assert.equal(result.endIndex, itemCount)
    assert.equal(result.bottomSpacerPx, 0)
  })

  it('AC-84 renders the full range with both pads at 0 when itemCount*rowHeight <= viewportHeight', () => {
    let result = computeWindow({
      rowHeight: 38,
      viewportHeight: 600,
      scrollTop: 0,
      itemCount: 10, // 10 * 38 = 380 <= 600
      overscan: 5,
    })

    assert.deepEqual(result, {
      startIndex: 0,
      endIndex: 10,
      topSpacerPx: 0,
      bottomSpacerPx: 0,
    })
  })

  it('AC-84 returns an empty range with both pads at 0, without throwing, when itemCount is 0', () => {
    assert.doesNotThrow(() =>
      computeWindow({ rowHeight: 38, viewportHeight: 600, scrollTop: 0, itemCount: 0, overscan: 5 }),
    )

    let result = computeWindow({
      rowHeight: 38,
      viewportHeight: 600,
      scrollTop: 0,
      itemCount: 0,
      overscan: 5,
    })

    assert.deepEqual(result, {
      startIndex: 0,
      endIndex: 0,
      topSpacerPx: 0,
      bottomSpacerPx: 0,
    })
  })
})

describe('window.ts: clampScrollTop()', () => {
  it('AC-97 clamps a stale deep scroll position to a shrunk list\'s real scroll extent', () => {
    // 5 rows of 40px in a 480px viewport: the list is shorter than the
    // viewport, so there is nothing to scroll and any leftover scrollTop
    // from a longer list must collapse to 0 — otherwise computeWindow starts
    // past the end and renders an empty window while matches exist.
    assert.equal(clampScrollTop(8000, 5, 40, 480), 0)
  })

  it('leaves a scroll position that is still valid untouched', () => {
    assert.equal(clampScrollTop(400, 300, 40, 480), 400)
  })

  it('clamps to the last full screen of a list longer than the viewport', () => {
    // 100 rows * 40px = 4000px of content, 480px visible => max scroll 3520.
    assert.equal(clampScrollTop(99999, 100, 40, 480), 3520)
  })

  it('never returns a negative extent for an empty list', () => {
    assert.equal(clampScrollTop(500, 0, 40, 480), 0)
  })
})

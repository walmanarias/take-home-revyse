// Unit coverage for the sparkline's point math (the SVG wrapper around it is
// visual, and covered by QA per CONV-testing-4).

import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { sparkPoints } from './sparkline.tsx'

function parse(points: string): Array<{ x: number; y: number }> {
  return points.split(' ').map((pair) => {
    let [x, y] = pair.split(',').map(Number)
    return { x: x!, y: y! }
  })
}

describe('sparkline.ts: sparkPoints()', () => {
  it('AC-63 draws a flat line rather than nothing when a symbol has too few samples', () => {
    for (let history of [[], [42]]) {
      let parsed = parse(sparkPoints(history))
      assert.equal(parsed.length, 2, 'a flat line still needs two points to render')
      assert.equal(parsed[0]!.y, parsed[1]!.y, 'too few samples must read as flat, not as a trend')
    }
  })

  it('spans the full width and inverts the y axis so a rising series rises visually', () => {
    let parsed = parse(sparkPoints([1, 2, 3]))
    assert.equal(parsed.length, 3)
    assert.equal(parsed[0]!.x, 0)
    assert.equal(parsed[parsed.length - 1]!.x, 68)
    // SVG y grows downward, so the highest value must have the smallest y.
    assert.ok(parsed[2]!.y < parsed[0]!.y, 'a rising series must slope upward on screen')
  })

  it('normalizes a flat non-zero series without dividing by a zero span', () => {
    let parsed = parse(sparkPoints([5, 5, 5]))
    assert.ok(parsed.every((point) => Number.isFinite(point.y)))
    assert.equal(new Set(parsed.map((p) => p.y)).size, 1)
  })

  it('keeps only the most recent samples so a long history stays a fixed-width line', () => {
    let long = Array.from({ length: 200 }, (_, i) => i)
    assert.equal(parse(sparkPoints(long)).length, 24)
  })
})

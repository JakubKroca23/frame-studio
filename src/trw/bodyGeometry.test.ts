import { describe, expect, it } from 'vitest'
import { boundsOf, parametricBodyBoxes } from './bodyGeometry'

describe('parametric body geometry', () => {
  const frameTop = 1000
  it('flatbed bounds match TRW L/W/sideHeight', () => {
    const xFrom = 1000
    const xTo = 5000
    const W = 2550
    const sh = 450
    const boxes = parametricBodyBoxes({ type: 'flatbed', xFrom, xTo, width: W, height: 300, sideHeight: sh, frameTop })
    const b = boundsOf(boxes)!
    expect(b.max[0] - b.min[0]).toBeCloseTo(xTo - xFrom, 0)
    expect(b.max[2] - b.min[2]).toBeCloseTo(W, 0)
    expect(b.max[1] - b.min[1]).toBeGreaterThanOrEqual(80 + sh)
    expect(b.max[1] - frameTop).toBeGreaterThan(500)
  })
  it('cabinet closed box matches TRW footprint', () => {
    const boxes = parametricBodyBoxes({ type: 'cabinet', xFrom: 1000, xTo: 5000, width: 2400, height: 800, sideHeight: null, frameTop: 1000 })
    const b = boundsOf(boxes)!
    expect(b.max[0] - b.min[0]).toBeCloseTo(4000, 0)
    expect(b.max[2] - b.min[2]).toBeCloseTo(2400, 0)
  })
  it('tipper bounds use tapered walls', () => {
    const xFrom = 2000
    const xTo = 6200
    const W = 2400
    const H = 1100
    const boxes = parametricBodyBoxes({ type: 'tipper', xFrom, xTo, width: W, height: H, sideHeight: null, frameTop })
    const b = boundsOf(boxes)!
    expect(b.max[0] - b.min[0]).toBeGreaterThan(4100)
    expect(b.max[0] - b.min[0]).toBeLessThan(4300)
    expect(b.max[2] - b.min[2]).toBeCloseTo(W, 0)
    expect(b.max[1] - frameTop).toBeGreaterThan(H)
  })
})

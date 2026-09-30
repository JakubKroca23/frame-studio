import { describe, expect, it } from 'vitest'
import { outerOutline, ringBounds, signedArea, type LineSeg } from './cabOutline'

function box(x0: number, y0: number, x1: number, y1: number): LineSeg[] {
  return [
    { x1: x0, y1: y0, x2: x1, y2: y0 },
    { x1: x1, y1: y0, x2: x1, y2: y1 },
    { x1: x1, y1: y1, x2: x0, y2: y1 },
    { x1: x0, y1: y1, x2: x0, y2: y0 },
  ]
}

describe('outer outline of line work', () => {
  it('fills the outline, ignores windows, closes small gaps and drops an antenna', () => {
    const segs: LineSeg[] = [
      // Outer body with a 16 mm gap in the bottom line.
      { x1: 0, y1: 0, x2: 900, y2: 0 },
      { x1: 916, y1: 0, x2: 2000, y2: 0 },
      { x1: 2000, y1: 0, x2: 2000, y2: 2600 },
      { x1: 2000, y1: 2600, x2: 0, y2: 2600 },
      { x1: 0, y1: 2600, x2: 0, y2: 0 },
      // Window and door seam inside.
      ...box(300, 1500, 1200, 2300),
      { x1: 1400, y1: 100, x2: 1400, y2: 2400 },
      // Antenna on the roof.
      { x1: 600, y1: 2600, x2: 700, y2: 3300 },
    ]
    const ring = outerOutline(segs)
    expect(ring).not.toBeNull()
    const b = ringBounds(ring!)
    expect(Math.abs(b.x0 - 0)).toBeLessThan(8)
    expect(Math.abs(b.x1 - 2000)).toBeLessThan(8)
    expect(Math.abs(b.y0 - 0)).toBeLessThan(8)
    expect(Math.abs(b.y1 - 2600)).toBeLessThan(8)
    expect(signedArea(ring!)).toBeGreaterThan(0)
    // Filled: the area is close to the full rectangle, not a thin band of lines.
    expect(signedArea(ring!)).toBeGreaterThan(2000 * 2600 * 0.95)
  })

  it('cuts mirrors that stick out past the body sides', () => {
    const segs: LineSeg[] = [
      ...box(0, -1250, 2200, 1250),
      // Mirror arm and head beyond the left side near the front.
      { x1: 300, y1: 1250, x2: 330, y2: 1500 },
      { x1: 330, y1: 1500, x2: 360, y2: 1250 },
      ...box(250, 1500, 520, 1560),
    ]
    const ring = outerOutline(segs, { clamp: 'y' })
    expect(ring).not.toBeNull()
    const b = ringBounds(ring!)
    expect(b.y1).toBeLessThan(1272)
    expect(b.y0).toBeGreaterThan(-1272)
  })

  it('gives up on an empty drawing', () => {
    expect(outerOutline([])).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildEntityIndex,
  chainContour,
  dropLastPoint,
  hitEntity,
  insertVertex,
  outlineFromEntities,
  pointInPolygon,
  polygonBounds,
  removeVertex,
  scalePoints,
  shouldClose,
  snapPoint,
  type DrawEntity,
} from './outline'

function line(id: number, x1: number, y1: number, x2: number, y2: number): DrawEntity {
  return { id, kind: 'line', x1, y1, x2, y2, cx: 0, cy: 0, r: 0 }
}

const square = [line(0, 0, 0, 10, 0), line(1, 10, 0, 10, 10), line(2, 10, 10, 0, 10), line(3, 0, 10, 0, 0)]

describe('drawing outlines', () => {
  it('snaps to an endpoint and to a crossing', () => {
    const index = buildEntityIndex([line(0, 0, 0, 30, 0), line(1, 0, 0, 20, 20), line(2, 0, 20, 20, 0)])
    const end = snapPoint(index, 1.2, 0.4, 3)
    expect(end.kind).toBe('endpoint')
    expect(end.x).toBe(0)
    expect(end.y).toBe(0)
    const cross = snapPoint(index, 12, 10, 5)
    expect(cross.kind).toBe('intersection')
    expect(cross.x).toBeCloseTo(10)
    expect(cross.y).toBeCloseTo(10)
  })

  it('picks the line under the cursor', () => {
    const index = buildEntityIndex(square)
    const hit = hitEntity(index, 5, 0.4, 2)
    expect(hit?.id).toBe(0)
    expect(hitEntity(index, 5, 5, 0.2)).toBeNull()
  })

  it('chains a closed contour and a picked subset', () => {
    const chain = chainContour(square, 0, 2)
    expect(chain?.closed).toBe(true)
    expect(chain?.points).toHaveLength(4)
    expect(polygonBounds(chain?.points ?? []).x1).toBe(10)
    const partial = outlineFromEntities(square, [0, 1, 2], 2)
    expect(partial?.closed).toBe(false)
    expect(partial?.points.length).toBeGreaterThanOrEqual(3)
    const whole = outlineFromEntities(square, [0, 1, 2, 3], 2)
    expect(whole?.closed).toBe(true)
    expect(whole?.points).toHaveLength(4)
  })

  it('treats a circle as a closed outline', () => {
    const circle: DrawEntity = { id: 0, kind: 'circle', x1: -5, y1: 0, x2: 5, y2: 0, cx: 0, cy: 0, r: 5 }
    const chain = chainContour([circle], 0, 2)
    expect(chain?.closed).toBe(true)
    expect(chain?.points.length).toBeGreaterThanOrEqual(12)
    expect(pointInPolygon(0, 0, chain?.points ?? [])).toBe(true)
  })

  it('edits vertices and closes on the first point', () => {
    const ring = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 4 },
    ]
    expect(shouldClose(ring, 0.2, 0.2, 1)).toBe(true)
    expect(shouldClose(ring, 4, 0, 1)).toBe(false)
    expect(dropLastPoint(ring)).toHaveLength(2)
    expect(removeVertex(ring, 1)).toBeNull()
    const quad = insertVertex(ring, 1, { x: 10, y: 8 })
    expect(quad).toHaveLength(4)
    expect(removeVertex(quad, 2)).toHaveLength(3)
    const scaled = scalePoints(quad, polygonBounds(quad), { x0: 0, y0: 0, x1: 20, y1: 10 })
    expect(polygonBounds(scaled).x1).toBeCloseTo(20)
    expect(pointInPolygon(5, 2, quad)).toBe(true)
  })
})

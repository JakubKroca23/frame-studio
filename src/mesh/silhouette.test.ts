import { describe, expect, it } from 'vitest'
import { cabSections, envelope } from './silhouette'

describe('cab silhouettes', () => {
  it('builds an envelope around the outer points', () => {
    const points = []
    for (let i = 0; i <= 20; i++) {
      const x = i * 100
      points.push({ x, y: 1000 + Math.sin(i / 4) * 80 })
      points.push({ x, y: 2800 - (i < 4 ? i * 80 : 0) })
      points.push({ x, y: 1800 })
    }
    const ring = envelope(points, 12)
    expect(ring).not.toBeNull()
    const ys = ring!.map((point) => point.y)
    expect(Math.max(...ys)).toBeGreaterThan(2700)
    expect(Math.min(...ys)).toBeLessThan(1100)
  })

  it('clips the front silhouette with the side and top envelopes', () => {
    const side = [
      { x: 0, y: 1000 },
      { x: 400, y: 2200 },
      { x: 1800, y: 2400 },
      { x: 1800, y: 1000 },
    ]
    const top = [
      { x: 0, y: -800 },
      { x: 1800, y: -1100 },
      { x: 1800, y: 1100 },
      { x: 0, y: 800 },
    ]
    const front = [
      { x: 0, y: 0 },
      { x: 100, y: 80 },
      { x: 200, y: 0 },
      { x: 100, y: -20 },
    ]
    const sections = cabSections(side, top, front, 8)
    expect(sections.length).toBeGreaterThan(4)
    const mid = sections[Math.floor(sections.length / 2)]
    const lateral = mid.loop.map((point) => point.x)
    const height = mid.loop.map((point) => point.y)
    expect(Math.max(...height) - Math.min(...height)).toBeGreaterThan(800)
    expect(Math.max(...lateral) - Math.min(...lateral)).toBeGreaterThan(1000)
    expect(Math.max(...lateral)).toBeLessThanOrEqual(1100.1)
    expect(Math.min(...height)).toBeGreaterThanOrEqual(999)
  })
})

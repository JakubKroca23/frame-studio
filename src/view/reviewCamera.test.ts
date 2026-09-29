import { describe, expect, it } from 'vitest'
import { fitView, panBy, screenToWorld, wheelIntent, wheelZoomFactor, worldToScreen, zoomAt, zoomLimits } from './reviewCamera'

describe('review camera', () => {
  it('fits the tighter axis and centres the bounds', () => {
    const view = fitView({ x0: 0, y0: 0, x1: 1000, y1: 100 }, 500, 500, 28)
    expect(view.scale).toBeCloseTo(444 / 1000)
    expect(view.cx).toBe(500)
    expect(view.cy).toBe(50)
    const wide = fitView({ x0: 0, y0: 0, x1: 100, y1: 1000 }, 500, 500, 28)
    expect(wide.scale).toBeCloseTo(444 / 1000)
    expect(wide.cx).toBe(50)
    expect(wide.cy).toBe(500)
  })

  it('round-trips a world point through the screen', () => {
    const view = { scale: 2.5, cx: 120, cy: -40 }
    const [sx, sy] = worldToScreen(view, 900, 700, 300, 80)
    const back = screenToWorld(view, 900, 700, sx, sy)
    expect(back.x).toBeCloseTo(300)
    expect(back.y).toBeCloseTo(80)
  })

  it('zooms around the cursor and clamps to the hole-inspection maximum', () => {
    const limits = zoomLimits(0.05)
    expect(limits.min).toBeCloseTo(0.0175)
    expect(limits.max).toBe(14)
    expect(15 * limits.max).toBeGreaterThanOrEqual(210)

    const view = { scale: 10, cx: 0, cy: 0 }
    const before = screenToWorld(view, 800, 600, 100, 80)
    const next = zoomAt(view, 800, 600, 100, 80, 2, limits)
    expect(next.scale).toBe(14)
    const after = screenToWorld(next, 800, 600, 100, 80)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)

    const stuck = zoomAt(next, 800, 600, 100, 80, 3, limits)
    expect(stuck).toBe(next)
  })

  it('pans so the drawing follows the pointer', () => {
    const view = { scale: 2, cx: 100, cy: 50 }
    const next = panBy(view, 10, -4)
    expect(next.scale).toBe(2)
    expect(next.cx).toBeCloseTo(95)
    expect(next.cy).toBeCloseTo(48)
    const [sx, sy] = worldToScreen(view, 400, 300, 100, 50)
    const [nx, ny] = worldToScreen(next, 400, 300, 100, 50)
    expect(nx - sx).toBeCloseTo(10)
    expect(ny - sy).toBeCloseTo(-4)
  })

  it('treats a mouse notch as zoom and a trackpad scroll as pan', () => {
    expect(wheelZoomFactor(-100, 0)).toBeCloseTo(Math.exp(0.2))
    expect(wheelZoomFactor(-1, 1)).toBeCloseTo(Math.exp(0.2))
    expect(wheelIntent({ deltaX: 0, deltaY: -100, deltaMode: 0, ctrlKey: false })).toBe('zoom')
    expect(wheelIntent({ deltaX: 0, deltaY: -12, deltaMode: 0, ctrlKey: false })).toBe('pan')
    expect(wheelIntent({ deltaX: 6, deltaY: -80, deltaMode: 0, ctrlKey: false })).toBe('pan')
    expect(wheelIntent({ deltaX: 0, deltaY: -8, deltaMode: 0, ctrlKey: true })).toBe('zoom')
    expect(wheelIntent({ deltaX: 4, deltaY: -1, deltaMode: 1, ctrlKey: false })).toBe('zoom')
  })
})

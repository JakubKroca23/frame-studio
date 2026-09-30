import { describe, expect, it } from 'vitest'
import { handleAnchor, hitHandle, resizeBox } from './reviewHandles'

describe('review handles', () => {
  const box = { x0: 0, y0: 0, x1: 100, y1: 40 }

  it('keeps the opposite edge fixed and refuses to flip the box', () => {
    expect(resizeBox(box, 'e', 160, 10)).toEqual({ x0: 0, y0: 0, x1: 160, y1: 40 })
    expect(resizeBox(box, 'nw', -20, 80)).toEqual({ x0: -20, y0: 0, x1: 100, y1: 80 })
    expect(resizeBox(box, 'w', 90, 0).x0).toBe(80)
    expect(resizeBox(box, 's', 0, 30).y0).toBe(20)
  })

  it('hits the corner under the cursor in screen space', () => {
    const map = (x: number, y: number) => [x, 100 - y] as const
    const corner = handleAnchor(box, 'ne')
    const [px, py] = map(corner.x, corner.y)
    expect(hitHandle(px + 2, py - 1, box, map)).toBe('ne')
    expect(hitHandle(px + 30, py, box, map)).toBeNull()
  })
})

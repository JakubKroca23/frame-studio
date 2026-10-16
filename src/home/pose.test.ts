import { describe, expect, it } from 'vitest'
import { H } from '../view/Environment'
import { HEADING, STOP_Z, TURN, drivePath, originPose } from './pose'

describe('drivePath', () => {
  it('drives straight out, then turns left by 45° and stops at STOP_Z', () => {
    const p = drivePath(1, 9500)
    const a = p.at(0), e = p.end
    expect(a.rotY).toBe(HEADING)
    expect(a.z).toBeLessThan(H.z1)
    expect(e.z).toBeCloseTo(STOP_Z, 3)
    expect(e.rotY).toBeCloseTo(HEADING - TURN, 6)
    expect(e.x).toBeLessThan(a.x) // turned towards −X
    // rear has cleared the facade before the turn starts
    expect(p.at(H.z1 + 9500 / 2 - (H.z1 - 400 - 9500 / 2)).rotY).toBe(HEADING)
  })
  it('is continuous', () => {
    const p = drivePath(0, 9000)
    for (let s = 0; s < p.length; s += 100) {
      const q = p.at(s), r = p.at(s + 100)
      expect(Math.hypot(r.x - q.x, r.z - q.z)).toBeLessThanOrEqual(100.001)
    }
  })
})

describe('originPose', () => {
  it('matches the old π/2 mapping', () => {
    const o = originPose({ x: 1000, z: 2000, rotY: Math.PI / 2 }, 300, 50)
    expect(o.x).toBeCloseTo(1000 - 50)
    expect(o.z).toBeCloseTo(2000 + 300)
  })
})

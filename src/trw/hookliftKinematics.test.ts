import { describe, expect, it } from 'vitest'
import { classifyPiece, clampPose, hookLimits } from './hookliftKinematics'
import { ULT18Z59, ULTIMA21S56 } from './hooklift'
import { HOOKLIFT_CATALOG } from './hookliftCatalog'

describe('hooklift articulation', () => {
  it('segments pieces: rollers + low rails stay, tall front column is the jib, the rest tips', () => {
    expect(classifyPiece('rear', 0.3)).toBe('sub')
    expect(classifyPiece('rails', 0.14)).toBe('sub')
    expect(classifyPiece('rails', 0.58)).toBe('frame')
    expect(classifyPiece('front', 1.62)).toBe('jib')
    expect(classifyPiece('front', 0.4)).toBe('frame')
    expect(classifyPiece('arm', 2.0)).toBe('jib')
  })
  it('limits: Z series articulates the jib, S series slides; tipping angle from the datasheet', () => {
    const z = HOOKLIFT_CATALOG.find((s) => /18Z$/.test(s.series))!
    const lz = hookLimits(ULT18Z59, z)
    expect(lz.jibMax).toBeGreaterThan(0)
    expect(lz.slideMaxMm).toBe(0)
    expect(lz.tipMax).toBe(z.tippingAngleDeg)
    const s = HOOKLIFT_CATALOG.find((x) => /18S$/.test(x.series))
    if (s) {
      const ls = hookLimits(ULTIMA21S56, s)
      expect(ls.jibMax).toBe(0)
      expect(ls.slideMaxMm).toBe(s.horizontalMovementMm)
      expect(ls.slideFromSpec).toBe(true)
    }
    expect(hookLimits(ULTIMA21S56).slideMaxMm).toBe(1000)
    expect(clampPose({ tipDeg: 99, jibDeg: -5, slideMm: 5000 }, lz)).toEqual({ tipDeg: z.tippingAngleDeg, jibDeg: 0, slideMm: 0 })
  })
})

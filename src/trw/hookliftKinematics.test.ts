import { describe, expect, it } from 'vitest'
import { GEOM, classifyPiece, clampPose, hookLimits } from './hookliftKinematics'
import { ULT18Z59, ULTIMA21S56 } from './hooklift'
import { HOOKLIFT_CATALOG } from './hookliftCatalog'

const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => ({ x0, x1, y0, y1, z0, z1 })
describe('hooklift articulation (GDZ0073 / GDS0352)', () => {
  it('segments: outer low rails fixed, rollers tip, inner beams after the knuckle swing, column = arm', () => {
    const g = GEOM.Z
    expect(classifyPiece('rails', box(0.32, 0.56, 0, 0.14, 0.28, 6.46), g)).toBe('sub')
    expect(classifyPiece('rear', box(0.44, 0.62, 0.01, 0.34, -0.07, 0.27), g)).toBe('frame')
    expect(classifyPiece('rails', box(0.05, 0.09, 0.11, 0.58, 3.36, 6.08), g)).toBe('mid')
    expect(classifyPiece('rails', box(0.16, 0.32, -0.01, 0.35, 3.24, 5.66), g)).toBe('frame')
    expect(classifyPiece('rails', box(0.2, 0.28, 0.08, 0.31, 3.19, 5.4), g)).toBe('cyl')
    expect(classifyPiece('rails', box(-0.07, 0.07, 0.15, 0.29, 2.18, 3.57), g)).toBe('mid')
    expect(classifyPiece('rails', box(-0.06, 0.06, 0.17, 0.29, 3.49, 4.85), g)).toBe('arm')
    expect(classifyPiece('rails', box(0.27, 0.35, 0.07, 0.2, 0.19, 2.52), g)).toBe('frame')
    expect(classifyPiece('front', box(-0.17, 0.17, 0.15, 1.62, 5.34, 6.17), g)).toBe('arm')
    expect(classifyPiece('arm', box(-0.1, 0.1, 1.5, 2, 5.8, 6.1), g)).toBe('arm')
  })
  it('pivots and ranges from the drawings', () => {
    expect(GEOM.Z.knuckle.z - GEOM.Z.tip.z).toBeCloseTo(2.021, 3)
    expect(GEOM.Z.slideMm).toBe(1100)
    expect(GEOM.S.slideMm).toBe(1450)
    const z = HOOKLIFT_CATALOG.find((s) => s.name === 'ULTIMA 18Z.59')!
    const lz = hookLimits(ULT18Z59, z)
    expect(lz.tipMax).toBe(z.tippingAngleDeg)
    expect(lz.slideMaxMm).toBe(1100)
    const s = HOOKLIFT_CATALOG.find((x) => x.name === 'ULTIMA 18S.59')!
    expect(hookLimits(ULTIMA21S56, s).slideMaxMm).toBe(s.horizontalMovementMm)
    expect(hookLimits(ULTIMA21S56).slideMaxMm).toBe(1450)
    expect(clampPose({ tipDeg: 99, swingDeg: 999, slideMm: -5 }, lz)).toEqual({ tipDeg: z.tippingAngleDeg, swingDeg: 152.7, slideMm: 0 })
  })
})

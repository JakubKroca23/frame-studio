import { describe, expect, it } from 'vitest'
import { craneDefFor, craneVariantMatch, forwardKinematics, inverseKinematics, jointFromBoomPoint, jointLimits, loadAt, meshAngles, unfoldedPose, variantBoom } from './craneKinematics'
import { craneModelFor } from './CraneModel'

describe('crane definitions', () => {
  it('recognises 408 spellings', () => {
    for (const n of ['408', 'X-HiPro 408', '408E8', '408 E-8', 'HIAB X-HiPro 408 E-8', 'hiab x-hipro 408e-8']) expect(craneDefFor(n)?.key).toBe('408')
    for (const n of ['408E8', '408 E-8', 'X-HiPro 408 E8']) expect(craneVariantMatch(n)).toMatchObject({ exact: true, variant: { id: 'E-8' } })
    expect(craneVariantMatch('X-HiPro 408')).toMatchObject({ exact: false, variant: { id: 'E-8' } })
    expect(craneDefFor('HIAB X-HiPro 142 E-4')?.key).toBe('142')
    expect(craneDefFor('HIAB 1408')).toBeNull()
    expect(craneModelFor('408 E-8')?.file).toBe('hiab-x-hipro-408e8-articulated.glb')
    expect(craneModelFor('HIAB 142 E-4')?.file).toBe('hiab-x-hipro-142e4.glb')
  })
  const m = craneVariantMatch('408 E-8')!
  const v = m.variant
  it('folded preset = measured GLB pose (tip at the hook pin)', () => {
    const f = m.def.folded!
    expect(f.a1).toBeCloseTo(-49.65, 1)
    expect(f.rel).toBeGreaterThanOrEqual(jointLimits('rel', v)[0])
    const t = forwardKinematics(f, v)
    expect(t.knuckle.r).toBeCloseTo(1.244, 2)
    expect(t.knuckle.h).toBeCloseTo(0.555, 2)
    expect(t.tip.r).toBeCloseTo(-0.991, 2)
    expect(t.tip.h).toBeCloseTo(2.22, 2)
  })
  it('stroke from datasheet outreach minus measured retracted reach', () => {
    expect(meshAngles(m.def).l1).toBeCloseTo(2.4, 2)
    expect(variantBoom(v).stroke).toBeCloseTo(16.0, 1)
    // straight, fully extended: horizontal outreach ≈ 20.9 m (extension off-axis by delta → slightly less)
    const s = forwardKinematics({ slew: 0, a1: 0, rel: -meshAngles(m.def).delta, ext: variantBoom(v).stroke }, v).tip
    expect(s.r).toBeGreaterThan(20.5)
    expect(s.r).toBeLessThan(21.0)
  })
  it('IK round trip on the 408 (off-axis extension)', () => {
    for (const [a1, rel, ext] of [[30, -60, 0], [10, -20, 5], [60, -100, 2], [0, 0, 14]]) {
      const target = forwardKinematics({ slew: 0, a1, rel, ext }, v).tip
      const t = forwardKinematics(inverseKinematics(target, v), v).tip
      expect(Math.hypot(t.r - target.r, t.h - target.h)).toBeLessThan(0.05)
    }
  })
  it('ext from a dragged point on the extension line', () => {
    const j = { ...unfoldedPose(m.def), ext: 3 }
    const tip = forwardKinematics(j, v).tip
    expect(jointFromBoomPoint({ ...j, ext: 0 }, 'ext', tip, v).ext).toBeCloseTo(3, 1)
  })
  it('no load table for the 408', () => {
    expect(loadAt(v, 5)).toBeNull()
    expect(m.def.noLoadText).toBe('nosnost n/a')
  })
})

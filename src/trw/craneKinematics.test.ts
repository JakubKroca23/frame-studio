import { describe, expect, it } from 'vitest'
import { forwardKinematics, inverseKinematics, LIMITS, loadAt, parseX142Variant, slewFromAzimuth, straightPose, variantBoom } from './craneKinematics'

describe('X-HiPro 142 kinematics', () => {
  const e4 = parseX142Variant('HIAB X-HiPro 142 E-4')
  it('parses variants', () => {
    expect(parseX142Variant('eX 142E4').id).toBe('E-4')
    expect(parseX142Variant('HIAB X-HiPro 142 ES-3').id).toBe('ES-3')
    expect(parseX142Variant('HIAB 142').id).toBe('E-4')
    expect(variantBoom(parseX142Variant('142 E-5')).stroke).toBeCloseTo(10.2)
  })
  it('straight pose reproduces the CAD tip', () => {
    const t = forwardKinematics(straightPose(), e4).tip
    expect(t.r).toBeCloseTo(4.69, 2)
    expect(t.h).toBeCloseTo(2.27, 2)
  })
  it('IK reproduces reachable targets within limits', () => {
    const poses = [[60, -90, 0], [15, -55, 0], [12, 0, 3.5], [70, -20, 2], [2, 0, 6.3], [40, -120, 1], [-5, -10, 7.9]]
    for (const [a1, rel, ext] of poses) {
      const target = forwardKinematics({ slew: 0, a1, rel, ext }, e4).tip
      const j = inverseKinematics(target, e4)
      const t = forwardKinematics(j, e4).tip
      expect(Math.hypot(t.r - target.r, t.h - target.h)).toBeLessThan(0.02)
      expect(j.a1).toBeGreaterThanOrEqual(LIMITS.a1[0])
      expect(j.a1).toBeLessThanOrEqual(LIMITS.a1[1])
      expect(j.rel).toBeGreaterThanOrEqual(LIMITS.rel[0])
      expect(j.ext).toBeGreaterThanOrEqual(0)
    }
    expect(inverseKinematics({ r: 3, h: 3 }, e4).ext).toBe(0) // prefers no extension
  })
  it('IK clamps unreachable targets', () => {
    const j = inverseKinematics({ r: 30, h: 2 }, e4)
    expect(j.ext).toBeCloseTo(variantBoom(e4).stroke)
  })
  it('slew from azimuth', () => {
    expect(slewFromAzimuth(-1, 0)).toBeCloseTo(0)
    expect(slewFromAzimuth(0, 1)).toBeCloseTo(90)
    expect(slewFromAzimuth(1, 0.0001, 170)).toBeCloseTo(180, 0)
    expect(slewFromAzimuth(-1, -0.001, 200)).toBeCloseTo(0, 0)
  })
  it('load interpolation', () => {
    expect(loadAt('E-4', 3.1)!.kg).toBe(4000)
    expect(loadAt('E-4', 2)!.kg).toBe(4000)
    expect(loadAt('E-4', 5.7)!.kg).toBeCloseTo((2550 + 1780) / 2)
    expect(loadAt('E-4', 14)).toMatchObject({ manual: true })
    expect(loadAt('E-4', 16)!.kg).toBe(0)
    expect(loadAt('ES-4', 5)).toBeNull()
  })
})

import { jointFromBoomPoint, setJoint, nearestEquivalent, LIMITS as LIM2, straightPose as sp, forwardKinematics as fk, X142_VARIANTS as VV } from './craneKinematics'
describe('joint-only manipulation', () => {
  const v = VV.find((x) => x.id === 'E-4')!
  it('setJoint changes one joint and clamps to limits', () => {
    const j = sp()
    const a = setJoint(j, 'a1', 45, v)
    expect(a).toEqual({ ...j, a1: 45 })
    expect(setJoint(j, 'a1', 200, v).a1).toBe(LIM2.a1[1])
    expect(setJoint(j, 'rel', -400, v).rel).toBe(LIM2.rel[0])
    expect(setJoint(j, 'slew', 300, v).slew).toBe(LIM2.slew[1])
    expect(setJoint(j, 'ext', 99, v).ext).toBeCloseTo(8.0, 3)
    expect(setJoint(j, 'ext', -1, v).ext).toBe(0)
  })
  it('dragged point sets only the chosen joint', () => {
    const j = { ...sp(), slew: 30, ext: 2 }
    const p1 = { r: -0.05 + Math.cos(Math.PI / 4), h: 2.2 + Math.sin(Math.PI / 4) }
    const a = jointFromBoomPoint(j, 'a1', p1, v)
    expect(a.a1).toBeCloseTo(45, 6)
    expect({ ...a, a1: j.a1 }).toEqual(j)
    const k = fk(j, v).knuckle
    const r = jointFromBoomPoint(j, 'rel', { r: k.r, h: k.h - 1 }, v)
    expect(r.rel).toBeCloseTo(-90 - j.a1, 6)
    expect({ ...r, rel: j.rel }).toEqual(j)
    const tip = fk({ ...j, ext: 5 }, v).tip
    const e = jointFromBoomPoint(j, 'ext', tip, v)
    expect(e.ext).toBeCloseTo(5, 6)
    expect(jointFromBoomPoint(j, 'ext', { r: 100, h: k.h }, v).ext).toBeCloseTo(8, 3)
  })
  it('angles stay continuous across ±180°', () => {
    expect(nearestEquivalent(-179, 175)).toBe(181)
    expect(nearestEquivalent(170, -160)).toBe(-190)
  })
})

import { describe, expect, it } from 'vitest'
import { AUX_STAB, armExtFromReach, legToGround, pickAuxStab } from './AuxOutriggerModel'
describe('aux outriggers', () => {
  it('picks by nearest extended spread', () => {
    expect(pickAuxStab(5041)).toBe('5m')
    expect(pickAuxStab(5980)).toBe('6m')
    expect(pickAuxStab(null)).toBe('5m')
  })
  it('full arm stroke gives the drawing spread', () => {
    for (const k of ['5m', '6m'] as const) {
      const s = AUX_STAB[k]
      expect(s.footRetracted + 2 * s.armStroke).toBeCloseTo(s.extended, 6)
      expect(armExtFromReach(k, s.extended / 2)).toBeCloseTo(s.armStroke)
      expect(armExtFromReach(k, 99999)).toBe(s.armStroke)
      expect(armExtFromReach(k, 100)).toBe(0)
    }
  })
  it('leg reaches ground within the cylinder stroke', () => {
    expect(legToGround('5m', 300)).toEqual({ down: 300, reaches: true })
    expect(legToGround('6m', 600)).toEqual({ down: 450, reaches: false })
  })
})

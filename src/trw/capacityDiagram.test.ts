import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { capacityInfo, capacityRings, slewStatus } from './capacityDiagram'
import { craneVariantMatch, X142_LOADS } from './craneKinematics'
import { mapExtended } from './trwExtended'

describe('CraneWIN capacity diagram data', () => {
  it('rings come straight from the HiSelect table (E-4)', () => {
    const r = capacityRings(X142_LOADS['E-4'])
    expect(r[0]).toEqual({ rMm: 3100, kg: 4000, manual: false })
    expect(r.at(-1)).toEqual({ rMm: 15000, kg: 660, manual: true })
  })
  it('no table → no rings and a missing note (408)', () => {
    const v = craneVariantMatch('HIAB X-HiPro 408 E-8')!.variant
    const i = capacityInfo({ variant: v, reachMm: 8000, slewDeg: 0, stability: null })
    expect(i.rings).toHaveLength(0)
    expect(i.atReach).toBeNull()
    expect(i.missing.join(' ')).toMatch(/Zátěžná tabulka/)
  })
  it('uses the trw stability + design case of the 142 sample', () => {
    const doc = JSON.parse(readFileSync('src/trw/sample-crane-142-stability-3d.json', 'utf8'))
    const ext = mapExtended(doc, 0)!
    const v = craneVariantMatch(doc.crane.name)!.variant
    const i = capacityInfo({ variant: v, reachMm: 8500, slewDeg: 0, stability: ext.stability, design: { hookKg: doc.crane.hook_kg, radiusM: doc.crane.radius_m, momentKNm: doc.crane.Mk_kNm } })
    expect(i.atReach?.kg).toBe(1320)
    expect(i.atSlew?.factor).toBeCloseTo(9.42, 1)
    expect(i.design?.hookKg).toBe(2000)
    expect(i.design?.withinChart).toBe(false)
    expect(slewStatus(ext.stability)).toHaveLength(360)
  })
})

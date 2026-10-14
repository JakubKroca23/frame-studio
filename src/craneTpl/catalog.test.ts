import { describe, expect, it } from 'vitest'
import { CRANE_CATALOG, CRANE_DEFS, craneVariantMatch, forwardKinematics, inverseKinematics, meshAngles, variantBoom } from '../trw/craneKinematics'
import { craneModelFor } from '../trw/CraneModel'

describe('crane catalog (template + drawings)', () => {
  it('has the models from the drawings', () => {
    const keys = CRANE_CATALOG.map((e) => e.key)
    for (const k of ['ex142-bbs', 'ex142-bss', 'ex142-dds', 'ex162-ees', 'ex162-bbs', 'ex162-bss', 'ex162-dds', 'ix148-bbs', 'ex192-ees', 'ix188-bbs', 'ix188-ees', 'ix228-bbs', 'ix228-ees', 'ex232-ees', 'ix225l-dldll', 'ex235l-dldll', 'ex262-e', 'ex302-e', 'ex302-ep', 'cl19-bbs', 'cl23-bbs', 'iq708-e', 'iq708-ejib', 'iq1188-e', 'iq1188-ejib', 'x638-e']) expect(keys).toContain(k)
    for (const e of CRANE_CATALOG) {
      expect(e.template).toBe(e.key === 'cl23-bbs' || Number.parseInt(e.model, 10) >= 220 ? '408' : '142')
      expect(new Set(e.variants.map((v) => v.id)).size).toBe(e.variants.length)
      for (const v of e.variants) { expect(v.hydMaxMm).toBeGreaterThan(v.minOutreachMm); expect(v.manMaxMm).toBeGreaterThanOrEqual(v.hydMaxMm) }
    }
  })
  it('every variant articulates: straight full stroke reaches the drawing hydraulic max (± template hook offset), IK round trip', () => {
    for (const d of CRANE_DEFS.filter((x) => x.adapt)) for (const v of d.variants) {
      const { stroke } = variantBoom(v)
      expect(stroke).toBeCloseTo((v.hydMaxMm - v.minOutreachMm) / 1000, 6)
      const t = forwardKinematics({ slew: 0, a1: 0, rel: -meshAngles(d).delta, ext: stroke }, v).tip
      expect(Math.abs(t.r * 1000 - v.hydMaxMm)).toBeLessThan(15) // LESSONS L2: hook offset corrected
      for (const [a1, rel, ext] of [[30, -60, 0], [10, -20, stroke / 2]]) {
        const target = forwardKinematics({ slew: 0, a1, rel, ext }, v).tip
        const r = forwardKinematics(inverseKinematics(target, v), v).tip
        expect(Math.hypot(r.r - target.r, r.h - target.h)).toBeLessThan(0.05)
      }
    }
  })
  it('aliases share the drawings (LESSONS L6)', () => {
    expect(craneVariantMatch('HIAB CLX 178 E-4')?.def.key).toBe('ix188-ees')
    expect(craneVariantMatch('HIAB CLX 218 B-3')?.def.key).toBe('ix228-bbs')
    expect(craneVariantMatch('HIAB CLX 288 EP-4')?.def.key).toBe('ex302-ep')
    expect(craneVariantMatch('HIAB iQ.958 E-9')?.def.key).toBe('iq1188-e')
    expect(craneVariantMatch('HIAB iQ.708 E-7')?.variant.id).toBe('E-7')
  })
  it('maps trw crane names', () => {
    expect(craneVariantMatch('HIAB  X-HiPro 192 E-4')).toMatchObject({ def: { key: 'ex192-ees' }, variant: { id: 'E-4' }, exact: true })
    expect(craneVariantMatch('X-HiPro 192 E-4')).toMatchObject({ def: { key: 'ex192-ees' }, exact: true })
    expect(craneVariantMatch('iX.188 B-4')).toMatchObject({ def: { key: 'ix188-bbs' }, variant: { id: 'B-4' } })
    expect(craneVariantMatch('HIAB eX.235L DLL-3')).toMatchObject({ def: { key: 'ex235l-dldll' }, variant: { id: 'DLL-3' } })
    expect(craneVariantMatch('X-HiPro 302 EP-4')).toMatchObject({ def: { key: 'ex302-ep' }, variant: { id: 'EP-4' } })
    expect(craneVariantMatch('X-HiPro 302 E-6')).toMatchObject({ def: { key: 'ex302-e' }, variant: { id: 'E-6' } })
    expect(craneVariantMatch('HIAB X-HiPro 142 B-2')).toMatchObject({ def: { key: 'ex142-bbs' }, variant: { id: 'B-2' } })
    expect(craneVariantMatch('HIAB X-HiPro 142 E-4')).toMatchObject({ def: { key: '142' }, variant: { id: 'E-4' } })
    expect(craneVariantMatch('408 E-8')?.def.key).toBe('408')
    expect(craneVariantMatch('HIAB 232 E-5')).toMatchObject({ def: { key: 'ex232-ees' }, variant: { id: 'E-5' } })
    expect(craneVariantMatch('HIAB 225 E-5')).toBeNull()
    expect(craneModelFor('HIAB X-HiPro 192 E-4')).not.toBeNull()
  })
})

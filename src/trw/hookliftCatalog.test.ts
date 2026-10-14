import { describe, expect, it } from 'vitest'
import { findHookliftSpec, HOOKLIFT_CATALOG } from './hookliftCatalog'
import { hookliftPlacement } from './hooklift'

describe('hookliftCatalog', () => {
  it('has all datasheet models', () => {
    expect(HOOKLIFT_CATALOG.map((c) => c.name)).toContain('ULTIMA 18Z.59')
    expect(HOOKLIFT_CATALOG).toHaveLength(57)
    for (const c of HOOKLIFT_CATALOG) expect(c.subframeLengthMm).toBeGreaterThan(4500)
  })
  it('fuzzy matches names', () => {
    expect(findHookliftSpec('MULTILIFT ULT18Z59 DIN')).toMatchObject({ name: 'ULTIMA 18Z.59', massKg: 2520, subframeLengthMm: 6583, gLengthMm: 5880, installHeightMm: 250 })
    expect(findHookliftSpec('Multilift Ultima 18S.53')?.subframeLengthMm).toBe(6508)
    expect(findHookliftSpec('ULTIMA 21 SL 49')).toMatchObject({ capacityT: 21, installHeightMm: 195, massKg: 2040 })
    expect(findHookliftSpec('ULTIMA 21SL', 6100)?.name).toBe('ULTIMA 21SL.53')
    expect(findHookliftSpec('MULTILIFT ULTIMA 21S56')).toMatchObject({ name: 'ULTIMA 21S.56', subframeLengthMm: 6563, massKg: 2500, oilFlowLpm: 100 })
    expect(findHookliftSpec('Ultima 21S.56S')?.subframeLengthMm).toBe(6283)
    expect(findHookliftSpec('ULT21SL53')?.series).toBe('ULTIMA 21SL')
    expect(findHookliftSpec('ULT21Z61')?.minWorkingHeightMm).toBe(3066)
    expect(findHookliftSpec('hákový nosič')).toBeNull()
    expect(findHookliftSpec('ULT18Z99')).toBeNull()
  })
  it('placement uses catalog length, rear at x_to', () => {
    const r = hookliftPlacement({ xFrom: 1000, xTo: 8000, length: null, height: null, name: 'ULT21SL56' }, 9000)
    expect(r.xRear).toBe(8000)
    expect(r.params).toMatchObject({ lengthMm: 6443, capacityT: 21, installHeightMm: 195 })
    expect(r.mesh.file).toBe('ultima21s56.glb')
    expect(hookliftPlacement({ xFrom: null, xTo: null, length: null, height: null, name: 'ULT18Z59' }, 9000).mesh.file).toBe('ult18z59.glb')
    expect(hookliftPlacement({ xFrom: null, xTo: null, length: null, height: null, name: 'ULTIMA 21Z.56' }, 9000).mesh.file).toBe('ult18z59.glb')
    for (const n of ['ULT18S53', 'ULT14S41', 'ULT16S61', 'ULT26S78']) expect(hookliftPlacement({ xFrom: null, xTo: null, length: null, height: null, name: n }, 9000).mesh.file).toBe('ultima21s56.glb')
    expect(hookliftPlacement({ xFrom: null, xTo: null, length: null, height: null, name: 'ULT26Z65' }, 9000).mesh.file).toBe('ult18z59.glb')
    expect(findHookliftSpec('ULTIMA 26S.56S')?.subframeLengthMm).toBe(6583)
  })
})

import { findHookliftMatch } from './hookliftCatalog'
import { pickHooklift } from './hooklift'
describe('exact model only', () => {
  it('resolves 14S.51 in all spellings', () => {
    for (const n of ['ULTIMA 14S.51', 'ULT14S51', '14S51', 'Multilift 14S.51', 'MULTILIFT ULTIMA 14S51 DIN', 'Hiab 14 S-51']) {
      const m = findHookliftMatch(n)
      expect(m?.spec.name, n).toBe('ULTIMA 14S.51')
      expect(m?.exact).toBe(true)
    }
  })
  it('series only → auto-picked, flagged not exact', () => {
    const m = findHookliftMatch('ULTIMA 14S', 5700)
    expect(m?.exact).toBe(false)
    expect(m?.spec.series).toBe('ULTIMA 14S')
  })
  it('does not match unrelated names', () => {
    expect(findHookliftMatch('MAN TGX 26.480 6x2')).toBeNull()
    expect(findHookliftMatch('HIAB X-HiPro 142 E-4')).toBeNull()
  })
  it('several hooklift entries → only the exact one is picked', () => {
    const acc = (name: string) => ({ name, kind: null, isOutrigger: false }) as never
    expect(pickHooklift({ accessories: [acc('ULTIMA 14S'), acc('box'), acc('MULTILIFT ULTIMA 14S.51')] })).toBe(2)
    expect(pickHooklift({ accessories: [acc('box')] })).toBeNull()
    expect(pickHooklift({ body: { type: 'hooklift', typeRaw: 'abroll' } as never, accessories: [acc('ULT14S51')] })).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'
import { capacityFromName, hookliftPlacement, isHookliftAccessory, makeHookliftDeform, ULT18Z59 } from './hooklift'

describe('hooklift', () => {
  it('classifies accessories', () => {
    for (const n of ['MULTILIFT ULT18Z59 DIN', 'Hákový nosič', 'Ampliroll', 'Abrollkipper', 'hooklift', 'ULTIMA 21SL.53']) expect(isHookliftAccessory({ name: n, kind: null, isOutrigger: false })).toBe(true)
    expect(isHookliftAccessory({ name: 'výfuk', kind: 'exhaust', isOutrigger: false })).toBe(false)
  })
  it('capacity from name', () => {
    expect(capacityFromName('MULTILIFT ULT18Z59 DIN')).toBe(18)
    expect(capacityFromName('Multilift XR21S')).toBe(21)
    expect(capacityFromName('hákový nosič 20 t')).toBe(20)
    expect(capacityFromName('Hákový nosič')).toBeNull()
  })
  it('placement defaults + range', () => {
    expect(hookliftPlacement({ xFrom: null, xTo: null, length: null, height: null }, 8000)).toEqual({ xRear: 8000, spec: null, params: { lengthMm: ULT18Z59.lengthMm, hookHeightMm: 1570, capacityT: 18, installHeightMm: 250 } })
    expect(hookliftPlacement({ xFrom: 2000, xTo: 7500, length: null, height: null, name: 'hákový nosič 20 t' }, 8000).params).toMatchObject({ lengthMm: 5500, capacityT: 20 })
  })
  it('deform keeps rear, stretches to length, raises hook', () => {
    const d = makeHookliftDeform({ lengthMm: ULT18Z59.nativeLengthMm + 1000, hookHeightMm: 1770, capacityT: 18 })
    const rear = { x: 0, y: 0.1, z: ULT18Z59.zMin }
    d(rear, false)
    expect(rear.z).toBeCloseTo(ULT18Z59.zMin)
    const front = { x: 0, y: 1.9, z: ULT18Z59.zMax }
    d(front, true)
    expect(front.z - ULT18Z59.zMin).toBeCloseTo((ULT18Z59.nativeLengthMm + 1000) / 1000)
    expect(front.y).toBeCloseTo(2.1)
  })
})

import { describe, expect, it } from 'vitest'
import { capacityFromName, deformPieces, hookliftPlacement, isHookliftAccessory, makeHookliftDeform, ULT18Z59 } from './hooklift'

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
    expect(hookliftPlacement({ xFrom: null, xTo: null, length: null, height: null }, 8000)).toMatchObject({ xRear: 8000, spec: null, params: { lengthMm: ULT18Z59.lengthMm, hookHeightMm: 1570, capacityT: 18, installHeightMm: 250 } })
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
  it('cut-and-shift: beams extrude, rigid parts translate unscaled, removed slice hides parts', () => {
    const M = ULT18Z59
    // piece 0: rail beam z 0.2..6.0 (vertices at ends + one in the middle), piece 1: bracket at z 5.0..5.2, piece 2: bracket at z 4.3
    const pos = new Float32Array([0, 0, 0.2, 0, 0.1, 3.0, 0, 0.14, 6.0, 0, 0.3, 5.0, 0, 0.3, 5.2, 0, 0.3, 4.3])
    const piece = [0, 0, 0, 1, 1, 2]
    const hidden = deformPieces(pos, piece, [0, 0, 0, 0, 0, 0], { lengthMm: M.nativeLengthMm + 1000, hookHeightMm: 1570, capacityT: 18, installHeightMm: 250 }, M)
    expect(hidden.size).toBe(0)
    expect(pos[2]).toBeCloseTo(0.2)
    expect(pos[8]).toBeCloseTo(7.0)
    expect(pos[14] - pos[11]).toBeCloseTo(0.2) // bracket length unchanged
    expect(pos[11]).toBeCloseTo(6.0)
    const pos2 = new Float32Array([0, 0, 0.2, 0, 0.1, 3.0, 0, 0.14, 6.0, 0, 0.3, 5.0, 0, 0.3, 5.2, 0, 0.3, 4.3])
    const h2 = deformPieces(pos2, piece, [0, 0, 0, 0, 0, 0], { lengthMm: M.nativeLengthMm - 400, hookHeightMm: 1570, capacityT: 18, installHeightMm: 250 }, M)
    expect(h2.has(2)).toBe(true) // 4.3 lies in the slice removed at the 4.4 plane
    expect(pos2[8]).toBeCloseTo(5.6)
    expect(pos2[14] - pos2[11]).toBeCloseTo(0.2)
  })
})

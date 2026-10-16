import { describe, expect, it } from 'vitest'
import { autoPlace, autoScale, orient, roleFromName, sizeFromName } from './dxfLayers'

const d = { frontX: -1400, frameRear: 7000, frameTop: 1050, hook: { install: 250, xRear: 7100 } }
describe('DXF refinement layers', () => {
  it('guesses the role from the file name', () => {
    expect(roleFromName('ABROLL DSD 6500x2340x2400 36m3.dxf')).toBe('container')
    expect(roleFromName('tsr-sestava.dxf')).toBe('assembly')
    expect(roleFromName('podvozek 6x4.dwg')).toBe('chassis')
    expect(roleFromName('sklapec.dxf')).toBe('body')
  })
  it('reads the size from the name and rescales paper drawings', () => {
    expect(sizeFromName('X 6500x2340x2400x5x3')).toEqual({ length: 6500, width: 2340, height: 2400 })
    expect(autoScale(388.3, 'ABROLL 6500x2340x2400').k).toBeCloseTo(16.74, 2)
    expect(autoScale(6480, 'ABROLL 6500x2340x2400').k).toBe(1)
    const f = autoScale(165, 'ABROLL 6500x2340x2400', 159, 116)
    expect(159 * f.k * f.kw).toBeCloseTo(2340, 6)
    expect(116 * f.k * f.kh).toBeCloseTo(2400, 6)
    expect(autoScale(10766, 'tsr.dxf').k).toBe(1)
  })
  it('orients the longer horizontal axis along the vehicle', () => {
    expect(orient({ x: 10766, y: 2979, z: 4070 })).toMatchObject({ lengthAxis: 'x', length: 10766, width: 2979 })
    expect(orient({ x: 2400, y: 6500, z: 2400 })).toMatchObject({ lengthAxis: 'y', length: 6500 })
    expect(orient({ x: 4070, y: 10066, z: 2979 }, 'auto')).toMatchObject({ lengthAxis: 'y', width: 2979, height: 4070, swapped: true })
    expect(orient({ x: 2500, y: 10066, z: 3900 }, 'auto').swapped).toBe(false)
  })
  it('places each role on its datum', () => {
    expect(autoPlace('container', 6500, d)).toMatchObject({ x0: 600, y0: 1300 })
    expect(autoPlace('container', 6500, { ...d, hook: null })).toMatchObject({ x0: 500, y0: 1300 })
    expect(autoPlace('body', 5000, d)).toMatchObject({ x0: 2000, y0: 1050 })
    expect(autoPlace('assembly', 10766, d)).toMatchObject({ x0: -1400, y0: 0 })
  })
})

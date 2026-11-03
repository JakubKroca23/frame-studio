import { describe, expect, it } from 'vitest'
import golden from './fixtures/golden-volvo-fm-6x2.json'
import { hookliftPlacement } from './hooklift'
import { craneHasOriginalModel, craneModelFor } from './CraneModel'
import { mapTrwExport } from './trwConfig'

/** Upper bound on preset.approx[] entries for the golden fixture — raise only when intentionally adding new estimated fields. */
const GOLDEN_MAX_APPROX = 38

describe('golden trw import (Volvo FM 6x2 synthetic)', () => {
  const x0 = 1365
  const r = mapTrwExport(golden)
  const c = r.preset.config
  const ext = r.markers.extended!

  it('maps chassis wheelbase and axle positions from trw (no rounding)', () => {
    expect(r.preset.wheelbases[0]).toBe(5200)
    expect(c.axles.map((a) => a.position)).toEqual([0, 5200, 6570])
    expect(c.axles.map((a) => a.track)).toEqual([2109, 1837, 1837])
    expect(c.cab.width).toBe(2550)
    expect(c.cab.backFromAxle).toBe(515)
    expect(c.frame.topHeight).toBe(1064)
    expect(c.frame.widthRear).toBe(852)
    expect(r.warnings.some((w) => w.includes('Rozchod kol'))).toBe(false)
  })

  it('maps flatbed + hook bodies from bodies[]', () => {
    const flat = ext.bodies!.find((b) => b.sourceSection === 'BODYDATA')!
    const hook = ext.bodies!.find((b) => b.sourceSection === 'HOOK')!
    expect(flat).toMatchObject({
      type: 'flatbed',
      xFrom: 4680 - x0,
      xTo: 8680 - x0,
      length: 4000,
      width: 2550,
      sideHeight: 450,
      massKg: 1180,
    })
    expect(hook.type).toBe('hooklift')
    expect(hook.length).toBe(6044)
  })

  it('hooklift uses trw length 6044 mm and warns on catalog delta', () => {
    const hlAcc = ext.accessories?.find((a) => a.name.includes('ULTIMA')) 
    const hookBody = ext.bodies!.find((b) => b.sourceSection === 'HOOK')!
    const w: string[] = []
    const p = hookliftPlacement(
      { xFrom: hookBody.xFrom, xTo: hookBody.xTo, length: hookBody.length, height: null, name: hookBody.typeRaw ?? '' },
      c.axles[2].position + c.rearOverhang,
      w,
    )
    expect(p.params.lengthMm).toBe(6044)
    expect(p.params.hookHeightMm).toBe(1570)
    expect(w.some((s) => s.includes('odchyluje od katalogu'))).toBe(true)
    expect(hlAcc).toBeUndefined()
  })

  it('crane marker and Jonsered GLB', () => {
    expect(r.markers.crane).toMatchObject({ name: expect.stringContaining('iZ.18R'), x: 4180 - x0 })
    expect(craneModelFor(r.markers.crane!.name)?.file).toBe('jonsered-iz18r-articulated.glb')
    expect(r.warnings.some((w) => w.includes('parametrický obrys'))).toBe(false)
  })

  it('lists acc_accessories', () => {
    const names = ext.accessories!.map((a) => a.name)
    expect(names).toEqual(expect.arrayContaining(['nárážník', 'nádrž paliva', 'Kinshofer KHM 17']))
    expect(ext.accessories!.find((a) => a.name === 'nádrž paliva')?.y).toBe(-900)
  })

  it('does not grow approx[] beyond the golden ceiling', () => {
    expect(r.preset.approx.length).toBeLessThanOrEqual(GOLDEN_MAX_APPROX)
    for (const p of ['axles.0.track', 'axles.1.track', 'cab.width', 'cab.backFromAxle', 'frame.widthRear', 'frame.topHeight']) expect(r.preset.approx).not.toContain(p)
  })
})

describe('missing crane model (HIAB iX.138)', () => {
  it('warns and has no catalogue GLB', () => {
    const doc = { ...golden, crane: { ...golden.crane, name: 'HIAB iX.138', manufacturer: 'HIAB', x_mm: 4000 } }
    const r = mapTrwExport(doc)
    expect(craneHasOriginalModel('HIAB iX.138')).toBe(false)
    expect(r.warnings.some((w) => w.includes('nemá originální 3D model'))).toBe(true)
  })
})

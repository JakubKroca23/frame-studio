import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { CRANE_DEFS, extFraction, forwardKinematics, meshAngles, variantBoom } from '../trw/craneKinematics'
import { adaptGroups } from './adaptMesh'
import { outreachVariants, parseAcadTables, tableLabelValues, type CraneSheet } from './sheet'
import { adaptFromSheet, pickTemplate } from './template'

const scale = { mmPerUnit: 20, ratio: 20, label: '1:20', source: 'dims', units: 4, unitsName: 'mm', unitToMm: 1, dimsTotal: 3, dimsAgreeing: 3, titleHint: null, confident: true, note: '' } as const
function sheet(over: Partial<CraneSheet> = {}): CraneSheet {
  return {
    isCrane: true, reason: '', title: 'T', model: '142', scale: { ...scale }, scaleNote: '', labelled: [], tableValues: [],
    variants: [{ id: 'E-6', family: 'E', extensions: 6, minOutreachMm: 5000, hydMaxMm: 17000, manMaxMm: 19000 }],
    dims: [{ key: 'height', name: 'h', mm: 2800, source: 'výkres-kóta', ref: '' }, { key: 'stabFolded', name: 's', mm: 2511, source: 'výkres-tabulka', ref: '' }],
    ...over,
  }
}

describe('template + drawing', () => {
  it('ACAD_TABLE grid + labelled columns + outreach rows', () => {
    const cell = (t: string) => `171\n1\n1\n${t}\n`
    const raw = `0\nACAD_TABLE\n10\n1\n20\n2\n91\n3\n92\n4\n${['1-3, OUTREACH', '', '', '', 'EXTENSION', 'MIN', 'MAX', 'MAX', 'E-2', '4750', '8600', '10780'].map(cell).join('')}0\nACAD_TABLE\n91\n2\n92\n2\n${['SPREED', '3-5a', '4.8m', '1250'].map(cell).join('')}0\nEOF\n`
    const t = parseAcadTables(raw)
    expect(t).toHaveLength(2)
    expect(outreachVariants(t)).toEqual([{ id: 'E-2', family: 'E', boom: 'E', extensions: 2, minOutreachMm: 4750, hydMaxMm: 8600, manMaxMm: 10780 }])
    expect(tableLabelValues(t)).toEqual([{ label: '3-5a', row: '4.8m', value: 1250, table: 'SPREED' }])
  })
  it('picks the closest template', () => {
    expect(pickTemplate(sheet({ model: '158' })).key).toBe('142')
    expect(pickTemplate(sheet({ model: '358' })).key).toBe('408')
    expect(pickTemplate(sheet({ model: null })).key).toBe('408') // 6 extensions
  })
  it('adapts column height, keeps base within 2 %, extensions from the drawing; kinematics follow', () => {
    const a = adaptFromSheet(sheet())
    expect(a.scales.dh).toBeCloseTo((2800 - 2569) / 1000, 6)
    expect(a.scales.baseX).toBe(1)
    const v = a.variants[0]
    expect(v.extensions).toBe(6)
    expect(a.def.geom.p1.h).toBeCloseTo(CRANE_DEFS[0].geom.p1.h + a.scales.dh, 6)
    expect(variantBoom(v).stroke).toBeCloseTo(12, 6)
    // straight + full stroke reaches the drawing's hydraulic max (outer boom in line with the extension axis on the 142)
    const m = meshAngles(a.def)
    const t = forwardKinematics({ slew: 0, a1: 0, rel: -m.delta, ext: 12 }, v).tip
    expect(t.r).toBeCloseTo(a.def.geom.p1.r + m.l1 + variantBoom(v).l2 + 12, 1)
    expect(a.report.find((r) => r.name.startsWith('Výška'))?.used).toBe('výkres')
    expect(a.report.find((r) => r.name.startsWith('Hlavní'))?.used).toBe('šablona')
  })
  it('clones extension parts beyond the template sections and stretches the column', () => {
    const a = adaptFromSheet(sheet(), false)
    const box = (y0: number, y1: number) => { const g = new THREE.BoxGeometry(0.2, y1 - y0, 0.2); g.translate(0.3, (y0 + y1) / 2, 3); return g }
    const groups: Record<string, THREE.BufferGeometry[]> = { column: [box(0, 2)], ext4: [box(2.1, 2.3)], main: [box(2.1, 2.4)] }
    const out = adaptGroups(groups, a.def, 0, 6, { r: 1, h: 0 }, { r: 1, h: 0 })
    expect(out.ext5).toHaveLength(1)
    expect(out.ext6).toHaveLength(1)
    out.ext6[0].computeBoundingBox()
    const bb = out.ext6[0].boundingBox!
    expect(bb.max.x - bb.min.x).toBeCloseTo(0.2 * 0.86 ** 2, 4)
    out.column[0].computeBoundingBox()
    expect(out.column[0].boundingBox!.max.y).toBeCloseTo(2 * (a.def.geom.p1.h / (a.def.geom.p1.h - a.scales.dh)), 4)
  })
  it('408 telescope strokes calibrated on the extended GLB', () => {
    const d = CRANE_DEFS.find((x) => x.key === '408')!
    expect(d.extStrokes).toHaveLength(8)
    expect(d.extStrokes!.reduce((p, c) => p + c, 0)).toBeCloseTo(16.05, 2)
    expect(extFraction(d, 8, 8)).toBe(1)
    expect(extFraction(d, 8, 1)).toBeCloseTo(1.505 / 16.049, 3)
    expect(extFraction(CRANE_DEFS[0], 4, 2)).toBe(0.5)
  })
})

import { describe, expect, it } from 'vitest'
import sample from './sample-export.json'
import { mapTrwExport } from './trwConfig'
import { mapExtended, nearestAngle, stabilitySummary, normalizeBodyType, parseAccessories, parseAccessory, parseBody, parseStability } from './trwExtended'

const x0 = 1475

describe('trw extended: body', () => {
  it('normalizes Czech/English types', () => {
    expect(normalizeBodyType('valník')).toBe('flatbed')
    expect(normalizeBodyType('Flatbed')).toBe('flatbed')
    expect(normalizeBodyType('sklápěč')).toBe('tipper')
    expect(normalizeBodyType('tipper')).toBe('tipper')
    expect(normalizeBodyType('hákový nosič')).toBe('hooklift')
    expect(normalizeBodyType('hooklift')).toBe('hooklift')
    expect(normalizeBodyType('cisterna')).toBe('other')
    expect(normalizeBodyType(null)).toBe('other')
  })
  it('parses snake_case _mm fields', () => {
    const w: string[] = []
    const b = parseBody({ type: 'valník', x_from_mm: 4675, x_to_mm: 8675, width_mm: 2550, height_mm: 900, side_height_mm: 500, mass_kg: 1200, cog_x_mm: 6700 }, x0, w)!
    expect(b).toMatchObject({ type: 'flatbed', xFrom: 4675 - x0, xTo: 8675 - x0, length: 4000, width: 2550, sideHeight: 500, massKg: 1200, cog: { x: 6700 - x0 } })
    expect(w).toEqual([])
  })
  it('parses kind, x_from/x_to, dimensions{}, cog{} and swaps reversed range', () => {
    const b = parseBody({ kind: 'tipper', x_from: 9000, dimensions: { length: 4000, width: 2400, height: 1100 }, cog: { x_mm: 7000, z_mm: 1800 }, mass: '2500' }, x0)!
    expect(b).toMatchObject({ type: 'tipper', xFrom: 9000 - x0, xTo: 13000 - x0, width: 2400, height: 1100, massKg: 2500, cog: { x: 7000 - x0, z: 1800 } })
    expect(parseBody({ x_from_mm: 8000, x_to_mm: 3000 }, 0)).toMatchObject({ xFrom: 3000, xTo: 8000 })
    expect(parseBody({ type: 'flatbed', side_walls: { height_mm: 600 } }, 0)?.sideHeight).toBe(600)
  })
  it('warns on missing values and never throws', () => {
    const w: string[] = []
    const b = parseBody({}, x0, w)!
    expect(b.type).toBe('other')
    expect(w.some((s) => s.includes('Typ nástavby chybí'))).toBe(true)
    expect(w.some((s) => s.includes('Poloha nástavby'))).toBe(true)
    expect(w.some((s) => s.includes('Hmotnost nástavby'))).toBe(true)
    expect(parseBody(null, x0)).toBeUndefined()
    expect(parseBody('x', x0)).toBeUndefined()
    const w2: string[] = []
    parseBody({ type: 'valník', x_from_mm: 1, x_to_mm: 2 }, 0, w2)
    expect(w2.some((s) => s.includes('bočnic'))).toBe(true)
  })
})

describe('trw extended: accessories', () => {
  it('parses plain accessory with label and kg', () => {
    const a = parseAccessory({ kind: 'toolbox', name: 'Bedna', x_mm: 5000, mass_kg: 60, cog: { x_mm: 5100, y_mm: -900 }, outline_svg_url: '/o.svg' }, 0, x0)
    expect(a).toMatchObject({ name: 'Bedna', kind: 'toolbox', isOutrigger: false, x: 5000 - x0, massKg: 60, cog: { x: 5100 - x0, y: -900 }, outline: '/o.svg' })
  })
  it('accepts position{x_mm}, type, x_from/x_to range and cog-only position', () => {
    expect(parseAccessory({ type: 'nádrž', position: { x_mm: 3000, y_mm: 800 }, mass_kg: 1 }, 0, 0)).toMatchObject({ name: 'nádrž', x: 3000, y: 800 })
    expect(parseAccessory({ x_from: 2000, x_to: 3000 }, 1, 0)).toMatchObject({ name: 'příslušenství 2', x: 2500, length: 1000 })
    expect(parseAccessory({ cog_x_mm: 4200 }, 0, 200).x).toBe(4000)
  })
  it('detects extra outriggers with reach left/right in several spellings', () => {
    expect(parseAccessory({ kind: 'outrigger', name: 'Zadní podpěry', x_mm: 9000, reach_left_mm: 2100, reach_right_mm: 2300, mass_kg: 300 }, 0, x0)).toMatchObject({ isOutrigger: true, x: 9000 - x0, reachLeft: 2100, reachRight: 2300 })
    expect(parseAccessory({ name: 'podpěra', x_mm: 1, reach: { left: 1000, right: 1200 } }, 0, 0)).toMatchObject({ isOutrigger: true, reachLeft: 1000, reachRight: 1200 })
    expect(parseAccessory({ type: 'stabilizer', x_mm: 1, spread_mm: 4000 }, 0, 0)).toMatchObject({ isOutrigger: true, reachLeft: 2000, reachRight: 2000 })
    const w: string[] = []
    parseAccessory({ kind: 'outrigger', name: 'P', x_mm: 1, mass_kg: 1, reach_left_mm: 1 }, 0, 0, w)
    expect(w).toEqual(['Podpěra „P“ nemá vyložení na pravou stranu.'])
  })
  it('warns on missing values, tolerates junk', () => {
    const w: string[] = []
    const list = parseAccessories([null, 5, { name: 'X' }], 0, w)!
    expect(list.map((a) => a.name)).toEqual(['příslušenství 1', 'příslušenství 2', 'X'])
    expect(w.filter((s) => s.startsWith('Příslušenství'))).toHaveLength(3)
    const w2: string[] = []
    expect(parseAccessories({ a: 1 }, 0, w2)).toBeUndefined()
    expect(w2).toHaveLength(1)
    expect(parseAccessories(undefined, 0)).toBeUndefined()
  })
})

describe('trw extended: stability', () => {
  const st = {
    angles: [
      { angle_deg: 90, factor: 1.12, pass: false, tipping_lines: [[{ x_mm: 2000, y_mm: -2100 }, { x_mm: 9000, y_mm: -2100 }]], reactions: [{ kind: 'outrigger', id: 'OL', x_mm: 4100, y_mm: -2100, kN: 120.5 }, { kind: 'wheel', id: 'A1R', x_mm: 1475, side: 'right', kN: -2 }] },
      { angle_deg: 0, factor: 1.6, pass: true, tipping_lines: [], reactions: [] },
    ],
  }
  it('parses angles[] sorted, lines, reactions with x - x0', () => {
    const r = parseStability(st, x0)!
    expect(r.angles.map((a) => a.angleDeg)).toEqual([0, 90])
    expect(r.pass).toBe(false)
    expect(r.verified).toBe(false)
    expect(r.minFactor).toBe(1.12)
    const a = r.angles[1]
    expect(a.tippingLines).toEqual([[{ x: 2000 - x0, y: -2100 }, { x: 9000 - x0, y: -2100 }]])
    expect(a.reactions).toEqual([
      { kind: 'outrigger', id: 'OL', x: 4100 - x0, y: -2100, side: null, kN: 120.5 },
      { kind: 'wheel', id: 'A1R', x: 0, y: null, side: 'right', kN: -2 },
    ])
  })
  it('accepts by_angle[], ok, stability_factor, {a,b} and [x,y] points, string pass', () => {
    const r = parseStability({ by_angle: [{ angle: 180, stability_factor: 1.3, ok: 'vyhovuje', tipping_lines: [{ a: [100, 1], b: { x: 200, y: 2 } }, { points: [[0, 0], [1, 1]] }] }], verified: true }, 0)!
    expect(r.angles[0]).toMatchObject({ angleDeg: 180, factor: 1.3, pass: true })
    expect(r.angles[0].tippingLines).toHaveLength(2)
    expect(r.pass).toBe(true)
    expect(r.verified).toBe(true)
    expect(parseStability([{ angle_deg: 0 }], 0)!.angles).toHaveLength(1)
  })
  it('warns and does not crash on bad data', () => {
    const w: string[] = []
    const r = parseStability({ angles: [{ factor: 1 }, null, { angle_deg: 45, reactions: 'x', tipping_lines: [[1]] }] }, 0, w)!
    expect(r.angles).toHaveLength(1)
    expect(r.pass).toBeNull()
    expect(w.some((s) => s.includes('bez úhlu'))).toBe(true)
    expect(w.some((s) => s.includes('CraneWIN'))).toBe(true)
    expect(w.some((s) => s.includes('klopné hrany'))).toBe(true)
    const w2: string[] = []
    expect(parseStability({ foo: 1 }, 0, w2)?.angles).toEqual([])
    expect(w2[0]).toContain('angles')
  })
  it('nearestAngle picks closest incl. wrap-around', () => {
    const r = parseStability({ angles: [0, 90, 180, 270].map((angle_deg) => ({ angle_deg })) }, 0)
    expect(nearestAngle(r, 100)?.angleDeg).toBe(90)
    expect(nearestAngle(r, 350)?.angleDeg).toBe(0)
    expect(nearestAngle(undefined, 10)).toBeNull()
  })
})

describe('trw extended: integration', () => {
  it('mapExtended returns undefined without blocks', () => {
    expect(mapExtended({}, 0)).toBeUndefined()
    expect(mapExtended(null, 0)).toBeUndefined()
  })
  it('mapTrwExport attaches extended markers and keeps existing ones', () => {
    const r = mapTrwExport({ ...sample, body: { type: 'hooklift', x_from_mm: 4000, x_to_mm: 9000, mass_kg: 2000 }, accessories: [{ kind: 'outrigger', x_mm: 9500, reach_left_mm: 2000, reach_right_mm: 2000, mass_kg: 250 }], stability: { angles: [{ angle_deg: 0, factor: 1.5, pass: true }] } })
    expect(r.markers.crane).toBeDefined()
    expect(r.markers.extended?.body?.type).toBe('hooklift')
    expect(r.markers.extended?.accessories?.[0].isOutrigger).toBe(true)
    expect(r.markers.extended?.stability?.pass).toBe(true)
    expect(r.warnings.some((w) => w.includes('CraneWIN'))).toBe(true)
    expect(() => mapTrwExport({ ...sample, body: 7, accessories: 'x', stability: [null] })).not.toThrow()
  })
})

import doc3d from './sample-config-3d.json'

describe('trw extended: docs/trw-config-3d.md sample', () => {
  it('skips crane + crane outriggers, keeps other accessories, unwraps {value}', () => {
    const w: string[] = []
    const ext = mapExtended(doc3d, x0, w)!
    expect(ext.accessories!.map((a) => a.name)).toEqual(['MAXISTAB  2 EHA', 'výfuk'])
    expect(ext.craneAccessories!.map((a) => a.kind)).toEqual(['crane', 'outrigger'])
    expect(ext.craneAccessories![1]).toMatchObject({ xLeft: 9064 - x0, xRight: 9222 - x0, reachLeft: 3401 })
    expect(ext.accessories![1]).toMatchObject({ x: 4000 - x0, xTo: 4600 - x0 })
    expect(ext.body).toMatchObject({ typeRaw: 'la', xFrom: 2360 - x0, length: 6600, width: null })
  })
  it('uses top-level reactions for all angles, placing missing x/y from crane outrigger', () => {
    const ext = mapExtended(doc3d, x0, [])!
    const st = ext.stability!
    expect(st.angles).toHaveLength(2)
    for (const a of st.angles) expect(a.reactions).toHaveLength(2)
    expect(st.angles[1].reactions[0]).toMatchObject({ side: 'left', x: 9064 - x0, y: -3401, kN: 85.6 })
    expect(st.angles[1].reactions[1]).toMatchObject({ side: 'right', x: 9222 - x0, y: 3401 })
    expect(st).toMatchObject({ pass: false, verified: false, minFactor: 0.36 })
  })
  it('emits one summary warning for fields trw marks neznámé', () => {
    const w: string[] = []
    mapExtended(doc3d, x0, w)
    expect(w.filter((s) => s.includes('.trw neobsahuje'))).toHaveLength(1)
    expect(w.some((s) => s.startsWith('Šířka nástavby'))).toBe(false)
    expect(w.some((s) => s.includes('vyložení na'))).toBe(false)
    expect(w.some((s) => s.includes('reakce'))).toBe(false)
  })
  it('stability null → note from stability_fields.evidence', () => {
    const ext = mapExtended({ ...doc3d, stability: null, stability_fields: { status: 'neznámé', evidence: 'podpěry nejsou zvolené — stabilita nespočtena' } }, x0, [])!
    expect(ext.stability).toBeUndefined()
    expect(ext.stabilityNote).toBe('podpěry nejsou zvolené — stabilita nespočtena')
    expect(mapExtended({ stability: null, stability_fields: { evidence: 'x' } }, x0, [])?.stabilityNote).toBe('x')
  })
  it('stability + stability_fields both null → bez jeřábu, no warning', () => {
    const w: string[] = []
    const ext = mapExtended({ ...doc3d, stability: null, stability_fields: null }, x0, w)!
    expect(ext.noCrane).toBe(true)
    expect(ext.stabilityNote).toBeUndefined()
    expect(w.some((s) => /stabilit/i.test(s))).toBe(false)
    expect(mapExtended({ body: null }, x0, [])).toBeUndefined()
  })
  it('uses stability.min_factor / required_n / pass from trw', () => {
    const st = mapExtended(doc3d, x0, [])!.stability!
    expect(st).toMatchObject({ minFactor: 0.36, requiredN: 1.4, pass: false })
    expect(stabilitySummary(st)).toBe('k_min 0,36 / požadováno 1,40 – nevyhovuje')
    const s2 = parseStability({ min_factor: 1.32, required_n: 1.25, pass: true, angles: [{ angle_deg: 0, factor: 2, pass: true }, { angle_deg: 90, factor: 1.5, pass: false }] }, 0)!
    expect(s2).toMatchObject({ minFactor: 1.32, requiredN: 1.25, pass: true })
    expect(stabilitySummary(s2)).toBe('k_min 1,32 / požadováno 1,25 – vyhovuje')
    expect(parseStability({ angles: [{ angle_deg: 0, factor: 2, pass: true }, { angle_deg: 90, factor: 1.5, pass: true }] }, 0)!.minFactor).toBe(1.5)
  })
  it('reactions placed by crane outrigger (reach ± y centreline), not MAXISTAB', () => {
    const accessories = [
      { kind: 'crane', name: 'jeřáb', x_mm: 3000, y_mm: null },
      { kind: 'outrigger', name: 'MAXISTAB', x_mm: 8000, y_mm: null, reach_left_mm: null, reach_right_mm: null },
      { kind: 'outrigger', name: 'podpěry jeřábu', x_left_mm: 3100, x_right_mm: 3200, y_mm: 100, reach_left_mm: 2500, reach_right_mm: 2600 },
    ]
    const st = mapExtended({ accessories, stability: { angles: [{ angle_deg: 0, factor: 2, pass: true }], reactions: [{ kind: 'outrigger', side: 'left', kN: 1 }, { kind: 'outrigger', side: 'right', kN: 2 }] } }, 0, [])!.stability!
    expect(st.angles[0].reactions[0]).toMatchObject({ x: 3100, y: 100 - 2500 })
    expect(st.angles[0].reactions[1]).toMatchObject({ x: 3200, y: 100 + 2600 })
  })
})

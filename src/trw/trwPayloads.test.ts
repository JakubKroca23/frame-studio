import { describe, expect, it } from 'vitest'
import sample from './sample-export.json'
import { mapPayload, mapTrwExport } from './trwConfig'

const x0 = 1475
const withPayloads = (payloads: unknown, extra: object = {}) => mapTrwExport({ ...sample, payloads, ...extra })

describe('trw payloads', () => {
  it('maps x_mm relative to first axle', () => {
    const r = withPayloads([{ name: 'Náklad', mass_kg: 6410, x_mm: 5775 }])
    expect(r.markers.payloads).toEqual([{ x: 5775 - x0, name: 'Náklad', massKg: 6410 }])
    expect(r.warnings.some((w) => w.includes('Náklad „'))).toBe(false)
  })
  it('accepts x_from/x_to range, label/type and cog', () => {
    expect(mapPayload({ label: 'Hákový nosič', x_from: 3000, x_to: 8000, mass_kg: 2100 }, 0, x0)).toEqual({ x: 5500 - x0, xFrom: 3000 - x0, xTo: 8000 - x0, name: 'Hákový nosič', massKg: 2100 })
    expect(mapPayload({ type: 'bumper', x_from_mm: 9000, x_to_mm: 8800, cog: { x_mm: 8950 }, mass_kg: 80 }, 1, x0)).toMatchObject({ x: 8950 - x0, xFrom: 8800 - x0, xTo: 9000 - x0, name: 'bumper' })
    expect(mapPayload({ name: 'Výfuk', cog_x_mm: 2000, mass_kg: 40 }, 2, x0).x).toBe(2000 - x0)
    expect(mapPayload({ name: 'X', cog: 2500, mass_kg: 1 }, 2, x0).x).toBe(2500 - x0)
  })
  it('warns on missing position or mass', () => {
    const r = withPayloads([{ name: 'Bez polohy', mass_kg: 100, x_mm: null }, { type: 'exhaust', x_mm: 2000, mass_kg: null }, null])
    expect(r.markers.payloads?.map((p) => p.name)).toEqual(['Bez polohy', 'exhaust', 'položka 3'])
    expect(r.warnings.filter((w) => w.startsWith('Náklad'))).toHaveLength(3)
    expect(r.warnings.some((w) => w.includes('Bez polohy') && w.includes('polohu'))).toBe(true)
    expect(r.warnings.some((w) => w.includes('exhaust') && w.includes('hmotnost'))).toBe(true)
  })
  it('tolerates missing payloads and ignores config.trailerwin', () => {
    const r = mapTrwExport({ ...sample, payloads: undefined, config: { trailerwin: { FOH: 'x', weird: [1, { a: null }] } } })
    expect(r.markers.payloads).toBeUndefined()
    expect(() => withPayloads('nonsense', { config: { trailerwin: null } })).not.toThrow()
  })
})

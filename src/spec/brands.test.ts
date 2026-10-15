import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { configToModel } from '../presets/configModel'
import { detectSpecBrand, parseSpec, specToConfig } from '.'
import { rx } from './volvoSpec'

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8')

describe('spec brand detection', () => {
  it('detects MAN / Volvo / DAF', () => {
    expect(detectSpecBrand(`MAN Truck\n${fx('man-td-minimal.txt')}`)).toBe('man')
    expect(detectSpecBrand(fx('volvo-synthetic.txt'))).toBe('volvo')
    expect(detectSpecBrand(fx('daf-synthetic.txt'))).toBe('daf')
    expect(() => parseSpec('hello')).toThrow(/nerozpoznan/)
  })
})

describe('Volvo specification (synthetic)', () => {
  it('tolerates the lost "á" glyph and the fi→R ligature', () => {
    expect(rx('Zatížení přední náprava').test('Zatížení přední n prava')).toBe(true)
    expect(rx('Profil').test('ProRl')).toBe(true)
  })
  it('maps dimensions, axles and equipment', () => {
    const s = parseSpec(fx('volvo-synthetic.txt'))
    expect(s).toMatchObject({ brand: 'volvo', drive: '6x2', series: 'FM' })
    expect(s.axles.map((a) => a.role)).toEqual(['front', 'drive', 'tag'])
    expect(s.axles.map((a) => a.load?.value)).toEqual([9000, 11000, 7000])
    expect(s.axles[2]).toMatchObject({ steered: true, twin: { value: false } })
    expect(s.dims.frameTop).toMatchObject({ value: 950, approx: true })
    const r = specToConfig(s, 'v.txt')
    const c = r.preset.config
    expect(c.axles.map((a) => a.tyre)).toEqual(['385/65R22.5', '315/70R22.5', '385/55R22.5'])
    expect(c).toMatchObject({ make: 'volvo', rearOverhang: 2500, fuel: { liters: 400, side: 'right' }, adblue: { liters: 60, side: 'left' }, battery: { side: 'left' }, coupling: true })
    expect(c.frame).toMatchObject({ sectionHeight: 300, thickness: 7, topHeight: 950 })
    expect(c.cab.kind).toBe('sleeper')
    const paths = r.assumptions.map((a) => a.path)
    expect(paths).toEqual(expect.arrayContaining(['frontOverhang', 'frame.widthRear', 'cab.width', 'cab.length', 'axles.2.position', 'exhaust']))
    expect(r.preset.approx).toContain('frontOverhang')
    expect(configToModel(c, r.preset.id).axles).toHaveLength(3)
  })
})

describe('DAF specification (synthetic)', () => {
  it('maps dimensions, axles and equipment', () => {
    const s = parseSpec(fx('daf-synthetic.txt'))
    expect(s).toMatchObject({ brand: 'daf', drive: '6x2', series: 'XF' })
    expect(s.axles.map((a) => a.load?.value)).toEqual([8000, 12000, 7000])
    expect(s.axles[2]).toMatchObject({ steered: true, lift: true })
    const r = specToConfig(s, 'd.txt')
    const c = r.preset.config
    expect(c.axles.map((a) => a.position)).toEqual([0, 4900, 4900 + 1350])
    expect(c).toMatchObject({ make: 'daf', rearOverhang: 2500, fuel: { liters: 430, side: 'right' }, adblue: { liters: 60, side: 'left' }, battery: { side: 'left' }, spare: { side: 'left' }, exhaust: { side: 'right' } })
    expect(c.cab).toMatchObject({ width: 2490, length: 2300, kind: 'sleeper' })
    expect(c.frame).toMatchObject({ sectionHeight: 300, thickness: 8 })
    expect(r.assumptions.map((a) => a.path)).toEqual(expect.arrayContaining(['axles.2.position', 'frontOverhang', 'frame.topHeight', 'cab.height']))
    expect(r.parsed.find((p) => p.path === 'fuel.height')?.value).toBe('600')
    expect(configToModel(c, r.preset.id).components.some((p) => p.kind === 'spare')).toBe(true)
  })
})

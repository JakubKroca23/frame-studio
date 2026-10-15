import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { configToModel } from '../presets/configModel'
import { itemsToText } from './pdfText'
import { manCabVariant, parseManSpec, parseTd, specToConfig, tyreFromSize } from './manSpec'

const text = readFileSync(new URL('./fixtures/man-td-minimal.txt', import.meta.url), 'utf8')

describe('MAN specification – TD rows', () => {
  it('reads TD values in both columns, "-" as null and the wrapped frame profile', () => {
    const td = parseTd(text)
    expect(td.TD008.value).toBe(2900)
    expect(td.TD001.value).toBe(2200)
    expect(td.TD051.value).toBeNull()
    expect(td.TD067.value).toBeNull()
    expect(td.TD078.raw).toBe('260 x 80 x 8')
    expect(td.TD072.value).toBe(900)
    expect(td.TD035.value).toBe(1000)
  })

  it('maps to a configurator chassis; everything not in the TD rows is an assumption', () => {
    const r = specToConfig(parseManSpec(text), 'synthetic.txt')
    const c = r.preset.config
    expect(c.axles.map((a) => a.position)).toEqual([0, 4500, 5900])
    expect(c.frontOverhang).toBe(1500)
    expect(c.rearOverhang).toBe(2600)
    expect(c.frame).toMatchObject({ widthFront: 940, widthRear: 760, sectionHeight: 260, flange: 80, thickness: 8, topHeight: 1000 })
    expect(c.cab.width).toBe(2200)
    expect(r.assumptions.map((a) => a.path)).toEqual(expect.arrayContaining(['axles', 'cab.backFromAxle', 'frame.taperEnd', 'axles.1.tyre', 'fuel']))
    expect(r.preset.approx).toContain('cab.backFromAxle')
    expect(r.preset.approx).not.toContain('frontOverhang')
    // 1500 + 5900 + 2600 = 10000 → no length warning
    expect(r.warnings).toEqual([])
    const model = configToModel(c, r.preset.id)
    expect(model.axles).toHaveLength(3)
  })

  it('computes tyre diameters from the ISO size exactly', () => {
    expect(tyreFromSize('385/65R22,5')).toEqual({ diameter: 1072, width: 385 })
    expect(tyreFromSize('315/80R22.5')).toEqual({ diameter: 1075.5, width: 315 })
  })

  it('decodes the cab description', () => {
    expect(manCabVariant('TM', 'komfortní (úzká, dlouhá, středně vysoká)')).toMatchObject({ kind: 'sleeper', width: 'narrow', length: 'long' })
  })

  it('groups pdf.js runs into lines with column gaps', () => {
    const t = itemsToText([
      { x: 10, y: 100, w: 40, h: 8, s: 'TD063 Přední' },
      { x: 52, y: 100, w: 30, h: 8, s: 'převis' },
      { x: 200, y: 100.5, w: 20, h: 8, s: '1605.0' },
      { x: 10, y: 90, w: 20, h: 8, s: 'next' },
    ])
    expect(t.split('\n')[0]).toMatch(/^TD063 Přední převis\s{2,}1605\.0$/)
    expect(parseTd(t).TD063.value).toBe(1605)
  })
})

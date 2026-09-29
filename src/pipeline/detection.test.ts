import { readFileSync } from 'node:fs'
import { gunzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { analyzeDxf } from './analyze'

describe('measured detection', () => {
  it('reads a dimension entity, a hatch contour and a text label on the mini chassis', () => {
    const model = analyzeDxf(readFileSync('fixtures/mini-chassis.dxf', 'utf8'))
    expect(model.dimensions.find((item) => item.label === 'L016')?.value).toBe(1450)
    const fuel = model.components.find((part) => part.partNumber.startsWith('2774928'))
    expect(fuel?.kind).toBe('fuel')
    expect(fuel?.source).toBe('measured')
    expect(fuel?.evidence).toMatch(/FUEL TANK|uzavřená kontura|Uzavřená/i)
    expect(fuel?.confidence ?? 0).toBeGreaterThan(0.8)
    expect(model.axles.length).toBe(3)
    expect(model.axles.every((axle) => axle.tireSource === 'measured')).toBe(true)
    expect(model.frame?.sources?.height).toBe('measured')
    expect(model.frame?.sources?.section).toBe('estimated')
  })

  it('annotates the Scania sample from the drawing', () => {
    const model = analyzeDxf(readFileSync('public/samples/scania-icd-sample.dxf', 'latin1'))
    expect(model.components.length).toBeGreaterThan(5)
    expect(model.components.every((part) => part.kind && (part.confidence ?? 0) > 0 && part.source && part.evidence)).toBe(true)
    expect(model.axles.every((axle) => axle.tireSource === 'measured')).toBe(true)
    expect(model.axles.every((axle) => axle.dualSource === 'estimated')).toBe(true)
    expect(model.frame?.sources?.height).toBe('measured')
    expect(model.frame?.sources?.section).toBe('estimated')
    const measured = model.components.filter((part) => part.source === 'measured' && part.kind !== 'skip')
    const estimated = model.components.filter((part) => part.source === 'estimated' && part.kind !== 'skip')
    expect(measured.length + estimated.length).toBeGreaterThan(0)
    expect(model.components.some((part) => (part.evidence ?? '').includes('bokorysu'))).toBe(true)
  })

  it('annotates the Volvo sample from block names', () => {
    const bytes = gunzipSync(readFileSync('public/samples/volvo-vssb-25-277591.dxf.gz'))
    const model = analyzeDxf(new TextDecoder('windows-1252').decode(bytes))
    expect(model.profileId).toBe('volvo-bep')
    const fuels = model.components.filter((part) => part.kind === 'fuel')
    expect(fuels.length).toBeGreaterThan(0)
    expect(fuels.some((part) => part.source === 'measured' && (part.confidence ?? 0) >= 0.9 && (part.evidence ?? '').includes('bloku'))).toBe(true)
    expect(model.components.some((part) => part.kind === 'toolbox' || part.kind === 'exhaust' || part.kind === 'stack')).toBe(true)
    expect(model.axles.filter((axle) => axle.dual).every((axle) => axle.dualSource === 'measured')).toBe(true)
    expect(model.frame?.sources?.section).toBe('measured')
    expect(model.components.every((part) => (part.confidence ?? 0) > 0 && (part.confidence ?? 0) <= 1)).toBe(true)
  })
})

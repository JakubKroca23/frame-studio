import { describe, expect, it } from 'vitest'
import sample from './sample-cs-sim.json'
import { parseCsSimResult, parseProfileDims, utilColor, utilizationAt } from './csSimResult'

const clone = () => structuredClone(sample) as Record<string, any>

describe('cs-sim/trw-export@1 parser', () => {
  it('parses results without a subframe block (estimated span)', () => {
    const r = parseCsSimResult(sample)
    expect(r.x0).toBe(1475)
    expect(r.axles).toEqual([0, 4200, 5550])
    expect(r.maxMoment).toMatchObject({ value: -152.3, x: 2450 - 1475, chassis: -60.1 })
    expect(r.stress).toEqual({ subframe: 210.4, chassis: 180.2 })
    expect(r.deflection?.vertical).toBe(-11.8)
    expect(r.utilization).toHaveLength(2)
    expect(r.governing).toMatchObject({ check: 'Podélník mezirámu L', pct: 62.4, ok: true, x: 975 })
    expect(r.reactions[0]).toEqual({ label: 'N1L', x: 0, Fz: 10.2 })
    expect(r.load.craneX).toBe(2800 - 1475)
    expect(r.subframe.estimated).toBe(true)
    expect(r.subframe.from).toBe(1325 - 600)
    expect(r.subframe.to).toBe(9175 - 1475)
    expect(r.subframe.dims).toEqual({ H: 200, B: 80, t: 8 })
    expect(r.subframe.uniformPct).toBe(62.4)
    expect(r.warnings.some((w) => w.includes('subframe'))).toBe(true)
  })

  it('parses a subframe block with pair and object utilization', () => {
    const d = clone()
    d.results.subframe = { x_from_mm: 2000, x_to_mm: 9000, profile: 'U 160x60x6', steel: 'S355', utilization: [[3000, 40], { x_mm: 2500, pct: 70 }, ['bad']] }
    const r = parseCsSimResult(d)
    expect(r.subframe).toMatchObject({ from: 525, to: 7525, profile: 'U 160x60x6', steel: 'S355', estimated: false, dims: { H: 160, B: 60, t: 6 } })
    expect(r.subframe.curve).toEqual([
      [1025, 70],
      [1525, 40],
    ])
    expect(utilizationAt(r.subframe.curve, null, 1275)).toBeCloseTo(55)
    d.subframe = d.results.subframe
    delete d.results.subframe
    expect(parseCsSimResult(d).subframe.estimated).toBe(false)
  })

  it('tolerates missing fields and rejects other files', () => {
    expect(() => parseCsSimResult({ schema: 'trw/config@1' })).toThrow(/CS Sim/)
    const r = parseCsSimResult({ schema: 'cs-sim/trw-export@1', results: {} })
    expect(r.maxMoment).toBeNull()
    expect(r.utilization).toEqual([])
    expect(r.subframe.estimated).toBe(true)
    expect(r.warnings.length).toBeGreaterThan(2)
  })

  it('profile dims and colours', () => {
    expect(parseProfileDims('M.A.N  Profil 1   220x80x85x6')).toEqual({ H: 220, B: 80, t: 6 })
    expect(parseProfileDims('nic')).toBeNull()
    const [r1, g1] = utilColor(30)
    const [r2, g2] = utilColor(95)
    expect(g1).toBeGreaterThan(r1)
    expect(r2).toBeGreaterThan(g2)
  })
})

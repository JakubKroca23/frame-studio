import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyzeDxf } from '../pipeline/analyze'
import { presetById } from '../presets'
import { refineConfigFromDxf } from './refineFromDxf'

describe('refineConfigFromDxf (trw + DXF side view)', () => {
  const model = analyzeDxf(readFileSync('public/samples/scania-icd-sample.dxf', 'latin1'))
  const base = structuredClone(presetById('scania-r-6x2-rigid')!.config)
  base.axles[1].position = 4000 // pretend trw had a rough value
  base.rearOverhang = 1000
  const { cfg, applied, kept } = refineConfigFromDxf(base, model)
  it('takes measured axle positions and overhangs from the drawing', () => {
    expect(cfg.axles[1].position).toBeCloseTo(4950, -1)
    expect(Math.abs(cfg.rearOverhang - 1960)).toBeLessThan(60)
    expect(applied.length).toBeGreaterThan(2)
  })
  it('keeps what the drawing does not measure', () => {
    expect(cfg.gvw).toBe(base.gvw)
    expect(cfg.axles[0].maxLoad).toBe(base.axles[0].maxLoad)
    expect(kept.some((k) => /Hmotnosti/.test(k))).toBe(true)
  })
})

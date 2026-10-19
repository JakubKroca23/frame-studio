import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyzeDxf } from '../pipeline/analyze'
import { presetById } from '../presets'
import { refineConfigFromDxf } from './refineFromDxf'

// company drawing: kept only in the gitignored test-local/ (never in the public repo); tests skip without it
const SAMPLE = 'test-local/samples/scania-icd-sample.dxf'
const HAS = existsSync(SAMPLE)
describe.skipIf(!HAS)('refineConfigFromDxf (trw + DXF side view)', () => {
  if (!HAS) return
  const model = analyzeDxf(readFileSync(SAMPLE, 'latin1'))
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

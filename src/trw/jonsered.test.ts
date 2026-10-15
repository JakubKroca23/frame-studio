import { describe, expect, it } from 'vitest'
import { craneVariantMatch, forwardKinematics, meshAngles, CRANE_DEFS } from './craneKinematics'
import { craneModelFor } from './CraneModel'
import { legToGroundM, stabFromSpread } from './CraneArticulated'

// crane line of the user's test .trw (LN record), the file itself is company data and stays out of the repo
const TRW_NAME = 'JONSERED  iZ.18R 100 HD, High-seat, B4500, column R'

describe('Jonsered iZ.18R HD', () => {
  const def = CRANE_DEFS.find((d) => d.key === 'iz18r')!
  it('trw name maps to the Jonsered model, variant 100', () => {
    const m = craneVariantMatch(TRW_NAME)!
    expect(m.def.key).toBe('iz18r')
    expect(m.variant.id).toBe('100')
    expect(craneModelFor(TRW_NAME)?.file).toBe('jonsered-iz18r-articulated.glb')
    expect(craneVariantMatch('X-HiPro 142 E-4')!.def.key).toBe('142')
    expect(craneVariantMatch('iZ.18R')!.def.key).toBe('iz18r')
  })
  it('mesh pins reproduce the drawing boom lengths (465-1037)', () => {
    const m = meshAngles(def)
    expect(m.l1 * 1000).toBeCloseTo(3287, -1) // P1–P2 mesh 3287.5 (drawing 3297, −10)
    expect(m.l2 * 1000).toBeCloseTo(3004, -1) // P2–retracted tip (drawing 3019)
    expect(-def.geom.p1.r * 1000).toBeCloseTo(296, 0) // kóta 1-7
  })
  it('min / max outreach in the drawing pose within 70 mm of table 1-0 (5933 / 9963)', () => {
    const v = def.variants[0]
    const pose = { slew: 0, a1: def.unfolded!.a1, rel: def.unfolded!.rel }
    const rMin = forwardKinematics({ ...pose, ext: 0 }, v).tip.r * 1000
    const rMax = forwardKinematics({ ...pose, ext: (v.hydMaxMm - v.minOutreachMm) / 1000 }, v).tip.r * 1000
    expect(Math.abs(rMin - 5933)).toBeLessThan(70)
    expect(Math.abs(rMax - 9963)).toBeLessThan(70)
    expect(rMax - rMin).toBeCloseTo(4030, -1)
  })
  it('outriggers: full extension gives the table spread 6-11 (B4500 H 4457), legs to ground within stroke', () => {
    const st = def.stab!
    const e = stabFromSpread(st, 4457)
    expect(st.telescopes).toBe(1)
    expect((st.footX.right + e.right - (st.footX.left - e.left)) * 1000).toBeCloseTo(4457, 0)
    expect(e.left).toBeCloseTo(e.right, 6)
    expect(e.left).toBeLessThanOrEqual(st.maxExt)
    expect(legToGroundM(st, 1200)).toBeCloseTo(0.2913, 3)
    expect(legToGroundM(st, 3000)).toBe(st.legStroke)
  })
})

import { describe, expect, it } from 'vitest'
import sample from './sample-export.json'
import fx from './fixtures/crane-outriggers.synthetic.json'
import { mapTrwExport } from './trwConfig'
import { CRANE_DEFS } from './craneKinematics'
import { legToGroundM, stabFromSpread } from './CraneArticulated'

const x0 = 1475 // first axle of sample-export
const crane = (c: object) => mapTrwExport({ ...sample, crane: { ...sample.crane, ...c } })

describe('trw crane outriggers (a1ce9b3 fields, synthetic fixture)', () => {
  it('maps half span per side, x, stroke, variant, cp', () => {
    const r = crane(fx.crane)
    expect(r.markers.outriggers).toEqual([
      { x: 3000 - x0, side: 'left', spread: 4400, halfSpan: 2300 },
      { x: 3000 - x0, side: 'right', spread: 4400, halfSpan: 2100 },
    ])
    expect(r.markers.craneStab).toEqual({ spreadMm: 4400, halfSpanMm: { left: 2300, right: 2100 }, strokeMm: 700, variant: 'B4400, Leg: A D100/80-700', cpMm: 1500 })
    expect(r.warnings).not.toContain('Rozpětí podpěr jeřábu chybí.')
  })
  it('derives spread from half spans when spread missing; warns only when nothing given', () => {
    const r = crane({ ...fx.crane, outrigger_spread_mm: null })
    expect(r.markers.craneStab?.spreadMm).toBe(4400)
    expect(r.warnings).not.toContain('Rozpětí podpěr jeřábu chybí.')
    const n = crane({ ...fx.crane, outrigger_spread_mm: null, outrigger_half_span_mm: null, outrigger_stroke_mm: null, outrigger_variant: null })
    expect(n.warnings).toContain('Rozpětí podpěr jeřábu chybí.')
    expect(n.markers.craneStab).toMatchObject({ halfSpanMm: null, strokeMm: null, variant: null })
  })
  it('Jonsered stabs: half span per side, symmetric fallback, trw stroke', () => {
    const st = CRANE_DEFS.find((d) => d.stab)!.stab!
    const w = (st.footX.right - st.footX.left) / 2
    const e = stabFromSpread(st, 4400, { left: 2300, right: 2100 })
    expect(e.left).toBeCloseTo(Math.min(st.maxExt, 2.3 - w), 6)
    expect(e.right).toBeCloseTo(Math.min(st.maxExt, 2.1 - w), 6)
    expect(stabFromSpread(st, 4400, null)).toEqual(stabFromSpread(st, 4400))
    expect(legToGroundM(st, 5000, 0.75)).toBeCloseTo(0.75, 6)
  })
})

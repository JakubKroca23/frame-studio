import { beforeAll, describe, expect, it } from 'vitest'
import { initManifold } from '../mesh/manifold'
import { analyzeDxf3d } from './analyze'
import { buildSolid } from './build'
import { BOX_WITH_HOLES, FIXTURES, L_BRACKET, PLATE_WITH_HOLES, fixtureDxf } from './fixtures'
import { buildViewSet } from './views'

beforeAll(async () => {
  await initManifold()
}, 60000)

describe('DXF → 3D fixtures', () => {
  for (const part of FIXTURES) {
    for (const projection of ['first', 'third'] as const) {
      for (const scale of [1, 20] as const) {
        it(`${part.name} · ${projection} · 1:${scale}`, async () => {
          const text = fixtureDxf(part, projection, scale, true)
          const analysis = analyzeDxf3d(text)
          expect(analysis.islands.length).toBeGreaterThanOrEqual(3)
          expect(analysis.scale.ratio).toBeCloseTo(scale, scale === 1 ? 0 : -0.05)
          expect(analysis.assignment).not.toBeNull()
          const a = analysis.assignment!
          expect(a.top).not.toBeNull()
          expect(a.side).not.toBeNull()
          expect(a.projection).toBe(projection)
          const vs = buildViewSet(analysis, a)
          expect(vs.size.x).toBeCloseTo(part.size.x, 0)
          expect(vs.size.y).toBeCloseTo(part.size.y, 0)
          expect(vs.size.z).toBeCloseTo(part.size.z, 0)
          expect(vs.checks.every((c) => c.ok)).toBe(true)
          const { manifoldApi } = await import('../mesh/manifold')
          const built = buildSolid(manifoldApi()!, vs)
          expect(built).not.toBeNull()
          expect(built!.watertight).toBe(true)
          const okViews = built!.deviations.filter((d) => d.status === 'ok' || d.status === 'warn')
          expect(okViews.length).toBe(3)
          // Volume within 8 % of the analytical expectation (tessellated circles).
          expect(Math.abs(built!.volume - part.volume) / part.volume).toBeLessThan(0.08)
        }, 30000)
      }
    }
  }

  it('flags inconsistent shared dimensions with an mm delta', () => {
    const analysis = analyzeDxf3d(fixtureDxf(L_BRACKET, 'first', 1, false))
    const a = analysis.assignment!
    // Pretend the side view were drawn 6 mm taller than the front.
    const islands = analysis.islands.map((i) => (i.id === a.side ? { ...i, height: i.height + 6 } : i))
    const vs = buildViewSet({ ...analysis, islands }, a)
    const z = vs.checks.find((c) => c.axis === 'Z')!
    expect(z.ok).toBe(false)
    expect(z.delta).toBeCloseTo(6, 1)
    expect(vs.warnings.some((w) => w.includes('Δ 6.0 mm'))).toBe(true)
  })

  it('never invents a dimension without marking it computed', () => {
    const analysis = analyzeDxf3d(fixtureDxf(PLATE_WITH_HOLES, 'third', 1, false))
    // Drop the side view by keeping only the two largest islands that share width.
    const a = { ...analysis.assignment!, side: null }
    const vs = buildViewSet(analysis, a)
    expect(vs.computed.side).toBe(true)
    expect(vs.warnings.some((w) => /dopočítán|dopočítána|chybí/i.test(w))).toBe(true)
  })
})

describe('scale detection', () => {
  it('detects 1:20 from dimensions, not from the title block alone', () => {
    const text = fixtureDxf(BOX_WITH_HOLES, 'third', 20, true)
    const analysis = analyzeDxf3d(text)
    expect(analysis.scale.source).toBe('dims')
    expect(analysis.scale.ratio).toBe(20)
    expect(analysis.scale.label).toBe('1:20')
    expect(analysis.scale.mmPerUnit).toBeCloseTo(20, 0)
  })

  it('detects 1:1 when geometry and dims agree', () => {
    const analysis = analyzeDxf3d(fixtureDxf(BOX_WITH_HOLES, 'first', 1, false))
    expect(analysis.scale.ratio).toBe(1)
    expect(analysis.scale.source).toBe('dims')
  })
})

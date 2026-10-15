import { describe, expect, it } from 'vitest'
import { CRANE_DEFS, extFraction, meshAngles, type CraneJoints } from './craneKinematics'
import { liftCylinderPose } from './CraneArticulated'
import fx from './jonsered-parts.fixture.json'

// Automatic "nothing hangs in the air" check for the Jonsered split (LESSONS L11): surface samples of every pair of
// neighbouring groups around their joint (from the built GLB, /workspace/jons/samples.py) are posed with the same
// transforms as CraneArticulated; the child must stay in contact with its parent (min distance) in every test pose.
const def = CRANE_DEFS.find((d) => d.key === 'iz18r')!
const m = meshAngles(def)
const rad = Math.PI / 180
type V = [number, number, number]
const pts = (a: number[]): V[] => Array.from({ length: a.length / 3 }, (_, i) => [a[3 * i] / 1000, a[3 * i + 1] / 1000, a[3 * i + 2] / 1000])
/** rotation about the lateral X axis through pivot (h, r) — three.js convention */
const rotX = (p: V, ph: number, pr: number, a: number): V => {
  const y = p[1] - ph, z = p[2] - pr
  return [p[0], ph + y * Math.cos(a) - z * Math.sin(a), pr + y * Math.sin(a) + z * Math.cos(a)]
}
function pose(group: string, p: V, j: CraneJoints): V {
  const P1 = def.geom.p1, P2 = def.geom.p2, lc = def.liftCyl!
  const phi = -(j.a1 - m.a1) * rad
  const onMain = (q: V) => rotX(q, P1.h, P1.r, phi)
  if (group === 'main') return onMain(p)
  if (group === 'outer') return onMain(rotX(p, P2.h, P2.r, -(j.rel - m.rel) * rad))
  const lp = liftCylinderPose(lc, P1, phi)
  if (group === 'liftCyl') return rotX(p, lc.a.h, lc.a.r, lp.beta)
  if (group === 'liftRod') { const q = rotX(p, lc.b.h, lc.b.r, lp.beta); return [q[0], q[1] - lc.b.h + lp.b2.h, q[2] - lc.b.r + lp.b2.r] }
  return p // base, column
}
const minDist = (a: V[], b: V[]) => { let d = Infinity; for (const p of a) for (const q of b) d = Math.min(d, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])); return d }
const POSES: [string, CraneJoints][] = [
  ['parked', { ...def.folded!, a1: m.a1, rel: m.rel }],
  ['rozloženo', { slew: 0, ...def.unfolded! }],
  ['hlavní max', { slew: 0, a1: def.limits.a1[1], rel: 0, ext: 0 }],
  ['vnější dolů', { slew: 0, a1: 40, rel: def.limits.rel[0], ext: 0 }],
  ['hlavní min', { slew: 0, a1: def.limits.a1[0], rel: 120, ext: 0 }],
]

describe('Jonsered iZ.18R parts stay attached (L11)', () => {
  it('build-time split has no unexpected detached islands', () => {
    expect(fx.report.islandsBig.map(([g]) => g).sort()).toEqual(['main', 'outer', 'stabL']) // documented: knuckle side link pad, outer heel plates (P2 bore), leg-housing cap
  })
  for (const [name, j] of POSES) {
    it(`pose ${name}: every child touches its parent at the joint`, () => {
      for (const [k, jt] of Object.entries(fx.joints)) {
        const c = pts(jt.childMm).map((p) => pose(jt.child, p, j)), pa = pts(jt.parentMm).map((p) => pose(jt.parent, p, j))
        expect(c.length, k).toBeGreaterThan(100)
        expect(minDist(c, pa) * 1000, `${k} @ ${name}`).toBeLessThan(35) // sampled surfaces (~1 cm spacing); a wrong pin or a misassigned part gives ≥ 40 mm
      }
    })
  }
  it('telescopes and lift cylinder keep overlap at full stroke', () => {
    const s = fx.slides, st = def.extStrokes!.reduce((a, b) => a + b, 0)
    const e1 = st * extFraction(def, 2, 1), e2 = st * extFraction(def, 2, 2)
    expect(s.outer[1] - (s.ext1[0] + e1)).toBeGreaterThan(0.2)
    expect(s.ext1[1] + e1 - (s.ext2[0] + e2)).toBeGreaterThan(0.2)
    const lc = def.liftCyl!, l0 = Math.hypot(lc.b.r - lc.a.r, lc.b.h - lc.a.h)
    const lMax = liftCylinderPose(lc, def.geom.p1, -(def.limits.a1[1] - m.a1) * rad).length
    expect(s.liftCyl[1] - (s.liftRod[0] + lMax - l0)).toBeGreaterThan(0.02) // rod still inside the barrel at a1 max
  })
  it('def pins sit on the measured pin bores of the GLB (concentric ring fits, ≤ 3 mm)', () => {
    const R = fx.pinRings as Record<string, { n: number; rMm: number; hMm: number }>
    const d = { p1: def.geom.p1, p2: def.geom.p2, liftA: def.liftCyl!.a, liftB: def.liftCyl!.b }
    for (const [k, p] of Object.entries(d)) {
      expect(R[k].n, k).toBeGreaterThan(0)
      expect(Math.hypot(R[k].rMm - p.r * 1000, R[k].hMm - p.h * 1000), k).toBeLessThan(3)
    }
  })
  it('outer boom can bring the tip below the knuckle pin', () => {
    expect(def.limits.rel[0]).toBeLessThanOrEqual(-60)
  })
})

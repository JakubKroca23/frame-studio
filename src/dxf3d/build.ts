import * as THREE from 'three'
import type { ManifoldToplevel } from 'manifold-3d/manifold'
import { prismAlong, silhouetteIntersection, solidGeometry } from '../mesh/silhouette'
import { area } from './contour'
import { segDist } from './views'
import type { HoleSpec, P2, ViewDeviation, ViewSet } from './types'

type Solid = InstanceType<ManifoldToplevel['Manifold']>

export interface Built {
  /** Y-up display geometry in mm (three.js: x = X, y = Z, z = −Y). */
  geometry: THREE.BufferGeometry
  volume: number
  watertight: boolean
  holesCut: number
  deviations: ViewDeviation[]
  /** Re-projected outlines (model mm, same 2D frames as ViewSet) for the UI overlay. */
  projected: { front: P2[][]; top: P2[][]; side: P2[][] }
}

/** Silhouette intersection + holes, then re-project and compare with the drawing. */
export function buildSolid(api: ManifoldToplevel, vs: ViewSet): Built | null {
  const first = silhouetteIntersection(api, vs, vs.size)
  if (!first || first.isEmpty()) {
    first?.delete()
    return null
  }
  let solid: Solid = first
  let holesCut = 0
  for (const h of vs.holes) {
    const cut = holeSolid(api, h, vs)
    if (!cut) continue
    const next: Solid = solid.subtract(cut)
    cut.delete()
    if (next.isEmpty()) {
      next.delete()
      continue
    }
    solid.delete()
    solid = next
    holesCut++
  }
  const deviations: ViewDeviation[] = []
  const projected = { front: [] as P2[][], top: [] as P2[][], side: [] as P2[][] }
  const span = Math.max(vs.size.x, vs.size.y, vs.size.z)
  for (const view of ['front', 'top', 'side'] as const) {
    const polys = projectView(solid, view)
    projected[view] = polys
    const outer = polys.reduce<P2[] | null>((best, p) => (!best || Math.abs(area(p)) > Math.abs(area(best)) ? p : best), null)
    const ref = vs[view]
    const { max, mean } = outer ? hausdorff(ref, outer, span / 500) : { max: Infinity, mean: Infinity }
    const expected = vs.holes.filter((h) => h.view === view && h.through).length
    const found = vs.holes.filter((h) => h.view === view && h.through && polys.some((p) => area(p) < 0 && insideish(p, { x: h.u, y: h.v }))).length
    const okTol = Math.max(1, span * 0.005)
    const warnTol = Math.max(3, span * 0.03)
    const computed = vs.computed[view]
    deviations.push({
      view,
      max,
      mean,
      status: computed ? 'warn' : max <= okTol && found === expected ? 'ok' : max <= warnTol ? 'warn' : 'bad',
      holesExpected: expected,
      holesFound: found,
      note: computed ? 'pohled dopočítán (není ve výkresu)' : '',
    })
  }
  const display = solid.rotate([-90, 0, 0])
  const geometry = solidGeometry(display)
  display.delete()
    const volume = solid.volume()
  const watertight = solid.status() === 'NoError' && !solid.isEmpty()
  solid.delete()
  return { geometry, volume, watertight, holesCut, deviations, projected }
}

function holeSolid(api: ManifoldToplevel, h: HoleSpec, vs: ViewSet): Solid | null {
  const depth = h.axis === 'Y' ? vs.size.y : h.axis === 'Z' ? vs.size.z : vs.size.x
  const lo = h.from <= 1e-3 + depth * 0.003 ? -1 : h.from
  const hi = h.to >= depth * 0.997 - 1e-3 ? depth + 1 : h.to
  const seg = Math.max(24, Math.min(96, Math.round(h.r * 2)))
  const circle = api.CrossSection.circle(h.r, seg)
  const placed = circle.translate([h.u, h.v])
  circle.delete()
  const axis = h.axis === 'Y' ? 'y' : h.axis === 'Z' ? 'z' : 'x'
  const out = prismAlong(placed, axis, lo, hi)
  placed.delete()
  return out
}

/** Project the solid onto a view plane, returned in that view's 2D frame (front X,Z · top X,Y · side Y,Z). */
function projectView(solid: Solid, view: 'front' | 'top' | 'side'): P2[][] {
  let turned: Solid
  if (view === 'top') turned = solid.translate([0, 0, 0])
  else if (view === 'front') turned = solid.rotate([-90, 0, 0]) // (x,y,z) → (x, z, −y)
  else {
    const a = solid.rotate([0, 0, -90]) // (x,y,z) → (y, −x, z)
    turned = a.rotate([-90, 0, 0]) // → (y, z, x)
    a.delete()
  }
  const cs = turned.project()
  turned.delete()
  const polys = cs.toPolygons().map((poly) => poly.map(([x, y]) => ({ x, y })))
  cs.delete()
  return polys
}

/** Symmetric distance between two closed rings, sampled every `step` mm. */
export function hausdorff(a: readonly P2[], b: readonly P2[], step: number): { max: number; mean: number } {
  const sa = sample(a, step)
  const sb = sample(b, step)
  let max = 0
  let sum = 0
  const one = (pts: P2[], ring: readonly P2[]) => {
    for (const p of pts) {
      let d = Infinity
      for (let i = 0; i < ring.length; i++) d = Math.min(d, segDist(p, ring[i], ring[(i + 1) % ring.length]))
      max = Math.max(max, d)
      sum += d
    }
  }
  one(sa, b)
  one(sb, a)
  return { max, mean: sum / Math.max(1, sa.length + sb.length) }
}

function sample(ring: readonly P2[], step: number): P2[] {
  const out: P2[] = []
  let per = ring.length
  let total = 0
  for (let i = 0; i < ring.length; i++) total += Math.hypot(ring[(i + 1) % per].x - ring[i].x, ring[(i + 1) % per].y - ring[i].y)
  const s = Math.max(step, total / 1500)
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]
    const q = ring[(i + 1) % per]
    const len = Math.hypot(q.x - p.x, q.y - p.y)
    const n = Math.max(1, Math.ceil(len / s))
    for (let k = 0; k < n; k++) out.push({ x: p.x + ((q.x - p.x) * k) / n, y: p.y + ((q.y - p.y) * k) / n })
  }
  per = 0
  return out
}

function insideish(ring: readonly P2[], p: P2): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

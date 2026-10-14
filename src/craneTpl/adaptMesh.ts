import * as THREE from 'three'
import { extFraction, type CraneDef } from '../trw/craneKinematics'

/** Shrink factor of the cross-section for every telescope added beyond the template's sections. */
export const CLONE_SHRINK = 0.86

function map(geo: THREE.BufferGeometry, f: (v: THREE.Vector3) => void): THREE.BufferGeometry {
  const g = geo.clone()
  const pa = g.getAttribute('position') as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); f(v); pa.setXYZ(i, v.x, v.y, v.z) }
  pa.needsUpdate = true
  g.computeVertexNormals()
  return g
}

/**
 * Per-part adaptation of the template mesh (mesh frame: x lateral, y = h, z = r; base in its own raw frame).
 * - def.adapt.dh: column + cyl1 stretched vertically, booms lifted
 * - def.adapt.baseX: base scaled along the stabiliser beam
 * - dl: retracted outer-boom length of the variant vs. the template → outer boom stretched linearly from the knuckle
 * - n > template sections: extra telescopes = copies of the innermost one, cross-section shrunk by CLONE_SHRINK per step
 * Without def.adapt only the extension clones are added (the shipped models stay untouched).
 */
export function adaptGroups(groups: Record<string, THREE.BufferGeometry[]>, def: CraneDef, dl: number, n: number, ud: { r: number; h: number }, u: { r: number; h: number }, stroke = 0, secStroke?: number[]): Record<string, THREE.BufferGeometry[]> {
  const out: Record<string, THREE.BufferGeometry[]> = { ...groups }
  const a = def.adapt
  if (a) {
    const p1h = def.geom.p1.h - a.dh
    const sy = (p1h + a.dh) / p1h
    if (a.baseX !== 1) out.base = (groups.base ?? []).map((g) => map(g, (v) => { v.x *= a.baseX }))
    if (a.dh) {
      for (const k of ['column', 'cyl1']) if (groups[k]) out[k] = groups[k].map((g) => map(g, (v) => { if (v.y > 0) v.y *= sy }))
      for (const k of Object.keys(groups)) if (k === 'main' || k === 'outer' || /^ext\d+$/.test(k)) out[k] = groups[k].map((g) => map(g, (v) => { v.y += a.dh }))
    }
    if (Math.abs(dl) > 1e-4 && out.outer) {
      const P2 = def.geom.p2, l2 = Math.hypot(def.geom.tipRetracted.r - P2.r, def.geom.tipRetracted.h - P2.h)
      out.outer = out.outer.map((g) => map(g, (v) => {
        const t = Math.min(1, Math.max(0, ((v.z - P2.r) * ud.r + (v.y - P2.h) * ud.h) / l2))
        v.z += ud.r * dl * t
        v.y += ud.h * dl * t
      }))
    }
  }
  const S = def.meshExtSections
  const last = out[`ext${S}`]
  if (n > S && last?.length) {
    const c = new THREE.Vector3(), tmp = new THREE.Vector3()
    let cnt = 0
    for (const g of last) { const pa = g.getAttribute('position'); for (let i = 0; i < pa.count; i++) { c.add(tmp.fromBufferAttribute(pa, i)); cnt++ } }
    c.divideScalar(Math.max(1, cnt))
    for (let k = S + 1; k <= n; k++) {
      const f = CLONE_SHRINK ** (k - S)
      out[`ext${k}`] = last.map((g) => map(g, (v) => {
        // along-axis component kept, perpendicular (lateral x and the in-plane normal) scaled about the centroid axis
        const dz = v.z - c.z, dy = v.y - c.y
        const along = dz * u.r + dy * u.h
        const nz = dz - along * u.r, ny = dy - along * u.h
        v.x = c.x + (v.x - c.x) * f
        v.z = c.z + along * u.r + nz * f
        v.y = c.y + along * u.h + ny * f
      }))
    }
  }
  // RULE R1 (LESSONS.md): exactly n telescopes, each sized from the variant: length = own stroke + the template's
  // overlap of that section (template length − template stroke). Scaled along the axis about the outer end, so the
  // retracted tip stays put; longer sections reach back into the outer boom, shorter ones lose overlap length only.
  const ss = secStroke ?? a?.secStroke
  if (ss && stroke > 0) for (let k = 1; k <= n; k++) {
    const need = stroke * (extFraction(def, n, k) - extFraction(def, n, k - 1))
    const have = ss[Math.min(k, ss.length) - 1]
    const gs = out[`ext${k}`]
    if (!gs?.length) continue
    let hi = -Infinity, lo = Infinity
    const t = new THREE.Vector3()
    for (const g of gs) { const pa = g.getAttribute('position'); for (let i = 0; i < pa.count; i++) { t.fromBufferAttribute(pa, i); const al = t.z * u.r + t.y * u.h; hi = Math.max(hi, al); lo = Math.min(lo, al) } }
    const L = hi - lo
    const f = (need + Math.max(0.15, L - have)) / L
    if (Math.abs(f - 1) < 0.01) continue
    out[`ext${k}`] = gs.map((g) => map(g, (v) => {
      const al = v.z * u.r + v.y * u.h
      const d = (al - hi) * (f - 1)
      v.z += d * u.r
      v.y += d * u.h
    }))
  }
  // only the n telescopes of the variant exist
  for (const k of Object.keys(out)) { const m = /^ext(\d+)$/.exec(k); if (m && +m[1] > n) delete out[k] }
  return out
}

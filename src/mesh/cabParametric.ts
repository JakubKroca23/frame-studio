import * as THREE from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { ParametricCabSpec } from '../model/types'
import { BUMPER_PROUD, cabLayout, planRing, type CabLayout } from '../presets/cabLayout'
import { cabMaterials, type CabMaterials } from './materials'

/**
 * Brand-specific configurator cab. The body is a loft of plan sections stacked by height (smooth,
 * watertight by construction, no boolean seams); grille, lamps, glass, bumper, visor, mirrors,
 * steps… are separate closed plates that follow the body surface, each with its own material.
 * Shapes are visual approximations of the series (see presets/cabLayout.ts), not CAD data.
 */

type V3 = THREE.Vector3
type UV = [number, number]
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export interface CabPart {
  part: 'body' | 'glass' | 'grille' | 'lamp' | 'bumper' | 'trim' | 'seam' | 'mirror' | 'step' | 'badge' | 'visor' | 'deflector' | 'fender'
  name: string
  geometry: THREE.BufferGeometry
  material: THREE.Material
}

// ───────────────────────────── geometry helpers ─────────────────────────────

/** Closed loft through rings with the same vertex count; ends closed by fans. Indexed, outward wound. */
export function loftRings(rings: V3[][], capStart = true, capEnd = true): THREE.BufferGeometry {
  const m = rings[0].length
  const positions: number[] = []
  for (const ring of rings) for (const p of ring) positions.push(p.x, p.y, p.z)
  const index: number[] = []
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < m; i++) {
      const a = k * m + i
      const b = k * m + ((i + 1) % m)
      const c = (k + 1) * m + ((i + 1) % m)
      const d = (k + 1) * m + i
      index.push(a, b, c, a, c, d)
    }
  }
  const center = (ring: V3[]) => ring.reduce((sum, p) => sum.add(p), V(0, 0, 0)).multiplyScalar(1 / ring.length)
  if (capStart) {
    const c = center(rings[0])
    const ci = positions.length / 3
    positions.push(c.x, c.y, c.z)
    for (let i = 0; i < m; i++) index.push(ci, (i + 1) % m, i)
  }
  if (capEnd) {
    const c = center(rings[rings.length - 1])
    const ci = positions.length / 3
    const base = (rings.length - 1) * m
    positions.push(c.x, c.y, c.z)
    for (let i = 0; i < m; i++) index.push(ci, base + i, base + ((i + 1) % m))
  }
  return finish(positions, index)
}

function finish(positions: number[], index: number[]): THREE.BufferGeometry {
  // Make the winding outward: a closed mesh with a negative signed volume is inside out.
  let volume = 0
  for (let t = 0; t < index.length; t += 3) {
    const [a, b, c] = [index[t] * 3, index[t + 1] * 3, index[t + 2] * 3]
    volume +=
      positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1]) -
      positions[a + 1] * (positions[b] * positions[c + 2] - positions[b + 2] * positions[c]) +
      positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c])
  }
  if (volume < 0) for (let t = 0; t < index.length; t += 3) [index[t + 1], index[t + 2]] = [index[t + 2], index[t + 1]]
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  return geometry
}

/** A surface patch parametrised by (u, v) with a reference direction for the outward normal. */
interface Surface {
  at(u: number, v: number): V3
  out: V3
}

function normalAt(surface: Surface, u: number, v: number): V3 {
  const h = 1.5
  const du = surface.at(u + h, v).sub(surface.at(u - h, v))
  const dv = surface.at(u, v + h).sub(surface.at(u, v - h))
  const n = du.cross(dv).normalize()
  if (!Number.isFinite(n.x) || n.lengthSq() < 0.5) return surface.out.clone()
  return n.dot(surface.out) < 0 ? n.negate() : n
}

/** Outline in (u, v), counter-clockwise, with the indices of its bottom-left, bottom-right, top-right and top-left corners. */
interface Outline {
  pts: UV[]
  corners: [number, number, number, number]
}

function chain(pts: UV[], from: number, to: number): UV[] {
  const out: UV[] = []
  let i = from
  for (;;) {
    out.push(pts[i])
    if (i === to) break
    i = (i + 1) % pts.length
  }
  return out
}

function resampleUV(points: UV[], count: number): UV[] {
  const lengths = [0]
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]))
  const total = lengths[lengths.length - 1] || 1
  const out: UV[] = []
  let k = 1
  for (let i = 0; i < count; i++) {
    const target = (total * i) / (count - 1)
    while (k < points.length - 1 && lengths[k] < target) k++
    const span = lengths[k] - lengths[k - 1] || 1
    const t = Math.min(1, Math.max(0, (target - lengths[k - 1]) / span))
    const a = points[k - 1]
    const b = points[k] ?? a
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  }
  return out
}

/**
 * Closed plate on a surface: the outline is filled with a transfinite (Coons) grid, mapped onto the
 * surface and offset along the normal between t0 (inside the body) and t1 (proud of it).
 */
function plate(surface: Surface, outline: Outline, t0: number, t1: number, nu = 16, nv = 8): THREE.BufferGeometry {
  const [c0, c1, c2, c3] = outline.corners
  const bottom = resampleUV(chain(outline.pts, c0, c1), nu + 1)
  const right = resampleUV(chain(outline.pts, c1, c2), nv + 1)
  const top = resampleUV(chain(outline.pts, c2, c3), nu + 1).reverse()
  const left = resampleUV(chain(outline.pts, c3, c0), nv + 1).reverse()
  const grid: UV[] = []
  for (let j = 0; j <= nv; j++) {
    const t = j / nv
    for (let i = 0; i <= nu; i++) {
      const s = i / nu
      const p: UV = [0, 0]
      for (let k = 0; k < 2; k++) {
        p[k] =
          (1 - t) * bottom[i][k] +
          t * top[i][k] +
          (1 - s) * left[j][k] +
          s * right[j][k] -
          ((1 - s) * (1 - t) * bottom[0][k] + s * (1 - t) * bottom[nu][k] + (1 - s) * t * top[0][k] + s * t * top[nu][k])
      }
      grid.push(p)
    }
  }
  const positions: number[] = []
  for (const [u, v] of grid) {
    const p = surface.at(u, v)
    const n = normalAt(surface, u, v)
    const f = p.clone().addScaledVector(n, t1)
    const b = p.clone().addScaledVector(n, t0)
    positions.push(f.x, f.y, f.z, b.x, b.y, b.z)
  }
  // Interleaved: front = 2k, back = 2k + 1.
  const F = (i: number, j: number) => 2 * (j * (nu + 1) + i)
  const B = (i: number, j: number) => 2 * (j * (nu + 1) + i) + 1
  const index: number[] = []
  const quad = (a: number, b: number, c: number, d: number) => index.push(a, b, c, a, c, d)
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      quad(F(i, j), F(i + 1, j), F(i + 1, j + 1), F(i, j + 1))
      quad(B(i, j), B(i, j + 1), B(i + 1, j + 1), B(i + 1, j))
    }
  }
  const loop: [number, number][] = []
  for (let i = 0; i < nu; i++) loop.push([i, 0])
  for (let j = 0; j < nv; j++) loop.push([nu, j])
  for (let i = nu; i > 0; i--) loop.push([i, nv])
  for (let j = nv; j > 0; j--) loop.push([0, j])
  for (let k = 0; k < loop.length; k++) {
    const [ia, ja] = loop[k]
    const [ib, jb] = loop[(k + 1) % loop.length]
    quad(F(ib, jb), F(ia, ja), B(ia, ja), B(ib, jb))
  }
  return finish(positions, index)
}

/** Rounded rectangle outline (u0 < u1, v0 < v1). */
function roundRect(u0: number, u1: number, v0: number, v1: number, r: number): Outline {
  return roundPoly(
    [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ],
    r,
    [0, 1, 2, 3],
  )
}

/** Convex polygon (counter-clockwise) with filleted vertices; `corners` names four of its vertices. */
function roundPoly(points: UV[], r: number, corners: [number, number, number, number], seg = 5): Outline {
  const pts: UV[] = []
  const at: number[] = []
  const n = points.length
  for (let i = 0; i < n; i++) {
    const p = points[i]
    const a = points[(i + n - 1) % n]
    const b = points[(i + 1) % n]
    const la = Math.hypot(a[0] - p[0], a[1] - p[1])
    const lb = Math.hypot(b[0] - p[0], b[1] - p[1])
    const t = Math.min(r, la * 0.45, lb * 0.45)
    const ta: UV = [p[0] + ((a[0] - p[0]) / la) * t, p[1] + ((a[1] - p[1]) / la) * t]
    const tb: UV = [p[0] + ((b[0] - p[0]) / lb) * t, p[1] + ((b[1] - p[1]) / lb) * t]
    const start = pts.length
    for (let k = 0; k <= seg; k++) {
      const s = k / seg
      const w0 = (1 - s) * (1 - s)
      const w1 = 2 * s * (1 - s)
      const w2 = s * s
      pts.push([w0 * ta[0] + w1 * p[0] + w2 * tb[0], w0 * ta[1] + w1 * p[1] + w2 * tb[1]])
    }
    at.push(start + Math.floor(seg / 2))
  }
  return { pts, corners: [at[corners[0]], at[corners[1]], at[corners[2]], at[corners[3]]] }
}

/** Mirror an outline to the other side (u → -u), keeping it counter-clockwise. */
function mirrorU(outline: Outline): Outline {
  const n = outline.pts.length
  const pts = outline.pts.map(([u, v]) => [-u, v] as UV).reverse()
  const map = (i: number) => n - 1 - i
  const [c0, c1, c2, c3] = outline.corners
  return { pts, corners: [map(c1), map(c0), map(c3), map(c2)] }
}

/** A band of the given width along a segment in (u, v). */
function band(a: UV, b: UV, width: number, extend = 0): Outline {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  const d: UV = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
  const l: UV = [-d[1], d[0]]
  const A: UV = [a[0] - d[0] * extend, a[1] - d[1] * extend]
  const Bp: UV = [b[0] + d[0] * extend, b[1] + d[1] * extend]
  const h = width / 2
  return {
    pts: [
      [A[0] - l[0] * h, A[1] - l[1] * h],
      [Bp[0] - l[0] * h, Bp[1] - l[1] * h],
      [Bp[0] + l[0] * h, Bp[1] + l[1] * h],
      [A[0] + l[0] * h, A[1] + l[1] * h],
    ],
    corners: [0, 1, 2, 3],
  }
}

/** Shrink a convex outline towards its centroid by `d` (approximate inset). */
function inset(outline: Outline, d: number): Outline {
  const c = outline.pts.reduce((s, p) => [s[0] + p[0] / outline.pts.length, s[1] + p[1] / outline.pts.length], [0, 0] as UV)
  return {
    pts: outline.pts.map(([u, v]) => {
      const du = u - c[0]
      const dv = v - c[1]
      const len = Math.hypot(du, dv) || 1
      const k = Math.max(0, len - d) / len
      return [c[0] + du * k, c[1] + dv * k] as UV
    }),
    corners: outline.corners,
  }
}

/** Width of a convex outline at height v (min and max u). */
function spanAt(outline: Outline, v: number): [number, number] | null {
  let lo = Infinity
  let hi = -Infinity
  const pts = outline.pts
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    if ((v < a[1] && v < b[1]) || (v > a[1] && v > b[1]) || a[1] === b[1]) continue
    const u = a[0] + ((v - a[1]) / (b[1] - a[1])) * (b[0] - a[0])
    lo = Math.min(lo, u)
    hi = Math.max(hi, u)
  }
  return lo < hi ? [lo, hi] : null
}

function orientTo(object: THREE.Object3D, axis: V3, normal: V3) {
  object.quaternion.setFromUnitVectors(axis, normal.clone().normalize())
}

// ───────────────────────────── the cab ─────────────────────────────

interface Ctx {
  L: CabLayout
  spec: ParametricCabSpec
  mats: CabMaterials
  parts: CabPart[]
  objects: THREE.Object3D[]
  front: Surface
  side: (sign: 1 | -1) => Surface
  add(part: CabPart['part'], name: string, geometry: THREE.BufferGeometry, material: THREE.Material): void
}

export interface ParametricCabResult {
  layout: CabLayout
  body: THREE.BufferGeometry
  parts: CabPart[]
  /** Small fixed-shape pieces (badges, mirror housings, treads) positioned by transform. */
  objects: THREE.Object3D[]
}

/** Watertight body only, in drawing coordinates (X along, Y height, Z lateral). */
export function parametricCabBody(spec: ParametricCabSpec): { layout: CabLayout; geometry: THREE.BufferGeometry } {
  const layout = cabLayout(spec)
  const rings = layout.rings.map((z) => planRing(layout.plan(z)).map((p) => V(p.x, z, p.y)))
  return { layout, geometry: loftRings(rings) }
}

export function parametricCab(spec: ParametricCabSpec, color?: number): ParametricCabResult {
  const { layout: L, geometry: body } = parametricCabBody(spec)
  const mats = cabMaterials(spec.brand, spec.variant, color)
  const ctx: Ctx = {
    L,
    spec,
    mats,
    parts: [],
    objects: [],
    front: { at: (u, v) => V(L.frontAt(v, u), v, u), out: V(-1, 0, 0) },
    side: (sign) => ({ at: (u, v) => V(u, v, sign * L.sideAt(v, u)), out: V(0, 0, sign) }),
    add(part, name, geometry, material) {
      this.parts.push({ part, name, geometry, material })
    },
  }
  windscreen(ctx)
  bumper(ctx)
  const face = FACES[spec.brand]
  face(ctx)
  visor(ctx)
  for (const sign of [-1, 1] as const) {
    doorAndWindows(ctx, sign)
    steps(ctx, sign)
    mirror(ctx, sign)
    fender(ctx, sign)
  }
  roofKit(ctx)
  return { layout: L, body, parts: ctx.parts, objects: ctx.objects }
}

/** Build the display group in world coordinates. */
export function parametricCabGroup(spec: ParametricCabSpec, color: number | undefined, offset: V3): THREE.Group {
  const result = parametricCab(spec, color)
  const g = new THREE.Group()
  g.name = 'cab'
  g.userData.role = 'cab'
  const inner = new THREE.Group()
  inner.name = 'cab-body'
  inner.position.copy(offset)
  g.add(inner)
  const display = toCreasedNormals(result.body, THREE.MathUtils.degToRad(42))
  result.body.dispose()
  display.computeBoundingBox()
  const shell = new THREE.Mesh(display, cabMaterials(spec.brand, spec.variant, color).paint)
  shell.name = 'cab-shell'
  shell.userData.role = 'cab-shell'
  shell.userData.part = 'body'
  inner.add(shell)
  for (const part of result.parts) {
    const geometry = toCreasedNormals(part.geometry, THREE.MathUtils.degToRad(50))
    part.geometry.dispose()
    const mesh = new THREE.Mesh(geometry, part.material)
    mesh.name = `cab-${part.name}`
    mesh.userData.part = part.part
    inner.add(mesh)
  }
  for (const object of result.objects) inner.add(object)
  return g
}

function W(ctx: Ctx, z: number) {
  return ctx.L.plan(z).w
}

function windscreen(ctx: Ctx) {
  const { L, mats } = ctx
  const v0 = L.zScreenLow + 20
  const v1 = L.zScreenTop - 15
  const w0 = W(ctx, v0) * 0.955
  const w1 = W(ctx, v1) * 0.945
  const r = ctx.spec.brand === 'scania' ? 70 : 130
  const outline = roundPoly(
    [
      [-w0, v0],
      [w0, v0],
      [w1, v1],
      [-w1, v1],
    ],
    r,
    [0, 1, 2, 3],
  )
  ctx.add('trim', 'screen-frame', plate(ctx.front, outline, -6, 4, 40, 10), mats.black)
  ctx.add('glass', 'windscreen', plate(ctx.front, inset(outline, 28), -6, 9, 40, 10), mats.glass)
  // Wipers parked on the glass.
  for (const [a, b] of [
    [-0.78, -0.08],
    [0.02, 0.72],
  ] as const) {
    const z = v0 + 45
    ctx.add('trim', 'wiper', plate(ctx.front, band([a * w0, z], [b * w0, z + 40], 22), 8, 22, 12, 1), mats.black)
  }
}

function bumper(ctx: Ctx) {
  const { L, mats, spec } = ctx
  const z0 = L.zLow + 2
  const z1 = L.zBumperTop
  const split = z0 + (z1 - z0) * (spec.brand === 'man' || spec.variant === 'FMX' || spec.variant === 'Arocs' ? 0.02 : 0.42)
  const wb = W(ctx, z1) * 0.996
  const upper = mats.bumperUpper
  const lower = mats.bumperLower
  if (split > z0 + 20) ctx.add('bumper', 'bumper-lower', plate(ctx.front, roundRect(-wb, wb, z0, split + 4, 30), -8, 47, 44, 6), lower)
  ctx.add('bumper', 'bumper', plate(ctx.front, roundRect(-wb, wb, Math.max(z0, split), z1, 30), -8, 50, 44, 8), upper)
  // Wings of the bumper running back to the wheel arch, on both sides.
  for (const sign of [-1, 1] as const) {
    const xa = L.plan(z1).xc - 6
    const xb = L.plan(z0 + 40).xr - 50
    if (xb - xa < 80) continue
    ctx.add('bumper', 'bumper-wing', plate(ctx.side(sign), roundRect(xa, xb, z0, z1 - 10, 25), -8, 22, 10, 6), lower)
  }
  if (spec.variant === 'FMX' || spec.variant === 'Arocs') {
    // Steel skid plate under the bumper.
    ctx.add('bumper', 'skid-plate', plate(ctx.front, roundRect(-0.42 * wb, 0.42 * wb, z0 + 8, z0 + 150, 20), 50, 72, 16, 3), mats.chrome)
  }
}

// ───────────────────────────── brand faces ─────────────────────────────

interface FaceFrame {
  zBT: number
  zF: number
  h: number
  wb: number
  bh: number
}

function frame(ctx: Ctx): FaceFrame {
  const { L } = ctx
  return { zBT: L.zBumperTop, zF: L.zFace, h: L.zFace - L.zBumperTop, wb: W(ctx, L.zBumperTop), bh: L.zBumperTop - L.zLow }
}

/** Horizontal bars across a grille outline. */
function slats(ctx: Ctx, outline: Outline, count: number, from: number, to: number, height: number, t1: number, mat: THREE.Material, margin = 30) {
  for (let k = 0; k < count; k++) {
    const z = from + ((to - from) * (k + 0.5)) / count
    const span = spanAt(outline, z)
    if (!span) continue
    ctx.add('grille', 'grille-bar', plate(ctx.front, roundRect(span[0] + margin, span[1] - margin, z - height / 2, z + height / 2, Math.min(10, height / 3)), 2, t1, 24, 2), mat)
  }
}

/** Chrome letter blocks suggesting the brand lettering. */
function lettering(ctx: Ctx, z: number, count: number, w: number, h: number, gap: number, mat: THREE.Material, t1 = 10) {
  const total = count * w + (count - 1) * gap
  for (let k = 0; k < count; k++) {
    const u0 = -total / 2 + k * (w + gap)
    ctx.add('badge', 'letter', plate(ctx.front, roundRect(u0, u0 + w, z - h / 2, z + h / 2, 8), -2, t1, 4, 3), mat)
  }
}

/** Headlamps (housing, lens, daytime running light). `proud` lifts lamps set into the bumper onto its face. */
function lamps(ctx: Ctx, right: Outline, drl: [UV, UV][], drlWidth = 20, proud = 0) {
  const { mats } = ctx
  for (const outline of [right, mirrorU(right)]) {
    ctx.add('lamp', 'headlamp-housing', plate(ctx.front, outline, proud - 6, proud + 9, 16, 6), mats.black)
    ctx.add('lamp', 'headlamp', plate(ctx.front, inset(outline, 14), proud - 6, proud + 15, 16, 6), mats.lens)
    // Two reflector bowls behind the lens.
    let u0 = Infinity
    let u1 = -Infinity
    let v0 = Infinity
    let v1 = -Infinity
    for (const [u, v] of outline.pts) {
      u0 = Math.min(u0, u)
      u1 = Math.max(u1, u)
      v0 = Math.min(v0, v)
      v1 = Math.max(v1, v)
    }
    const r = Math.min((v1 - v0) * 0.24, (u1 - u0) * 0.13)
    const vc = v0 + (v1 - v0) * 0.42
    for (const k of [0.36, 0.68]) {
      const u = u0 + (u1 - u0) * k
      addBadgeRing(ctx, u, vc, r, Math.max(6, r * 0.18), proud + 8, mats.chrome)
      addBadgeDisc(ctx, u, vc, r * 0.55, proud + 4, mats.reflector, 6)
    }
  }
  for (const [a, b] of drl) {
    for (const s of [1, -1]) {
      ctx.add('lamp', 'drl', plate(ctx.front, band([a[0] * s, a[1]], [b[0] * s, b[1]], drlWidth, drlWidth / 3), proud + 4, proud + 19, 6, 1), mats.drl)
    }
  }
}

/** Lamps inside the bumper sit on its face. */
const IN_BUMPER = BUMPER_PROUD - 4

function addBadgeDisc(ctx: Ctx, u: number, v: number, radius: number, proud: number, mat: THREE.Material, thick = 10) {
  const p = ctx.front.at(u, v)
  const n = normalAt(ctx.front, u, v)
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, thick, 40), mat)
  orientTo(disc, V(0, 1, 0), n)
  disc.position.copy(p.addScaledVector(n, proud + thick / 2))
  disc.name = 'cab-badge'
  disc.userData.part = 'badge'
  ctx.objects.push(disc)
}

function addBadgeRing(ctx: Ctx, u: number, v: number, radius: number, tube: number, proud: number, mat: THREE.Material) {
  const p = ctx.front.at(u, v)
  const n = normalAt(ctx.front, u, v)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 12, 48), mat)
  orientTo(ring, V(0, 0, 1), n)
  ring.position.copy(p.addScaledVector(n, proud))
  ring.name = 'cab-badge'
  ring.userData.part = 'badge'
  ctx.objects.push(ring)
}

function fogLamps(ctx: Ctx, u: number, v: number, r: number) {
  for (const s of [-1, 1]) {
    addBadgeDisc(ctx, s * u, v, r + 10, 44, ctx.mats.black, 8)
    addBadgeDisc(ctx, s * u, v, r, 48, ctx.mats.lens, 8)
  }
}

const FACES: Record<ParametricCabSpec['brand'], (ctx: Ctx) => void> = {
  volvo(ctx) {
    const { zBT, zF, h, wb, bh } = frame(ctx)
    const { mats } = ctx
    const g0 = zBT + 0.03 * h
    const g1 = zF - 0.2 * h
    const mid = g0 + 0.45 * (g1 - g0)
    const grille = roundPoly(
      [
        [-0.5 * wb, g0],
        [0.5 * wb, g0],
        [0.62 * wb, mid],
        [0.62 * wb, g1],
        [-0.62 * wb, g1],
        [-0.62 * wb, mid],
      ],
      45,
      [0, 1, 3, 4],
    )
    ctx.add('grille', 'grille', plate(ctx.front, grille, -6, 12, 28, 12), mats.grille)
    slats(ctx, grille, 7, g0 + 20, g1 - 20, 30, 20, mats.grilleBar)
    // The diagonal iron-mark band and the badge ring with its arrow.
    const gc = (g0 + g1) / 2 + 0.05 * (g1 - g0)
    ctx.add('badge', 'iron-mark-band', plate(ctx.front, band([-0.58 * wb, g1 - 0.08 * (g1 - g0)], [0.56 * wb, g0 + 0.2 * (g1 - g0)], 58), 4, 28, 30, 2), mats.chrome)
    addBadgeRing(ctx, 0, gc, 125, 17, 30, mats.chrome)
    addBadgeDisc(ctx, 0, gc, 110, 18, mats.badgeDark, 8)
    const ax = 125 * Math.cos(Math.PI / 4)
    ctx.add('badge', 'iron-mark-arrow', plate(ctx.front, band([ax, gc + ax], [ax + 95, gc + ax + 95], 34), 6, 32, 6, 2), mats.chrome)
    lettering(ctx, g1 + 0.5 * (zF - g1), 5, 78, 54, 46, mats.chrome)
    const l0 = zBT + 12
    const l1 = zBT + 0.56 * h
    lamps(
      ctx,
      roundPoly(
        [
          [0.65 * wb, l0],
          [0.985 * wb, l0],
          [0.985 * wb, l1],
          [0.8 * wb, l1],
          [0.65 * wb, l0 + 0.45 * (l1 - l0)],
        ],
        36,
        [0, 1, 2, 3],
      ),
      [
        [
          [0.71 * wb, l1 - 0.18 * (l1 - l0)],
          [0.8 * wb, l0 + 0.12 * (l1 - l0)],
        ],
        [
          [0.8 * wb, l0 + 0.12 * (l1 - l0)],
          [0.96 * wb, l0 + 0.32 * (l1 - l0)],
        ],
      ],
    )
    fogLamps(ctx, 0.78 * wb, ctx.L.zLow + 0.3 * bh, 42)
  },

  scania(ctx) {
    const { zBT, zF, h, wb, bh } = frame(ctx)
    const { mats } = ctx
    const g0 = zBT + 0.03 * h
    const g1 = zF - 0.26 * h
    const grille = roundRect(-0.6 * wb, 0.6 * wb, g0, g1, 30)
    ctx.add('grille', 'grille', plate(ctx.front, grille, -6, 12, 28, 12), mats.grille)
    slats(ctx, grille, 6, g0 + 20, g1 - 40, 34, 20, mats.grilleBar, 24)
    // Griffin badge on the top edge of the grille and the SCANIA lettering above it.
    addBadgeRing(ctx, 0, g1 - 25, 92, 13, 22, mats.chrome)
    addBadgeDisc(ctx, 0, g1 - 25, 82, 14, mats.badgeDark, 9)
    addBadgeDisc(ctx, 0, g1 - 25, 40, 22, mats.badgeAccent, 4)
    lettering(ctx, g1 + 0.5 * (zF - g1) + 10, 6, 88, 58, 36, mats.chrome)
    const l0 = zBT - 0.68 * bh
    const l1 = zBT - 0.04 * bh
    lamps(
      ctx,
      roundPoly(
        [
          [0.56 * wb, l0],
          [0.975 * wb, l0],
          [0.975 * wb, l1],
          [0.7 * wb, l1],
          [0.56 * wb, l0 + 0.55 * (l1 - l0)],
        ],
        22,
        [0, 1, 2, 3],
      ),
      [
        [
          [0.71 * wb, l1 - 20],
          [0.955 * wb, l1 - 20],
        ],
        [
          [0.58 * wb, l0 + 0.5 * (l1 - l0)],
          [0.7 * wb, l1 - 20],
        ],
      ],
      16,
      IN_BUMPER,
    )
    // Lower grille slot between the lamps.
    ctx.add('grille', 'lower-grille', plate(ctx.front, roundRect(-0.42 * wb, 0.42 * wb, ctx.L.zLow + 0.2 * bh, ctx.L.zLow + 0.46 * bh, 20), 30, 54, 20, 4), mats.grille)
  },

  man(ctx) {
    const { zBT, zF, h, wb, bh } = frame(ctx)
    const { mats } = ctx
    const g0 = zBT + 0.02 * h
    const g1 = zF - 0.1 * h
    const grille = roundPoly(
      [
        [-0.6 * wb, g0],
        [0.6 * wb, g0],
        [0.68 * wb, g1],
        [-0.68 * wb, g1],
      ],
      55,
      [0, 1, 2, 3],
    )
    ctx.add('grille', 'grille', plate(ctx.front, grille, -6, 12, 28, 12), mats.grille)
    const wing = g1 - 0.2 * (g1 - g0)
    slats(ctx, grille, 4, g0 + 30, wing - 70, 30, 20, mats.chrome, 40)
    // Chrome wing bar across the top of the grille with the lion badge in the middle.
    ctx.add('badge', 'wing-bar', plate(ctx.front, roundRect(-0.76 * wb, 0.76 * wb, wing - 24, wing + 24, 18), 2, 24, 40, 2), mats.chrome)
    ctx.add('badge', 'lion-plate', plate(ctx.front, roundRect(-92, 92, wing - 70, wing + 70, 30), 6, 30, 8, 6), mats.chrome)
    ctx.add('badge', 'lion', plate(ctx.front, roundRect(-62, 62, wing - 48, wing + 48, 22), 10, 34, 6, 4), mats.badgeDark)
    lettering(ctx, g0 + 0.18 * (g1 - g0), 3, 70, 50, 26, mats.chrome, 24)
    const l0 = zBT - 0.76 * bh
    const l1 = zBT - 0.05 * bh
    lamps(
      ctx,
      roundPoly(
        [
          [0.6 * wb, l0],
          [0.975 * wb, l0],
          [0.975 * wb, l1],
          [0.74 * wb, l1],
          [0.6 * wb, l0 + 0.5 * (l1 - l0)],
        ],
        30,
        [0, 1, 2, 3],
      ),
      [
        [
          [0.6 * wb, l0 + 0.62 * (l1 - l0)],
          [0.74 * wb, l1 + 14],
        ],
        [
          [0.74 * wb, l1 + 14],
          [0.97 * wb, l1 + 14],
        ],
      ],
      16,
      IN_BUMPER,
    )
    ctx.add('grille', 'lower-grille', plate(ctx.front, roundRect(-0.46 * wb, 0.46 * wb, ctx.L.zLow + 0.22 * bh, ctx.L.zLow + 0.5 * bh, 26), 30, 56, 20, 4), mats.grille)
  },

  daf(ctx) {
    const { zBT, zF, h, wb, bh } = frame(ctx)
    const { mats } = ctx
    const g0 = zBT - 0.02 * h
    const g1 = zF - 0.06 * h
    const mid = g0 + 0.55 * (g1 - g0)
    const grille = roundPoly(
      [
        [-0.46 * wb, g0],
        [0.46 * wb, g0],
        [0.66 * wb, mid],
        [0.56 * wb, g1],
        [-0.56 * wb, g1],
        [-0.66 * wb, mid],
      ],
      40,
      [0, 1, 3, 4],
    )
    ctx.add('grille', 'grille', plate(ctx.front, grille, -6, 12, 28, 12), mats.grille)
    const top = g1 - 0.2 * (g1 - g0)
    slats(ctx, grille, 5, g0 + 25, top - 40, 34, 22, mats.chrome, 36)
    ctx.add('badge', 'top-bar', plate(ctx.front, roundRect(-0.5 * wb, 0.5 * wb, top - 20, top + 20, 12), 2, 22, 30, 2), mats.chrome)
    lettering(ctx, top + 0.5 * (g1 - top), 3, 130, 82, 34, mats.chrome, 22)
    const l0 = zBT - 0.62 * bh
    const l1 = zBT - 0.04 * bh
    lamps(
      ctx,
      roundPoly(
        [
          [0.56 * wb, l0],
          [0.98 * wb, l0 + 0.2 * bh],
          [0.98 * wb, l1],
          [0.82 * wb, l1],
          [0.6 * wb, l0 + 0.45 * (l1 - l0)],
        ],
        30,
        [0, 1, 2, 3],
      ),
      [
        [
          [0.62 * wb, l0 + 0.42 * (l1 - l0)],
          [0.83 * wb, l1 - 18],
        ],
        [
          [0.83 * wb, l1 - 18],
          [0.965 * wb, l1 - 18],
        ],
      ],
      18,
      IN_BUMPER,
    )
    fogLamps(ctx, 0.8 * wb, ctx.L.zLow + 0.17 * bh, 36)
  },

  mercedes(ctx) {
    const { zBT, zF, h, wb, bh } = frame(ctx)
    const { mats } = ctx
    const g0 = zBT + 0.03 * h
    const g1 = zF - 0.07 * h
    const grille = roundPoly(
      [
        [-0.52 * wb, g0],
        [0.52 * wb, g0],
        [0.58 * wb, g1],
        [-0.58 * wb, g1],
      ],
      70,
      [0, 1, 2, 3],
    )
    ctx.add('grille', 'grille', plate(ctx.front, grille, -6, 12, 28, 12), mats.grille)
    slats(ctx, grille, 3, g0 + 30, g1 - 30, 62, 22, mats.chrome, 30)
    // Three-pointed star in a ring.
    const c = (g0 + g1) / 2
    addBadgeDisc(ctx, 0, c, 150, 22, mats.grille, 6)
    addBadgeRing(ctx, 0, c, 150, 16, 34, mats.chrome)
    for (const angle of [90, 210, 330]) {
      const a = (angle * Math.PI) / 180
      ctx.add('badge', 'star', plate(ctx.front, band([0, c], [Math.cos(a) * 140, c + Math.sin(a) * 140], 30, 6), 20, 40, 8, 2), mats.chrome)
    }
    const l0 = zBT - 0.6 * bh
    const l1 = zBT - 0.04 * bh
    lamps(
      ctx,
      roundPoly(
        [
          [0.6 * wb, l0],
          [0.985 * wb, l0],
          [0.985 * wb, l1],
          [0.86 * wb, l1],
          [0.62 * wb, l0 + 0.4 * (l1 - l0)],
        ],
        34,
        [0, 1, 2, 3],
      ),
      [
        [
          [0.64 * wb, l0 + 0.42 * (l1 - l0)],
          [0.86 * wb, l1 - 18],
        ],
      ],
      18,
      IN_BUMPER,
    )
    fogLamps(ctx, 0.8 * wb, ctx.L.zLow + 0.18 * bh, 36)
  },
}

// ───────────────────────────── shared details ─────────────────────────────

function visor(ctx: Ctx) {
  const { L, spec, mats } = ctx
  const zV = L.zScreenTop + 12
  const wv = W(ctx, zV) * 0.93
  const length = { volvo: 270, scania: 190, man: 210, daf: 240, mercedes: 230 }[spec.brand]
  const sections: V3[][] = []
  const count = 36
  for (let i = 0; i <= count; i++) {
    const y = -wv + (2 * wv * i) / count
    const a = Math.abs(y) / wv
    const len = length * (0.3 + 0.7 * Math.sqrt(Math.max(0, 1 - a ** 8)))
    const xs = L.frontAt(zV, y) + 12
    const drop = len * 0.22
    sections.push([V(xs, zV + 46, y), V(xs - len, zV - drop + 20, y), V(xs - len, zV - drop, y), V(xs, zV, y)])
  }
  ctx.add('visor', 'sun-visor', loftRings(sections), spec.brand === 'scania' ? mats.black : mats.paint)
}

function doorAndWindows(ctx: Ctx, sign: 1 | -1) {
  const { L, spec, mats } = ctx
  const surface = ctx.side(sign)
  const zTop = L.zScreenTop - 30
  const zLowDoor = L.zFloor - 110
  const xPillar = (z: number) => L.plan(z).xc + 70
  const xA = Math.max(xPillar(L.zScreenLow), -L.archR * 0.75)
  const xAt = xPillar(zTop)
  const xB = Math.min(xA + 1080, spec.xRear - 170)
  const seam = (a: UV, b: UV) => ctx.add('seam', 'door-seam', plate(surface, band(a, b, 7, 3), -3, 1.6, Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 60)), 1), mats.black)
  seam([xA, zLowDoor], [xB, zLowDoor])
  seam([xB, zLowDoor], [xB, zTop])
  seam([xB, zTop], [xAt, zTop])
  seam([xAt, zTop], [xA, L.zScreenLow])
  seam([xA, L.zScreenLow], [xA, zLowDoor])
  // Door window; Volvo and MAN dip the front of the sill line towards the mirror.
  const w0 = L.zScreenLow + 30
  const w1 = zTop - 45
  const dip = spec.brand === 'volvo' ? 170 : spec.brand === 'man' ? 120 : spec.brand === 'scania' ? 40 : 0
  const fx = (z: number) => xA + ((xAt - xA) * (z - L.zScreenLow)) / (zTop - L.zScreenLow) + 45
  const r0 = xB - 60
  const outline = roundPoly(
    [
      [fx(w0 - dip), w0 - dip],
      [fx(w0 - dip) + 230, w0 - dip],
      [fx(w0 - dip) + 380, w0],
      [r0, w0],
      [r0, w1],
      [fx(w1), w1],
    ],
    40,
    [0, 3, 4, 5],
  )
  ctx.add('trim', 'side-window-frame', plate(surface, inset(outline, -16), -3, 3, 20, 8), mats.black)
  ctx.add('glass', 'side-window', plate(surface, outline, -3, 7, 20, 8), mats.glass)
  // Handle below the window, near the rear edge.
  ctx.add('trim', 'door-handle', plate(surface, roundRect(xB - 230, xB - 80, w0 - 130, w0 - 92, 14), -2, 14, 6, 2), mats.black)
  // Sleeper: outside locker hatch behind the door.
  if (spec.kind === 'sleeper' && spec.xRear - xB > 520) {
    const h0 = L.zFloor - 60
    const h1 = Math.min(L.zFloor + 420, L.zScreenLow - 80)
    const xa = xB + 70
    const xb = spec.xRear - 170
    seam([xa, h0], [xb, h0])
    seam([xb, h0], [xb, h1])
    seam([xb, h1], [xa, h1])
    seam([xa, h1], [xa, h0])
  }
  // Side marker / indicator near the front corner.
  const zm = L.zBumperTop + 40
  const xm = L.plan(zm).xc + 40
  ctx.add('lamp', 'side-indicator', plate(surface, roundRect(xm, xm + 90, zm, zm + 36, 12), -2, 10, 4, 2), mats.amber)
}

function steps(ctx: Ctx, sign: 1 | -1) {
  const { L, mats } = ctx
  const surface = ctx.side(sign)
  const z0 = L.zLow + 40
  const z1 = L.zFloor - 140
  if (z1 - z0 < 250) return
  const archFront = (z: number) => L.plan(z).xr - 45
  const x0 = archFront(z0) - 420
  const right = (z: number) => Math.min(archFront(z), x0 + 470)
  const pts: UV[] = [[x0, z0]]
  const n = 8
  for (let i = 0; i <= n; i++) {
    const z = z0 + ((z1 - z0) * i) / n
    pts.push([right(z), z])
  }
  pts.push([x0, z1])
  const outline = roundPoly(pts, 20, [0, 1, n + 1, n + 2])
  ctx.add('step', 'step-panel', plate(surface, outline, -3, 10, 10, 10), mats.black)
  const count = Math.max(2, Math.min(3, Math.round((z1 - z0) / 330)))
  for (let k = 0; k < count; k++) {
    const z = z0 + 110 + (k * (z1 - z0 - 140)) / Math.max(1, count - 1)
    const xa = x0 + 40
    const xb = right(z) - 30
    if (xb - xa < 120) continue
    const tread = new THREE.Mesh(new RoundedBoxGeometry(xb - xa, 34, 120, 2, 8), mats.step)
    const lateral = L.sideAt(z, (xa + xb) / 2)
    tread.position.set((xa + xb) / 2, z, sign * (lateral - 30))
    tread.name = 'cab-step'
    tread.userData.part = 'step'
    ctx.objects.push(tread)
  }
}

function mirror(ctx: Ctx, sign: 1 | -1) {
  const { L, mats, spec } = ctx
  const zM = L.zScreenLow + 0.42 * (L.zScreenTop - L.zScreenLow)
  const xM = L.plan(zM).xc + 110
  const w = L.sideAt(zM, xM)
  const out = 300
  const housing = spec.brand === 'man' ? mats.black : mats.paint
  const arm = (z0: number, z1: number) => {
    const from = V(xM, z0, sign * (w - 10))
    const to = V(xM - 110, z1, sign * (w + out - 40))
    const len = from.distanceTo(to)
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, len, 10), mats.black)
    rod.position.copy(from.clone().add(to).multiplyScalar(0.5))
    orientTo(rod, V(0, 1, 0), to.clone().sub(from))
    rod.name = 'cab-mirror-arm'
    rod.userData.part = 'mirror'
    ctx.objects.push(rod)
  }
  arm(zM + 260, zM + 190)
  arm(zM - 330, zM - 260)
  const box = (h: number, z: number, d: number) => {
    const shell = new THREE.Mesh(new RoundedBoxGeometry(105, h, d, 3, 30), housing)
    shell.position.set(xM - 150, z, sign * (w + out))
    shell.name = 'cab-mirror'
    shell.userData.part = 'mirror'
    const pane = new THREE.Mesh(new THREE.BoxGeometry(8, h - 40, d - 36), mats.mirror)
    pane.position.set(xM - 150 + 52, z, sign * (w + out))
    pane.name = 'cab-mirror-glass'
    pane.userData.part = 'glass'
    ctx.objects.push(shell, pane)
  }
  box(400, zM + 20, 230)
  box(190, zM - 320, 200)
}

function fender(ctx: Ctx, sign: 1 | -1) {
  const { spec, mats } = ctx
  const r0 = spec.wheelRadius + 45
  const r1 = r0 + 22
  const shape = new THREE.Shape()
  const a0 = (12 * Math.PI) / 180
  const a1 = Math.PI / 2
  shape.absarc(0, 0, r1, a0, a1, false)
  shape.absarc(0, 0, r0, a1, a0, true)
  shape.closePath()
  const width = spec.tyreWidth + 90
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 24 })
  geometry.translate(0, spec.axleZ, sign * (spec.frontTrack / 2) - width / 2)
  ctx.add('fender', 'front-fender', geometry, mats.black)
  // Mud flap hanging behind the wheel.
  const flapX = Math.cos(a0) * r0 + 6
  const flapTop = spec.axleZ + Math.sin(a0) * r0 + 20
  const flap = new THREE.Mesh(new THREE.BoxGeometry(10, Math.max(80, flapTop - 260), width - 20), mats.rubber)
  flap.position.set(flapX, (flapTop + 260) / 2, sign * (spec.frontTrack / 2))
  flap.name = 'cab-mudflap'
  flap.userData.part = 'fender'
  ctx.objects.push(flap)
}

function roofKit(ctx: Ctx) {
  const { L, spec, mats } = ctx
  const H = spec.height
  const top = L.plan(H)
  if (!spec.tractor) return
  const low = spec.roof === 'low' || spec.roof === 'normal'
  if (low) {
    // Adjustable roof air deflector rising towards the trailer height.
    const rise = Math.max(250, Math.min(4000 - H - 20, 720))
    const x0 = top.xf + 80
    const x1 = x0 + Math.min(1350, (top.xr - x0) * 0.8)
    const wd = top.w - 30
    const sections: V3[][] = []
    const count = 28
    for (let i = 0; i <= count; i++) {
      const y = -wd + (2 * wd * i) / count
      const a = Math.abs(y) / wd
      const k = Math.max(0.06, Math.pow(Math.max(0, 1 - a ** 4), 0.5))
      const base = H - 8
      const ring: V3[] = [V(x0, base, y)]
      for (let j = 1; j <= 10; j++) {
        const t = j / 10
        ring.push(V(x0 + (x1 - 50 - x0) * t, base + rise * k * (1 - (1 - t) ** 1.8), y))
      }
      ring.push(V(x1, base + rise * k - 25 * k, y), V(x1, base, y))
      sections.push(ring)
    }
    ctx.add('deflector', 'roof-deflector', loftRings(sections), mats.paint)
  }
  // Side collars extending the cab sides towards the trailer.
  for (const sign of [-1, 1] as const) {
    const z0 = L.zScreenLow + 40
    const z1 = H - 220
    if (z1 - z0 < 300) continue
    ctx.add('deflector', 'side-collar', plate(ctx.side(sign), roundRect(spec.xRear - 60, spec.xRear + 220, z0, z1, 40), -2, 20, 6, 12), mats.paint)
  }
}

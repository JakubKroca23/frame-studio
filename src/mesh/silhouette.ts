import * as THREE from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { ManifoldToplevel } from 'manifold-3d/manifold'
import type { BBox, Pt } from '../lib/geom'
import type { CabModel } from '../model/types'
import { resampleRing, ringBounds, signedArea, simplifyRing, smoothRing } from '../pipeline/cabOutline'
import { manifoldApi } from './manifold'
import { cabPaint } from './materials'

export { envelope } from '../pipeline/cabOutline'

type Solid = InstanceType<ManifoldToplevel['Manifold']>
type Section = InstanceType<ManifoldToplevel['CrossSection']>

/**
 * Cab outlines in drawing millimetres.
 * side: x along the vehicle, y height. top: x along the vehicle, y lateral.
 * front: x lateral, y height, already placed in the side/top coordinates (see mapFrontView).
 */
export interface CabViews {
  side: readonly Pt[]
  top: readonly Pt[]
  front: readonly Pt[] | null
}

/** A feature skin on the cab: a thin closed solid that follows the body surface. */
export interface CabFeature {
  part: 'glass' | 'grille' | 'lamp' | 'bumper' | 'trim' | 'seam'
  face: 'front' | 'side'
  /** Skin thickness in mm. */
  thickness: number
  /** Height band as fractions of the body height. */
  y: [number, number]
  /** Lateral band as fractions of the half width, measured from the centre line. */
  z: [number, number]
  /** Side features only: band along the body as fractions of its length from the nose. */
  x?: [number, number]
}

export interface CabPartGeometry {
  part: CabFeature['part']
  geometry: THREE.BufferGeometry
}

export interface CabSolidResult {
  /** Indexed, watertight, outward-wound body in drawing coordinates (X along, Y height, Z lateral). */
  body: THREE.BufferGeometry
  parts: CabPartGeometry[]
}

const GENERIC_FEATURES: CabFeature[] = [
  { part: 'glass', face: 'front', thickness: 9, y: [0.58, 0.87], z: [0, 0.9] },
  { part: 'grille', face: 'front', thickness: 14, y: [0.24, 0.47], z: [0, 0.62] },
  { part: 'lamp', face: 'front', thickness: 18, y: [0.14, 0.25], z: [0.6, 0.9] },
  { part: 'bumper', face: 'front', thickness: 22, y: [0.015, 0.13], z: [0, 0.93] },
  { part: 'glass', face: 'side', thickness: 7, y: [0.55, 0.84], z: [0, 1], x: [0.21, 0.58] },
  { part: 'seam', face: 'side', thickness: 3, y: [0.1, 0.86], z: [0, 1], x: [0.175, 0.182] },
  { part: 'seam', face: 'side', thickness: 3, y: [0.1, 0.86], z: [0, 1], x: [0.615, 0.622] },
]

/** Volvo FM/FH proportions read off the front view of the sample drawing. */
const VOLVO_FEATURES: CabFeature[] = [
  { part: 'glass', face: 'front', thickness: 9, y: [0.61, 0.86], z: [0, 0.9] },
  { part: 'trim', face: 'front', thickness: 10, y: [0.45, 0.53], z: [0, 0.66] },
  { part: 'grille', face: 'front', thickness: 14, y: [0.2, 0.4], z: [0, 0.68] },
  { part: 'lamp', face: 'front', thickness: 18, y: [0.17, 0.3], z: [0.62, 0.9] },
  { part: 'bumper', face: 'front', thickness: 22, y: [0.015, 0.16], z: [0, 0.93] },
  { part: 'glass', face: 'side', thickness: 7, y: [0.55, 0.84], z: [0, 1], x: [0.22, 0.6] },
  { part: 'seam', face: 'side', thickness: 3, y: [0.1, 0.86], z: [0, 1], x: [0.18, 0.187] },
  { part: 'seam', face: 'side', thickness: 3, y: [0.1, 0.86], z: [0, 1], x: [0.635, 0.642] },
]

export function cabFeatures(profileId: string): CabFeature[] {
  return profileId.includes('volvo') ? VOLVO_FEATURES : GENERIC_FEATURES
}

/** Only the watertight body (used by tests and callers that do not need details). */
export function cabSolidGeometry(side: readonly Pt[], top: readonly Pt[], front: readonly Pt[] | null): THREE.BufferGeometry | null {
  return cabSolid({ side, top, front }, [])?.body ?? null
}

/**
 * Closed cab solid: the side, plan and front outlines are extruded along their view axes and
 * intersected with manifold-3d, so the result is watertight by construction. Features are thin
 * skins cut from a slightly inflated body, so they sit exactly on the surface.
 */
export function cabSolid(views: CabViews, features: readonly CabFeature[]): CabSolidResult | null {
  const api = manifoldApi()
  if (!api) return null
  const side = asRing(views.side)
  const topRing = asRing(views.top)
  if (!side || !topRing) return null
  const sideBox = ringBounds(views.side)
  const topBox = ringBounds(views.top)
  const x0 = Math.max(sideBox.x0, topBox.x0)
  const x1 = Math.min(sideBox.x1, topBox.x1)
  if (x1 - x0 < 80 || sideBox.y1 - sideBox.y0 < 80 || topBox.y1 - topBox.y0 < 80) return null
  // Where two views describe the same wall (front vs plan at the sides, front vs side at the roof,
  // plan vs side at nose and tail) their outlines run within millimetres of each other and the
  // intersection turns into a mottled patchwork. Let only one view own each wall.
  const frontRelaxed =
    views.front && views.front.length >= 3
      ? relax(frontProfile(views.front, topBox.y0, topBox.y1), { y: { lo: sideBox.y0, hi: sideBox.y1 } })
      : null
  const plan = convexPlan(views.top)
  const front = frontRelaxed ? asRing(frontRelaxed) : null
  const top = asRing(plan) ?? topRing
  // Nose and tail belong to the side view: carry the plan straight past them.
  const topEnds = extendEnds(plan, { lo: sideBox.x0, hi: sideBox.x1 })

  const origin = { x: x0, y: sideBox.y0, z: (topBox.y0 + topBox.y1) / 2 }
  const span = {
    x: [x0 - origin.x, x1 - origin.x] as const,
    y: [0, sideBox.y1 - origin.y] as const,
    z: [topBox.y0 - origin.z, topBox.y1 - origin.z] as const,
  }
  const pad = 400
  const { Manifold, CrossSection } = api
  const trash: { delete(): void }[] = []
  const keep = <T extends { delete(): void }>(obj: T): T => {
    trash.push(obj)
    return obj
  }

  const sideLocal = side.map(([x, y]) => [x - origin.x, y - origin.y] as [number, number])
  const topLocal = top.map(([x, lateral]) => [x - origin.x, -(lateral - origin.z)] as [number, number])
  const frontLocal = front
    ? front.map(([lateral, y]) => [-(lateral - origin.z), y - origin.y] as [number, number])
    : syntheticFront(span.z[0], span.z[1], span.y[1])

  const topEndsLocal = topEnds.map((ring) => ring.map((p) => [p.x - origin.x, -(p.y - origin.z)] as [number, number]))

  const section = (ring: [number, number][], grow: number, extra: [number, number][][] = []): Section => {
    let base = keep(new CrossSection([orient(ring)], 'Positive'))
    if (extra.length) base = keep(CrossSection.union([base, ...extra.map((part) => keep(new CrossSection([orient(part)], 'Positive')))]))
    return grow > 0 ? keep(base.offset(grow, 'Round', 2, 24)) : base
  }
  const bodyOf = (grow: number): Solid => {
    const sideSolid = keep(keep(section(sideLocal, grow).extrude(span.z[1] - span.z[0] + pad * 2)).translate([0, 0, span.z[0] - pad]))
    const topSolid = keep(keep(keep(section(topLocal, grow, topEndsLocal).extrude(span.y[1] + pad * 2)).translate([0, 0, -pad])).rotate([-90, 0, 0]))
    const frontSolid = keep(
      keep(keep(section(frontLocal, grow).extrude(span.x[1] - span.x[0] + pad * 2)).translate([0, 0, span.x[0] - pad])).rotate([0, 90, 0]),
    )
    return keep(Manifold.intersection([sideSolid, topSolid, frontSolid]))
  }

  try {
    let body = bodyOf(0)
    if (body.isEmpty() || body.status() !== 'NoError') return null
    const pieces = body.decompose()
    if (pieces.length > 1) {
      // Keep the cab, drop slivers that an odd outline left floating beside it.
      pieces.forEach((piece) => keep(piece))
      body = pieces.reduce((best, piece) => (piece.volume() > best.volume() ? piece : best))
    } else pieces.forEach((piece) => piece.delete())
    const box = body.boundingBox()
    const parts: CabPartGeometry[] = []
    const inflated = new Map<number, Solid>()
    for (const feature of features) {
      try {
        let outer = inflated.get(feature.thickness)
        if (!outer) {
          outer = bodyOf(feature.thickness)
          inflated.set(feature.thickness, outer)
        }
        const region = featureRegion(api, keep, feature, box, sideLocal)
        if (!region) continue
        const skin = keep(keep(outer.intersect(region)).subtract(body))
        if (skin.isEmpty() || skin.status() !== 'NoError') continue
        parts.push({ part: feature.part, geometry: toGeometry(skin, origin) })
      } catch {
        /* a failed detail never costs the body */
      }
    }
    // Long sliver triangles smear the interpolated normals into streaks; even them out.
    const display = keep(body.refineToLength(90))
    return { body: toGeometry(display.status() === 'NoError' ? display : body, origin), parts }
  } catch {
    return null
  } finally {
    for (let index = trash.length - 1; index >= 0; index--) {
      try {
        trash[index].delete()
      } catch {
        /* already released */
      }
    }
  }
}

function toGeometry(solid: Solid, origin: { x: number; y: number; z: number }): THREE.BufferGeometry {
  const mesh = solid.getMesh()
  const stride = mesh.numProp
  const positions = new Float32Array(mesh.numVert * 3)
  for (let index = 0; index < mesh.numVert; index++) {
    positions[index * 3] = mesh.vertProperties[index * stride] + origin.x
    positions[index * 3 + 1] = mesh.vertProperties[index * stride + 1] + origin.y
    positions[index * 3 + 2] = mesh.vertProperties[index * stride + 2] + origin.z
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.triVerts), 1))
  geometry.computeVertexNormals()
  return geometry
}

/** Box that selects one patch of the body surface. Coordinates are local (origin at nose, floor, centre). */
function featureRegion(
  api: ManifoldToplevel,
  keep: <T extends { delete(): void }>(obj: T) => T,
  feature: CabFeature,
  box: { min: readonly number[]; max: readonly number[] },
  side: [number, number][],
): Solid | null {
  const height = box.max[1] - box.min[1]
  const length = box.max[0] - box.min[0]
  const zc = (box.min[2] + box.max[2]) / 2
  const half = (box.max[2] - box.min[2]) / 2
  const ya = box.min[1] + height * feature.y[0]
  const yb = box.min[1] + height * feature.y[1]
  if (yb - ya < 5) return null
  const cube = (xa: number, xb: number, za: number, zb: number) =>
    keep(keep(api.Manifold.cube([xb - xa, yb - ya, zb - za])).translate([xa, ya, za]))
  const bands: [number, number][] = []
  const za = half * feature.z[0]
  const zb = half * feature.z[1]
  if (feature.face === 'front') {
    let lead = -Infinity
    for (let step = 0; step <= 12; step++) {
      const x = leadingX(side, ya + ((yb - ya) * step) / 12)
      if (x !== null && x > lead) lead = x
    }
    if (!Number.isFinite(lead)) return null
    const xa = box.min[0] - 60
    const xb = lead + 40 + feature.thickness
    if (za <= 0) bands.push([zc - zb, zc + zb])
    else bands.push([zc - zb, zc - za], [zc + za, zc + zb])
    const parts = bands.map(([p, q]) => cube(xa, xb, p, q))
    return parts.length === 1 ? parts[0] : keep(api.Manifold.union(parts))
  }
  const along = feature.x ?? [0.2, 0.6]
  const xa = box.min[0] + length * along[0]
  const xb = box.min[0] + length * along[1]
  const depth = 260
  const parts = [cube(xa, xb, box.min[2] - 60, box.min[2] + depth), cube(xa, xb, box.max[2] - depth, box.max[2] + 60)]
  return keep(api.Manifold.union(parts))
}

/**
 * Push the parts of a ring that come within `band` of limits another view already sets clearly
 * outside them. Each coordinate is remapped by a smooth monotone function, so the ring stays
 * simple and smooth, and walls owned by the other view are no longer contested.
 */
function relax(ring: readonly Pt[], limits: { x?: { lo: number; hi: number }; y?: { lo: number; hi: number } }, band = 40, push = 80): Pt[] {
  const remap = (v: number, lim: { lo: number; hi: number } | undefined) => {
    if (!lim) return v
    const ease = (d: number) => {
      const t = Math.min(1, Math.max(0, d / band))
      return t * t * (3 - 2 * t)
    }
    return v + push * ease(v - (lim.hi - band)) - push * ease(lim.lo + band - v)
  }
  return ring.map((p) => ({ x: remap(p.x, limits.x), y: remap(p.y, limits.y) }))
}

/**
 * Rectangles that continue a plan outline straight past the given x limits (with its lateral
 * extent taken `band` inside them), so the other view alone shapes those ends.
 */
function extendEnds(ring: readonly Pt[], limits: { lo: number; hi: number }, band = 40, push = 80): Pt[][] {
  const box = ringBounds(ring)
  const interval = (x: number) => {
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]
      const q = ring[(i + 1) % ring.length]
      if ((x < p.x && x < q.x) || (x > p.x && x > q.x) || p.x === q.x) continue
      const y = p.y + ((x - p.x) / (q.x - p.x)) * (q.y - p.y)
      lo = Math.min(lo, y)
      hi = Math.max(hi, y)
    }
    return lo < hi ? { lo, hi } : null
  }
  const rect = (x0: number, x1: number, y0: number, y1: number): Pt[] => [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]
  const out: Pt[][] = []
  if (box.x1 > limits.hi - band) {
    const at = interval(limits.hi - band)
    if (at) out.push(rect(limits.hi - band - 2, Math.max(box.x1, limits.hi) + push, at.lo, at.hi))
  }
  if (box.x0 < limits.lo + band) {
    const at = interval(limits.lo + band)
    if (at) out.push(rect(Math.min(box.x0, limits.lo) - push, limits.lo + band + 2, at.lo, at.hi))
  }
  return out
}

/**
 * Symmetric front section rebuilt row by row. A row that is not clearly narrower than the plan
 * width is opened past it, so the plan alone owns the side walls; the front view then only rounds
 * the roof corners and tapers the lower cab. Rows are smoothed so transitions become ramps.
 */
function frontProfile(front: readonly Pt[], lateral0: number, lateral1: number, band = 60, push = 100): Pt[] {
  const box = ringBounds(front)
  const center = (lateral0 + lateral1) / 2
  const limit = (lateral1 - lateral0) / 2
  const step = 10
  const rows = Math.max(4, Math.ceil((box.y1 - box.y0) / step))
  const at: number[] = []
  const half: number[] = []
  for (let k = 0; k <= rows; k++) {
    const y = box.y0 + ((box.y1 - box.y0) * Math.min(Math.max(k, 0.05), rows - 0.05)) / rows
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < front.length; i++) {
      const p = front[i]
      const q = front[(i + 1) % front.length]
      if ((y < p.y && y < q.y) || (y > p.y && y > q.y) || p.y === q.y) continue
      const x = p.x + ((y - p.y) / (q.y - p.y)) * (q.x - p.x)
      lo = Math.min(lo, x)
      hi = Math.max(hi, x)
    }
    if (lo > hi) continue
    const h = Math.max(hi - center, center - lo)
    at.push(y)
    half.push(h < limit - band ? h : limit + push)
  }
  if (at.length < 4) return front.slice()
  for (let round = 0; round < 4; round++) {
    const copy = half.slice()
    for (let k = 1; k < half.length - 1; k++) half[k] = (copy[k - 1] + 2 * copy[k] + copy[k + 1]) / 4
  }
  const out: Pt[] = []
  for (let k = 0; k < at.length; k++) out.push({ x: center + half[k], y: at[k] })
  for (let k = at.length - 1; k >= 0; k--) out.push({ x: center - half[k], y: at[k] })
  return simplifyRing(smoothRing(resampleRing(simplifyRing(out, 1), 8), 6), 2)
}

/**
 * A cab seen from above is convex; the traced plan still carries handle and mirror stubs and small
 * steps that would stripe the side walls. Use the hull unless the outline is clearly not convex.
 */
function convexPlan(ring: readonly Pt[]): Pt[] {
  const points = ring.slice().sort((a, b) => a.x - b.x || a.y - b.y)
  if (points.length < 4) return ring.slice()
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Pt[] = []
  for (const p of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Pt[] = []
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)]
  const ratio = Math.abs(signedArea(ring)) / (Math.abs(signedArea(hull)) || 1)
  return ratio > 0.93 ? hull : ring.slice()
}

/** Rounded roof corners and slightly rounded sills when the drawing has no front view. */
function syntheticFront(z0: number, z1: number, height: number): [number, number][] {
  const width = z1 - z0
  const roof = Math.min(width, height) * 0.1
  const sill = Math.min(width, height) * 0.02
  const ring: [number, number][] = []
  const arc = (cx: number, cy: number, r: number, from: number, to: number) => {
    for (let step = 0; step <= 8; step++) {
      const angle = from + ((to - from) * step) / 8
      ring.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r])
    }
  }
  // Lateral is negated in the front section, so walk it with -z.
  const l0 = -z1
  const l1 = -z0
  arc(l1 - sill, sill, sill, -Math.PI / 2, 0)
  arc(l1 - roof, height - roof, roof, 0, Math.PI / 2)
  arc(l0 + roof, height - roof, roof, Math.PI / 2, Math.PI)
  arc(l0 + sill, sill, sill, Math.PI, Math.PI * 1.5)
  return ring
}

/**
 * Place the front view in side/top coordinates. The front view is drawn in its own spot; when it
 * shares the side view's height datum (common in BEP drawings) it is used 1:1, otherwise its roof
 * is aligned with the side roof. Lateral scale stays 1:1 unless the widths clearly disagree.
 */
export function mapFrontView(front: readonly Pt[], side: readonly Pt[], top: readonly Pt[], frames?: { side?: BBox; front?: BBox }): Pt[] {
  const fb = ringBounds(front)
  const sb = ringBounds(side)
  const tb = ringBounds(top)
  const frontWidth = fb.x1 - fb.x0 || 1
  const topWidth = tb.y1 - tb.y0 || 1
  const ratio = topWidth / frontWidth
  const sx = ratio > 0.85 && ratio < 1.18 ? 1 : ratio
  const fcx = (fb.x0 + fb.x1) / 2
  const tcy = (tb.y0 + tb.y1) / 2
  const sharedDatum =
    !!frames?.side && !!frames.front && (Math.abs(frames.side.y1 - frames.front.y1) < 40 || Math.abs(frames.side.y0 - frames.front.y0) < 40)
  const frontHeight = fb.y1 - fb.y0 || 1
  const sideHeight = sb.y1 - sb.y0 || 1
  const hRatio = sideHeight / frontHeight
  const sy = sharedDatum || (hRatio > 0.85 && hRatio < 1.18) ? 1 : hRatio
  const dy = sharedDatum ? 0 : sb.y1 - fb.y1 * sy
  return front.map((p) => ({ x: tcy + (p.x - fcx) * sx, y: p.y * sy + dy }))
}

export interface CabSolid {
  mesh: THREE.Mesh
  parts: CabPartGeometry[]
  side: Pt[]
  top: Pt[]
  originX: number
  ground: number
  centerY: number
  liftY: number
}

/** Map a ring from the box it was traced in to the (possibly edited) box. */
function remap(points: readonly Pt[], from: BBox, to: BBox): Pt[] {
  const sx = (to.x1 - to.x0) / (from.x1 - from.x0 || 1)
  const sy = (to.y1 - to.y0) / (from.y1 - from.y0 || 1)
  return points.map((p) => ({ x: to.x0 + (p.x - from.x0) * sx, y: to.y0 + (p.y - from.y0) * sy }))
}

/** Views of the cab in drawing coordinates, following any box edits made in the review. */
export function cabViews(cab: CabModel): CabViews | null {
  const sil = cab.silhouettes
  const frame = sil?.frame
  const drawnSide = cab.profile && cab.profile.length >= 3 ? cab.profile : null
  const side = drawnSide ?? (sil?.side && sil.side.length >= 4 ? remap(sil.side, frame?.side ?? ringBounds(sil.side), cab.side) : null)
  const top = sil?.top && sil.top.length >= 4 ? remap(sil.top, frame?.top ?? ringBounds(sil.top), cab.top) : null
  if (!side || !top) return null
  const front = sil?.front && sil.front.length >= 4 ? mapFrontView(sil.front, side, top, frame ? { side: cab.side, front: frame.front } : undefined) : null
  return { side, top, front }
}

export function tracedCab(
  cab: CabModel,
  world: { originX: number; ground: number; centerY: number; lift: (drawingX: number) => number },
  features: readonly CabFeature[] = [],
): CabSolid | null {
  const views = cabViews(cab)
  if (!views) return null
  const result = cabSolid(views, features)
  if (!result) return null
  const liftY = world.lift((cab.side.x0 + cab.side.x1) / 2)
  const place = (geometry: THREE.BufferGeometry) => {
    geometry.translate(-world.originX, -world.ground + liftY, -world.centerY)
    return geometry
  }
  const body = place(result.body)
  // Split normals at sharp creases so the intersection edges read crisp and curved panels stay smooth.
  const display = toCreasedNormals(body, THREE.MathUtils.degToRad(38))
  body.dispose()
  display.computeBoundingBox()
  const mesh = new THREE.Mesh(display, cabPaint)
  mesh.name = 'cab-shell'
  mesh.userData.role = 'cab-shell'
  mesh.castShadow = true
  mesh.receiveShadow = true
  const parts = result.parts.map((part) => {
    const creased = toCreasedNormals(place(part.geometry), THREE.MathUtils.degToRad(38))
    part.geometry.dispose()
    return { part: part.part, geometry: creased }
  })
  return {
    mesh,
    parts,
    side: [...views.side],
    top: [...views.top],
    originX: world.originX,
    ground: world.ground,
    centerY: world.centerY,
    liftY,
  }
}

function orient(ring: [number, number][]): [number, number][] {
  let area = 0
  for (let index = 0; index < ring.length; index++) {
    const current = ring[index]
    const next = ring[(index + 1) % ring.length]
    area += current[0] * next[1] - next[0] * current[1]
  }
  return area < 0 ? ring.slice().reverse() : ring
}

function asRing(points: readonly Pt[]): [number, number][] | null {
  const cleaned: [number, number][] = []
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
    const last = cleaned[cleaned.length - 1]
    if (last && Math.hypot(last[0] - point.x, last[1] - point.y) < 0.4) continue
    cleaned.push([point.x, point.y])
  }
  if (cleaned.length > 2) {
    const first = cleaned[0]
    const last = cleaned[cleaned.length - 1]
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.4) cleaned.pop()
  }
  return cleaned.length >= 3 ? cleaned : null
}

function leadingX(ring: readonly [number, number][], y: number): number | null {
  let best: number | null = null
  for (let index = 0; index < ring.length; index++) {
    const a = ring[index]
    const b = ring[(index + 1) % ring.length]
    if (y < Math.min(a[1], b[1]) || y > Math.max(a[1], b[1])) continue
    const x = Math.abs(a[1] - b[1]) < 1e-9 ? Math.min(a[0], b[0]) : a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0])
    if (best === null || x < best) best = x
  }
  return best
}

/**
 * Topology check. Vertices are welded by position, so split-normal display meshes are judged by
 * their geometry. Closed means every edge has exactly two faces; oriented means those two faces
 * use the edge in opposite directions; a positive volume means the normals point outward.
 */
export function solidReport(geometry: THREE.BufferGeometry): {
  boundary: number
  nonManifold: number
  misoriented: number
  shells: number
  volume: number
} {
  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()
  const triangles = (index ? index.count : position.count) / 3
  const corner = (face: number, k: number) => (index ? index.getX(face * 3 + k) : face * 3 + k)
  const weld = new Map<string, number>()
  const ids = new Int32Array(position.count)
  for (let vertex = 0; vertex < position.count; vertex++) {
    const key = `${Math.round(position.getX(vertex) * 100)},${Math.round(position.getY(vertex) * 100)},${Math.round(position.getZ(vertex) * 100)}`
    let id = weld.get(key)
    if (id === undefined) {
      id = weld.size
      weld.set(key, id)
    }
    ids[vertex] = id
  }
  const directed = new Map<string, number>()
  const edgeFaces = new Map<string, number[]>()
  const parent = Array.from({ length: triangles }, (_, face) => face)
  const find = (face: number): number => {
    while (parent[face] !== face) {
      parent[face] = parent[parent[face]]
      face = parent[face]
    }
    return face
  }
  let volume = 0
  for (let face = 0; face < triangles; face++) {
    const v = [corner(face, 0), corner(face, 1), corner(face, 2)]
    const [ax, ay, az] = [position.getX(v[0]), position.getY(v[0]), position.getZ(v[0])]
    const [bx, by, bz] = [position.getX(v[1]), position.getY(v[1]), position.getZ(v[1])]
    const [cx, cy, cz] = [position.getX(v[2]), position.getY(v[2]), position.getZ(v[2])]
    volume += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
    const w = v.map((vertex) => ids[vertex])
    for (let k = 0; k < 3; k++) {
      const u = w[k]
      const t = w[(k + 1) % 3]
      if (u === t) continue
      const dirKey = `${u}>${t}`
      directed.set(dirKey, (directed.get(dirKey) ?? 0) + 1)
      const key = u < t ? `${u}:${t}` : `${t}:${u}`
      const faces = edgeFaces.get(key)
      if (faces) {
        const ra = find(faces[0])
        const rb = find(face)
        if (ra !== rb) parent[rb] = ra
        faces.push(face)
      } else edgeFaces.set(key, [face])
    }
  }
  let boundary = 0
  let nonManifold = 0
  let misoriented = 0
  for (const [key, faces] of edgeFaces) {
    if (faces.length === 1) boundary++
    else if (faces.length > 2) nonManifold++
    else {
      const [u, t] = key.split(':')
      if (directed.get(`${u}>${t}`) !== 1 || directed.get(`${t}>${u}`) !== 1) misoriented++
    }
  }
  const shells = new Set<number>()
  for (let face = 0; face < triangles; face++) shells.add(find(face))
  return { boundary, nonManifold, misoriented, shells: shells.size, volume: volume / 6 }
}

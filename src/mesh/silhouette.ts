import * as THREE from 'three'
import type { Pt } from '../lib/geom'
import type { CabModel } from '../model/types'
import { manifoldApi } from './manifold'
import { cabPaint } from './materials'

/** Outer envelope of a point cloud. X is the station axis, Y the other drawing axis. */
export function envelope(points: readonly Pt[], bins = 48): Pt[] | null {
  if (points.length < 8) return null
  let minX = Infinity
  let maxX = -Infinity
  for (const point of points) {
    if (point.x < minX) minX = point.x
    if (point.x > maxX) maxX = point.x
  }
  const span = maxX - minX
  if (span < 40) return null
  const top: (number | null)[] = new Array(bins).fill(null)
  const bot: (number | null)[] = new Array(bins).fill(null)
  for (const point of points) {
    let index = Math.floor(((point.x - minX) / span) * (bins - 1))
    if (index < 0) index = 0
    if (index >= bins) index = bins - 1
    if (top[index] === null || point.y > (top[index] as number)) top[index] = point.y
    if (bot[index] === null || point.y < (bot[index] as number)) bot[index] = point.y
  }
  const filledTop = fillGaps(top)
  const filledBot = fillGaps(bot)
  if (!filledTop || !filledBot) return null
  for (let index = 0; index < bins; index++) {
    if (filledTop[index] < filledBot[index]) {
      const swap = filledTop[index]
      filledTop[index] = filledBot[index]
      filledBot[index] = swap
    }
  }
  despike(filledTop)
  despike(filledBot)
  const upper: Pt[] = []
  const lower: Pt[] = []
  for (let index = 0; index < bins; index++) {
    const x = minX + (span * index) / Math.max(1, bins - 1)
    upper.push({ x, y: filledTop[index] })
    lower.push({ x, y: filledBot[index] })
  }
  const ring = [...simplifyChain(upper, 8), ...simplifyChain(lower, 8).reverse()]
  return ring.length >= 4 ? ring : null
}

function fillGaps(values: (number | null)[]): number[] | null {
  if (!values.some((value) => value !== null)) return null
  const out = values.slice()
  let index = 0
  while (index < out.length) {
    if (out[index] !== null) {
      index++
      continue
    }
    let end = index
    while (end < out.length && out[end] === null) end++
    const left = index > 0 ? (out[index - 1] as number) : null
    const right = end < out.length ? (out[end] as number) : null
    for (let cursor = index; cursor < end; cursor++) {
      if (left !== null && right !== null) {
        const t = (cursor - (index - 1)) / (end - (index - 1))
        out[cursor] = left + (right - left) * t
      } else {
        out[cursor] = (left ?? right) as number
      }
    }
    index = end
  }
  return out as number[]
}

/** Drop a one-bin needle. A real slope stays between its neighbours, so it is kept. */
function despike(values: number[]) {
  const next = values.slice()
  for (let index = 1; index < values.length - 1; index++) {
    const peak = Math.max(values[index - 1], values[index + 1])
    const valley = Math.min(values[index - 1], values[index + 1])
    if (values[index] > peak + 80) next[index] = peak
    else if (values[index] < valley - 80) next[index] = valley
  }
  for (let index = 0; index < values.length; index++) values[index] = next[index]
}

function simplifyChain(chain: Pt[], epsilon: number): Pt[] {
  if (chain.length < 3) return chain
  let farthest = 0
  let distance = 0
  const start = chain[0]
  const end = chain[chain.length - 1]
  const span = Math.hypot(end.x - start.x, end.y - start.y) || 1
  for (let index = 1; index < chain.length - 1; index++) {
    const point = chain[index]
    const t = ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) / (span * span)
    const px = start.x + (end.x - start.x) * t
    const py = start.y + (end.y - start.y) * t
    const d = Math.hypot(point.x - px, point.y - py)
    if (d > distance) {
      distance = d
      farthest = index
    }
  }
  if (distance <= epsilon) return [start, end]
  const left = simplifyChain(chain.slice(0, farthest + 1), epsilon)
  const right = simplifyChain(chain.slice(farthest), epsilon)
  return [...left.slice(0, -1), ...right]
}

export interface CabSection {
  x: number
  /** Closed loop. `x` is lateral drawing Y, `y` is height drawing Z. */
  loop: Pt[]
}

/** Cross-sections of the cab: front silhouette clipped by the side and top envelopes. */
export function cabSections(side: readonly Pt[], top: readonly Pt[], front: readonly Pt[] | null, count = 36): CabSection[] {
  if (side.length < 4 || top.length < 4) return []
  const sideBox = bounds(side)
  const topBox = bounds(top)
  const x0 = Math.max(sideBox.x0, topBox.x0)
  const x1 = Math.min(sideBox.x1, topBox.x1)
  if (x1 - x0 < 80) return []
  const mapped = mapFront(front, topBox, sideBox)
  const out: CabSection[] = []
  for (let i = 0; i <= count; i++) {
    const x = x0 + ((x1 - x0) * i) / count
    const yCuts = cuts(top, x)
    const zCuts = cuts(side, x)
    if (yCuts.length < 2 || zCuts.length < 2) continue
    const y0 = Math.min(...yCuts)
    const y1 = Math.max(...yCuts)
    const z0 = Math.min(...zCuts)
    const z1 = Math.max(...zCuts)
    if (y1 - y0 < 20 || z1 - z0 < 20) continue
    const raw = mapped ? clipRect(mapped, y0, z0, y1, z1) : rect(y0, z0, y1, z1)
    const loop = resample(raw.length >= 3 ? raw : rect(y0, z0, y1, z1), 28)
    if (loop.length >= 8) out.push({ x, loop })
  }
  return out
}

export interface CabSolid {
  mesh: THREE.Mesh
  side: Pt[]
  top: Pt[]
  originX: number
  ground: number
  centerY: number
  liftY: number
}

/**
 * Closed cab solid: side, plan and front outlines are extruded and intersected.
 * Coordinates are drawing millimetres: X longitudinal, Y height, Z lateral.
 */
export function cabSolidGeometry(side: readonly Pt[], top: readonly Pt[], front: readonly Pt[] | null): THREE.BufferGeometry | null {
  const api = manifoldApi()
  if (!api) return null
  const sideRing = asRing(side)
  const topRing = asRing(top)
  if (!sideRing || !topRing) return null
  const sideBox = bounds(side)
  const topBox = bounds(top)
  const x0 = Math.max(sideBox.x0, topBox.x0)
  const x1 = Math.min(sideBox.x1, topBox.x1)
  const y0 = sideBox.y0
  const y1 = sideBox.y1
  const z0 = topBox.y0
  const z1 = topBox.y1
  if (x1 - x0 < 80 || y1 - y0 < 80 || z1 - z0 < 80) return null

  const ox = x0
  const oy = y0
  const oz = (z0 + z1) / 2
  const pad = 500
  const { Manifold, CrossSection } = api
  const trash: { delete(): void }[] = []
  const keep = <T extends { delete(): void }>(obj: T): T => {
    if (!trash.includes(obj)) trash.push(obj)
    return obj
  }
  try {
    const sideFlat = sideRing.map(([x, y]) => [x - ox, y - oy] as [number, number])
    const sideCs = keep(new CrossSection([orient(sideFlat)]))
    const sideSolid = keep(keep(sideCs.extrude(z1 - z0 + pad * 2)).translate([0, 0, z0 - oz - pad]))

    const topFlat = topRing.map(([x, lateral]) => [x - ox, -(lateral - oz)] as [number, number])
    const topCs = keep(new CrossSection([orient(topFlat)]))
    const topExtruded = keep(keep(topCs.extrude(y1 - y0 + pad * 2)).translate([0, 0, -pad]))
    const topSolid = keep(topExtruded.rotate(-90, 0, 0))

    const solids = [sideSolid, topSolid]
    const mapped = mapFront(front, { y0: z0, y1: z1 }, { y0, y1 })
    if (mapped && mapped.length >= 3) {
      const frontFlat = mapped.map((point) => [-(point.x - oz), point.y - oy] as [number, number])
      const frontCs = keep(new CrossSection([orient(frontFlat)]))
      const frontExtruded = keep(keep(frontCs.extrude(x1 - x0 + pad * 2)).translate([0, 0, -pad]))
      solids.push(keep(frontExtruded.rotate(0, 90, 0)))
    }

    const result = keep(Manifold.intersection(solids))
    if (result.isEmpty() || result.status() !== 'NoError') return null
    const mesh = result.getMesh()
    const stride = mesh.numProp
    const count = mesh.numVert
    const positions = new Float32Array(count * 3)
    for (let index = 0; index < count; index++) {
      positions[index * 3] = mesh.vertProperties[index * stride] + ox
      positions[index * 3 + 1] = mesh.vertProperties[index * stride + 1] + oy
      positions[index * 3 + 2] = mesh.vertProperties[index * stride + 2] + oz
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.triVerts), 1))
    geometry.computeVertexNormals()
    return geometry
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

export function tracedCab(
  cab: CabModel,
  world: { originX: number; ground: number; centerY: number; lift: (drawingX: number) => number },
): CabSolid | null {
  const side = cab.silhouettes?.side
  const top = cab.silhouettes?.top
  if (!side || !top || side.length < 4 || top.length < 4) return null
  const fittedSide = fit(side, cab.side)
  const fittedTop = fit(top, cab.top)
  const geometry = cabSolidGeometry(fittedSide, fittedTop, cab.silhouettes?.front ?? null)
  if (!geometry) return null
  const liftY = world.lift((cab.side.x0 + cab.side.x1) / 2)
  const position = geometry.getAttribute('position') as THREE.BufferAttribute
  for (let index = 0; index < position.count; index++) {
    position.setXYZ(
      index,
      position.getX(index) - world.originX,
      position.getY(index) - world.ground + liftY,
      position.getZ(index) - world.centerY,
    )
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  const mesh = new THREE.Mesh(geometry, cabPaint)
  mesh.name = 'cab-shell'
  mesh.userData.role = 'cab-shell'
  mesh.castShadow = true
  mesh.receiveShadow = true
  return { mesh, side: fittedSide, top: fittedTop, originX: world.originX, ground: world.ground, centerY: world.centerY, liftY }
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

function mapFront(front: readonly Pt[] | null, topBox: { y0: number; y1: number }, sideBox: { y0: number; y1: number }): Pt[] | null {
  if (!front || front.length < 4) return null
  const box = bounds(front)
  const sx = box.x1 - box.x0 || 1
  const sy = box.y1 - box.y0 || 1
  return front.map((point) => ({
    x: topBox.y0 + ((point.x - box.x0) / sx) * (topBox.y1 - topBox.y0),
    y: sideBox.y0 + ((point.y - box.y0) / sy) * (sideBox.y1 - sideBox.y0),
  }))
}

function fit(points: Pt[], to: { x0: number; y0: number; x1: number; y1: number }): Pt[] {
  const from = bounds(points)
  const sx = from.x1 - from.x0 || 1
  const sy = from.y1 - from.y0 || 1
  return points.map((point) => ({
    x: to.x0 + ((point.x - from.x0) / sx) * (to.x1 - to.x0),
    y: to.y0 + ((point.y - from.y0) / sy) * (to.y1 - to.y0),
  }))
}

function bounds(points: readonly Pt[]) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const point of points) {
    if (point.x < x0) x0 = point.x
    if (point.y < y0) y0 = point.y
    if (point.x > x1) x1 = point.x
    if (point.y > y1) y1 = point.y
  }
  return { x0, y0, x1, y1 }
}

function cuts(points: readonly Pt[], x: number): number[] {
  const ys: number[] = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const minX = Math.min(a.x, b.x)
    const maxX = Math.max(a.x, b.x)
    if (x < minX - 1e-6 || x > maxX + 1e-6) continue
    if (Math.abs(a.x - b.x) < 1e-6) {
      ys.push(a.y, b.y)
      continue
    }
    const t = (x - a.x) / (b.x - a.x)
    if (t < -1e-4 || t > 1 + 1e-4) continue
    ys.push(a.y + t * (b.y - a.y))
  }
  return ys
}

function rect(x0: number, y0: number, x1: number, y1: number): Pt[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]
}

function clipRect(points: Pt[], x0: number, y0: number, x1: number, y1: number): Pt[] {
  let poly = points
  poly = clip(poly, (point) => point.x >= x0 - 1e-6, (a, b) => hitX(a, b, x0))
  poly = clip(poly, (point) => point.x <= x1 + 1e-6, (a, b) => hitX(a, b, x1))
  poly = clip(poly, (point) => point.y >= y0 - 1e-6, (a, b) => hitY(a, b, y0))
  poly = clip(poly, (point) => point.y <= y1 + 1e-6, (a, b) => hitY(a, b, y1))
  return poly
}

function clip(points: Pt[], inside: (point: Pt) => boolean, cross: (a: Pt, b: Pt) => Pt): Pt[] {
  if (points.length < 3) return []
  const out: Pt[] = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const inA = inside(a)
    const inB = inside(b)
    if (inA && inB) out.push(b)
    else if (inA && !inB) out.push(cross(a, b))
    else if (!inA && inB) out.push(cross(a, b), b)
  }
  return out
}

function hitX(a: Pt, b: Pt, x: number): Pt {
  const t = (x - a.x) / (b.x - a.x || 1e-9)
  return { x, y: a.y + t * (b.y - a.y) }
}

function hitY(a: Pt, b: Pt, y: number): Pt {
  const t = (y - a.y) / (b.y - a.y || 1e-9)
  return { x: a.x + t * (b.x - a.x), y }
}

function resample(points: Pt[], count: number): Pt[] {
  if (points.length < 3) return []
  let start = 0
  for (let i = 1; i < points.length; i++) {
    if (points[i].x > points[start].x + 0.5 || (Math.abs(points[i].x - points[start].x) <= 0.5 && points[i].y > points[start].y)) start = i
  }
  const ring = [...points.slice(start), ...points.slice(0, start)]
  const lengths: number[] = []
  let total = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    lengths.push(len)
    total += len
  }
  if (total < 1) return []
  const out: Pt[] = []
  for (let k = 0; k < count; k++) {
    let dist = (total * k) / count
    for (let i = 0; i < ring.length; i++) {
      if (dist <= lengths[i] || i === ring.length - 1) {
        const t = lengths[i] ? Math.max(0, Math.min(1, dist / lengths[i])) : 0
        const a = ring[i]
        const b = ring[(i + 1) % ring.length]
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
        break
      }
      dist -= lengths[i]
    }
  }
  return out
}

/** Every welded edge is shared by two triangles, and the winding faces outward. */
export function solidReport(geometry: THREE.BufferGeometry): { boundary: number; nonManifold: number; shells: number; volume: number } {
  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()
  if (!index) return { boundary: -1, nonManifold: -1, shells: 0, volume: 0 }
  const idOf = (vertex: number) => vertex
  const edgeCount = new Map<string, number>()
  const edgeFaces = new Map<string, number[]>()
  const triangles = index.count / 3
  const parent = Array.from({ length: triangles }, (_, face) => face)
  const find = (face: number): number => {
    let root = face
    while (parent[root] !== root) root = parent[root]
    let cursor = face
    while (parent[cursor] !== root) {
      const next = parent[cursor]
      parent[cursor] = root
      cursor = next
    }
    return root
  }
  const join = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }
  let volume = 0
  for (let face = 0; face < triangles; face++) {
    const a = idOf(index.getX(face * 3))
    const b = idOf(index.getX(face * 3 + 1))
    const c = idOf(index.getX(face * 3 + 2))
    const ax = position.getX(index.getX(face * 3))
    const ay = position.getY(index.getX(face * 3))
    const az = position.getZ(index.getX(face * 3))
    const bx = position.getX(index.getX(face * 3 + 1))
    const by = position.getY(index.getX(face * 3 + 1))
    const bz = position.getZ(index.getX(face * 3 + 1))
    const cx = position.getX(index.getX(face * 3 + 2))
    const cy = position.getY(index.getX(face * 3 + 2))
    const cz = position.getZ(index.getX(face * 3 + 2))
    volume += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      if (u === v) continue
      const key = u < v ? `${u}:${v}` : `${v}:${u}`
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1)
      const faces = edgeFaces.get(key)
      if (faces) {
        join(faces[0], face)
        faces.push(face)
      } else edgeFaces.set(key, [face])
    }
  }
  let boundary = 0
  let nonManifold = 0
  for (const count of edgeCount.values()) {
    if (count === 2) continue
    if (count === 1) boundary++
    else nonManifold++
  }
  const shells = new Set<number>()
  for (let face = 0; face < triangles; face++) shells.add(find(face))
  return { boundary, nonManifold, shells: shells.size, volume: volume / 6 }
}

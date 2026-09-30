import * as THREE from 'three'
import type { Pt } from '../lib/geom'
import { normalizeRing } from '../view/outline'

export type ProfileUse = 'revolve' | 'extrude' | 'typed'

/** Tanks follow the side profile by revolution. Boxes, cab and mudguards extrude it. */
export function profileShape(kind: string): ProfileUse {
  if (kind === 'fuel' || kind === 'adblue' || kind === 'air' || kind === 'exhaust') return 'revolve'
  if (kind === 'battery' || kind === 'toolbox' || kind === 'case' || kind === 'shield' || kind === 'skirt' || kind === 'steps' || kind === 'bracket') return 'extrude'
  return 'typed'
}

export interface ProfileStation {
  x: number
  z0: number
  z1: number
}

/** Vertical cuts through a side-view ring. X is longitudinal, Z is the drawing Y of that view. */
export function profileStations(points: readonly Pt[], count = 18): ProfileStation[] {
  const ring = normalizeRing(points)
  if (ring.length < 3) return []
  const min = Math.min(...ring.map((point) => point.x))
  const max = Math.max(...ring.map((point) => point.x))
  if (max - min < 1) return []
  const xs = new Set<number>()
  for (let i = 0; i <= count; i++) xs.add(min + ((max - min) * i) / count)
  for (const point of ring) xs.add(point.x)
  const out: ProfileStation[] = []
  for (const x of [...xs].sort((a, b) => a - b)) {
    const zs = cutsAt(ring, x)
    if (zs.length < 2) continue
    const z0 = Math.min(...zs)
    const z1 = Math.max(...zs)
    const prev = out[out.length - 1]
    if (prev && Math.abs(prev.x - x) < 0.05 && Math.abs(prev.z0 - z0) < 0.05 && Math.abs(prev.z1 - z1) < 0.05) continue
    out.push({ x, z0, z1 })
  }
  return out
}

function cutsAt(points: readonly Pt[], x: number): number[] {
  const zs: number[] = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const minX = Math.min(a.x, b.x)
    const maxX = Math.max(a.x, b.x)
    if (x < minX - 1e-6 || x > maxX + 1e-6) continue
    if (Math.abs(a.x - b.x) < 1e-6) {
      zs.push(a.y, b.y)
      continue
    }
    const t = (x - a.x) / (b.x - a.x)
    if (t < -1e-4 || t > 1 + 1e-4) continue
    zs.push(a.y + t * (b.y - a.y))
  }
  return zs
}

/** Side profile spun around its own centreline. `lateral` stretches the section to the plan width. */
export function revolveProfile(
  points: readonly Pt[],
  originX: number,
  ground: number,
  yCenter: number,
  lateral: number,
  material: THREE.Material,
): THREE.Mesh | null {
  const stations = profileStations(points, 20)
  if (stations.length < 2) return null
  const segs = 18
  const rings = stations.map((station) => {
    const rz = Math.max(1, (station.z1 - station.z0) / 2)
    const ry = Math.max(1, rz * lateral)
    const zc = (station.z0 + station.z1) / 2
    const ring: [number, number, number][] = []
    for (let i = 0; i < segs; i++) {
      const angle = (i / segs) * Math.PI * 2
      ring.push([station.x - originX, zc - ground + Math.cos(angle) * rz, yCenter + Math.sin(angle) * ry])
    }
    return ring
  })
  return meshFromRings(rings, material, 'revolve')
}

/**
 * Extrude a side-view ring (drawing X/Z) along drawing Y from y0 to y1.
 * Three.js axes are (X, Z, Y).
 */
export function extrudeProfile(
  points: readonly Pt[],
  originX: number,
  ground: number,
  y0: number,
  y1: number,
  centerY: number,
  material: THREE.Material,
): THREE.Mesh | null {
  const ring = normalizeRing(points)
  if (ring.length < 3) return null
  const depth = Math.abs(y1 - y0)
  if (depth < 2) return null
  try {
    const shape = new THREE.Shape()
    ring.forEach((point, index) => {
      const x = point.x - originX
      const y = point.y - ground
      if (index === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    })
    shape.closePath()
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 })
    geometry.translate(0, 0, Math.min(y0, y1) - centerY)
    geometry.computeVertexNormals()
    const mesh = new THREE.Mesh(geometry, material)
    mesh.userData.profile = 'extrude'
    return mesh
  } catch {
    return null
  }
}

/** Extrude a plan ring (drawing X/Y) upward by `height`. */
export function extrudePlan(
  points: readonly Pt[],
  originX: number,
  centerY: number,
  z0: number,
  height: number,
  ground: number,
  material: THREE.Material,
): THREE.Mesh | null {
  const ring = normalizeRing(points)
  if (ring.length < 3 || height < 2) return null
  try {
    const shape = new THREE.Shape()
    ring.forEach((point, index) => {
      const x = point.x - originX
      const y = centerY - point.y
      if (index === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    })
    shape.closePath()
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 8 })
    geometry.rotateX(-Math.PI / 2)
    geometry.translate(0, z0 - ground, 0)
    geometry.computeVertexNormals()
    const mesh = new THREE.Mesh(geometry, material)
    mesh.userData.profile = 'extrude'
    return mesh
  } catch {
    return null
  }
}

function meshFromRings(rings: [number, number, number][][], material: THREE.Material, profile: string): THREE.Mesh | null {
  const segs = rings[0]?.length ?? 0
  if (segs < 3) return null
  const pos: number[] = []
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i]
    const b = rings[i + 1]
    for (let k = 0; k < segs; k++) {
      const k2 = (k + 1) % segs
      pos.push(...a[k], ...b[k], ...b[k2], ...a[k], ...b[k2], ...a[k2])
    }
  }
  const cap = (pts: [number, number, number][], reverse: boolean) => {
    const c = pts.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1], acc[2] + point[2]], [0, 0, 0]).map((value) => value / pts.length) as [
      number,
      number,
      number,
    ]
    for (let k = 0; k < segs; k++) {
      const k2 = (k + 1) % segs
      if (reverse) pos.push(...c, ...pts[k2], ...pts[k])
      else pos.push(...c, ...pts[k], ...pts[k2])
    }
  }
  cap(rings[0], true)
  cap(rings[rings.length - 1], false)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.profile = profile
  return mesh
}

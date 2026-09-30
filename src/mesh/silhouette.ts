import * as THREE from 'three'
import type { Pt } from '../lib/geom'
import type { CabModel } from '../model/types'
import { cabPaint, lamp } from './materials'

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
  const top = new Array<number>(bins).fill(-Infinity)
  const bot = new Array<number>(bins).fill(Infinity)
  const count = new Array<number>(bins).fill(0)
  for (const point of points) {
    let index = Math.floor(((point.x - minX) / span) * (bins - 1))
    if (index < 0) index = 0
    if (index >= bins) index = bins - 1
    count[index]++
    if (point.y > top[index]) top[index] = point.y
    if (point.y < bot[index]) bot[index] = point.y
  }
  const upper: Pt[] = []
  const lower: Pt[] = []
  for (let index = 0; index < bins; index++) {
    if (!count[index]) continue
    const x = minX + (span * index) / Math.max(1, bins - 1)
    upper.push({ x, y: top[index] })
    lower.push({ x, y: bot[index] })
  }
  if (upper.length < 4) return null
  return [...smoothChain(upper), ...smoothChain(lower).reverse()]
}

function smoothChain(chain: Pt[]): Pt[] {
  if (chain.length < 5) return chain
  return chain.map((point, index) => {
    if (index === 0 || index === chain.length - 1) return point
    const prev = chain[index - 1]
    const next = chain[index + 1]
    return { x: point.x, y: point.y * 0.5 + (prev.y + next.y) * 0.25 }
  })
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

export function tracedCab(
  cab: CabModel,
  world: { originX: number; ground: number; centerY: number; lift: (drawingX: number) => number },
): THREE.Group | null {
  const side = cab.silhouettes?.side
  const top = cab.silhouettes?.top
  if (!side || !top || side.length < 4 || top.length < 4) return null
  const fittedSide = fit(side, cab.side)
  const fittedTop = fit(top, cab.top)
  const sections = cabSections(fittedSide, fittedTop, cab.silhouettes?.front ?? null, 40)
  if (sections.length < 4) return null
  const geo = sectionsGeometry(sections, world)
  if (!geo) return null
  const group = new THREE.Group()
  group.name = 'cab'
  group.userData.role = 'cab'
  const shell = new THREE.Mesh(geo, cabPaint)
  shell.castShadow = true
  shell.receiveShadow = true
  group.add(shell)
  const nose = sections[1] ?? sections[0]
  const yLift = world.lift(nose.x)
  const low = Math.min(...nose.loop.map((point) => point.y))
  const span = Math.max(...nose.loop.map((point) => point.x)) - Math.min(...nose.loop.map((point) => point.x))
  if (span > 600) {
    for (const sideSign of [-1, 1]) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(46, 20, 14), lamp)
      bulb.position.set(nose.x - world.originX + 24, low - world.ground + yLift + 180, sideSign * span * 0.34)
      group.add(bulb)
    }
  }
  return group
}

function sectionsGeometry(
  sections: CabSection[],
  world: { originX: number; ground: number; centerY: number; lift: (drawingX: number) => number },
): THREE.BufferGeometry | null {
  const verts: number[] = []
  const indices: number[] = []
  const bases: number[] = []
  const count = sections[0].loop.length
  for (const section of sections) {
    bases.push(verts.length / 3)
    const up = world.lift(section.x)
    for (const point of section.loop) {
      verts.push(section.x - world.originX, point.y - world.ground + up, point.x - world.centerY)
    }
  }
  for (let s = 0; s < sections.length - 1; s++) {
    const a = bases[s]
    const b = bases[s + 1]
    for (let i = 0; i < count; i++) {
      const i2 = (i + 1) % count
      indices.push(a + i, b + i, a + i2, a + i2, b + i, b + i2)
    }
  }
  const cap = (base: number, reverse: boolean) => {
    const center = verts.length / 3
    let x = 0
    let y = 0
    let z = 0
    for (let i = 0; i < count; i++) {
      x += verts[(base + i) * 3]
      y += verts[(base + i) * 3 + 1]
      z += verts[(base + i) * 3 + 2]
    }
    verts.push(x / count, y / count, z / count)
    for (let i = 0; i < count; i++) {
      const i2 = (i + 1) % count
      indices.push(center, reverse ? base + i2 : base + i, reverse ? base + i : base + i2)
    }
  }
  cap(bases[0], true)
  cap(bases[bases.length - 1], false)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
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
    else if (!inA && inB) {
      out.push(cross(a, b), b)
    }
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

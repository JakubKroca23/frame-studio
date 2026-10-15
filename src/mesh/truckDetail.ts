import * as THREE from 'three'
import { clamp } from '../lib/geom'
import type { PartModel } from '../model/types'
import { bumperGrey, couplingYellow, crossBlue, fenderBlack, fuelBlack, guardBracket, guardGreen, intakeBrown, lampAmber, lampRed, lampWhite, mufflerGrey, plastic, rubber, steel, tankStrap } from './materials'

/**
 * Typed component geometry for body-builder drawings (Volvo BEP), matched to the manufacturer Creo renders.
 * All positions / extents come from the drawing parts (layer-classified); only the cross-section shapes are generic.
 * Three.js coordinates: x rearward from axle 1, y up from the road, z lateral (centre of frame = 0).
 */
export interface PlacedPart { part: PartModel; len: number; height: number; width: number; x: number; y: number; z: number }
export interface TruckCtx { frameHalf: number; frameBottom: number; frameTop: number; ground: number; originX: number; centerY: number }

const box = new THREE.BoxGeometry(1, 1, 1)
function blk(size: [number, number, number], mat: THREE.Material, at: [number, number, number]) {
  const m = new THREE.Mesh(box, mat)
  m.scale.set(...size)
  m.position.set(...at)
  return m
}
function bar(from: [number, number, number], to: [number, number, number], r: number, mat: THREE.Material, segs = 10) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to)
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), segs), mat)
  m.position.copy(a).add(b).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
  return m
}
const zRange = (p: PlacedPart) => [p.y - p.height / 2, p.y + p.height / 2] as const
const sideOf = (p: PlacedPart) => (Math.sign(p.z) || -1) as -1 | 1

/** True for a part that spans both sides (drawn once across the full width in the plan view). */
export const spansBoth = (p: PlacedPart, ctx: TruckCtx) => p.width > ctx.frameHalf * 2.2

/**
 * Side underrun protection: two light-green double-bar rails per side, dark-green brackets down from the frame.
 * Rail x range = union of the 32_ bar parts per side; bracket x = 31_ bracket parts (else every ~1.4 m).
 */
export function addSideGuards(parent: THREE.Group, bars: PlacedPart[], brackets: PlacedPart[], ctx: TruckCtx) {
  const g = new THREE.Group()
  g.name = 'side-underrun-protection'
  for (const side of [-1, 1] as const) {
    const mine = bars.filter((b) => spansBoth(b, ctx) || sideOf(b) === side)
    if (!mine.length) continue
    const x0 = Math.min(...mine.map((b) => b.x - b.len / 2)), x1 = Math.max(...mine.map((b) => b.x + b.len / 2))
    const zLo = Math.min(...mine.map((b) => zRange(b)[0])), zHi = Math.max(...mine.map((b) => zRange(b)[1]))
    const outer = Math.max(...mine.map((b) => (spansBoth(b, ctx) ? b.width / 2 : Math.abs(b.z) + b.width / 2))) - 40
    const z = side * outer
    const rails = [zLo + 90, zLo + (zHi - zLo) * 0.5]
    for (const y of rails) for (const dy of [-34, 34]) g.add(blk([x1 - x0, 44, 40], guardGreen, [(x0 + x1) / 2, y + dy, z]))
    let xs = brackets.filter((b) => sideOf(b) === side || spansBoth(b, ctx)).map((b) => b.x)
    if (!xs.length) { const n = Math.max(2, Math.round((x1 - x0) / 1400) + 1); xs = Array.from({ length: n }, (_, i) => x0 + 60 + ((x1 - x0 - 120) * i) / (n - 1)) }
    for (const x of [x0 + 40, x1 - 40, ...xs]) {
      g.add(blk([60, ctx.frameBottom - rails[0] + 60, 14], guardBracket, [x, (ctx.frameBottom + rails[0]) / 2 - 20, z - side * 30]))
      g.add(blk([60, 40, Math.max(40, outer - ctx.frameHalf)], guardBracket, [x, ctx.frameBottom - 40, side * (ctx.frameHalf + (outer - ctx.frameHalf) / 2)]))
    }
  }
  parent.add(g)
}

/** Rear underrun: grey round bar across the full part width, blue drop brackets from the frame end. */
export function addRearBumper(parent: THREE.Group, p: PlacedPart, ctx: TruckCtx) {
  const g = new THREE.Group()
  g.name = p.part.partNumber
  const [, hi] = zRange(p)
  const half = p.width / 2
  const x = p.x + p.len / 2 - 70, y = Math.min(hi - 90, ctx.frameBottom - 140)
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(55, 55, half * 2, 24), bumperGrey)
  tube.rotation.x = Math.PI / 2
  tube.position.set(x, y, p.z)
  g.add(tube)
  for (const s of [-1, 1]) {
    g.add(blk([300, ctx.frameBottom - y + 40, 16], crossBlue, [x - 120, (ctx.frameBottom + y) / 2, p.z + s * (ctx.frameHalf - 30)]))
    g.add(blk([60, 40, 140], crossBlue, [x, y + 60, p.z + s * (ctx.frameHalf - 30)]))
  }
  parent.add(g)
}

/** Tail lamps: one red/amber/white cluster at each end of the lamp part (the plan part spans the full width). */
export function addTailLamps(parent: THREE.Group, p: PlacedPart, ctx: TruckCtx) {
  const g = new THREE.Group()
  g.name = p.part.partNumber
  const ends = spansBoth(p, ctx) ? [p.z - p.width / 2 + 220, p.z + p.width / 2 - 220] : [p.z]
  const h = clamp(p.height, 120, 220)
  for (const z of ends) {
    g.add(blk([60, h, 420], plastic, [p.x, p.y, z]))
    ;[lampRed, lampAmber, lampWhite, lampRed].forEach((m, i) => g.add(blk([14, h * 0.7, 90], m, [p.x + 34, p.y, z - 150 + i * 100])))
    g.add(blk([200, 30, 60], crossBlue, [p.x - 100, p.y + h / 2 + 10, z]))
  }
  parent.add(g)
}

/** Fuel tank: black D-section (flat side to the frame), two steel straps. */
export function addFuelTank(parent: THREE.Group, p: PlacedPart, ctx: TruckCtx) {
  const side = sideOf(p)
  const h = clamp(p.height, 300, 800), w = clamp(p.width, 300, 800), len = clamp(p.len, 400, 3000)
  const [lo] = zRange(p)
  const yc = lo + h / 2
  const s = new THREE.Shape()
  const r = Math.min(h, w) * 0.42
  // D: flat inner face (toward the frame), rounded outer corners
  s.moveTo(0, -h / 2); s.lineTo(w - r, -h / 2); s.quadraticCurveTo(w, -h / 2, w, -h / 2 + r); s.lineTo(w, h / 2 - r); s.quadraticCurveTo(w, h / 2, w - r, h / 2); s.lineTo(0, h / 2); s.lineTo(0, -h / 2)
  const geo = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: true, bevelSize: 18, bevelThickness: 18, bevelSegments: 3, curveSegments: 10 })
  geo.translate(0, 0, -len / 2)
  const m = new THREE.Mesh(geo, fuelBlack)
  m.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2
  const inner = Math.max(ctx.frameHalf + 30, Math.abs(p.z) - p.width / 2)
  m.position.set(p.x, yc, side * inner)
  const g = new THREE.Group()
  g.name = p.part.partNumber
  g.add(m)
  for (const t of [-0.3, 0.3]) {
    g.add(blk([50, 14, w + 30], tankStrap, [p.x + t * len, yc + h / 2 + 8, side * (inner + w / 2)]))
    g.add(blk([50, h + 30, 14], tankStrap, [p.x + t * len, yc, side * (inner + w + 16)]))
  }
  g.add(bar([p.x - len * 0.32, yc + h / 2, side * (inner + w * 0.7)], [p.x - len * 0.32, yc + h / 2 + 60, side * (inner + w * 0.7)], 45, steel, 16))
  parent.add(g)
}

/** Exhaust after-treatment / muffler box: grey rounded box with a darker perforated top band. */
export function addMufflerBox(parent: THREE.Group, p: PlacedPart, ctx: TruckCtx) {
  const g = new THREE.Group()
  g.name = p.part.partNumber
  const h = clamp(p.height, 250, 800), w = clamp(p.width, 250, 900), len = clamp(p.len, 300, 1800)
  const [lo] = zRange(p)
  const side = sideOf(p)
  const z = side * Math.max(ctx.frameHalf + 30 + w / 2, Math.abs(p.z))
  const geo = new THREE.BoxGeometry(len, h, w, 1, 1, 1)
  { const m = new THREE.Mesh(geo, mufflerGrey); m.position.set(p.x, lo + h / 2, z); g.add(m) }
  g.add(blk([len * 0.98, 30, w * 0.98], fenderBlack, [p.x, lo + h - 15, z]))
  for (let i = 0; i < 6; i++) g.add(blk([len * 0.8, 8, 10], fenderBlack, [p.x, lo + h * (0.25 + i * 0.09), z + side * (w / 2 + 2)]))
  parent.add(g)
}

const fenderCache = new Map<string, THREE.BufferGeometry>()
/** Ribbed plastic rear fender: thick half-shell over the wheel(s) with 4 raised ribs. */
function fenderGeo(radius: number, width: number) {
  const key = `${Math.round(radius)}:${Math.round(width)}`
  const hit = fenderCache.get(key)
  if (hit) return hit
  const parts: THREE.BufferGeometry[] = []
  const a0 = -0.12 * Math.PI, a1 = 1.12 * Math.PI
  const shell = new THREE.CylinderGeometry(radius + 70, radius + 70, width, 40, 1, true, a0 + Math.PI / 2, a1 - a0)
  parts.push(shell)
  for (const t of [-0.36, -0.12, 0.12, 0.36]) {
    const rib = new THREE.CylinderGeometry(radius + 92, radius + 92, 34, 40, 1, true, a0 + Math.PI / 2, a1 - a0)
    rib.translate(0, t * width, 0)
    parts.push(rib)
  }
  // flat side walls (outer + inner) as rings
  for (const s of [-1, 1]) {
    const wall = new THREE.RingGeometry(radius + 20, radius + 92, 40, 1, a0, a1 - a0)
    wall.rotateX(-Math.PI / 2)
    wall.translate(0, (s * width) / 2, 0)
    parts.push(wall)
  }
  const merged = mergeAll(parts)
  merged.rotateX(Math.PI / 2) // cylinder axis Y → lateral Z
  fenderCache.set(key, merged)
  return merged
}
function mergeAll(gs: THREE.BufferGeometry[]) {
  const nonIdx = gs.map((g) => (g.index ? g.toNonIndexed() : g))
  const n = nonIdx.reduce((a, g) => a + g.getAttribute('position').count, 0)
  const pos = new Float32Array(n * 3)
  let o = 0
  for (const g of nonIdx) { pos.set(g.getAttribute('position').array as Float32Array, o * 3); o += g.getAttribute('position').count }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.computeVertexNormals()
  return out
}

/** Rear fenders over each tandem wheel set (both sides) + rubber mud flap behind the last axle. */
export function addRearFenders(parent: THREE.Group, axles: { x: number; y: number; radius: number; width: number; track: number }[], flapBottom = 160) {
  const g = new THREE.Group()
  g.name = 'rear-fenders'
  axles.forEach((a, i) => {
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(fenderGeo(a.radius, a.width + 60), fenderBlack)
      m.position.set(a.x, a.y, side * (a.track / 2))
      g.add(m)
      if (i === axles.length - 1) g.add(blk([14, a.y - flapBottom, a.width + 40], rubber, [a.x + a.radius + 80, (a.y + flapBottom) / 2, side * (a.track / 2)]))
    }
  })
  parent.add(g)
}

/** Towing coupling (yellow jaw) at the rear end of the towing member. */
export function addCoupling(parent: THREE.Group, member: PlacedPart) {
  const g = new THREE.Group()
  g.name = member.part.partNumber
  const [lo] = zRange(member)
  const x = member.x + member.len / 2 + 60
  g.add(blk([member.len, member.height, 140], crossBlue, [member.x, member.y, member.z]))
  const jaw = new THREE.Mesh(new THREE.CylinderGeometry(150, 110, 130, 20), couplingYellow)
  jaw.position.set(x, lo - 40, member.z)
  g.add(jaw)
  g.add(blk([180, 60, 120], couplingYellow, [x - 80, lo + 20, member.z]))
  parent.add(g)
}

/** Air intake tower behind the cab (Volvo FH/FM): brown duct cap + black ribbed vertical intake. */
export function addIntakeTower(parent: THREE.Group, xRear: number, roofZ: number, cabBottom: number, lateral: number) {
  const g = new THREE.Group()
  g.name = 'air-intake'
  const h = roofZ - cabBottom - 300
  const x = xRear + 140
  g.add(blk([260, h * 0.8, 360], fenderBlack, [x, cabBottom + 250 + (h * 0.8) / 2, lateral]))
  for (let i = 0; i < 14; i++) g.add(blk([272, 18, 372], plastic, [x, cabBottom + 300 + i * ((h * 0.75) / 14), lateral]))
  const cap = new THREE.Mesh(new THREE.BoxGeometry(320, h * 0.24, 420), intakeBrown)
  cap.position.set(x - 10, roofZ - h * 0.12 - 40, lateral)
  g.add(cap)
  parent.add(g)
}

/** Blue crossmember with flanges and a lightening-hole row (BEP renders: blue, flanged ends). */
export function crossmemberMat() { return crossBlue }

import * as THREE from 'three'
import { clamp } from '../lib/geom'
import type { EquipKind } from '../pipeline/kinds'
import type { Axle, CabModel, ChassisModel, ChassisParams, FrameModel, PartModel } from '../model/types'
import {
  adblue,
  alloy,
  battery,
  cabPaint,
  cabRoof,
  cabTrim,
  castIron,
  cranePaint,
  exhaust,
  gasket,
  glass,
  lamp,
  lampRed,
  paint,
  paintDark,
  plastic,
  rubber,
  steel,
  tank,
  tankStrap,
  toolbox,
} from './materials'

export interface World {
  model: ChassisModel
  params: ChassisParams
  originX: number
  ground: number
  centerY: number
  lift: (drawingX: number) => number
  frame: FrameModel
  webT: number
  flangeW: number
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1)
boxGeo.userData.shared = true
const boltGeo = new THREE.CylinderGeometry(7, 7, 16, 8)
boltGeo.userData.shared = true

function solid(size: [number, number, number], mat: THREE.Material, at: [number, number, number], rot?: [number, number, number]) {
  const mesh = new THREE.Mesh(boxGeo, mat)
  mesh.scale.set(size[0], size[1], size[2])
  mesh.position.set(at[0], at[1], at[2])
  if (rot) mesh.rotation.set(rot[0], rot[1], rot[2])
  mesh.userData.noShadow = size[0] * size[1] * size[2] < 8000
  return mesh
}

function rod(from: [number, number, number], to: [number, number, number], radius: number, mat: THREE.Material) {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const dz = to[2] - from[2]
  const len = Math.hypot(dx, dy, dz) || 1
  const mesh = tube(radius, len, 'y', mat, [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2], 8)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len))
  return mesh
}

function tube(radius: number, length: number, axis: 'x' | 'y' | 'z', mat: THREE.Material, at: [number, number, number], segs = 16) {
  const geo = new THREE.CylinderGeometry(radius, radius, length, segs)
  const mesh = new THREE.Mesh(geo, mat)
  if (axis === 'x') mesh.rotation.z = Math.PI / 2
  if (axis === 'z') mesh.rotation.x = Math.PI / 2
  mesh.position.set(at[0], at[1], at[2])
  return mesh
}

function yAt(frame: FrameModel, drawingX: number, side: -1 | 1): number | null {
  const path = side < 0 ? frame.left : frame.right
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]
    const b = path[i + 1]
    const min = Math.min(a.x, b.x)
    const max = Math.max(a.x, b.x)
    if (drawingX < min - 1 || drawingX > max + 1) continue
    const t = Math.abs(b.x - a.x) < 1e-6 ? 0 : (drawingX - a.x) / (b.x - a.x)
    return a.y + (b.y - a.y) * clamp(t, 0, 1)
  }
  return null
}

function railZ(world: World, drawingX: number, side: -1 | 1): number | null {
  const y = yAt(world.frame, drawingX, side)
  if (y === null) return null
  return y - world.centerY
}

export function axleIsDriven(axles: Axle[], index: number): boolean {
  if (axles[index]?.dual) return true
  const anyDual = axles.some((axle) => axle.dual)
  return !anyDual && index === axles.length - 1
}

export function suspensionKind(params: ChassisParams, axle: Axle, index: number, axles: Axle[]): 'leaf' | 'air' {
  if (params.suspension === 'leaf') return 'leaf'
  if (params.suspension === 'air') return 'air'
  return axleIsDriven(axles, index) || axle.dual ? 'air' : 'leaf'
}

export function addCrossmemberAssembly(
  parent: THREE.Group,
  member: { x: number; thickness: number },
  world: World,
) {
  const { frame, originX, ground, lift, webT, flangeW } = world
  const yL = yAt(frame, member.x, -1)
  const yR = yAt(frame, member.x, 1)
  if (yL === null || yR === null) return
  const innerL = yL + flangeW - frame.centerY
  const innerR = yR - flangeW - frame.centerY
  const span = Math.abs(innerR - innerL)
  if (span < 120) return
  const x = member.x - originX
  const zBot = frame.bottomZ - ground + lift(member.x)
  const zTop = frame.topZ - ground + lift(member.x)
  const railH = zTop - zBot
  const height = clamp(railH * 0.46, 90, 210)
  const cz = zBot + railH * 0.42
  const thick = clamp(member.thickness, 46, 130)
  const web = solid([thick, height, span - webT], paint, [x, cz, (innerL + innerR) / 2])
  web.userData.noShadow = false
  parent.add(web)
  parent.add(solid([thick + 18, 10, span - webT - 8], paintDark, [x, cz + height / 2, (innerL + innerR) / 2]))
  parent.add(solid([thick + 18, 10, span - webT - 8], paintDark, [x, cz - height / 2, (innerL + innerR) / 2]))
  for (const side of [-1, 1] as const) {
    const z = side < 0 ? innerL : innerR
    const gusset = solid([thick + 36, railH * 0.72, 8], paint, [x, zBot + railH * 0.48, z + side * 6])
    gusset.userData.noShadow = false
    parent.add(gusset)
    for (const up of [-1, 1]) {
      for (const along of [-1, 1]) {
        const bolt = new THREE.Mesh(boltGeo, steel)
        bolt.rotation.x = Math.PI / 2
        bolt.position.set(x + along * (thick * 0.28), zBot + railH * (0.32 + up * 0.22), z + side * 12)
        bolt.userData.noShadow = true
        parent.add(bolt)
      }
    }
  }
}

export function addAxleAssembly(parent: THREE.Group, axle: Axle, index: number, world: World) {
  const { params, originX, ground, frame, lift, model } = world
  const specWidth = axle.tireSpec?.match(/^(\d{3})/)
  const width = clamp(specWidth ? Number(specWidth[1]) : params.tireWidth, 180, 480)
  const diameter = axle.tireDiameter
  const radius = diameter / 2
  const track = (params.tracks[index] ?? 0) > 0 ? params.tracks[index] : axle.track ?? 2000
  const dual = params.dualDrive && axle.dual
  const x = axle.x - originX
  const z = axle.z - ground
  const driven = axleIsDriven(model.axles, index)
  const kind = suspensionKind(params, axle, index, model.axles)
  const zFrame = frame.bottomZ - ground + lift(axle.x)

  const beam = tube(driven ? 58 : 50, track - 160, 'z', castIron, [x, z, 0], 18)
  parent.add(beam)

  if (driven) {
    parent.add(new THREE.Mesh(diffBowl(), castIron))
    const bowl = parent.children[parent.children.length - 1] as THREE.Mesh
    bowl.position.set(x, z, 0)
    parent.add(tube(72, 260, 'x', castIron, [x - 180, z + 10, 0], 14))
    parent.add(solid([160, 90, 220], castIron, [x + 40, z - 20, 0]))
  }

  const gap = 46
  for (const side of [-1, 1] as const) {
    const center = side * (track / 2)
    const offsets = dual ? [-width / 2 - gap / 2, width / 2 + gap / 2] : [0]
    for (const extra of offsets) {
      parent.add(makeWheel(radius, width, x, z, center + extra, side))
    }
    const drumZ = dual ? center - side * (width + gap / 2 + 70) : center - side * (width / 2 + 70)
    parent.add(tube(radius * 0.36, 150, 'z', castIron, [x, z, drumZ], 16))
    parent.add(tube(42, 70, 'x', plastic, [x + 30, z, side * (track / 2 - (dual ? width + 80 : width / 2 + 40))], 10))
    if (params.show.suspension) addSuspension(parent, world, x, z, zFrame, side, kind, axle.x)
  }

  if (!axle.dual) addSteering(parent, world, x, z, track, index === 0)
  if (!world.model.skipMudguards?.includes(axle.index)) addMudguards(parent, x, z, radius, width, track, dual)
}

function addSuspension(
  parent: THREE.Group,
  world: World,
  x: number,
  zAxle: number,
  zFrame: number,
  side: -1 | 1,
  kind: 'leaf' | 'air',
  drawingX: number,
) {
  const rail = railZ(world, drawingX, side)
  const y = rail === null ? side * 280 : rail - side * (world.flangeW * 0.35)
  const g = new THREE.Group()
  g.name = 'spring'
  g.userData.part = 'suspension'
  if (kind === 'leaf') addLeaf(g, x, zAxle, zFrame, y, side)
  else addAir(g, x, zAxle, zFrame, y, side)
  const shockTop = zFrame + (world.frame.topZ - world.frame.bottomZ) * 0.35
  const shock = tube(16, Math.max(80, shockTop - zAxle - 40), 'y', steel, [x + 220, (zAxle + shockTop) / 2, y], 8)
  shock.rotation.z = side * 0.08
  g.add(shock)
  parent.add(g)
}

function addLeaf(g: THREE.Group, x: number, zAxle: number, zFrame: number, y: number, side: -1 | 1) {
  const len = 1280
  const n = 8
  for (const leaf of [0, 1]) {
    const leafLen = len * (1 - leaf * 0.28)
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n
      const sag = 36 * Math.sin(t * Math.PI)
      const px = x - leafLen / 2 + t * leafLen
      const pz = zAxle + 78 + sag + leaf * 18
      g.add(solid([leafLen / n + 8, 16, 90], leaf === 0 ? paintDark : paint, [px, pz, y]))
    }
  }
  for (const end of [-1, 1] as const) {
    const hx = x + end * (len / 2 - 30)
    const hz = zAxle + 78
    g.add(solid([28, Math.max(40, zFrame - hz), 70], paint, [hx, (hz + zFrame) / 2, y]))
    g.add(solid([70, 16, 86], steel, [hx, zFrame - 8, y]))
  }
  g.add(tube(11, 150, 'y', steel, [x - 50, zAxle + 70, y], 8))
  g.add(tube(11, 150, 'y', steel, [x + 50, zAxle + 70, y], 8))
  g.add(solid([40, 18, 120], steel, [x, zAxle + 150, y + side * 8]))
}

function addAir(g: THREE.Group, x: number, zAxle: number, zFrame: number, y: number, side: -1 | 1) {
  const armLen = 760
  const arm = solid([armLen, 36, 70], paintDark, [x - armLen / 2 + 80, zAxle + 70, y])
  arm.userData.noShadow = false
  g.add(arm)
  g.add(solid([36, Math.max(50, zFrame - zAxle - 40), 64], paint, [x - armLen + 120, (zFrame + zAxle) / 2, y]))
  const bagH = clamp(zFrame - zAxle - 90, 70, 280)
  const bag = new THREE.Mesh(bellows(), rubber)
  bag.scale.set(1, bagH / 160, 1)
  bag.position.set(x + 40, zAxle + 50 + bagH / 2, y)
  g.add(bag)
  g.add(solid([160, 12, 150], steel, [x + 40, zFrame - 8, y]))
  g.add(solid([120, 14, 90], steel, [x + 40, zAxle + 48, y]))
  const barY = y - side * 40
  g.add(tube(18, Math.abs(barY) * 2, 'z', steel, [x - 180, zAxle + 40, 0], 8))
  g.add(tube(10, 90, 'y', steel, [x - 180, zAxle + 80, y], 6))
}

function addSteering(parent: THREE.Group, world: World, x: number, z: number, track: number, primary: boolean) {
  const y = track / 2 - 80
  parent.add(tube(18, track - 220, 'z', steel, [x - 40, z - 70, 0], 8))
  parent.add(solid([50, 36, 40], castIron, [x - 20, z - 40, -y]))
  parent.add(solid([50, 36, 40], castIron, [x - 20, z - 40, y]))
  if (!primary) return
  const rail = railZ(world, world.originX + x, -1) ?? -world.frame.outerWidthStraight / 2
  parent.add(solid([180, 140, 120], castIron, [x - 520, z + 40, rail + 40]))
  parent.add(rod([x - 480, z + 10, rail + 20], [x - 30, z - 50, -y], 18, steel))
}

function addMudguards(parent: THREE.Group, x: number, z: number, radius: number, width: number, track: number, dual: boolean) {
  for (const side of [-1, 1] as const) {
    const center = side * (track / 2)
    const guardW = dual ? width * 2 + 90 : width + 80
    const mesh = new THREE.Mesh(mudguardGeo(radius), plastic)
    mesh.scale.set(1, 1, guardW)
    mesh.position.set(x, z, center)
    parent.add(mesh)
    parent.add(tube(16, 200, 'y', paintDark, [x - radius * 0.55, z + radius * 0.72, center - side * (guardW / 2 + 10)], 10))
    parent.add(tube(16, 200, 'y', paintDark, [x + radius * 0.42, z + radius * 0.78, center - side * (guardW / 2 + 10)], 10))
    const flapTop = z + radius * 0.08
    const flapBottom = 48
    if (flapTop > flapBottom + 60) {
      parent.add(solid([16, flapTop - flapBottom, guardW * 0.82], plastic, [x + radius + 36, (flapTop + flapBottom) / 2, center]))
    }
  }
}

const studGeo = new THREE.CylinderGeometry(11, 11, 28, 16)
studGeo.userData.shared = true

function makeWheel(radius: number, width: number, x: number, y: number, z: number, outward: number) {
  const g = new THREE.Group()
  g.name = 'wheel'
  const tire = new THREE.Mesh(tireGeo(radius, width), rubber)
  tire.rotation.x = Math.PI / 2
  const barrel = new THREE.Mesh(rimBarrel(radius, width), alloy)
  barrel.rotation.x = Math.PI / 2
  const disc = new THREE.Mesh(rimDisc(radius), alloy)
  const back = new THREE.Mesh(backplate(radius), plastic)
  const cap = new THREE.Mesh(hubCap(radius), alloy)
  const face = outward * width * 0.5
  disc.position.z = face
  back.position.z = outward * width * 0.45
  if (outward < 0) back.rotation.y = Math.PI
  cap.rotation.x = outward > 0 ? Math.PI / 2 : -Math.PI / 2
  cap.position.z = outward * width * 0.58
  if (outward < 0) disc.rotation.y = Math.PI
  g.add(tire, barrel, back, disc, cap)
  const pcd = radius * 0.22
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.15
    const stud = new THREE.Mesh(studGeo, steel)
    stud.rotation.x = Math.PI / 2
    stud.position.set(Math.cos(a) * pcd, Math.sin(a) * pcd, outward * width * 0.56)
    stud.userData.noShadow = true
    g.add(stud)
  }
  g.position.set(x, y, z)
  return g
}

const tireCache = new Map<string, THREE.LatheGeometry>()
function tireGeo(radius: number, width: number) {
  const key = `${Math.round(radius)}:${Math.round(width)}`
  const hit = tireCache.get(key)
  if (hit) return hit
  const half = width / 2
  const bead = radius * 0.64
  const v = (r: number, y: number) => new THREE.Vector2(r, y)
  const pts = [
    v(bead, -half * 0.5),
    v(bead + 16, -half * 0.62),
    v(radius * 0.78, -half * 0.86),
    v(radius * 0.9, -half * 0.68),
    v(radius * 0.975, -half * 0.46),
    v(radius, -half * 0.3),
    v(radius - 6, -half * 0.18),
    v(radius, -half * 0.08),
    v(radius - 6, half * 0.04),
    v(radius, half * 0.16),
    v(radius - 6, half * 0.28),
    v(radius, half * 0.36),
    v(radius * 0.975, half * 0.5),
    v(radius * 0.9, half * 0.68),
    v(radius * 0.78, half * 0.86),
    v(bead + 16, half * 0.62),
    v(bead, half * 0.5),
    v(bead - 8, half * 0.22),
    v(bead - 14, 0),
    v(bead - 8, -half * 0.22),
    v(bead, -half * 0.5),
  ]
  const geo = new THREE.LatheGeometry(pts, 80)
  geo.computeVertexNormals()
  geo.userData.shared = true
  tireCache.set(key, geo)
  return geo
}

const rimCache = new Map<string, THREE.LatheGeometry>()
function rimBarrel(radius: number, width: number) {
  const key = `${Math.round(radius)}:${Math.round(width)}`
  const hit = rimCache.get(key)
  if (hit) return hit
  const flange = radius * 0.66
  const seat = radius * 0.58
  const well = radius * 0.47
  const half = width * 0.22
  const v = (r: number, y: number) => new THREE.Vector2(r, y)
  const pts = [
    v(flange, -half),
    v(seat, -half * 0.72),
    v(well, -half * 0.28),
    v(well, half * 0.2),
    v(seat, half * 0.68),
    v(flange, half),
    v(flange * 0.9, half * 0.86),
    v(well * 0.94, half * 0.15),
    v(well * 0.94, -half * 0.22),
    v(flange * 0.9, -half * 0.86),
    v(flange, -half),
  ]
  const geo = new THREE.LatheGeometry(pts, 64)
  geo.computeVertexNormals()
  geo.userData.shared = true
  rimCache.set(key, geo)
  return geo
}

const discCache = new Map<number, THREE.ExtrudeGeometry>()
function rimDisc(radius: number) {
  const key = Math.round(radius)
  const hit = discCache.get(key)
  if (hit) return hit
  const outer = radius * 0.52
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  const bore = new THREE.Path()
  bore.absarc(0, 0, radius * 0.1, 0, Math.PI * 2, true)
  shape.holes.push(bore)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2
    const hand = new THREE.Path()
    hand.absarc(Math.cos(a) * radius * 0.3, Math.sin(a) * radius * 0.3, radius * 0.085, 0, Math.PI * 2, true)
    shape.holes.push(hand)
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 18, bevelEnabled: true, bevelThickness: 4, bevelSize: 3, bevelSegments: 2, curveSegments: 28 })
  geo.translate(0, 0, -8)
  geo.userData.shared = true
  discCache.set(key, geo)
  return geo
}

const plateCache = new Map<number, THREE.CircleGeometry>()
function backplate(radius: number) {
  const key = Math.round(radius)
  const hit = plateCache.get(key)
  if (hit) return hit
  const geo = new THREE.CircleGeometry(radius * 0.5, 32)
  geo.userData.shared = true
  plateCache.set(key, geo)
  return geo
}

const capCache = new Map<number, THREE.LatheGeometry>()
function hubCap(radius: number) {
  const key = Math.round(radius)
  const hit = capCache.get(key)
  if (hit) return hit
  const r = radius * 0.13
  const v = (x: number, y: number) => new THREE.Vector2(x, y)
  const pts = [v(0.01, r * 0.85), v(r * 0.72, r * 0.7), v(r, r * 0.15), v(r * 0.92, -r * 0.15), v(0.01, -r * 0.15)]
  const geo = new THREE.LatheGeometry(pts, 32)
  geo.computeVertexNormals()
  geo.userData.shared = true
  capCache.set(key, geo)
  return geo
}

const guardCache = new Map<number, THREE.ExtrudeGeometry>()
function mudguardGeo(radius: number) {
  const key = Math.round(radius)
  const hit = guardCache.get(key)
  if (hit) return hit
  const outer = radius + 95
  const inner = radius + 58
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI, false)
  shape.absarc(0, 0, inner, Math.PI, 0, true)
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 28 })
  geo.translate(0, 0, -0.5)
  geo.userData.shared = true
  guardCache.set(key, geo)
  return geo
}

let bellowsGeo: THREE.LatheGeometry | null = null
function bellows() {
  if (bellowsGeo) return bellowsGeo
  const pts = [
    new THREE.Vector2(70, -80),
    new THREE.Vector2(120, -50),
    new THREE.Vector2(78, -20),
    new THREE.Vector2(125, 10),
    new THREE.Vector2(78, 40),
    new THREE.Vector2(120, 70),
    new THREE.Vector2(70, 80),
  ]
  bellowsGeo = new THREE.LatheGeometry(pts, 18)
  bellowsGeo.userData.shared = true
  return bellowsGeo
}

let diffGeo: THREE.SphereGeometry | null = null
function diffBowl() {
  if (!diffGeo) {
    diffGeo = new THREE.SphereGeometry(210, 18, 12)
    diffGeo.scale(1.15, 1, 0.92)
    diffGeo.userData.shared = true
  }
  return diffGeo
}

export function buildDrivetrain(world: World): THREE.Group {
  const g = new THREE.Group()
  g.name = 'drivetrain'
  g.userData.role = 'drivetrain'
  const { frame, originX, ground, model, flangeW } = world
  const zBot = frame.bottomZ - ground
  const inner = Math.max(420, frame.outerWidthStraight - 2 * flangeW)
  const engW = Math.min(700, inner - 24)
  const front = frame.left[0].x - originX
  const engLen = 1080
  const engX = clamp(front + 280, -1600, -80)
  const engZ = zBot - 40
  g.add(solid([engLen, 720, engW], paintDark, [engX + engLen / 2, engZ, 0]))
  g.add(solid([engLen * 0.72, 160, engW * 0.62], castIron, [engX + engLen * 0.48, engZ - 400, 0]))
  g.add(solid([engLen * 0.55, 90, engW * 0.8], gasket, [engX + engLen * 0.5, engZ + 390, 0]))
  g.add(solid([220, 280, 360], plastic, [engX + 160, engZ + 80, engW * 0.15]))
  const boxLen = 640
  const boxX = engX + engLen + boxLen / 2 - 40
  g.add(solid([boxLen, 520, engW * 0.72], castIron, [boxX, engZ - 40, 0]))
  g.add(solid([boxLen * 0.35, 180, engW * 0.4], paint, [boxX + 40, engZ - 280, 0]))

  const driven = model.axles.map((axle, index) => ({ axle, index })).filter((item) => axleIsDriven(model.axles, item.index))
  let fromX = boxX + boxLen / 2 - 80
  let fromZ = engZ - 80
  for (const item of driven) {
    const toX = item.axle.x - originX - 160
    const toZ = item.axle.z - ground + 20
    addShaft(g, fromX, fromZ, toX, toZ)
    fromX = item.axle.x - originX + 180
    fromZ = toZ
  }
  return g
}

function addShaft(parent: THREE.Group, x0: number, z0: number, x1: number, z1: number) {
  const len = Math.hypot(x1 - x0, z1 - z0)
  if (len < 80) return
  parent.add(rod([x0, z0, 0], [x1, z1, 0], 36, steel))
  for (const [x, z] of [
    [x0, z0],
    [x1, z1],
  ] as const) {
    parent.add(tube(52, 36, 'z', castIron, [x, z, 0], 8))
    parent.add(tube(52, 36, 'y', castIron, [x, z, 0], 8))
  }
}

interface Placed {
  part: PartModel
  len: number
  height: number
  width: number
  x: number
  y: number
  z: number
}

const PREFIX: Record<string, EquipKind> = {
  FT: 'fuel',
  AT: 'air',
  BB: 'battery',
  UT: 'toolbox',
  MH: 'toolbox',
  MP: 'toolbox',
  WC: 'toolbox',
  VE: 'stack',
  EP: 'exhaust',
  HS: 'shield',
  SA: 'skirt',
}

export function buildEquipment(world: World): { equipment: THREE.Group; brackets: THREE.Group } {
  const equipment = new THREE.Group()
  equipment.name = 'equipment'
  equipment.userData.role = 'equipment'
  const brackets = new THREE.Group()
  brackets.name = 'components'
  brackets.userData.role = 'components'

  const outer = world.frame.outerWidthStraight
  const measured = world.model.components
    .filter((part) => part.side && part.top)
    .map((part) => measure(part, world))
    .filter((item): item is Placed => item !== null && (item.part.kind === 'crane' || item.part.source === 'user' || !inCabVolume(item, world)))
    .filter((item) => item.part.kind === 'crane' || item.part.source === 'user' || !(cabOverlap(item, world) > 0.45 && Math.abs(item.y) < outer * 0.7))
  const placed = [
    ...dedupe(measured.filter((item) => item.part.source !== 'user')),
    ...measured.filter((item) => item.part.source === 'user'),
  ]

  let fuel = 0
  let batteryCount = 0
  let air = 0
  let exhaust = 0
  let shields = 0

  for (const item of placed) {
    const kind = classify(item, world)
    if (kind === 'skip') continue
    const before = equipment.children.length
    if (kind === 'bracket') {
      addPlate(brackets, item, steel)
      continue
    }
    if (kind === 'fuel') {
      addTankBody(equipment, fitBeside(item, world, 780), false)
      fuel++
    } else if (kind === 'adblue') {
      addTankBody(equipment, fitBeside(item, world, 560), true)
    } else if (kind === 'battery') {
      addLiddedBox(equipment, fitBeside(item, world, 620), battery)
      batteryCount++
    } else if (kind === 'toolbox') {
      addLiddedBox(equipment, fitBeside(item, world, 640), toolbox)
    } else if (kind === 'air') {
      addAirTank(equipment, item)
      air++
    } else if (kind === 'exhaust') {
      addExhaustBody(equipment, fitBeside(item, world, 560))
      exhaust++
    } else if (kind === 'stack') {
      addStack(equipment, item)
      exhaust++
    } else if (kind === 'shield') {
      addPlate(equipment, item, item.width < 80 || item.len < 80 ? steel : plastic)
      shields++
    } else if (kind === 'skirt') {
      addPlate(equipment, item, paintDark)
    } else if (kind === 'steps') {
      addSteps(equipment, item)
    } else if (kind === 'crane') {
      addCrane(equipment, item)
    } else if (Math.abs(item.y) > world.frame.outerWidthStraight * 0.28) {
      addTankBody(equipment, fitBeside(item, world, 700), false)
    } else {
      addLiddedBox(equipment, item, paintDark)
    }
    const tagged = equipment.children[before]
    if (tagged) tagged.userData.kind = kind
  }

  const drawn = equipment.children.length
  if (!world.model.reviewApplied) {
    if (fuel === 0) addTankBody(equipment, defaultFuel(world), false)
    if (batteryCount === 0 && drawn < 3) addLiddedBox(equipment, defaultBattery(world), battery)
    if (air === 0 && drawn < 3) addDefaultAir(equipment, world)
    if (exhaust === 0 && drawn < 3) addDefaultExhaust(equipment, world)
  }
  addRearBar(equipment, world, shields > 0)
  return { equipment, brackets }
}

function addCrane(parent: THREE.Group, item: Placed) {
  const g = new THREE.Group()
  g.name = item.part.partNumber
  const height = clamp(item.height, 700, 4200)
  const len = clamp(item.len, 360, 5200)
  const width = clamp(item.width, 260, 1400)
  const base = item.z - item.height / 2
  const colD = clamp(len * 0.22, 160, 380)
  const colW = clamp(width * 0.42, 180, 460)
  const colH = height * 0.76
  const colX = item.x - len * 0.28
  g.add(solid([colD * 1.4, height * 0.1, width * 0.9], cranePaint, [colX, base + height * 0.05, item.y]))
  g.add(solid([colD, colH, colW], cranePaint, [colX, base + height * 0.1 + colH / 2, item.y]))
  g.add(solid([colW * 0.72, colW * 0.5, colW * 0.72], steel, [colX, base + height * 0.1 + colH, item.y]))
  const boomLen = Math.max(len * 0.82, colD * 2.2)
  const boomH = clamp(height * 0.08, 64, 150)
  const boomZ = base + height * 0.1 + colH - boomH * 0.2
  g.add(solid([boomLen, boomH, colW * 0.7], cranePaint, [colX + boomLen / 2 - colD * 0.2, boomZ, item.y]))
  parent.add(g)
}

function addSteps(parent: THREE.Group, item: Placed) {
  const count = Math.min(4, Math.max(2, Math.round(item.height / 180)))
  for (let i = 0; i < count; i++) {
    const y = item.z - item.height / 2 + 36 + i * ((item.height - 50) / count)
    parent.add(solid([item.len * 0.92, 22, item.width * 0.88], paintDark, [item.x, y, item.y]))
  }
}

function classify(item: Placed, world: World): EquipKind {
  if (item.part.kind) return item.part.kind as EquipKind
  const outer = world.frame.outerWidthStraight
  if (item.width > outer * 1.7 && item.len < 1600) return 'skip'
  if (item.width > outer * 0.85 && item.len < 420 && item.height < 480 && Math.abs(item.y) < outer * 0.35) return 'skip'
  if (cabOverlap(item, world) > 0.45 && Math.abs(item.y) < outer * 0.7) return 'skip'
  if (hitsTyre(item, world)) return 'skip'
  const prefix = item.part.partNumber.split('_')[0]
  const known = PREFIX[prefix]
  if (known) return known
  const beside = Math.abs(item.y) > outer * 0.28
  const small = Math.min(item.len, item.height, item.width)
  const large = Math.max(item.len, item.height, item.width)
  const mid = item.len + item.height + item.width - small - large
  if (item.height > 1100 && item.len < 480 && item.width < 900) return 'stack'
  if (item.len > 1500 && item.height < 190 && item.width > 500) return 'skirt'
  if (small < 60 && large > 280) return 'shield'
  if (small > 150 && small < 460 && large > small * 1.65 && mid < small * 1.6) return 'air'
  if (beside && item.len >= 1100 && item.height >= 420 && item.width >= 420 && item.len >= item.height * 2.1) return 'fuel'
  if (beside && item.len >= 320 && item.len <= 900 && item.height >= 200 && item.height <= 520 && item.width >= 220 && item.width <= 700) return 'adblue'
  if (beside && item.len >= 450 && item.len <= 1700 && item.height >= 320 && item.height <= 900 && item.width >= 280 && item.width <= 1000 && item.x < axleMid(world)) return 'battery'
  if (beside && item.len >= 400 && item.len <= 1500 && item.height >= 260 && item.height <= 820 && item.width >= 260 && item.width <= 900) return 'toolbox'
  if (item.len >= 500 && item.len <= 1500 && item.height >= 240 && item.height <= 750 && item.width >= 180 && item.width <= 620) return 'exhaust'
  if (large > 480 && small > 140) return 'case'
  if (large > 90) return 'bracket'
  return 'skip'
}

function dedupe(items: Placed[]): Placed[] {
  const sorted = items.slice().sort((a, b) => b.len * b.height * b.width - a.len * a.height * a.width)
  const kept: Placed[] = []
  for (const item of sorted) {
    if (kept.some((other) => samePlace(item, other))) continue
    kept.push(item)
  }
  return kept
}

function samePlace(a: Placed, b: Placed) {
  const sideA = Math.abs(a.y) > 250
  const sideB = Math.abs(b.y) > 250
  if (sideA !== sideB) return false
  if (sideA && Math.sign(a.y) !== Math.sign(b.y)) return false
  return overlapRatio(a, b) > 0.4 || footprintOverlap(a, b) > 0.62
}

function footprintOverlap(a: Placed, b: Placed) {
  const dx = intervalOverlap(a.x, a.len, b.x, b.len)
  const dy = intervalOverlap(a.y, a.width, b.y, b.width)
  const area = Math.min(a.len * a.width, b.len * b.width)
  return area > 1 ? (dx * dy) / area : 0
}

function cabOverlap(item: Placed, world: World) {
  const cab = world.model.cab
  if (!cab) return 0
  const x0 = Math.max(cab.side.x0, cab.top.x0) - world.originX
  const x1 = Math.min(cab.side.x1, cab.top.x1) - world.originX
  return intervalOverlap(item.x, item.len, (x0 + x1) / 2, x1 - x0) / item.len
}

function overlapRatio(a: Placed, b: Placed) {
  const dx = intervalOverlap(a.x, a.len, b.x, b.len)
  const dy = intervalOverlap(a.y, a.width, b.y, b.width)
  const dz = intervalOverlap(a.z, a.height, b.z, b.height)
  const vol = Math.min(a.len * a.height * a.width, b.len * b.height * b.width)
  return vol > 1 ? (dx * dy * dz) / vol : 0
}

function intervalOverlap(ca: number, sa: number, cb: number, sb: number) {
  const a0 = ca - sa / 2
  const a1 = ca + sa / 2
  const b0 = cb - sb / 2
  const b1 = cb + sb / 2
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
}

function hitsTyre(item: Placed, world: World) {
  for (const axle of world.model.axles) {
    const ax = axle.x - world.originX
    const az = axle.z - world.ground
    const r = axle.tireDiameter / 2
    const dx = item.x - ax
    const dz = item.z - az
    const nearAxle = dx * dx + dz * dz < (r * 0.8) ** 2
    if (nearAxle && item.width > world.frame.outerWidthStraight) return true
    if (!nearAxle) continue
    const track = axle.track ?? 2000
    const spec = axle.tireSpec?.match(/^(\d{3})/)
    const tyreW = spec ? Number(spec[1]) : 315
    const dual = axle.dual
    for (const side of [-1, 1]) {
      const centers = dual ? [side * (track / 2 - tyreW * 0.55), side * (track / 2 + tyreW * 0.55)] : [side * (track / 2)]
      for (const cz of centers) {
        if (Math.abs(item.y - cz) < tyreW * 0.7 + item.width * 0.25) return true
      }
    }
  }
  return false
}

function fitBeside(item: Placed, world: World, maxThick: number): Placed {
  const half = world.frame.outerWidthStraight / 2
  const outward = Math.sign(item.y) || -1
  const width = clamp(Math.min(item.width, maxThick), 140, maxThick)
  const inner = Math.abs(item.y) - item.width / 2
  const y = inner < half + 16 ? outward * (half + 36 + width / 2) : item.y
  return { ...item, width, y }
}

function measure(part: PartModel, world: World): Placed | null {
  const side = part.side
  const top = part.top
  if (!side || !top) return null
  const x0 = Math.max(side.x0, top.x0)
  const x1 = Math.min(side.x1, top.x1)
  if (x1 - x0 < 30) return null
  const lift = world.lift((x0 + x1) / 2)
  return {
    part,
    len: x1 - x0,
    height: side.y1 - side.y0,
    width: Math.abs(top.y1 - top.y0),
    x: (x0 + x1) / 2 - world.originX,
    y: (top.y0 + top.y1) / 2 - world.centerY,
    z: (side.y0 + side.y1) / 2 - world.ground + lift,
  }
}

function inCabVolume(item: Placed, world: World): boolean {
  const cab = world.model.cab
  if (!cab) return false
  const x0 = Math.max(cab.side.x0, cab.top.x0) - world.originX
  const x1 = Math.min(cab.side.x1, cab.top.x1) - world.originX
  const halfW = Math.min(Math.abs(cab.top.y1 - cab.top.y0) / 2, 1300)
  const z0 = cab.side.y0 - world.ground
  const z1 = cab.side.y1 - world.ground
  return item.x > x0 + 120 && item.x < x1 - 80 && Math.abs(item.y) < halfW - 80 && item.z > z0 + 280 && item.z < z1 - 80
}

function seatZ(item: Placed, height: number) {
  return item.z - height / 2 < 16 ? height / 2 + 16 : item.z
}

function addTankBody(parent: THREE.Group, item: Placed, blue: boolean) {
  const height = clamp(item.height, 200, 1100)
  const width = clamp(item.width, 160, 1100)
  const length = clamp(item.len, 280, 2800)
  const z = seatZ(item, height)
  const outward = Math.sign(item.y) || -1
  const g = new THREE.Group()
  g.name = item.part.partNumber
  const radius = height / 2
  const squash = clamp(width / height, 0.55, 1.35)
  const body = tube(radius, length * 0.98, 'x', blue ? adblue : tank, [item.x, z, item.y], 36)
  body.scale.z = squash
  g.add(body)
  for (const t of [-0.3, 0.28]) {
    const band = tube(radius + 12, 26, 'x', tankStrap, [item.x + t * length, z, item.y], 28)
    band.scale.z = squash * 1.06
    g.add(band)
  }
  const capY = item.y + outward * Math.min(width, height) * 0.18
  g.add(tube(22, 26, 'y', blue ? adblue : plastic, [item.x + length * 0.16, z + radius + 4, capY], 16))
  g.add(tube(13, 12, 'y', steel, [item.x + length * 0.16, z + radius + 20, capY], 12))
  parent.add(g)
}

function addLiddedBox(parent: THREE.Group, item: Placed, mat: THREE.Material) {
  const len = clamp(item.len, 220, 1800)
  const height = clamp(item.height, 160, 900)
  const width = clamp(item.width, 160, 1000)
  const z = seatZ(item, height)
  const g = new THREE.Group()
  g.name = item.part.partNumber
  g.add(solid([len, height * 0.84, width], mat, [item.x, z - height * 0.05, item.y]))
  g.add(solid([len + 18, height * 0.14, width + 14], paintDark, [item.x, z + height * 0.42, item.y]))
  g.add(solid([len * 0.62, 8, 12], cabTrim, [item.x, z + height * 0.5, item.y + width * 0.12]))
  g.add(tube(14, 22, 'y', gasket, [item.x - len * 0.28, z + height * 0.52, item.y - width * 0.16], 10))
  parent.add(g)
}

function addAirTank(parent: THREE.Group, item: Placed) {
  const choices = [
    { axis: 'x' as const, len: item.len, dia: Math.min(item.height, item.width) },
    { axis: 'y' as const, len: item.height, dia: Math.min(item.len, item.width) },
    { axis: 'z' as const, len: item.width, dia: Math.min(item.len, item.height) },
  ].sort((a, b) => b.len - a.len)
  const axis = choices[0].axis
  const radius = clamp(choices[0].dia / 2, 50, 260)
  const length = clamp(choices[0].len, radius * 2.4, 2200)
  const z = axis === 'y' ? item.z : seatZ(item, radius * 2)
  const g = new THREE.Group()
  g.name = item.part.partNumber
  g.add(tube(radius, length, axis, tank, [item.x, z, item.y], 28))
  for (const t of [-0.28, 0.28]) {
    const shift = t * length
    const at: [number, number, number] =
      axis === 'x' ? [item.x + shift, z, item.y] : axis === 'y' ? [item.x, z + shift, item.y] : [item.x, z, item.y + shift]
    g.add(tube(radius + 7, 18, axis, tankStrap, at, 20))
  }
  parent.add(g)
}

function addExhaustBody(parent: THREE.Group, item: Placed) {
  const dia = clamp(Math.min(item.height, item.width), 140, 640)
  const length = clamp(item.len, 320, 1700)
  const z = seatZ(item, dia)
  const g = new THREE.Group()
  g.name = item.part.partNumber
  g.add(tube(dia / 2, length, 'x', exhaust, [item.x, z, item.y], 28))
  g.add(tube(dia * 0.16, dia * 0.85, 'y', exhaust, [item.x + length * 0.32, z + dia * 0.55, item.y], 16))
  g.add(tube(dia * 0.22, 20, 'y', paintDark, [item.x + length * 0.32, z + dia * 0.95, item.y], 14))
  const outward = Math.sign(item.y) || 1
  g.add(solid([length * 0.72, dia * 0.7, 12], steel, [item.x, z, item.y - outward * dia * 0.42]))
  parent.add(g)
}

function addStack(parent: THREE.Group, item: Placed) {
  const dia = clamp(Math.min(item.len, item.width), 90, 360)
  const height = clamp(item.height, 400, 2200)
  const z = Math.max(item.z, height / 2)
  const g = new THREE.Group()
  g.name = item.part.partNumber
  g.add(tube(dia / 2, height, 'y', exhaust, [item.x, z, item.y], 24))
  g.add(tube(dia * 0.72, 22, 'y', paintDark, [item.x, z + height / 2, item.y], 16))
  g.add(tube(dia * 0.28, 180, 'x', exhaust, [item.x, z - height * 0.2, item.y], 12))
  parent.add(g)
}

function addPlate(parent: THREE.Group, item: Placed, mat: THREE.Material) {
  const height = Math.max(item.height, 8)
  const z = item.z - height / 2 < 8 ? height / 2 + 8 : item.z
  const mesh = solid([Math.max(item.len, 8), height, Math.max(item.width, 6)], mat, [item.x, z, item.y])
  mesh.name = item.part.partNumber
  parent.add(mesh)
}

function addDefaultAir(parent: THREE.Group, world: World) {
  const x = axleX(world, 0) + 1100
  const z = world.frame.bottomZ - world.ground + 80
  const span = Math.max(160, world.frame.outerWidthStraight / 2 - world.flangeW - 70)
  for (const side of [-1, 1]) {
    addAirTank(parent, fake(x, side * span * 0.35, z, 820, 260, 260, 'air'))
  }
}

function addDefaultExhaust(parent: THREE.Group, world: World) {
  const x = axleX(world, 0) + 700
  const y = world.frame.outerWidthStraight / 2 + 280
  const z = world.frame.bottomZ - world.ground + 160
  addExhaustBody(parent, fake(x, y, z, 900, 420, 380, 'exhaust'))
}

function addRearBar(parent: THREE.Group, world: World, hasShields: boolean) {
  const rear = world.frame.left[world.frame.left.length - 1].x - world.originX
  const half = world.frame.outerWidthStraight / 2 + 30
  const low = 460
  parent.add(solid([70, 120, half * 2], paint, [rear - 30, low, 0]))
  const zHang = world.frame.bottomZ - world.ground
  parent.add(solid([36, Math.max(40, zHang - low), 46], paintDark, [rear - 30, (low + zHang) / 2, -half + 70]))
  parent.add(solid([36, Math.max(40, zHang - low), 46], paintDark, [rear - 30, (low + zHang) / 2, half - 70]))
  if (hasShields) return
  const a0 = axleX(world, 0)
  const rearAxle = axleX(world, world.model.axles.length - 1)
  if (rearAxle - a0 > 1800) {
    parent.add(solid([rearAxle - a0 - 1400, 80, 36], paintDark, [(a0 + rearAxle) / 2, 520, -(world.frame.outerWidthStraight / 2 + 24)]))
    parent.add(solid([rearAxle - a0 - 1400, 80, 36], paintDark, [(a0 + rearAxle) / 2, 520, world.frame.outerWidthStraight / 2 + 24]))
  }
}

function defaultFuel(world: World): Placed {
  const radius = 310
  const y = -(world.frame.outerWidthStraight / 2 + radius + 40)
  const z = Math.max(radius + 20, world.frame.bottomZ - world.ground - 10)
  return fake(betweenAxles(world, 0.55), y, z, 1600, radius * 2, radius * 1.3, 'fuel')
}

function defaultBattery(world: World): Placed {
  const y = -(world.frame.outerWidthStraight / 2 + 220)
  const z = world.frame.bottomZ - world.ground + 120
  return fake(axleX(world, 0) + 900, y, z, 720, 460, 400, 'battery')
}

export function buildCab(cab: CabModel, world: World): THREE.Group {
  const g = new THREE.Group()
  g.name = 'cab'
  g.userData.role = 'cab'
  const side = cab.side
  const top = cab.top
  const x0 = Math.max(side.x0, top.x0)
  const x1 = Math.min(side.x1, top.x1)
  const rawW = Math.abs(top.y1 - top.y0)
  const width = clamp(Math.min(rawW, 2550), 1800, 2550)
  const height = Math.max(1400, side.y1 - side.y0)
  const lift = world.lift((x0 + x1) / 2)
  const z0 = side.y0 - world.ground + lift
  const xA = x0 - world.originX
  const len = Math.max(1400, x1 - x0)
  const shell = new THREE.Mesh(cabShell(len, height, width), cabPaint)
  shell.position.set(xA, z0, 0)
  g.add(shell)

  const sx0 = len * 0.01
  const sy0 = height * 0.3
  const sx1 = len * 0.2
  const sy1 = height * 0.78
  const mx = (sx0 + sx1) / 2
  const my = (sy0 + sy1) / 2
  const ang = Math.atan2(sy1 - sy0, sx1 - sx0)
  const glassLen = Math.hypot(sx1 - sx0, sy1 - sy0) * 0.9
  const wind = solid([28, glassLen, width * 0.78], glass, [xA + mx, z0 + my, 0])
  wind.rotation.z = ang - Math.PI / 2
  g.add(wind)
  const visor = solid([len * 0.22, 22, width * 0.84], paintDark, [xA + len * 0.16, z0 + height * 0.8, 0])
  visor.rotation.z = -0.35
  g.add(visor)

  const grilleY = height * 0.18
  g.add(solid([36, height * 0.16, width * 0.58], paintDark, [xA + len * 0.02, z0 + grilleY, 0]))
  const volvo = world.model.profileId.includes('volvo')
  if (volvo) {
    const slash = solid([14, height * 0.13, 16], cabTrim, [xA + len * 0.012, z0 + grilleY, 0])
    slash.rotation.z = 0.85
    g.add(slash)
  } else {
    for (let i = 0; i < 5; i++) {
      g.add(solid([14, 10, width * 0.5], cabTrim, [xA + len * 0.008, z0 + grilleY - height * 0.06 + i * height * 0.028, 0]))
    }
  }
  g.add(solid([len * 0.1, height * 0.1, width * 0.98], plastic, [xA + len * 0.045, z0 + height * 0.07, 0]))
  for (const sz of [-1, 1]) {
    g.add(tube(46, 80, 'x', lamp, [xA + len * 0.03, z0 + height * 0.16, sz * width * 0.34], 20))
    g.add(tube(22, 36, 'x', lamp, [xA + len * 0.02, z0 + height * 0.1, sz * width * 0.44], 14))
    g.add(solid([14, 26, 64], lampRed, [xA + 6, z0 + height * 0.05, sz * width * 0.3]))
    g.add(solid([len * 0.62, height * 0.1, 16], paintDark, [xA + len * 0.52, z0 + height * 0.07, sz * (width / 2 + 6)]))
  }

  for (const sz of [-1, 1] as const) {
    const doorX = xA + len * 0.5
    const doorZ = z0 + height * 0.4
    const face = sz * (width / 2 + 8)
    g.add(solid([len * 0.36, height * 0.5, 18], cabRoof, [doorX, doorZ, face]))
    g.add(solid([len * 0.28, height * 0.22, 14], glass, [doorX + len * 0.01, doorZ + height * 0.12, face + sz * 10]))
    g.add(solid([10, height * 0.5, 10], paintDark, [doorX - len * 0.18, doorZ, face + sz * 4]))
    g.add(solid([64, 16, 12], cabTrim, [doorX + len * 0.08, doorZ - height * 0.04, face + sz * 12]))
    const step = Math.max(210, z0 * 0.35 + 40)
    g.add(solid([210, 26, 240], plastic, [xA + len * 0.2, step, sz * (width / 2 - 30)]))
    g.add(solid([180, 24, 210], plastic, [xA + len * 0.19, step + 190, sz * (width / 2 - 10)]))
    g.add(tube(14, height * 0.22, 'y', steel, [xA + len * 0.16, step + height * 0.16, sz * (width / 2 - 90)], 10))
    const armZ = sz * (width / 2 + 150)
    g.add(tube(16, 280, 'z', paintDark, [xA + len * 0.22, z0 + height * 0.58, sz * (width / 2 + 70)], 10))
    g.add(solid([200, 280, 34], plastic, [xA + len * 0.2, z0 + height * 0.56, armZ]))
    g.add(solid([150, 200, 8], glass, [xA + len * 0.2, z0 + height * 0.56, armZ + sz * 20]))
  }
  g.add(solid([len * 0.55, 16, width * 0.72], cabRoof, [xA + len * 0.58, z0 + height - 8, 0]))
  return g
}

const cabCache = new Map<string, THREE.ExtrudeGeometry>()
function cabShell(len: number, height: number, width: number) {
  const key = `${Math.round(len)}:${Math.round(height)}:${Math.round(width)}`
  const hit = cabCache.get(key)
  if (hit) return hit
  const shape = new THREE.Shape()
  shape.moveTo(0, height * 0.05)
  shape.lineTo(0, height * 0.3)
  shape.lineTo(len * 0.2, height * 0.78)
  shape.quadraticCurveTo(len * 0.3, height * 0.99, len * 0.42, height)
  shape.lineTo(len * 0.78, height * 0.97)
  shape.quadraticCurveTo(len * 0.96, height * 0.9, len, height * 0.7)
  shape.lineTo(len, height * 0.08)
  shape.lineTo(len * 0.9, 0)
  shape.lineTo(len * 0.08, 0)
  shape.lineTo(0, height * 0.05)
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: true,
    bevelThickness: 10,
    bevelSize: 10,
    bevelSegments: 2,
    curveSegments: 12,
  })
  geo.translate(0, 0, -width / 2)
  geo.computeVertexNormals()
  geo.userData.shared = true
  cabCache.set(key, geo)
  return geo
}

function axleX(world: World, index: number) {
  const axle = world.model.axles[index]
  return (axle?.x ?? world.originX) - world.originX
}

function axleMid(world: World) {
  const last = axleX(world, Math.max(0, world.model.axles.length - 1))
  return axleX(world, 0) + (last - axleX(world, 0)) * 0.45
}

function betweenAxles(world: World, t: number) {
  const a = axleX(world, 0)
  const b = axleX(world, Math.max(0, world.model.axles.length - 1))
  return a + (b - a) * t
}

function fake(x: number, y: number, z: number, len: number, height: number, width: number, partNumber = 'default'): Placed {
  return {
    part: { id: partNumber, partNumber, side: null, top: null, samples: [] },
    len,
    height,
    width,
    x,
    y,
    z,
  }
}

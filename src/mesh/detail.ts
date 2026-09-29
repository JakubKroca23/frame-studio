import * as THREE from 'three'
import { clamp } from '../lib/geom'
import type { Axle, CabModel, ChassisModel, ChassisParams, FrameModel, PartModel } from '../model/types'
import {
  alloy,
  battery,
  cabPaint,
  cabTrim,
  castIron,
  exhaust,
  gasket,
  glass,
  lamp,
  paint,
  paintDark,
  plastic,
  rubber,
  steel,
  tank,
  tankStrap,
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
      parent.add(makeWheel(radius, width, x, z, center + extra))
    }
    const drumZ = dual ? center - side * (width + gap / 2 + 70) : center - side * (width / 2 + 70)
    parent.add(tube(radius * 0.36, 150, 'z', castIron, [x, z, drumZ], 16))
    parent.add(tube(42, 70, 'x', plastic, [x + 30, z, side * (track / 2 - (dual ? width + 80 : width / 2 + 40))], 10))
    addSuspension(parent, world, x, z, zFrame, side, kind, axle.x)
  }

  if (!axle.dual) addSteering(parent, world, x, z, track, index === 0)
  addMudguards(parent, x, z, radius, width, track, dual)
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
    const guardW = dual ? width * 2 + 70 : width + 50
    const geo = new THREE.CylinderGeometry(radius + 70, radius + 70, guardW, 18, 1, true, Math.PI / 2, Math.PI)
    const mesh = new THREE.Mesh(geo, plastic)
    mesh.rotation.x = Math.PI / 2
    mesh.position.set(x, z, center)
    mesh.material = plastic
    parent.add(mesh)
    parent.add(tube(14, 220, 'y', paintDark, [x - radius * 0.2, z + radius * 0.72, center - side * (guardW / 2 + 10)], 6))
  }
}

function makeWheel(radius: number, width: number, x: number, y: number, z: number) {
  const g = new THREE.Group()
  g.name = 'wheel'
  const tire = new THREE.Mesh(tireGeo(radius, width), rubber)
  tire.rotation.x = Math.PI / 2
  const barrel = tube(radius * 0.66, width * 0.7, 'z', alloy, [0, 0, 0], 20)
  const disc = tube(radius * 0.46, width * 0.16, 'z', alloy, [0, 0, width * 0.22], 16)
  const hub = tube(radius * 0.16, width * 0.42, 'z', steel, [0, 0, width * 0.16], 12)
  const cap = tube(radius * 0.1, width * 0.12, 'z', alloy, [0, 0, width * 0.32], 10)
  g.add(tire, barrel, disc, hub, cap)
  const pcd = radius * 0.3
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    const bolt = new THREE.Mesh(boltGeo, steel)
    bolt.rotation.x = Math.PI / 2
    bolt.position.set(Math.cos(a) * pcd, Math.sin(a) * pcd, width * 0.3)
    bolt.userData.noShadow = true
    g.add(bolt)
  }
  g.position.set(x, y, z)
  return g
}

const tireCache = new Map<string, THREE.LatheGeometry>()
function tireGeo(radius: number, width: number) {
  const key = `${Math.round(radius)}:${Math.round(width)}`
  const hit = tireCache.get(key)
  if (hit) return hit
  const pts: THREE.Vector2[] = []
  const n = 18
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const side = Math.sin(t * Math.PI)
    let r = radius - 18 + side * 16
    if (t > 0.2 && t < 0.8) {
      const band = Math.sin((t - 0.2) * Math.PI * 9)
      r += band > 0.35 ? 0 : -12
      r = Math.min(r, radius)
    }
    r = Math.min(r, radius)
    pts.push(new THREE.Vector2(Math.max(8, r), (t - 0.5) * width))
  }
  const geo = new THREE.LatheGeometry(pts, 28)
  geo.userData.shared = true
  tireCache.set(key, geo)
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

export function buildEquipment(world: World): { equipment: THREE.Group; brackets: THREE.Group } {
  const equipment = new THREE.Group()
  equipment.name = 'equipment'
  equipment.userData.role = 'equipment'
  const brackets = new THREE.Group()
  brackets.name = 'components'
  brackets.userData.role = 'components'

  const placed = world.model.components
    .filter((part) => part.side && part.top)
    .map((part) => measure(part, world))
    .filter((item): item is Placed => item !== null && !insideCab(item, world))

  const tanks = placed
    .filter((item) => item.len > 520 && item.len < 2600 && item.height > 280 && item.height < 1200 && item.width > 220 && item.width < 1100 && Math.abs(item.y) > world.frame.outerWidthStraight * 0.28)
    .sort((a, b) => b.len * b.height - a.len * a.height)
  const used = new Set<string>()
  if (tanks[0]) {
    addTank(equipment, tanks[0], false)
    used.add(tanks[0].part.id)
  } else addDefaultFuel(equipment, world)
  if (tanks[1]) {
    addTank(equipment, tanks[1], true)
    used.add(tanks[1].part.id)
  } else addDefaultAdBlue(equipment, world)

  const boxes = placed.filter((item) => !used.has(item.part.id))
  const batteryBox = boxes.find((item) => item.len > 350 && item.len < 1100 && item.height > 220 && item.height < 700 && item.x < axleX(world, 0) + 1800)
  if (batteryBox) {
    addBattery(equipment, batteryBox)
    used.add(batteryBox.part.id)
  } else addDefaultBattery(equipment, world)

  addAirTanks(equipment, world)
  addExhaust(equipment, world)
  addUnderrun(equipment, world)
  addBodyBrackets(equipment, world)

  if (world.params.lod >= 2) {
    for (const item of boxes) {
      if (used.has(item.part.id)) continue
      if (item.len > 2400 || item.height > 1600 || item.width > 1600) continue
      if (item.len < 80 && item.height < 80) continue
      const mesh = solid(
        [clamp(item.len, 40, 1800), clamp(item.height, 30, 900), clamp(item.width, 30, 900)],
        item.height > item.width ? paintDark : steel,
        [item.x, item.z, item.y],
      )
      mesh.name = item.part.partNumber
      brackets.add(mesh)
    }
  }
  return { equipment, brackets }
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

function insideCab(item: Placed, world: World): boolean {
  const cab = world.model.cab
  if (!cab) return false
  const side = cab.side
  const top = cab.top
  const cx = item.x + world.originX
  const cy = item.y + world.centerY
  const inX = cx > side.x0 + 200 && cx < side.x1 - 200 && cx > top.x0 + 200 && cx < top.x1 - 200
  const inY = cy > top.y0 + 80 && cy < top.y1 - 80
  const inZ = item.z + world.ground > side.y0 + 400
  return inX && inY && inZ
}

function addTank(parent: THREE.Group, item: Placed, small: boolean) {
  const radius = clamp(Math.min(item.height, item.width) / 2, small ? 160 : 240, small ? 280 : 420)
  const length = clamp(item.len, 400, 2200)
  const y = Math.sign(item.y || 1) * (Math.abs(item.y) || radius + 400)
  const z = Math.max(radius + 40, item.z)
  const body = tube(radius, length, 'x', small ? plastic : tank, [item.x, z, y], 20)
  parent.add(body)
  for (const end of [-1, 1]) {
    parent.add(tube(radius * 0.92, 36, 'x', small ? plastic : tank, [item.x + end * (length / 2), z, y], 16))
  }
  for (const strap of [-0.28, 0.28]) {
    parent.add(solid([28, radius * 2.05, radius * 2.05], tankStrap, [item.x + strap * length, z, y]))
  }
  parent.add(solid([length * 0.7, 16, 70], paintDark, [item.x, z + radius + 8, y]))
}

function addDefaultFuel(parent: THREE.Group, world: World) {
  const x = betweenAxles(world, 0.42)
  const radius = 310
  const y = -(world.frame.outerWidthStraight / 2 + radius + 30)
  const z = world.frame.bottomZ - world.ground - 20
  addTank(parent, fake(x, y, Math.max(radius + 20, z), 1500, radius * 2, radius * 2), false)
}

function addDefaultAdBlue(parent: THREE.Group, world: World) {
  const x = betweenAxles(world, 0.22)
  const radius = 190
  const y = world.frame.outerWidthStraight / 2 + radius + 20
  const z = world.frame.bottomZ - world.ground + 40
  addTank(parent, fake(x, y, Math.max(radius, z), 620, radius * 2, radius * 2), true)
}

function addBattery(parent: THREE.Group, item: Placed) {
  parent.add(solid([item.len, item.height, item.width], battery, [item.x, item.z, item.y]))
  parent.add(solid([item.len * 0.92, 18, item.width * 0.86], plastic, [item.x, item.z + item.height / 2, item.y]))
  parent.add(solid([40, 28, 40], gasket, [item.x - item.len * 0.28, item.z + item.height / 2 + 10, item.y]))
}

function addDefaultBattery(parent: THREE.Group, world: World) {
  const x = axleX(world, 0) - 700
  const y = -(world.frame.outerWidthStraight / 2 + 180)
  const z = world.frame.bottomZ - world.ground + 80
  addBattery(parent, fake(x, y, z, 680, 420, 380))
}

function addAirTanks(parent: THREE.Group, world: World) {
  const x = axleX(world, 0) + 900
  const z = world.frame.bottomZ - world.ground + 40
  const span = Math.max(180, world.frame.outerWidthStraight / 2 - world.flangeW - 80)
  for (const side of [-1, 1]) {
    parent.add(tube(130, 780, 'x', paint, [x, z, side * span * 0.45], 16))
    parent.add(solid([40, 70, 40], steel, [x, z + 150, side * span * 0.45]))
  }
}

function addExhaust(parent: THREE.Group, world: World) {
  const x0 = axleX(world, 0) - 200
  const y = world.frame.outerWidthStraight / 2 + 220
  const z = world.frame.bottomZ - world.ground + 60
  parent.add(tube(70, 900, 'x', exhaust, [x0 - 200, z + 40, y * 0.55], 12))
  parent.add(solid([520, 560, 420], exhaust, [x0 + 700, z + 80, y]))
  parent.add(tube(48, 700, 'y', exhaust, [x0 + 860, z + 420, y], 10))
  parent.add(solid([180, 80, 180], paintDark, [x0 + 860, z + 760, y]))
}

function addUnderrun(parent: THREE.Group, world: World) {
  const { frame, originX, ground } = world
  const front = frame.left[0].x - originX
  const rear = frame.left[frame.left.length - 1].x - originX
  const half = frame.outerWidthStraight / 2 + 40
  const low = 420
  parent.add(solid([80, 140, half * 2], paint, [front + 80, low, 0]))
  parent.add(solid([70, 120, half * 2], paint, [rear - 40, low - 20, 0]))
  const zHang = frame.bottomZ - ground
  parent.add(solid([40, Math.max(40, zHang - low), 50], paintDark, [front + 80, (low + zHang) / 2, -half + 80]))
  parent.add(solid([40, Math.max(40, zHang - low), 50], paintDark, [front + 80, (low + zHang) / 2, half - 80]))
  const a0 = axleX(world, 0)
  const rearAxle = axleX(world, world.model.axles.length - 1)
  if (rearAxle - a0 > 1800) {
    parent.add(solid([rearAxle - a0 - 1600, 70, 40], paintDark, [(a0 + rearAxle) / 2, 560, -(frame.outerWidthStraight / 2 + 20)]))
    parent.add(solid([rearAxle - a0 - 1600, 70, 40], paintDark, [(a0 + rearAxle) / 2, 560, frame.outerWidthStraight / 2 + 20]))
  }
}

function addBodyBrackets(parent: THREE.Group, world: World) {
  const cab = world.model.cab
  const start = cab ? Math.max(cab.side.x1, cab.top.x1) - world.originX + 200 : axleX(world, 0) + 400
  const end = world.frame.left[world.frame.left.length - 1].x - world.originX - 180
  const z = world.frame.topZ - world.ground + 18
  for (let x = start; x < end; x += 980) {
    for (const side of [-1, 1] as const) {
      const y = railZ(world, x + world.originX, side)
      if (y === null) continue
      parent.add(solid([160, 14, world.flangeW + 20], steel, [x, z, y]))
      parent.add(solid([14, 70, 14], steel, [x - 50, z + 28, y]))
      parent.add(solid([14, 70, 14], steel, [x + 50, z + 28, y]))
    }
  }
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
  const height = Math.max(900, side.y1 - side.y0)
  const lift = world.lift((x0 + x1) / 2)
  const z0 = side.y0 - world.ground + lift
  const z1 = z0 + height
  const xA = x0 - world.originX
  const xB = x1 - world.originX
  const len = Math.max(400, xB - xA)
  const midX = (xA + xB) / 2
  const bodyZ = z0 + height * 0.56
  const bodyH = height * 0.78
  g.add(solid([len * 0.22, height * 0.28, width * 0.96], plastic, [xA + len * 0.08, z0 + height * 0.16, 0]))
  const shell = solid([len * 0.9, bodyH, width * 0.94], cabPaint, [midX + len * 0.04, bodyZ, 0])
  shell.userData.noShadow = false
  g.add(shell)
  g.add(solid([len * 0.86, 36, width * 0.9], cabTrim, [midX + len * 0.04, z1 - 24, 0]))
  const glassH = height * 0.34
  const wind = solid([48, glassH, width * 0.78], glass, [xA + len * 0.16, z0 + height * 0.62, 0])
  wind.rotation.z = -0.22
  g.add(wind)
  g.add(solid([len * 0.34, height * 0.22, 18], glass, [midX, z0 + height * 0.58, width * 0.47]))
  g.add(solid([len * 0.34, height * 0.22, 18], glass, [midX, z0 + height * 0.58, -width * 0.47]))
  g.add(solid([len * 0.2, 16, width * 0.7], cabTrim, [xA + len * 0.12, z0 + height * 0.84, 0], [0, 0, -0.15]))
  for (let i = 0; i < 5; i++) {
    g.add(solid([22, height * 0.16, width * 0.1], paintDark, [xA + len * 0.07, z0 + height * 0.4, (i - 2) * width * 0.12]))
  }
  g.add(solid([30, 70, 160], lamp, [xA + 20, z0 + height * 0.22, width * 0.32]))
  g.add(solid([30, 70, 160], lamp, [xA + 20, z0 + height * 0.22, -width * 0.32]))
  for (const sideSign of [-1, 1]) {
    g.add(tube(16, 180, 'z', paintDark, [xA + len * 0.22, z0 + height * 0.55, sideSign * (width / 2 + 70)], 6))
    g.add(solid([160, 280, 28], plastic, [xA + len * 0.2, z0 + height * 0.52, sideSign * (width / 2 + 150)]))
  }
  g.add(solid([len * 0.55, 8, width * 0.2], cabTrim, [midX, z0 + height * 0.34, width * 0.2]))
  return g
}

function axleX(world: World, index: number) {
  const axle = world.model.axles[index]
  return (axle?.x ?? world.originX) - world.originX
}

function betweenAxles(world: World, t: number) {
  const a = axleX(world, 0)
  const b = axleX(world, Math.max(0, world.model.axles.length - 1))
  return a + (b - a) * t
}

function fake(x: number, y: number, z: number, len: number, height: number, width: number): Placed {
  return {
    part: { id: 'default', partNumber: 'default', side: null, top: null, samples: [] },
    len,
    height,
    width,
    x,
    y,
    z,
  }
}

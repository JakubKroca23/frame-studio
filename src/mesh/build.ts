import earcut from 'earcut'
import * as THREE from 'three'
import { clamp, lerp, tireDiameterMm } from '../lib/geom'
import type { ChassisModel, ChassisParams, Hole, Slice } from '../model/types'
import type { Pt } from '../lib/geom'
import { addAxleAssembly, addCrossmemberAssembly, buildCab, buildDrivetrain, buildEquipment, type World } from './detail'
import { paint, shade } from './materials'

interface Station {
  s: number
  x: number
  y: number
  nx: number
  ny: number
  miter: number
  drawingX: number
}

let cabMat: THREE.MeshStandardMaterial | null = null
function cabFallback() {
  if (!cabMat) cabMat = new THREE.MeshStandardMaterial({ color: 0x1e4f86, metalness: 0.28, roughness: 0.42 })
  return cabMat
}

/**
 * Builds a Y-up Three.js group in millimetres.
 * Engineering axes: X along the drawing (positive toward the rear), Y lateral, Z up.
 * Three.js: (X, Z, Y). Origin is the front-axle centre on the ground.
 */
export function buildChassisGroup(model: ChassisModel, params: ChassisParams): THREE.Group {
  const root = new THREE.Group()
  root.name = 'podvozek'
  const frame = model.frame
  if (!frame) return root

  const originX = model.axles[0]?.x ?? frame.left[0].x
  const ground = model.axles.length
    ? Math.min(...model.axles.map((a) => a.z - a.tireDiameter / 2))
    : frame.bottomZ - 700
  const lift = makeLift(model, params)
  const z0 = frame.bottomZ - ground
  const z1 = frame.topZ - ground
  const webT = clamp(params.webThickness, 2, 20)
  const flangeT = clamp(params.flangeThickness, 2, 30)
  const flangeW = Math.max(frame.flangeWidth, webT + 8)
  const radius = clamp(params.cornerRadius, 0, Math.min(30, (z1 - z0) / 2 - flangeT - 2, flangeW - webT - 2))

  const leftSt = stations(frame.left, originX, frame.centerY, true)
  const rightSt = stations(frame.right, originX, frame.centerY, false)

  if (params.show.frame || params.lod === 0) {
    const g = new THREE.Group()
    g.name = 'frame'
    g.userData.role = 'frame'
    addRail(g, leftSt, z0, z1, webT, flangeT, flangeW, radius, model.holes.filter((h) => h.side === 'left'), params, lift, ground, frameMat())
    addRail(g, rightSt, z0, z1, webT, flangeT, flangeW, radius, model.holes.filter((h) => h.side === 'right'), params, lift, ground, frameMat())
    shade(g)
    root.add(g)
  }

  if (params.linerEnabled && params.show.liner && frame.liner) {
    const g = new THREE.Group()
    g.name = 'liner'
    g.userData.role = 'liner'
    const linerMat = new THREE.MeshStandardMaterial({
      color: 0x2a3138,
      metalness: 0.62,
      roughness: 0.42,
      side: THREE.DoubleSide,
    })
    for (const sts of [leftSt, rightSt]) {
      const sA = sAtDrawingX(sts, frame.liner.x0)
      const sB = sAtDrawingX(sts, frame.liner.x1)
      if (sA === null || sB === null) continue
      const sub = clipStations(sts, Math.min(sA, sB), Math.max(sA, sB))
      const side = sts === leftSt ? 'left' : 'right'
      const holes = model.holes.filter((h) => h.side === side && h.x >= frame.liner!.x0 && h.x <= frame.liner!.x1)
      const mesh = plateMesh(
        sub,
        z0 + flangeT,
        z1 - flangeT,
        webT + 1,
        clamp(params.linerThickness, 2, 16),
        holesFor(sub, holes, ground, z0 + flangeT + 2, z1 - flangeT - 2),
        lift,
        params.holes === 'geometry',
      )
      if (mesh) {
        mesh.material = linerMat
        g.add(mesh)
      }
    }
    root.add(g)
  }

  const world: World = {
    model,
    params,
    originX,
    ground,
    centerY: frame.centerY,
    lift,
    frame,
    webT,
    flangeW,
  }

  if (params.show.crossmembers && model.crossmembers.length && params.lod >= 0) {
    const g = new THREE.Group()
    g.name = 'crossmembers'
    g.userData.role = 'crossmembers'
    for (const member of model.crossmembers) addCrossmemberAssembly(g, member, world)
    shade(g)
    root.add(g)
  }

  if (params.lod >= 1 && params.show.axles && model.axles.length) {
    const g = new THREE.Group()
    g.name = 'axles'
    g.userData.role = 'axles'
    model.axles.forEach((axle, i) => addAxle(g, axle, i, world))
    shade(g)
    root.add(g)
  }

  if (params.lod >= 1 && params.show.drivetrain && model.axles.length) {
    const g = buildDrivetrain(world)
    shade(g)
    root.add(g)
  }

  if (params.lod >= 1 && params.show.cab && model.cab) {
    if (params.lod >= 2) {
      const g = buildCab(model.cab, world)
      shade(g)
      root.add(g)
    } else {
      const g = new THREE.Group()
      g.name = 'cab'
      g.userData.role = 'cab'
      const mesh = shapeMesh(model.cab.samples, model.cab.side, model.cab.top, params.lod, originX, frame.centerY, ground, lift, 16, cabFallback())
      if (mesh) g.add(mesh)
      shade(g)
      root.add(g)
    }
  }

  if (params.lod >= 1 && (params.show.equipment || params.show.components)) {
    const placed = buildEquipment(world)
    if (params.show.equipment) {
      shade(placed.equipment)
      root.add(placed.equipment)
    }
    if (params.show.components && params.lod >= 2) {
      shade(placed.brackets)
      root.add(placed.brackets)
    } else if (params.show.components) {
      const g = new THREE.Group()
      g.name = 'components'
      g.userData.role = 'components'
      model.components.forEach((part) => {
        if (!part.side || !part.top) return
        const mesh = shapeMesh(part.samples, part.side, part.top, 1, originX, frame.centerY, ground, lift, 8, cabFallback())
        if (mesh) {
          mesh.name = part.partNumber
          g.add(mesh)
        }
      })
      root.add(g)
    }
  }

  root.userData = { originX, ground, centerY: frame.centerY }
  return root
}

export function disposeGroup(group: THREE.Object3D) {
  const seen = new Set<THREE.BufferGeometry>()
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    const geo = mesh.geometry
    if (!geo || geo.userData.shared || seen.has(geo)) return
    seen.add(geo)
    geo.dispose()
  })
}

function makeLift(model: ChassisModel, params: ChassisParams): (drawingX: number) => number {
  if (params.loadState !== 'unladen') return () => 0
  const value = (label: string) => model.dimensions.find((d) => d.label === label && d.value !== null)?.value
  const frontU = value('H035')
  const frontL = value('H036')
  if (frontU == null || frontL == null) return () => 0
  const rearU = value('H037') ?? frontU
  const rearL = value('H038') ?? frontL
  const front = frontU - frontL
  const rear = rearU - rearL
  const x0 = model.axles[0]?.x ?? model.frame?.left[0].x ?? 0
  const x1 = model.axles[model.axles.length - 1]?.x ?? x0 + 5000
  const span = Math.max(1, x1 - x0)
  return (drawingX: number) => {
    const t = clamp((drawingX - x0) / span, 0, 1)
    return front + (rear - front) * t
  }
}

function stations(path: Pt[], originX: number, centerY: number, left: boolean): Station[] {
  const pts = path.map((p) => ({ x: p.x - originX, y: p.y - centerY, drawingX: p.x }))
  const segN: { x: number; y: number }[] = []
  const lens: number[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x
    const dy = pts[i + 1].y - pts[i].y
    const len = Math.hypot(dx, dy) || 1
    lens.push(len)
    let nx = -dy / len
    let ny = dx / len
    const my = (pts[i].y + pts[i + 1].y) / 2
    const inward = left ? 1 : -1
    if (ny * inward < 0) {
      nx = -nx
      ny = -ny
    }
    if (Math.abs(my) > 20 && ny * -my < 0) {
      nx = -nx
      ny = -ny
    }
    segN.push({ x: nx, y: ny })
  }
  const out: Station[] = []
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    let nx: number
    let ny: number
    let miter = 1
    if (i === 0) {
      nx = segN[0].x
      ny = segN[0].y
    } else if (i === pts.length - 1) {
      nx = segN[segN.length - 1].x
      ny = segN[segN.length - 1].y
    } else {
      nx = segN[i - 1].x + segN[i].x
      ny = segN[i - 1].y + segN[i].y
      const l = Math.hypot(nx, ny) || 1
      nx /= l
      ny /= l
      const dot = Math.max(0.35, nx * segN[i].x + ny * segN[i].y)
      miter = clamp(1 / dot, 1, 2.6)
    }
    out.push({ s, x: pts[i].x, y: pts[i].y, nx, ny, miter, drawingX: pts[i].drawingX })
    if (i < lens.length) s += lens[i]
  }
  return out
}

function addRail(
  parent: THREE.Group,
  sts: Station[],
  z0: number,
  z1: number,
  webT: number,
  flangeT: number,
  flangeW: number,
  radius: number,
  holes: Hole[],
  params: ChassisParams,
  lift: (drawingX: number) => number,
  ground: number,
  mat: THREE.MeshStandardMaterial,
) {
  const mapped = holesFor(sts, holes, ground, z0 + 3, z1 - 3)
  const web = plateMesh(sts, z0, z1, 0, webT, mapped, lift, params.holes === 'geometry' && params.show.holes)
  if (web) {
    web.material = mat
    web.userData.role = 'frame'
    parent.add(web)
  }
  const flangeMat = mat
  parent.add(flangeMesh(sts, z1, flangeT, flangeW, webT, radius, true, lift, flangeMat))
  parent.add(flangeMesh(sts, z0, flangeT, flangeW, webT, radius, false, lift, flangeMat))
  if (radius > 1) {
    parent.add(filletMesh(sts, z1, flangeT, webT, radius, true, lift, flangeMat))
    parent.add(filletMesh(sts, z0, flangeT, webT, radius, false, lift, flangeMat))
  }
  if (params.holes === 'markers' && params.show.holes) {
    const markers = holeMarkers(sts, mapped, webT, lift)
    if (markers) parent.add(markers)
  }
}

function holesFor(
  sts: Station[],
  holes: Hole[],
  ground: number,
  zMin: number,
  zMax: number,
): { s: number; z: number; r: number }[] {
  const out: { s: number; z: number; r: number }[] = []
  const sorted = holes.slice().sort((a, b) => a.x - b.x)
  for (const h of sorted) {
    const s = sAtDrawingX(sts, h.x)
    if (s === null) continue
    const z = h.z - ground
    const r = h.d / 2
    if (z < zMin + r || z > zMax - r) continue
    const prev = out[out.length - 1]
    if (prev && Math.hypot(prev.s - s, prev.z - z) < (prev.r + r) * 0.92) continue
    out.push({ s, z, r })
  }
  return out
}

function plateMesh(
  sts: Station[],
  z0: number,
  z1: number,
  u0: number,
  thickness: number,
  holes: { s: number; z: number; r: number }[],
  lift: (drawingX: number) => number,
  cutHoles: boolean,
): THREE.Mesh | null {
  if (sts.length < 2 || z1 - z0 < 4 || thickness <= 0) return null
  const loop: number[] = []
  loop.push(sts[0].s, z0, sts[0].s, z1)
  for (let i = 1; i < sts.length; i++) loop.push(sts[i].s, z1)
  for (let i = sts.length - 1; i >= 1; i--) loop.push(sts[i].s, z0)
  const outerN = loop.length / 2
  const holeIndices: number[] = []
  if (cutHoles) {
    for (const h of holes) {
      if (h.s - h.r < sts[0].s + 1 || h.s + h.r > sts[sts.length - 1].s - 1) continue
      if (h.z - h.r < z0 + 1 || h.z + h.r > z1 - 1) continue
      holeIndices.push(loop.length / 2)
      const n = 9
      for (let k = 0; k < n; k++) {
        const a = (-k / n) * Math.PI * 2
        loop.push(h.s + Math.cos(a) * h.r * 0.96, h.z + Math.sin(a) * h.r * 0.96)
      }
    }
  }
  let indices: number[] = []
  let capHoles = holeIndices
  try {
    indices = earcut(loop, holeIndices, 2)
  } catch {
    indices = []
  }
  if (indices.length < 3) {
    capHoles = []
    indices = earcut(loop.slice(0, outerN * 2), [], 2)
  }
  if (!indices.length) return null
  const count = loop.length / 2
  const pos: number[] = new Array(count * 2 * 3)
  for (let i = 0; i < count; i++) {
    const s = loop[i * 2]
    const z = loop[i * 2 + 1]
    const st = atS(sts, s)
    const up = lift(st.drawingX)
    const p0 = place(st, u0, z, up)
    const p1 = place(st, u0 + thickness, z, up)
    pos[i * 3] = p0[0]
    pos[i * 3 + 1] = p0[1]
    pos[i * 3 + 2] = p0[2]
    const j = (i + count) * 3
    pos[j] = p1[0]
    pos[j + 1] = p1[1]
    pos[j + 2] = p1[2]
  }
  const tri: number[] = []
  for (let t = 0; t < indices.length; t += 3) {
    tri.push(indices[t], indices[t + 1], indices[t + 2])
    tri.push(indices[t] + count, indices[t + 2] + count, indices[t + 1] + count)
  }
  const boundary = contourEdges(outerN, capHoles, 9)
  for (const [a, b] of boundary) {
    tri.push(a, b, b + count, a, b + count, a + count)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(tri)
  geo.computeVertexNormals()
  return new THREE.Mesh(geo, frameMat())
}

function contourEdges(outerN: number, holeStarts: number[], holeSegs: number): [number, number][] {
  const edges: [number, number][] = []
  for (let i = 0; i < outerN; i++) edges.push([i, (i + 1) % outerN])
  if (holeStarts.length === 0) return edges
  for (const start of holeStarts) {
    for (let k = 0; k < holeSegs; k++) edges.push([start + k, start + ((k + 1) % holeSegs)])
  }
  return edges
}

function flangeMesh(
  sts: Station[],
  zOuter: number,
  flangeT: number,
  flangeW: number,
  _webT: number,
  _radius: number,
  top: boolean,
  lift: (drawingX: number) => number,
  mat: THREE.Material,
): THREE.Mesh {
  const dir = top ? -1 : 1
  const zFar = zOuter
  const zNear = zOuter + dir * flangeT
  const uTip = flangeW
  const pos: number[] = []
  for (let i = 0; i < sts.length - 1; i++) {
    const a = sts[i]
    const b = sts[i + 1]
    // two quads: outer strip (0 → uInner) may be covered by web; still build uInner → tip as the visible flange,
    // plus 0 → uInner so the top face is continuous.
    quad(pos, (out) => {
      const emit = (u: number, z: number, st: Station) => {
        const p = place(st, u, z, lift(st.drawingX))
        out.push(p[0], p[1], p[2])
      }
      emit(0, zFar, a)
      emit(uTip, zFar, a)
      emit(uTip, zFar, b)
      emit(0, zFar, a)
      emit(uTip, zFar, b)
      emit(0, zFar, b)
    })
    quad(pos, (out) => {
      const emit = (u: number, z: number, st: Station) => {
        const p = place(st, u, z, lift(st.drawingX))
        out.push(p[0], p[1], p[2])
      }
      emit(0, zNear, a)
      emit(0, zNear, b)
      emit(uTip, zNear, b)
      emit(0, zNear, a)
      emit(uTip, zNear, b)
      emit(uTip, zNear, a)
    })
    // tip and root edges
    quad(pos, (out) => {
      const emit = (u: number, z: number, st: Station) => {
        const p = place(st, u, z, lift(st.drawingX))
        out.push(p[0], p[1], p[2])
      }
      emit(uTip, zFar, a)
      emit(uTip, zNear, a)
      emit(uTip, zNear, b)
      emit(uTip, zFar, a)
      emit(uTip, zNear, b)
      emit(uTip, zFar, b)
    })
  }
  return meshFromPositions(pos, mat)
}

function filletMesh(
  sts: Station[],
  zOuter: number,
  flangeT: number,
  webT: number,
  radius: number,
  top: boolean,
  lift: (drawingX: number) => number,
  mat: THREE.Material,
): THREE.Mesh {
  const pos: number[] = []
  const steps = 4
  for (let i = 0; i < sts.length - 1; i++) {
    for (let k = 0; k < steps; k++) {
      const t0 = k / steps
      const t1 = (k + 1) / steps
      const p = (t: number, st: Station) => {
        const ang = t * (Math.PI / 2)
        let u: number
        let z: number
        if (top) {
          u = webT + radius * (1 - Math.cos(ang))
          z = zOuter - flangeT - radius + radius * Math.sin(ang)
          // ang 0: u=webT, z = zOuter-flangeT-radius (on the web)
          // ang 90: u=webT+radius, z=zOuter-flangeT (on the flange)
          // Wait sin(90)=1, z = zOuter-flangeT-radius+radius = zOuter-flangeT. Good.
          // cos(0)=1, u=webT. Good.
        } else {
          u = webT + radius * (1 - Math.cos(ang))
          z = zOuter + flangeT + radius - radius * Math.sin(ang)
        }
        return place(st, u, z, lift(st.drawingX))
      }
      const a0 = p(t0, sts[i])
      const a1 = p(t1, sts[i])
      const b1 = p(t1, sts[i + 1])
      const b0 = p(t0, sts[i + 1])
      pos.push(...a0, ...a1, ...b1, ...a0, ...b1, ...b0)
    }
  }
  return meshFromPositions(pos, mat)
}

function holeMarkers(
  sts: Station[],
  holes: { s: number; z: number; r: number }[],
  webT: number,
  lift: (drawingX: number) => number,
): THREE.InstancedMesh | null {
  if (holes.length === 0) return null
  const geo = new THREE.CylinderGeometry(1, 1, 1, 8)
  const mat = new THREE.MeshStandardMaterial({ color: 0x1a1d21, roughness: 0.8, metalness: 0.1 })
  const mesh = new THREE.InstancedMesh(geo, mat, holes.length)
  const dummy = new THREE.Object3D()
  const yAxis = new THREE.Vector3(0, 1, 0)
  holes.forEach((h, i) => {
    const st = atS(sts, h.s)
    const p = place(st, webT / 2, h.z, lift(st.drawingX))
    dummy.position.set(p[0], p[1], p[2])
    const dir = new THREE.Vector3(st.nx, 0, st.ny).normalize()
    dummy.quaternion.setFromUnitVectors(yAxis, dir)
    dummy.scale.set(h.r, webT + 6, h.r)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}

function addAxle(parent: THREE.Group, axle: ChassisModel['axles'][number], index: number, world: World) {
  const specD = tireDiameterMm(world.params.tireSpec)
  const drawing = axle.tireDiameter
  const diameter = !world.params.useDrawingTires && specD ? specD : drawing
  const g = new THREE.Group()
  g.userData.drawingX = axle.x
  g.userData.role = 'axles'
  addAxleAssembly(g, { ...axle, tireDiameter: diameter }, index, world)
  parent.add(g)
}

function shapeMesh(
  samples: Slice[],
  side: { x0: number; y0: number; x1: number; y1: number },
  top: { x0: number; y0: number; x1: number; y1: number },
  lod: number,
  originX: number,
  centerY: number,
  ground: number,
  lift: (drawingX: number) => number,
  segs: number,
  mat: THREE.Material,
): THREE.Mesh | null {
  const x0 = Math.max(side.x0, top.x0)
  const x1 = Math.min(side.x1, top.x1)
  if (x1 - x0 < 20) return null
  if (lod < 2 || samples.length < 2) {
    const z0 = side.y0 - ground
    const z1 = side.y1 - ground
    const y0 = top.y0 - centerY
    const y1 = top.y1 - centerY
    const mid = (x0 + x1) / 2
    const up = lift(mid)
    const geo = new THREE.BoxGeometry(x1 - x0, z1 - z0, y1 - y0)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set((x0 + x1) / 2 - originX, (z0 + z1) / 2 + up, (y0 + y1) / 2)
    return mesh
  }
  const rings = samples
  const pos: number[] = []
  const ring = (sl: Slice) => {
    const cy = (sl.y0 + sl.y1) / 2 - centerY
    const cz = (sl.z0 + sl.z1) / 2 - ground + lift(sl.x)
    const ry = Math.max(8, (sl.y1 - sl.y0) / 2)
    const rz = Math.max(8, (sl.z1 - sl.z0) / 2)
    const pts: [number, number, number][] = []
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2
      pts.push([sl.x - originX, cz + Math.cos(a) * rz, cy + Math.sin(a) * ry])
    }
    return pts
  }
  const ringsP = rings.map(ring)
  for (let i = 0; i < ringsP.length - 1; i++) {
    const a = ringsP[i]
    const b = ringsP[i + 1]
    for (let k = 0; k < segs; k++) {
      const k2 = (k + 1) % segs
      pos.push(...a[k], ...b[k], ...b[k2], ...a[k], ...b[k2], ...a[k2])
    }
  }
  const cap = (pts: [number, number, number][], reverse: boolean) => {
    const c = pts.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]).map((v) => v / pts.length) as [
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
  cap(ringsP[0], true)
  cap(ringsP[ringsP.length - 1], false)
  return meshFromPositions(pos, mat)
}

function sAtDrawingX(sts: Station[], drawingX: number): number | null {
  if (drawingX < sts[0].drawingX - 20 || drawingX > sts[sts.length - 1].drawingX + 20) return null
  let i = 0
  while (i < sts.length - 2 && sts[i + 1].drawingX < drawingX) i++
  const a = sts[i]
  const b = sts[i + 1]
  const t = clamp((drawingX - a.drawingX) / (b.drawingX - a.drawingX || 1), 0, 1)
  return a.s + (b.s - a.s) * t
}

function atS(sts: Station[], s: number): Station {
  if (s <= sts[0].s) return sts[0]
  const last = sts[sts.length - 1]
  if (s >= last.s) return last
  let i = 0
  while (i < sts.length - 2 && sts[i + 1].s < s) i++
  const a = sts[i]
  const b = sts[i + 1]
  const t = (s - a.s) / (b.s - a.s || 1)
  let nx = lerp(a.nx, b.nx, t)
  let ny = lerp(a.ny, b.ny, t)
  const l = Math.hypot(nx, ny) || 1
  nx /= l
  ny /= l
  return {
    s,
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    nx,
    ny,
    miter: lerp(a.miter, b.miter, t),
    drawingX: lerp(a.drawingX, b.drawingX, t),
  }
}

function clipStations(sts: Station[], s0: number, s1: number): Station[] {
  const a = atS(sts, s0)
  const b = atS(sts, s1)
  const mid = sts.filter((st) => st.s > s0 + 1 && st.s < s1 - 1)
  const raw = [a, ...mid, b]
  const out: Station[] = []
  for (const st of raw) {
    const prev = out[out.length - 1]
    if (!prev || st.s - prev.s > 1) out.push(st)
  }
  return out.length >= 2 ? out : [a, b]
}

function place(st: Station, u: number, z: number, lift: number): [number, number, number] {
  const uu = u * st.miter
  return [st.x + st.nx * uu, z + lift, st.y + st.ny * uu]
}

function quad(pos: number[], fn: (out: number[]) => void) {
  fn(pos)
}

function meshFromPositions(pos: number[], mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.computeVertexNormals()
  return new THREE.Mesh(geo, mat)
}

let sharedFrame: THREE.MeshStandardMaterial | null = null
function frameMat(): THREE.MeshStandardMaterial {
  if (!sharedFrame) {
    sharedFrame = paint.clone()
    sharedFrame.side = THREE.DoubleSide
    sharedFrame.color.set(0x121418)
  }
  return sharedFrame
}


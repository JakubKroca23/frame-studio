import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react'
import * as THREE from 'three'
import { create } from 'zustand'
import { CUTS, deformPieces, ULT18Z59, type HookliftMesh, type HookliftParams } from './hooklift'
import type { HookliftSpec } from './hookliftCatalog'
import { classifyPiece, clampPose, geomFor, hookLimits, STOWED, type HookPart, type HookPose, type PieceBox } from './hookliftKinematics'
import { JointArcHandles, Protractor, TelescopeArrows } from './CraneGizmos'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Live pose of the (one) hooklift on screen: tipping, jib angle, slide. Driven by the 'Ovládání' handles. */
export const useHookPose = create<HookPose & { set: (p: Partial<HookPose>) => void }>((set) => ({ ...STOWED, set: (p) => set(p) }))
if (typeof window !== 'undefined') (window as unknown as { __hookPose?: (p: Partial<HookPose>) => void }).__hookPose = (p) => useHookPose.getState().set(p)

const glbUrl = (m: HookliftMesh) => `${import.meta.env.BASE_URL}models/hooklift/${m.file}`

export class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err: unknown) {
    console.warn('Hooklift model failed to load, using simple shape.', err)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** Lazy-loaded ULT18Z59 CAD model, stretched to params; rear end at xRear, underside at frameTop. */
export function HookliftModel(props: { xRear: number; frameTop: number; params: HookliftParams; mesh?: HookliftMesh; spec?: HookliftSpec | null; fallback: ReactNode }) {
  return (
    <Boundary fallback={props.fallback}>
      <Suspense fallback={props.fallback}>
        <Loaded {...props} />
      </Suspense>
    </Boundary>
  )
}

const edgeMat = new THREE.LineBasicMaterial({ color: '#5b6573', transparent: true, opacity: 0.55 })
const material = new THREE.MeshStandardMaterial({ color: '#1e1e1e', metalness: 0.3, roughness: 0.5, emissive: '#0b0d10', side: THREE.DoubleSide })

const PARTS: HookPart[] = ['sub', 'frame', 'mid', 'arm', 'cyl']
const rad = Math.PI / 180

function Loaded({ xRear, frameTop, params, mesh = ULT18Z59, spec }: { xRear: number; frameTop: number; params: HookliftParams; mesh?: HookliftMesh; spec?: HookliftSpec | null }) {
  const gltf = useGLTF(glbUrl(mesh))
  const built = useMemo(() => {
    gltf.scene.updateMatrixWorld(true)
    const v = new THREE.Vector3()
    const parts: { src: THREE.BufferGeometry; off: number; count: number; m: THREE.Mesh; group: string }[] = []
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      let group = ''
      for (let p: THREE.Object3D | null = m; p; p = p.parent) if (['rear', 'rails', 'front', 'arm'].includes(p.name)) group = p.name
      parts.push({ src: m.geometry, off: 0, count: m.geometry.getAttribute('position').count, m, group })
    })
    const total = parts.reduce((a, p) => a + p.count, 0)
    const pos = new Float32Array(total * 3), piece = new Float32Array(total), arm = new Uint8Array(total)
    const boxes = new Map<string, PieceBox>() // `${part}:${piece}` → undeformed box for segmentation
    let off = 0
    parts.forEach((part, pi) => {
      const isArm = part.group === 'arm' || part.group === 'front'
      const pa = part.src.getAttribute('position'), pc = part.src.getAttribute('_piece')
      part.off = off
      for (let i = 0; i < part.count; i++) {
        v.fromBufferAttribute(pa, i).applyMatrix4(part.m.matrixWorld)
        pos.set([v.x, v.y, v.z], (off + i) * 3)
        piece[off + i] = pc ? pc.getX(i) : -1
        arm[off + i] = isArm ? 1 : 0
        const key = `${pi}:${piece[off + i]}`
        const b = boxes.get(key)
        if (!b) boxes.set(key, { x0: v.x, x1: v.x, y0: v.y, y1: v.y, z0: v.z, z1: v.z })
        else { b.x0 = Math.min(b.x0, v.x); b.x1 = Math.max(b.x1, v.x); b.y0 = Math.min(b.y0, v.y); b.y1 = Math.max(b.y1, v.y); b.z0 = Math.min(b.z0, v.z); b.z1 = Math.max(b.z1, v.z) }
      }
      off += part.count
    })
    const geom = geomFor(mesh)
    const hidden = deformPieces(pos, piece, arm, params, mesh)
    const out: { g: THREE.BufferGeometry; part: HookPart; a?: [number, number]; b?: [number, number] }[] = []
    const armBox = new THREE.Box3()
    parts.forEach((part, pi) => {
      const g = new THREE.BufferGeometry()
      const P = pos.slice(part.off * 3, (part.off + part.count) * 3)
      g.setAttribute('position', new THREE.BufferAttribute(P, 3))
      const n = part.src.getAttribute('normal')
      if (n) g.setAttribute('normal', n)
      const idx = part.src.index
      const cache = new Map<number, HookPart>()
      const cls = (a: number) => {
        const id = piece[part.off + a]
        let c = cache.get(id)
        if (!c) cache.set(id, (c = classifyPiece(part.group, boxes.get(`${pi}:${id}`)!, geom)))
        return c
      }
      for (const which of PARTS) {
        const keep: number[] = []
        if (idx) for (let t = 0; t < idx.count; t += 3) {
          const a = idx.getX(t)
          if (hidden.has(piece[part.off + a]) || cls(a) !== which) continue
          keep.push(a, idx.getX(t + 1), idx.getX(t + 2))
          if (which === 'arm') for (let k = 0; k < 3; k++) { const q = idx.getX(t + k); armBox.expandByPoint(v.set(P[q * 3], P[q * 3 + 1], P[q * 3 + 2])) }
        }
        if (!keep.length) continue
        if (which === 'cyl') {
          // one geometry per cylinder piece, with its eyes (rear/front end on the axis, deformed coordinates)
          const byPiece = new Map<number, number[]>()
          for (let t = 0; t < keep.length; t += 3) { const id = piece[part.off + keep[t]]; if (!byPiece.has(id)) byPiece.set(id, []); byPiece.get(id)!.push(keep[t], keep[t + 1], keep[t + 2]) }
          for (const tri of byPiece.values()) {
            let z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity
            for (const q of tri) { const y = P[q * 3 + 1], z = P[q * 3 + 2]; z0 = Math.min(z0, z); z1 = Math.max(z1, z); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
            const gc = g.clone(); gc.setIndex(tri)
            out.push({ g: n ? gc : toCreasedNormals(gc, Math.PI / 6), part: 'cyl', a: [(y0 + y1) / 2, z0], b: [(y0 + y1) / 2, z1] })
          }
          continue
        }
        const gi = g.clone(); gi.setIndex(keep)
        out.push({ g: n ? gi : toCreasedNormals(gi, Math.PI / 6), part: which }) // mesh without normals (3MF source): keep CAD edges sharp
      }
    })
    // pivots follow the cut-and-shift deformation (length cuts behind them, install-height cut below them)
    const dInst = ((params.installHeightMm ?? mesh.installHeightMm) - mesh.installHeightMm) / 1000
    const cuts = CUTS[mesh.file]?.z ?? []
    const dLen = (params.lengthMm - mesh.nativeLengthMm) / 1000
    const zs = (z: number) => z + cuts.filter((c) => c < z).length * (cuts.length ? dLen / cuts.length : 0)
    const tip: [number, number, number] = [0, geom.tip.y + dInst, zs(geom.tip.z)]
    const knuckle: [number, number, number] = [0, geom.knuckle.y + dInst, zs(geom.knuckle.z)]
    return { out, tip, knuckle, armTop: armBox.isEmpty() ? 1.6 : armBox.max.y }
  }, [gltf, params, mesh])
  const edges = useMemo(() => built.out.map((o) => new THREE.EdgesGeometry(o.g, 35)), [built])
  const lim = useMemo(() => hookLimits(mesh, spec), [mesh, spec])
  const pose = clampPose(useHookPose(), lim)
  const setPose = useHookPose((s) => s.set)
  const { invalidate } = useThree()
  useEffect(() => { invalidate() }, [pose.tipDeg, pose.swingDeg, pose.slideMm, invalidate])
  const meshes = (part: HookPart) => built.out.map((o, i) => o.part !== part ? null : (
    <group key={i}>
      <mesh geometry={o.g} material={material} castShadow receiveShadow />
      <lineSegments geometry={edges[i]} material={edgeMat} />
    </group>
  ))
  const { tip, knuckle } = built
  // lift cylinders: rear eye fixed on the main frame, front eye follows the middle frame → aim + stretch along the axis
  const sw = pose.swingDeg * rad
  const cylinders = built.out.map((o, i) => {
    if (o.part !== 'cyl' || !o.a || !o.b) return null
    const [ay, az] = o.a, [by, bz] = o.b
    const ry = by - knuckle[1], rz = bz - knuckle[2]
    const ny = knuckle[1] + ry * Math.cos(sw) + rz * Math.sin(sw), nz = knuckle[2] - ry * Math.sin(sw) + rz * Math.cos(sw)
    const L0 = Math.hypot(by - ay, bz - az), L = Math.hypot(ny - ay, nz - az)
    const phi = Math.atan2(ny - ay, nz - az) - Math.atan2(by - ay, bz - az)
    return (
      <group key={i} position={[0, ay, az]} rotation={[-phi, 0, 0]}>
        <group scale={[1, 1, L / L0]}>
          <group position={[0, -ay, -az]}>
            <mesh geometry={o.g} material={material} castShadow receiveShadow />
            <lineSegments geometry={edges[i]} material={edgeMat} />
          </group>
        </group>
      </group>
    )
  })
  const neg = (p: [number, number, number]): [number, number, number] => [-p[0], -p[1], -p[2]]
  const sub = (a: [number, number, number], b: [number, number, number]): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  // gizmo frame: local X → model +Z (forward), local Y → up; set beside the body (+X = towards the default camera)
  const side = 0.78
  // model → scene: X = xRear - (z - zMin)·1000, Y = frameTop + (y - yMin)·1000, Z = x·1000 (rotation −90° about Y)
  return (
    <group name="trw-hooklift-model" position={[xRear + mesh.zMin * 1000, frameTop - mesh.yMin * 1000, 0]} rotation={[0, -Math.PI / 2, 0]} scale={1000}>
      {meshes('sub')}
      <group position={tip}>
        <group name="hooklift-frame" rotation={[-pose.tipDeg * rad, 0, 0]}>
          <group position={[side, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <Protractor offset={0} value={pose.tipDeg} limits={[0, lim.tipMax]} radius={0.9} />
            <JointArcHandles id="hook-tip" offset={0} value={pose.tipDeg} limits={[0, lim.tipMax]} label="Sklopení" onAngle={(d) => setPose({ tipDeg: d })} />
          </group>
          <group position={neg(tip)}>{meshes('frame')}{cylinders}</group>
          <group position={sub(knuckle, tip)}>
            <group name="hooklift-mid" rotation={[-pose.swingDeg * rad, 0, 0]}>
              <group position={[side * 0.55, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
                <Protractor offset={0} value={pose.swingDeg} limits={[0, lim.swingMax]} radius={0.55} />
                <JointArcHandles id="hook-swing" offset={0} value={pose.swingDeg} limits={[0, lim.swingMax]} label="Rameno háku" onAngle={(d) => setPose({ swingDeg: d })} />
              </group>
              <group position={neg(knuckle)}>
                {meshes('mid')}
                <group name="hooklift-arm" position={[0, 0, -pose.slideMm / 1000]}>
                  {lim.slideMaxMm > 0 ? (
                    <group position={[side * 0.55, built.armTop - 0.2, mesh.zMax - 0.3]} rotation={[0, Math.PI / 2, 0]}>
                      <TelescopeArrows value={pose.slideMm / 1000} max={lim.slideMaxMm / 1000} k={0.05} onValue={(m) => setPose({ slideMm: m * 1000 })} />
                    </group>
                  ) : null}
                  {meshes('arm')}
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

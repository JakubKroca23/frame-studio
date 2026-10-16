import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react'
import * as THREE from 'three'
import { create } from 'zustand'
import { CUTS, deformPieces, ULT18Z59, type HookliftMesh, type HookliftParams } from './hooklift'
import type { HookliftSpec } from './hookliftCatalog'
import { classifyPiece, clampPose, eyeAt, geomFor, hookLimits, STOWED, type HookPart, type HookPose, type PieceBox } from './hookliftKinematics'
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
const rodMat = new THREE.MeshStandardMaterial({ color: '#a7b0ba', metalness: 0.85, roughness: 0.25, side: THREE.DoubleSide })
const matFor = (part: HookPart) => (part === 'rod' ? rodMat : material)

const PARTS: HookPart[] = ['sub', 'frame', 'mid', 'arm', 'barrel', 'rod']
/** Rod eye length kept rigid [m]; the rest of the rod (shaft) may lengthen slightly at full stroke. */
const EYE = 0.12
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
    // pivots follow the cut-and-shift deformation (length cuts behind them, install-height cut below them)
    const dInst = ((params.installHeightMm ?? mesh.installHeightMm) - mesh.installHeightMm) / 1000
    const cuts = CUTS[mesh.file]?.z ?? []
    const dLen = (params.lengthMm - mesh.nativeLengthMm) / 1000
    const zs = (z: number) => z + cuts.filter((c) => c < z).length * (cuts.length ? dLen / cuts.length : 0)
    const tip: [number, number, number] = [0, geom.tip.y + dInst, zs(geom.tip.z)]
    const knuckle: [number, number, number] = [0, geom.knuckle.y + dInst, zs(geom.knuckle.z)]
    const pinA = { y: geom.cyl.A.y + dInst, z: zs(geom.cyl.A.z) }, pinB = { y: geom.cyl.B.y + dInst, z: zs(geom.cyl.B.z) }
    const L0 = Math.hypot(pinA.y - pinB.y, pinA.z - pinB.z)
    const hidden = deformPieces(pos, piece, arm, params, mesh)
    /** kind: barrel (local frame at pin B, +z towards A) / rod eye + rod shaft (local frame at pin A, +z towards B). */
    const out: { g: THREE.BufferGeometry; part: HookPart; kind?: 'barrel' | 'eye' | 'shaft'; side?: number }[] = []
    let rodLen = 0
    const toLocal = (from: { y: number; z: number }, to: { y: number; z: number }) => {
      const a = Math.atan2(-(to.y - from.y), to.z - from.z)
      return new THREE.Matrix4().makeRotationX(-a).multiply(new THREE.Matrix4().makeTranslation(0, -from.y, -from.z))
    }
    const mBarrel = toLocal(pinB, pinA), mRod = toLocal(pinA, pinB)
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
        if (which === 'barrel' || which === 'rod') {
          // per side (left/right cylinder); geometry moved into the cylinder's own pin frame
          const m = which === 'barrel' ? mBarrel : mRod
          const groups = new Map<string, number[]>()
          for (let t = 0; t < keep.length; t += 3) {
            const [a, b2, c] = [keep[t], keep[t + 1], keep[t + 2]]
            const side = P[a * 3] + P[b2 * 3] + P[c * 3] > 0 ? 1 : -1
            let kind = which === 'barrel' ? 'barrel' : 'eye'
            if (which === 'rod') {
              // distance of the triangle from the eye pin along the axis
              const cz = [a, b2, c].reduce((acc, q) => acc + v.set(P[q * 3], P[q * 3 + 1], P[q * 3 + 2]).applyMatrix4(m).z, 0) / 3
              if (cz > EYE) kind = 'shaft'
              rodLen = Math.max(rodLen, cz)
            }
            const key = `${kind}|${side}`
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key)!.push(a, b2, c)
          }
          for (const [key, tri] of groups) {
            const [kind, side] = key.split('|')
            const gc = g.clone(); gc.setIndex(tri)
            const gl = (n ? gc : toCreasedNormals(gc, Math.PI / 6)).applyMatrix4(m)
            out.push({ g: gl, part: which, kind: kind as 'barrel' | 'eye' | 'shaft', side: +side })
          }
          continue
        }
        const gi = g.clone(); gi.setIndex(keep)
        out.push({ g: n ? gi : toCreasedNormals(gi, Math.PI / 6), part: which }) // mesh without normals (3MF source): keep CAD edges sharp
      }
    })
    return { out, tip, knuckle, pinA, pinB, L0, rodLen, armTop: armBox.isEmpty() ? 1.6 : armBox.max.y }
  }, [gltf, params, mesh])
  const edges = useMemo(() => built.out.map((o) => new THREE.EdgesGeometry(o.g, 35)), [built])
  const lim = useMemo(() => hookLimits(mesh, spec), [mesh, spec])
  const pose = clampPose(useHookPose(), lim)
  const setPose = useHookPose((s) => s.set)
  const { invalidate } = useThree()
  useEffect(() => { invalidate() }, [pose.tipDeg, pose.swingDeg, pose.slideMm, invalidate])
  const meshes = (part: HookPart) => built.out.map((o, i) => o.part !== part ? null : (
    <group key={i}>
      <mesh geometry={o.g} material={matFor(o.part)} castShadow receiveShadow />
      <lineSegments geometry={edges[i]} material={edgeMat} />
    </group>
  ))
  const { tip, knuckle } = built
  // main cylinders (barrel on the subframe, rod eye on the middle frame), both aimed along the pin-to-pin line
  const eye = eyeAt(built.pinA, { y: knuckle[1], z: knuckle[2] }, { y: tip[1], z: tip[2] }, pose)
  const B = built.pinB
  const L = Math.hypot(eye.y - B.y, eye.z - B.z)
  const ang = Math.atan2(-(eye.y - B.y), eye.z - B.z) // local +z → B→A
  const angRod = Math.atan2(-(B.y - eye.y), B.z - eye.z)
  // rod slides out; only if the stroke exceeded the modelled rod (inner end leaving the barrel) the shaft lengthens
  const shaftLen = Math.max(0.05, built.rodLen - EYE)
  // inner rod end ≥ 0.1 m inside the barrel mouth (≈ L − L0 + 0.15 from the eye) and short of the barrel base
  const kShaft = Math.min(Math.max(1, (L - built.L0 + 0.25 - EYE) / shaftLen), Math.max(0.2, (L - 0.05 - EYE) / shaftLen))
  const cylinders = built.out.map((o, i) => {
    if (o.part !== 'barrel' && o.part !== 'rod') return null
    const mat = o.part === 'barrel' ? matFor('barrel') : matFor('rod')
    const body = <><mesh geometry={o.g} material={mat} castShadow receiveShadow /><lineSegments geometry={edges[i]} material={edgeMat} /></>
    if (o.kind === 'barrel') return <group key={i} position={[0, B.y, B.z]} rotation={[ang, 0, 0]}>{body}</group>
    return (
      <group key={i} position={[0, eye.y, eye.z]} rotation={[angRod, 0, 0]}>
        {o.kind === 'shaft' ? <group position={[0, 0, EYE]} scale={[1, 1, kShaft]}><group position={[0, 0, -EYE]}>{body}</group></group> : body}
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
      {cylinders}
      <group position={tip}>
        <group name="hooklift-frame" rotation={[-pose.tipDeg * rad, 0, 0]}>
          <group position={[side, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <Protractor offset={0} value={pose.tipDeg} limits={[0, lim.tipMax]} radius={0.9} />
            <JointArcHandles id="hook-tip" offset={0} value={pose.tipDeg} limits={[0, lim.tipMax]} label="Sklopení" onAngle={(d) => setPose({ tipDeg: d })} />
          </group>
          <group position={neg(tip)}>{meshes('frame')}</group>
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

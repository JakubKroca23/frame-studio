import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react'
import * as THREE from 'three'
import { create } from 'zustand'
import { deformPieces, ULT18Z59, type HookliftMesh, type HookliftParams } from './hooklift'
import type { HookliftSpec } from './hookliftCatalog'
import { classifyPiece, clampPose, hookLimits, REAR_PIVOT, STOWED, type HookPart, type HookPose } from './hookliftKinematics'
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

const PARTS: HookPart[] = ['sub', 'frame', 'jib']
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
    const top = new Map<string, number>() // `${part}:${piece}` → max y (undeformed) for segmentation
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
        top.set(key, Math.max(top.get(key) ?? -Infinity, v.y))
      }
      off += part.count
    })
    const hidden = deformPieces(pos, piece, arm, params, mesh)
    const out: { g: THREE.BufferGeometry; part: HookPart }[] = []
    const jibBox = new THREE.Box3()
    parts.forEach((part, pi) => {
      const g = new THREE.BufferGeometry()
      const P = pos.slice(part.off * 3, (part.off + part.count) * 3)
      g.setAttribute('position', new THREE.BufferAttribute(P, 3))
      const n = part.src.getAttribute('normal')
      if (n) g.setAttribute('normal', n)
      const idx = part.src.index
      const cls = (a: number) => classifyPiece(part.group, top.get(`${pi}:${piece[part.off + a]}`) ?? 0)
      for (const which of PARTS) {
        const keep: number[] = []
        if (idx) for (let t = 0; t < idx.count; t += 3) {
          const a = idx.getX(t)
          if (hidden.has(piece[part.off + a]) || cls(a) !== which) continue
          keep.push(a, idx.getX(t + 1), idx.getX(t + 2))
          if (which === 'jib') for (let k = 0; k < 3; k++) { const q = idx.getX(t + k); jibBox.expandByPoint(v.set(P[q * 3], P[q * 3 + 1], P[q * 3 + 2])) }
        }
        if (!keep.length) continue
        const gi = g.clone(); gi.setIndex(keep)
        out.push({ g: n ? gi : toCreasedNormals(gi, Math.PI / 6), part: which }) // mesh without normals (3MF source): keep CAD edges sharp
      }
    })
    const dInst = ((params.installHeightMm ?? mesh.installHeightMm) - mesh.installHeightMm) / 1000
    const rear: [number, number, number] = [0, REAR_PIVOT.y + dInst, REAR_PIVOT.z]
    const knuckle: [number, number, number] = jibBox.isEmpty() ? [0, 0.3, mesh.zMax - 0.6] : [0, jibBox.min.y + 0.1, (jibBox.min.z + jibBox.max.z) / 2]
    return { out, rear, knuckle, jibTop: jibBox.isEmpty() ? 1.6 : jibBox.max.y }
  }, [gltf, params, mesh])
  const edges = useMemo(() => built.out.map((o) => new THREE.EdgesGeometry(o.g, 35)), [built])
  const lim = useMemo(() => hookLimits(mesh, spec), [mesh, spec])
  const pose = clampPose(useHookPose(), lim)
  const setPose = useHookPose((s) => s.set)
  const { invalidate } = useThree()
  useEffect(() => { invalidate() }, [pose.tipDeg, pose.jibDeg, pose.slideMm, invalidate])
  const meshes = (part: HookPart) => built.out.map((o, i) => o.part !== part ? null : (
    <group key={i}>
      <mesh geometry={o.g} material={material} castShadow receiveShadow />
      <lineSegments geometry={edges[i]} material={edgeMat} />
    </group>
  ))
  const { rear, knuckle } = built
  const neg = (p: [number, number, number]): [number, number, number] => [-p[0], -p[1], -p[2]]
  // gizmo frame: local X → model +Z (forward), local Y → up; set beside the body (+X = towards the default camera)
  const side = 0.78
  // model → scene: X = xRear - (z - zMin)·1000, Y = frameTop + (y - yMin)·1000, Z = x·1000 (rotation −90° about Y)
  return (
    <group name="trw-hooklift-model" position={[xRear + mesh.zMin * 1000, frameTop - mesh.yMin * 1000, 0]} rotation={[0, -Math.PI / 2, 0]} scale={1000}>
      {meshes('sub')}
      <group position={rear}>
        <group name="hooklift-frame" rotation={[-pose.tipDeg * rad, 0, 0]}>
          <group position={[side, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <Protractor offset={0} value={pose.tipDeg} limits={[0, lim.tipMax]} radius={0.9} />
            <JointArcHandles id="hook-tip" offset={0} value={pose.tipDeg} limits={[0, lim.tipMax]} label="Sklopení" onAngle={(d) => setPose({ tipDeg: d })} />
          </group>
          <group position={neg(rear)}>
            {meshes('frame')}
            <group position={[0, 0, -pose.slideMm / 1000]}>
              <group position={knuckle}>
                <group name="hooklift-jib" rotation={[-pose.jibDeg * rad, 0, 0]}>
                  {lim.jibMax > 0 ? (
                    <group position={[side * 0.55, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
                      <Protractor offset={90} value={pose.jibDeg} limits={[0, lim.jibMax]} radius={0.55} />
                      <group position={[0, built.jibTop - knuckle[1] - 0.15, 0]}>
                        <JointArcHandles id="hook-jib" offset={90} value={pose.jibDeg} limits={[0, lim.jibMax]} label="Rameno háku" onAngle={(d) => setPose({ jibDeg: d })} />
                      </group>
                    </group>
                  ) : null}
                  {lim.slideMaxMm > 0 ? (
                    <group position={[side * 0.55, built.jibTop - knuckle[1] - 0.2, 0]} rotation={[0, Math.PI / 2, 0]}>
                      <TelescopeArrows value={pose.slideMm / 1000} max={lim.slideMaxMm / 1000} k={0.05} onValue={(m) => setPose({ slideMm: m * 1000 })} />
                    </group>
                  ) : null}
                  <group position={neg(knuckle)}>{meshes('jib')}</group>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

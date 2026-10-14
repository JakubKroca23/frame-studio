import { useGLTF } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Suspense, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Boundary } from './HookliftModel'
import { A1_CAD, forwardKinematics, inverseKinematics, L2_E4, REL_CAD, slewFromAzimuth, variantBoom, X142_GEOM, type CraneJoints, type CraneVariant } from './craneKinematics'

export const ARTICULATED_GLB = 'hiab-x-hipro-142e4-articulated.glb'
const material = new THREE.MeshStandardMaterial({ color: '#c8231b', metalness: 0.3, roughness: 0.5, side: THREE.DoubleSide })
const handleMat = new THREE.MeshStandardMaterial({ color: '#1f6fd1', emissive: '#0b3a7a', transparent: true, opacity: 0.85 })
const D2 = { r: X142_GEOM.tipRetractedE4.r - X142_GEOM.p2.r, h: X142_GEOM.tipRetractedE4.h - X142_GEOM.p2.h }
const U = { r: D2.r / Math.hypot(D2.r, D2.h), h: D2.h / Math.hypot(D2.r, D2.h) }
const rad = Math.PI / 180

export interface ArticulatedProps {
  x: number
  frameTop: number
  joints: CraneJoints
  variant: CraneVariant
  onJoints: (j: CraneJoints) => void
  fallback: ReactNode
}

export function CraneArticulated(props: ArticulatedProps) {
  return (
    <Boundary fallback={props.fallback}>
      <Suspense fallback={props.fallback}>
        <Loaded {...props} />
      </Suspense>
    </Boundary>
  )
}

function Loaded({ x, frameTop, joints, variant, onJoints }: ArticulatedProps) {
  const gltf = useGLTF(`${import.meta.env.BASE_URL}models/crane/${ARTICULATED_GLB}`)
  const groups = useMemo(() => {
    gltf.scene.updateMatrixWorld(true)
    const out: Record<string, THREE.BufferGeometry[]> = {}
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      let g = 'base'
      for (let p: THREE.Object3D | null = m; p; p = p.parent) if (p.parent === gltf.scene || p.parent?.type === 'Scene') g = p.name || g
      const pa = m.geometry.getAttribute('position')
      const arr = new Float32Array(pa.count * 3)
      const v = new THREE.Vector3()
      for (let i = 0; i < pa.count; i++) arr.set(v.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld).toArray(), i * 3)
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
      if (m.geometry.index) geo.setIndex(m.geometry.index)
      ;(out[g] ??= []).push(toCreasedNormals(geo, Math.PI / 6))
    })
    return out
  }, [gltf])
  const meshes = (g: string) => (groups[g] ?? []).map((geo, i) => <mesh key={`${g}${i}`} geometry={geo} material={material} castShadow receiveShadow />)

  const { l2 } = variantBoom(variant)
  const dl = l2 - L2_E4 // variant retracted length vs. the E-4 CAD
  const n = variant.extensions
  // 4 telescopes in the CAD; they extend equally, a variant with n sections moves the first n
  const extOff = (k: number) => dl + joints.ext * (Math.min(k, n) / n)
  const tipLocal = { r: D2.r + U.r * (dl + joints.ext), h: D2.h + U.h * (dl + joints.ext) }

  // ---- tip drag (IK) ----
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null
  const drag = useRef<{ plane: THREE.Plane } | null>(null)
  const tipRef = useRef<THREE.Mesh>(null)
  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const p = new THREE.Vector3()
    tipRef.current!.getWorldPosition(p)
    const nrm = new THREE.Vector3()
    camera.getWorldDirection(nrm)
    drag.current = { plane: new THREE.Plane().setFromNormalAndCoplanarPoint(nrm, p) }
    if (controls) controls.enabled = false
    ;(e.target as unknown as Element | null)?.setPointerCapture?.(e.pointerId)
  }
  const move = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return
    e.stopPropagation()
    const hit = new THREE.Vector3()
    if (!e.ray.intersectPlane(drag.current.plane, hit)) return
    const dx = (hit.x - x) / 1000, dz = hit.z / 1000, h = (hit.y - frameTop) / 1000
    const slew = slewFromAzimuth(dx, dz, joints.slew)
    onJoints(inverseKinematics({ r: Math.hypot(dx, dz), h }, variant, slew))
  }
  const up = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return
    drag.current = null
    if (controls) controls.enabled = true
    ;(e.target as unknown as Element | null)?.releasePointerCapture?.(e.pointerId)
  }

  const P1 = X142_GEOM.p1, P2 = X142_GEOM.p2
  return (
    <group name="trw-crane-model" position={[x, frameTop, 0]} scale={1000}>
      <group rotation={[0, -Math.PI / 2, 0]}>{meshes('base')}</group>
      <group name="trw-crane-slew" rotation={[0, -Math.PI / 2 + joints.slew * rad, 0]}>
        {meshes('column')}
        {meshes('cyl1')}
        <group position={[0, P1.h, P1.r]} rotation={[-(joints.a1 - A1_CAD) * rad, 0, 0]}>
          <group position={[0, -P1.h, -P1.r]}>{meshes('main')}</group>
          <group position={[0, P2.h - P1.h, P2.r - P1.r]} rotation={[-(joints.rel - REL_CAD) * rad, 0, 0]}>
            <group position={[0, -P2.h, -P2.r]}>
              {meshes('outer')}
              {[1, 2, 3, 4].map((k) => (
                <group key={k} position={[0, U.h * extOff(k), U.r * extOff(k)]}>
                  {meshes(`ext${k}`)}
                </group>
              ))}
            </group>
            <mesh ref={tipRef} name="crane-tip-handle" position={[X142_GEOM.lateralOffset, tipLocal.h, tipLocal.r]} material={handleMat} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
              <sphereGeometry args={[0.18, 20, 14]} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  )
}

/** Tip readout (scene mm → m). x along the vehicle from axle 1, y lateral (+ right), z height above ground. */
export function craneReadout(joints: CraneJoints, variant: CraneVariant, craneX: number, frameTop: number) {
  const t = forwardKinematics(joints, variant).tip
  const s = joints.slew * rad
  return {
    reach: t.r,
    height: frameTop / 1000 + t.h,
    x: craneX / 1000 - Math.cos(s) * t.r,
    y: Math.sin(s) * t.r,
  }
}

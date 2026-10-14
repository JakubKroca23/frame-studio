import { useGLTF } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { setLiveCrane } from './liveCrane'
import { CraneDimensions, LinearScale, Protractor } from './CraneGizmos'
import * as THREE from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Boundary } from './HookliftModel'
import { adaptGroups } from '../craneTpl/adaptMesh'
import { defOf, extFraction, forwardKinematics, inverseKinematics, jointLimits, loadAt, meshAngles, nearestEquivalent, setJoint, slewFromAzimuth, variantBoom, type CraneJoints, type CraneVariant, type JointKey } from './craneKinematics'

const material = new THREE.MeshStandardMaterial({ color: '#c8231b', metalness: 0.3, roughness: 0.5, side: THREE.DoubleSide })
const handleMat = new THREE.MeshStandardMaterial({ color: '#1f6fd1', emissive: '#0b3a7a', transparent: true, opacity: 0.85 })
const rad = Math.PI / 180
const jointMat = new THREE.MeshStandardMaterial({ color: '#f2a900', emissive: '#6b4a00', transparent: true, opacity: 0.9 })
const JOINT_NAMES: Record<JointKey, string> = { slew: 'Natočení', a1: 'Hlavní výložník', rel: 'Vnější výložník', ext: 'Výsuvy' }

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

function Loaded({ x, frameTop, joints: propJoints, variant, onJoints: propOnJoints }: ArticulatedProps) {
  // Live joints are local state, so a pointer move re-renders only the crane subtree. The page (panel,
  // stability, chassis) gets the value throttled (~8×/s) and on release.
  const [joints, setLive] = useState(propJoints)
  const sent = useRef<CraneJoints | null>(null)
  const pending = useRef<CraneJoints | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const same = (a: CraneJoints | null, b: CraneJoints) => !!a && a.slew === b.slew && a.a1 === b.a1 && a.rel === b.rel && a.ext === b.ext
  useEffect(() => {
    if (!same(sent.current, propJoints)) { setLive(propJoints); publish(propJoints) }
  }, [propJoints]) // eslint-disable-line react-hooks/exhaustive-deps
  function publish(j: CraneJoints) {
    const r = craneReadout(j, variant, x, frameTop)
    const ld = loadAt(variant, r.reach)
    setLiveCrane({ slewDeg: j.slew, outreachMm: r.reach * 1000, hookHeightMm: r.height * 1000, loadKg: ld?.kg ?? null, variant: `${defOf(variant).name.replace(/^HIAB /, '')} ${variant.id}` })
  }
  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (pending.current) { sent.current = pending.current; propOnJoints(pending.current); pending.current = null }
  }
  const raf = useRef(0)
  const latest = useRef<CraneJoints | null>(null)
  const onJoints = (j: CraneJoints) => {
    // coalesce pointer moves to one render per animation frame
    latest.current = j
    if (!raf.current) raf.current = requestAnimationFrame(() => { raf.current = 0; if (latest.current) { setLive(latest.current); publish(latest.current) } })
    pending.current = j
    if (!timer.current) timer.current = setTimeout(flush, 120)
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); cancelAnimationFrame(raf.current) }, [])
  useEffect(() => {
    window.addEventListener('pointerup', flush)
    return () => window.removeEventListener('pointerup', flush)
  })
  const def = defOf(variant)
  const mesh = meshAngles(def)
  const A1_CAD = mesh.a1, REL_CAD = mesh.rel, D2 = mesh.d2
  const Ud = { r: D2.r / mesh.l2, h: D2.h / mesh.l2 }
  const ed = def.geom.extDir ?? D2
  const U = { r: ed.r / Math.hypot(ed.r, ed.h), h: ed.h / Math.hypot(ed.r, ed.h) }
  const gltf = useGLTF(`${import.meta.env.BASE_URL}models/crane/${def.file}`)
  const raw = useMemo(() => {
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
  const { l2 } = variantBoom(variant)
  const dl = l2 - mesh.l2 // variant retracted length vs. the mesh variant
  const n = variant.extensions, S = def.meshExtSections
  const groups = useMemo(() => adaptGroups(raw, def, def.adapt ? dl : 0, n, Ud, U), [raw, def, dl, n]) // eslint-disable-line react-hooks/exhaustive-deps
  const meshes = (g: string) => (groups[g] ?? []).map((geo, i) => <mesh key={`${g}${i}`} geometry={geo} material={material} castShadow receiveShadow />)

  // S telescopes in the mesh. A variant with n < S shows only the first n (the n-th carries the hook); n > S adds
  // copies of the innermost section (adaptGroups). Stroke split per def.extStrokes (408: measured) or equal.
  void S
  const shown = n
  const frac = (k: number) => extFraction(def, n, k)
  const extPos = (k: number) => ({ r: Ud.r * dl + U.r * joints.ext * frac(k), h: Ud.h * dl + U.h * joints.ext * frac(k) })
  const tipLocal = { r: D2.r + Ud.r * dl + U.r * joints.ext, h: D2.h + Ud.h * dl + U.h * joints.ext }

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
    const slew = slewFromAzimuth(dx, dz, joints.slew, def.limits.slew)
    onJoints(inverseKinematics({ r: Math.hypot(dx, dz), h }, variant, slew))
  }
  const up = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return
    drag.current = null
    if (controls) controls.enabled = true
    ;(e.target as unknown as Element | null)?.releasePointerCapture?.(e.pointerId)
  }

  // ---- joint handles / protractors ----
  const [sel, setSel] = useState<JointKey | null>(null)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setSel(null) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  const jr = useRef(joints); jr.current = joints
  const setOne = (key: JointKey, val: number) => onJoints(setJoint(jr.current, key, key === 'ext' ? val : nearestEquivalent(val, jr.current[key]), variant))
  const pick = (key: JointKey) => ({ onPointerDown: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setSel(key) }, onClick: (e: ThreeEvent<MouseEvent>) => e.stopPropagation() })
  const lim = (k: JointKey) => jointLimits(k, variant)
  const ro = craneReadout(joints, variant, x, frameTop)
  const ld = loadAt(variant, ro.reach)
  const loadText = ld ? `max ${Math.round(ld.kg).toLocaleString('cs-CZ')} kg · ${(ld.kg * 9.81 * ro.reach / 1000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} kNm${ld.manual ? ' (ruční výsuv)' : ''}` : def.noLoadText
  const extBase = { r: def.geom.p2.r + D2.r + Ud.r * dl, h: def.geom.p2.h + D2.h + Ud.h * dl } // mesh frame (inside the −P2 group)
  const P1 = def.geom.p1, P2 = def.geom.p2
  const lat = def.geom.lateralOffset
  return (
   <>
    <CraneDimensions column={[x, 0]} tip={[ro.x * 1000, ro.y * 1000]} height={ro.height} reach={ro.reach} loadText={loadText} />
    <group name="trw-crane-model" position={[x, frameTop, 0]} scale={1000} onPointerMissed={() => setSel(null)}>
      <mesh name="crane-joint-slew" position={[0, 0.35, 0]} rotation={[-Math.PI / 2, 0, 0]} material={jointMat} {...pick('slew')}>
        <torusGeometry args={[0.55, 0.06, 10, 40]} />
      </mesh>
      {sel === 'slew' && (
        <group position={[0, 0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <Suspense fallback={null}><Protractor offset={180} value={joints.slew} limits={lim('slew')} radius={2.2} label={JOINT_NAMES.slew} onAngle={(d) => setOne('slew', d)} /></Suspense>
        </group>
      )}
      <group rotation={[0, -Math.PI / 2, 0]}>{meshes('base')}</group>
      <group name="trw-crane-slew" rotation={[0, -Math.PI / 2 + joints.slew * rad, 0]}>
        {meshes('column')}
        {meshes('cyl1')}
        <mesh name="crane-joint-a1" position={[lat, P1.h, P1.r]} material={jointMat} {...pick('a1')}><sphereGeometry args={[0.16, 18, 12]} /></mesh>
        {sel === 'a1' && (
          <group position={[lat + 0.25, P1.h, P1.r]} rotation={[0, -Math.PI / 2, 0]}>
            <Suspense fallback={null}><Protractor offset={0} value={joints.a1} limits={lim('a1')} radius={1.4} label={JOINT_NAMES.a1} onAngle={(d) => setOne('a1', d)} /></Suspense>
          </group>
        )}
        <group position={[0, P1.h, P1.r]} rotation={[-(joints.a1 - A1_CAD) * rad, 0, 0]}>
          <group position={[0, -P1.h, -P1.r]}>{meshes('main')}</group>
          <group position={[0, P2.h - P1.h, P2.r - P1.r]}>
          <mesh name="crane-joint-rel" position={[lat, 0, 0]} material={jointMat} {...pick('rel')}><sphereGeometry args={[0.16, 18, 12]} /></mesh>
          {sel === 'rel' && (
            <group position={[lat + 0.25, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
              {/* frame rotates with the main boom: absolute = φ + a1 − A1_CAD, so rel = φ − A1_CAD */}
              <group>
                <Suspense fallback={null}><Protractor offset={A1_CAD} value={joints.rel} limits={lim('rel')} radius={1.4} label={JOINT_NAMES.rel} onAngle={(d) => setOne('rel', d)} /></Suspense>
              </group>
            </group>
          )}
          <group rotation={[-(joints.rel - REL_CAD) * rad, 0, 0]}>
            <group position={[0, -P2.h, -P2.r]}>
              {meshes('outer')}
              {Array.from({ length: shown }, (_, i) => i + 1).map((k) => (
                <group key={k} position={[0, extPos(k).h, extPos(k).r]}>
                  {meshes(`ext${k}`)}
                </group>
              ))}
            </group>
            <mesh ref={tipRef} name="crane-tip-handle" position={[lat, tipLocal.h, tipLocal.r]} material={handleMat} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
              <sphereGeometry args={[0.18, 20, 14]} />
            </mesh>
            <group position={[0, -P2.h, -P2.r]}>
              <mesh name="crane-joint-ext" position={[lat, extBase.h + 0.25, extBase.r]} rotation={[-Math.atan2(U.h, U.r), 0, 0]} material={jointMat} {...pick('ext')}>
                <boxGeometry args={[0.18, 0.18, 0.4]} />
              </mesh>
              {sel === 'ext' && (
                <group position={[lat + 0.2, extBase.h + 0.35, extBase.r]} rotation={[0, -Math.PI / 2, 0]}>
                  <group rotation={[0, 0, Math.atan2(U.h, U.r)]}>
                    <Suspense fallback={null}><LinearScale value={joints.ext} max={lim('ext')[1]} onValue={(m) => setOne('ext', m)} /></Suspense>
                  </group>
                </group>
              )}
            </group>
          </group>
          </group>
        </group>
      </group>
    </group>
   </>
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

import { useGLTF } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { setLiveCrane } from './liveCrane'
import { CraneDimensions, JointArcHandles, LinearScale, Protractor, TelescopeArrows } from './CraneGizmos'
import * as THREE from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Boundary } from './HookliftModel'
import { adaptGroups } from '../craneTpl/adaptMesh'
import { defOf, extFraction, templateSectionStrokes, forwardKinematics, jointLimits, loadAt, meshAngles, nearestEquivalent, setJoint, variantBoom, type CraneJoints, type CraneVariant, type JointKey } from './craneKinematics'

const material = new THREE.MeshStandardMaterial({ color: '#222222', metalness: 0.35, roughness: 0.5, emissive: '#0b0d10', side: THREE.DoubleSide })
const handleMat = new THREE.MeshStandardMaterial({ color: '#E53935', emissive: '#7a1210', transparent: true, opacity: 0.85 })
const rad = Math.PI / 180
const jointMat = new THREE.MeshStandardMaterial({ color: '#E53935', emissive: '#7a1210', transparent: true, opacity: 0.9 })
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
  const vStroke = variantBoom(variant).stroke
  const groups = useMemo(() => adaptGroups(raw, def, def.adapt ? dl : 0, n, Ud, U, vStroke, def.adapt?.secStroke ?? templateSectionStrokes(def)), [raw, def, dl, n, vStroke]) // eslint-disable-line react-hooks/exhaustive-deps
  const meshes = (g: string) => (groups[g] ?? []).map((geo, i) => <mesh key={`${g}${i}`} geometry={geo} material={material} castShadow receiveShadow />)

  // S telescopes in the mesh. A variant with n < S shows only the first n (the n-th carries the hook); n > S adds
  // copies of the innermost section (adaptGroups). Stroke split per def.extStrokes (408: measured) or equal.
  void S
  const shown = n
  const frac = (k: number) => extFraction(def, n, k)
  const extPos = (k: number) => ({ r: Ud.r * dl + U.r * joints.ext * frac(k), h: Ud.h * dl + U.h * joints.ext * frac(k) })
  const tipLocal = { r: D2.r + Ud.r * dl + U.r * joints.ext, h: D2.h + Ud.h * dl + U.h * joints.ext }

  const tipRef = useRef<THREE.Mesh>(null)

  // ---- joint handles / protractors ----
  const [sel, setSel] = useState<JointKey | null>(null)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setSel(null) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  const jr = useRef(joints); jr.current = joints
  // test / capture hooks: select a joint, screen position of a named handle
  const { camera, scene, size } = useThree()
  useEffect(() => {
    const w = window as unknown as { __craneSel?: (k: JointKey | null) => void; __screenOf?: (n: string, lx?: number, ly?: number) => [number, number] | null }
    w.__craneSel = setSel
    w.__screenOf = (n, lx = 0, ly = 0) => { const o = scene.getObjectByName(n); if (!o) return null; o.updateWorldMatrix(true, false); const v = o.localToWorld(new THREE.Vector3(lx, ly, 0)).project(camera); return [(v.x + 1) / 2 * size.width, (1 - v.y) / 2 * size.height] }
  })
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
          <Suspense fallback={null}><Protractor offset={180} value={joints.slew} limits={lim('slew')} radius={1.1} /></Suspense>
        </group>
      )}
      <group position={[0, 0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <Suspense fallback={null}><JointArcHandles id="slew" offset={180} value={joints.slew} limits={lim('slew')} label={JOINT_NAMES.slew} onGrab={() => setSel('slew')} onAngle={(d) => setOne('slew', d)} /></Suspense>
      </group>
      <group rotation={[0, -Math.PI / 2, 0]}>{meshes('base')}</group>
      <group name="trw-crane-slew" rotation={[0, -Math.PI / 2 + joints.slew * rad, 0]}>
        {meshes('column')}
        {meshes('cyl1')}
        <mesh name="crane-joint-a1" position={[lat, P1.h, P1.r]} material={jointMat} {...pick('a1')}><sphereGeometry args={[0.16, 18, 12]} /></mesh>
        {sel === 'a1' && (
          <group position={[lat + 0.25, P1.h, P1.r]} rotation={[0, -Math.PI / 2, 0]}>
            <Suspense fallback={null}><Protractor offset={0} value={joints.a1} limits={lim('a1')} radius={0.7} /></Suspense>
          </group>
        )}
        <group position={[lat + 0.25, P1.h, P1.r]} rotation={[0, -Math.PI / 2, 0]}>
          <Suspense fallback={null}><JointArcHandles id="a1" offset={0} value={joints.a1} limits={lim('a1')} label={JOINT_NAMES.a1} onGrab={() => setSel('a1')} onAngle={(d) => setOne('a1', d)} /></Suspense>
        </group>
        <group position={[0, P1.h, P1.r]} rotation={[-(joints.a1 - A1_CAD) * rad, 0, 0]}>
          <group position={[0, -P1.h, -P1.r]}>{meshes('main')}</group>
          <group position={[0, P2.h - P1.h, P2.r - P1.r]}>
          <mesh name="crane-joint-rel" position={[lat, 0, 0]} material={jointMat} {...pick('rel')}><sphereGeometry args={[0.16, 18, 12]} /></mesh>
          {sel === 'rel' && (
            <group position={[lat + 0.25, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
              {/* frame rotates with the main boom: absolute = φ + a1 − A1_CAD, so rel = φ − A1_CAD */}
              <group>
                <Suspense fallback={null}><Protractor offset={A1_CAD} value={joints.rel} limits={lim('rel')} radius={0.7} /></Suspense>
              </group>
            </group>
          )}
          <group position={[lat + 0.25, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <Suspense fallback={null}><JointArcHandles id="rel" offset={A1_CAD} value={joints.rel} limits={lim('rel')} label={JOINT_NAMES.rel} onGrab={() => setSel('rel')} onAngle={(d) => setOne('rel', d)} /></Suspense>
          </group>
          <group rotation={[-(joints.rel - REL_CAD) * rad, 0, 0]}>
            <group position={[0, -P2.h, -P2.r]}>
              {meshes('outer')}
              {Array.from({ length: shown }, (_, i) => i + 1).map((k) => (
                <group key={k} position={[0, extPos(k).h, extPos(k).r]}>
                  {meshes(`ext${k}`)}
                </group>
              ))}
            </group>
            {/* tip marker only (no IK drag: angles change only via the ring arrows, the telescope via its arrows) */}
            <mesh ref={tipRef} name="crane-tip-handle" position={[lat, tipLocal.h, tipLocal.r]} material={handleMat} {...pick('ext')}>
              <sphereGeometry args={[0.18, 20, 14]} />
            </mesh>
            <group position={[lat + 0.3, tipLocal.h, tipLocal.r]} rotation={[0, -Math.PI / 2, 0]}>
              <group rotation={[0, 0, Math.atan2(U.h, U.r)]}>
                <Suspense fallback={null}><TelescopeArrows value={joints.ext} max={lim('ext')[1]} size={1} k={0.04} onValue={(m) => setOne('ext', m)} /></Suspense>
              </group>
            </group>
            <group position={[0, -P2.h, -P2.r]}>
              <mesh name="crane-joint-ext" position={[lat, extBase.h + 0.25, extBase.r]} rotation={[-Math.atan2(U.h, U.r), 0, 0]} material={jointMat} {...pick('ext')}>
                <boxGeometry args={[0.18, 0.18, 0.4]} />
              </mesh>
              {sel === 'ext' && (
                <group position={[lat + 0.2, extBase.h + 0.35, extBase.r]} rotation={[0, -Math.PI / 2, 0]}>
                  <group rotation={[0, 0, Math.atan2(U.h, U.r)]}>
                    <Suspense fallback={null}><LinearScale value={joints.ext} max={lim('ext')[1]} /></Suspense>
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

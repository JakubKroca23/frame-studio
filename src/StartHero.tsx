import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { queueProjectFile } from './openProject'
import { useApp } from './state'
import { Boundary } from './trw/HookliftModel'
import { DOORS, H } from './view/Environment'
import { Surroundings, type DoorLift } from './view/Environment'
import { vehicleFromFile, type DoorKind } from './home/vehicleFromFile'
import { spotForDoor, HEADING } from './home/pose'
import { useSceneFilters } from './view/sceneFilters'
import type { DriveState } from './home/DriveOut'
import { Sign3D } from './home/Sign3D'
import { handoff } from './home/handoff'
import { DW } from './view/Environment'

const DriveOut = lazy(() => import('./home/DriveOut').then((m) => ({ default: m.DriveOut })))
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
/** Generation slower than this → skip the show and go straight to the target page. */
const MAX_WAIT_MS = 12000
/** Show framing: from the front-left, the vehicle (stopped 17.5 m out, cab turned 45° left towards the camera) in the
 *  lower third with the hall front behind it. */
const SHOW_CAM = (s: { x: number; z: number }) => ({ pos: new THREE.Vector3(s.x - 9000, 9500, s.z + 17000), target: new THREE.Vector3(s.x + 3500, 2200, s.z - 5500) })
import { StudioLights } from './view/Viewport'

/**
 * Start page hero: the ContSystem hall with a dummy chassis, a HIAB crane and a Multilift in front of it.
 * Performance: one canvas, render on demand (OrbitControls invalidates while moving), dpr ≤ 2, hall merged per material,
 * exhibits are decimated single-mesh GLBs (scripts/hero-models.mjs, ~24k tris each, meshopt), baked floor shadows,
 * HTML labels are moved through refs (no React re-render per frame).
 */
const TARGET = new THREE.Vector3(-5200, 2600, H.z1 - 1000)
/** Dummy chassis in front of the middle door: centre x, z; length along X. */
/** Configurator dummy + any vehicle shown on the home scene: well out in the yard, clear of the door aprons. */
/** Home dummy stands where it always did (12.5 m out, perpendicular); the drive-out parks further (pose.STOP_Z). */
export const VEHICLE_SPOT = { x: spotForDoor(1).x, z: H.z1 + 12500 }
const CH = { ...VEHICLE_SPOT, len: 9000 }
// Exhibits stand on the yard beside the LEFT gable wall of the hall (x < H.x0), not in front of the doors.
const CRANE_AT = { x: H.x0 - 8500, z: H.z1 - 1500 }
const HOOK_AT = { x: H.x0 - 3300, z: H.z1 - 3000, len: 5900, rot: Math.PI / 2 }
// third in the row (left of the crane): HIAB auxiliary outriggers, 5 m variant, retracted
const AUX_AT = { x: H.x0 - 13500, z: H.z1 - 7000 }
const AUX_FILE = `${import.meta.env.BASE_URL}models/outrigger/hiab-aux-stab-5m.glb`
const FRAME_TOP = 1000
const MODELS = `${import.meta.env.BASE_URL}models/hero/`

const railMat = new THREE.MeshStandardMaterial({ color: '#2b2f35', metalness: 0.4, roughness: 0.5 })
const tyreMat = new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.9 })
const rimMat = new THREE.MeshStandardMaterial({ color: '#b9c0c6', metalness: 0.6, roughness: 0.35 })
const exhibitMat = new THREE.MeshStandardMaterial({ color: '#202225', metalness: 0.35, roughness: 0.5, side: THREE.DoubleSide })
const CHASSIS_MATS = [railMat, tyreMat, rimMat]
const EXHIBIT_MATS = [exhibitMat]
const standMat = new THREE.MeshStandardMaterial({ color: '#8ec5ff', roughness: 0.45, metalness: 0.35 })

/** Exhibits are see-through at rest and solid + glowing on hover (smooth). Per-exhibit material clones, so the
 *  shared catalogue/configurator materials are untouched; depthWrite stays on (no sorting artefacts within a model). */
const REST_OPACITY = 0.6
function useFadeMats(bases: THREE.MeshStandardMaterial[], hot: boolean, glow = 0.35) {
  const { invalidate } = useThree()
  const mats = useMemo(() => bases.map((b) => {
    const m = b.clone()
    m.transparent = true; m.opacity = REST_OPACITY; m.depthWrite = true
    m.emissive = new THREE.Color('#3ee6c4'); m.emissiveIntensity = 0
    return m
  }), [bases])
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats])
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 10), to = hot ? 1 : REST_OPACITY, ge = hot ? glow : 0
    let moving = false
    for (const m of mats) {
      m.opacity += (to - m.opacity) * k; m.emissiveIntensity += (ge - m.emissiveIntensity) * k
      if (Math.abs(to - m.opacity) > 0.004) moving = true
      else { m.opacity = to; m.emissiveIntensity = ge }
    }
    if (moving) invalidate()
  })
  useEffect(() => invalidate(), [hot, invalidate])
  return mats
}

/** Baked soft shadow (radial gradient) – static, no shadow map. */
const shadowMat = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64
  const c = cv.getContext('2d')!, g = c.createRadialGradient(32, 32, 4, 32, 32, 32)
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)')
  c.fillStyle = g; c.fillRect(0, 0, 64, 64)
  return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })
})()
function FloorShadow({ x, z = 0, sx, sz }: { x: number; z?: number; sx: number; sz: number }) {
  return <mesh position={[x, 10, z]} rotation={[-Math.PI / 2, 0, 0]} scale={[sx, sz, 1]} material={shadowMat}><planeGeometry args={[1, 1]} /></mesh>
}

type Hover = { hot: boolean; setHot: (h: boolean) => void; open: () => void }
const hoverProps = ({ setHot, open }: Hover) => ({
  onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHot(true); document.body.style.cursor = 'pointer' },
  onPointerOut: () => { setHot(false); document.body.style.cursor = '' },
  // click without drag only (OrbitControls drag ends with a click too)
  onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (e.delta <= 6) open() },
})

/** Frame + wheels only (no cab, no body) – the configurator entry. */
function DummyChassis({ hidden, ...h }: Hover & { hidden?: boolean }) {
  const [m, tyre, rim] = useFadeMats(CHASSIS_MATS, h.hot, 0.45), x0 = CH.x - CH.len / 2, axles = [x0 + 1500, x0 + 6400, x0 + 7750]
  return (
    <group name="start-dummy-chassis" position={[CH.x, 0, CH.z]} rotation={[0, HEADING, 0]} visible={!hidden} {...hoverProps(h)}><group position={[-CH.x, 0, 0]}>
      <FloorShadow x={CH.x} sx={CH.len + 1800} sz={3200} />
      {[-1, 1].map((s) => <mesh key={s} material={m} position={[CH.x, 1000, s * 420]}><boxGeometry args={[CH.len, 270, 90]} /></mesh>)}
      {[0.1, 0.3, 0.5, 0.7, 0.9].map((t) => <mesh key={t} material={m} position={[x0 + CH.len * t, 1000, 0]}><boxGeometry args={[120, 200, 750]} /></mesh>)}
      {axles.map((ax) => (
        <group key={ax}>
          <mesh material={m} position={[ax, 520, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[70, 70, 2000, 12]} /></mesh>
          {[-1, 1].map((s) => (
            <group key={s} position={[ax, 520, s * 1000]} rotation={[Math.PI / 2, 0, 0]}>
              <mesh material={tyre}><cylinderGeometry args={[520, 520, 320, 28]} /></mesh>
              <mesh material={rim} position={[0, s * -165, 0]}><cylinderGeometry args={[300, 300, 20, 20]} /></mesh>
            </group>
          ))}
        </group>
      ))}
    </group></group>
  )
}

/** Decimated exhibit GLB (metres, boom/arm along +Z) → scene mm, long axis along X, centred on x, bottom or origin at y. */
function ExhibitMesh({ file, x, y, hot, alignBottom }: { file: string; x: number; y: number; hot: boolean; alignBottom: boolean }) {
  const gltf = useGLTF(MODELS + file)
  const geo = useMemo(() => {
    gltf.scene.updateMatrixWorld(true)
    let out: THREE.BufferGeometry | null = null
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh || out) return
      // positions may be quantized (int16, meshopt) → copy to float before transforming
      const pa = m.geometry.getAttribute('position'), f = new Float32Array(pa.count * 3)
      for (let i = 0; i < pa.count; i++) f.set([pa.getX(i), pa.getY(i), pa.getZ(i)], i * 3)
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(f, 3))
      if (m.geometry.index) g.setIndex(m.geometry.index.clone())
      g.applyMatrix4(m.matrixWorld)
      out = toCreasedNormals(g, Math.PI / 6)
    })
    const g = (out ?? new THREE.BufferGeometry()) as THREE.BufferGeometry
    g.rotateY(-Math.PI / 2).scale(1000, 1000, 1000)
    g.computeBoundingBox()
    const b = g.boundingBox!
    g.translate(-(b.min.x + b.max.x) / 2, alignBottom ? -b.min.y : 0, -(b.min.z + b.max.z) / 2)
    return g
  }, [gltf, alignBottom])
  const [mat] = useFadeMats(EXHIBIT_MATS, hot)
  return <mesh geometry={geo} material={mat} position={[x, y, 0]} />
}

/** Open steel stand: top rectangular frame on 4 legs + light X bracing, merged into one geometry. */
const standCache = new Map<number, THREE.BufferGeometry>()
function steelStandGeo(len: number, brace = true, h = FRAME_TOP, w = 900, p = 80): THREE.BufferGeometry {
  const key = len * 2 + (brace ? 1 : 0)
  const hit = standCache.get(key)
  if (hit) return hit
  const parts: THREE.BufferGeometry[] = []
  const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, rx = 0, rz = 0) => {
    const g = new THREE.BoxGeometry(sx, sy, sz)
    if (rx || rz) g.rotateX(rx).rotateZ(rz)
    parts.push(g.translate(x, y, z))
  }
  const lx = len / 2 - p / 2, lz = w / 2 - p / 2, y0 = 3 // lift off floor -> no z-fighting
  // top frame (rails along X and Z)
  for (const s of [-1, 1]) box(len, p, p, 0, h - p / 2, s * lz)
  for (const s of [-1, 1]) box(p, p, w - 2 * p, s * lx, h - p / 2, 0)
  // legs + low stretchers
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(p, h - p - y0, p, sx * lx, y0 + (h - p - y0) / 2, sz * lz)
  for (const s of [-1, 1]) box(len - 2 * p, p * 0.6, p * 0.6, 0, y0 + 220, s * lz)
  // diagonal X bracing on long sides (thin flats)
  const bh = h - p - 260, bl = len - 2 * p
  const d = Math.hypot(bl, bh), a = Math.atan2(bh, bl)
  if (brace) for (const s of [-1, 1]) for (const k of [-1, 1]) box(d, 36, 18, 0, y0 + 260 + bh / 2 - 40, s * lz, 0, k * a)
  const g = mergeGeometries(parts.map((q) => q.toNonIndexed()))!
  standCache.set(key, g)
  return g
}
function SteelStand({ x, len, brace = true }: { x: number; len: number; brace?: boolean }) {
  return <mesh geometry={steelStandGeo(len, brace)} material={standMat} position={[x, 0, 0]} castShadow />
}

/** Multi-part GLB (metres) as one showpiece: shared exhibit material, centred on x, bottom on y. */
function AuxExhibitMesh({ x, y, hot }: { x: number; y: number; hot: boolean }) {
  const gltf = useGLTF(AUX_FILE)
  const obj = useMemo(() => {
    const o = gltf.scene.clone(true)
    o.scale.setScalar(1000)
    o.updateMatrixWorld(true)
    const b = new THREE.Box3().setFromObject(o)
    o.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2)
    return o
  }, [gltf])
  const [mat] = useFadeMats(EXHIBIT_MATS, hot)
  useEffect(() => { obj.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.material = mat }) }, [obj, mat])
  return <group position={[x, y, 0]}><primitive object={obj} /></group>
}

/** Clickable showpiece on a stand: hover ring + glow, click (not drag) opens the link. */
function Exhibit({ name, x, z, r, standLen, rot = 0, children, ...h }: Hover & { name: string; x: number; z: number; r: number; standLen: number; rot?: number; children: ReactNode }) {
  return (
    <group name={name} position={[x, 0, z]} rotation={[0, rot, 0]} {...hoverProps(h)}><group position={[-x, 0, 0]}>
      <FloorShadow x={x} sx={standLen + 2200} sz={3000} />
      <mesh position={[x, 16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r - 140, r, 64]} />
        <meshBasicMaterial color={h.hot ? '#3ee6c4' : '#5b6573'} transparent opacity={h.hot ? 0.95 : 0.45} depthWrite={false} polygonOffset polygonOffsetFactor={-6} polygonOffsetUnits={-6} />
      </mesh>
      <SteelStand x={x} len={standLen} brace={!rot} />
      <Boundary fallback={null}><Suspense fallback={null}>{children}</Suspense></Boundary>
    </group></group>
  )
}

/** Small floating logo/title + subtitle low in front of an exhibit (no board, no post), turned toward the default camera. */
function ExhibitSign({ x, z, w = 3600, title, sub, logo, hot, setHot, open, name }: Hover & { x: number; z: number; w?: number; title: string; sub: string; logo?: string; name: string }) {
  const cam = CAM_HOME(1), yaw = Math.atan2(cam.x - x, cam.z - z), W = w, Hs = 1250
  return <Sign3D name={name} bare w={W} h={Hs} title={title} sub={sub} logo={logo} hot={hot} position={[x, 60 + Hs / 2, z]} rotation={[0, yaw, 0]} onOver={() => setHot(true)} onOut={() => setHot(false)} onOpen={open} />
}

const CAM_HOME = (k: number) => new THREE.Vector3(TARGET.x - 2000 * k, 10500 + 1500 * (k - 1), H.z1 + 33000 * k)

/** Default view on the hall front (pulled back on portrait); free orbit afterwards. Moves the HTML labels via refs. */
function HeroCamera() {
  const { camera, size, gl, invalidate } = useThree()
  useEffect(() => { (window as unknown as { __heroInfo?: unknown }).__heroInfo = gl.info }, [gl])
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height)
    camera.position.copy(CAM_HOME(aspect < 1.2 ? 1.2 / aspect : 1))
    camera.lookAt(TARGET)
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, size, invalidate])
  return null
}

type Label = { label: string; sub: string; logo?: string; onClick: () => void; testid: string; hot?: boolean; setHot?: (h: boolean) => void; cfg?: boolean }

const SHOW_CFG = false
const SIGN_AT: Record<string, { x: number; z: number; w?: number }> = {
  'start-crane': { x: CRANE_AT.x, z: CRANE_AT.z + 2700 },
  'start-multilift': { x: HOOK_AT.x, z: HOOK_AT.z + 4300 },
  'start-aux': { x: AUX_AT.x - 400, z: AUX_AT.z + 2700, w: 5600 },
}

export function StartHero() {
  const dxf = useRef<HTMLInputElement>(null), trw = useRef<HTMLInputElement>(null), spec = useRef<HTMLInputElement>(null)
  const loadFile = useApp((s) => s.loadFile)
  const [doorHot, setDoorHot] = useState(-1)
  const [hot, setHot] = useState(false), [craneHot, setCraneHot] = useState(false), [hookHot, setHookHot] = useState(false), [auxHot, setAuxHot] = useState(false)
  const driving = useRef(false)
  const go = (h: string) => { if (driving.current) return; document.body.style.cursor = ''; window.location.hash = h }
  // --- drive-out show after a file pick: door rolls up, vehicle drives to VEHICLE_SPOT, door closes, then the target page
  const doorLift = useRef<number[]>([0, 0, 0]) as DoorLift
  const [drive, setDrive] = useState<DriveState | null>(null)
  useEffect(() => { driving.current = !!drive }, [drive])
  const [driveReady, setDriveReady] = useState(false)
  const finishRef = useRef<(() => void) | null>(null)
  /** End of the show (or skip / failure): hand off to the target page WITHOUT resetting the scene first. Resetting
   *  (drive → null) used to unmount the vehicle and remount every exhibit + label (crease-normal rebuild, material
   *  clones, shader compile) one frame before the route change – the visible hitch. Now the last frame stays as is
   *  and Root fades this screen out over the target page once that has rendered (home/handoff). */
  const finish = useCallback(() => { const f = finishRef.current; finishRef.current = null; if (!f) return; handoff.start(); f() }, [])
  /** The original action of each door; DXF parsing already started by the show (state.loadFile) is not repeated. */
  const proceed = (kind: DoorKind, f: File, loading = false) => {
    if (kind === 'dxf') { window.location.hash = '#vykres'; if (!loading) void loadFile(f) }
    else { queueProjectFile(f); window.location.hash = '#novy' }
  }
  const startDrive = (kind: DoorKind, f: File) => {
    useSceneFilters.getState().importDefaults()
    // crane controls stay hidden during the show (the configurator's own import turns them on for the final state)
    useSceneFilters.setState({ controls: false })
    if (reducedMotion()) return proceed(kind, f)
    const door = kind === 'dxf' ? 0 : kind === 'trw' ? 1 : 2
    finishRef.current = () => proceed(kind, f, true)
    setDrive({ door, vehicle: null })
    const bail = window.setTimeout(() => finishRef.current && finish(), MAX_WAIT_MS)
    vehicleFromFile(kind, f, loadFile)
      .then((vehicle) => { window.clearTimeout(bail); if (!finishRef.current) return; if (vehicle) setDrive({ door, vehicle }); else finish() })
      .catch(() => { window.clearTimeout(bail); if (finishRef.current) finish() })
  }
  // click / any key skips the show
  useEffect(() => {
    if (!drive) return
    // only Esc / Space skip; mouse and touch stay free for orbiting the camera during the show
    const skip = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === ' ') { e.preventDefault(); finish() } }
    window.addEventListener('keydown', skip)
    return () => window.removeEventListener('keydown', skip)
  }, [drive, finish])
  const items: Label[] = [
    { label: 'Import DXF podvozku', sub: 'bokorys / půdorys · DXF, DWG', onClick: () => dxf.current?.click(), testid: 'door-dxf' },
    { label: 'Import TRW', sub: '.trw projekt nebo export .json', onClick: () => trw.current?.click(), testid: 'door-trw' },
    { label: 'Specifikace PDF', sub: 'specifikace výrobce · MAN, Volvo, DAF', onClick: () => spec.current?.click(), testid: 'door-spec' },
    { label: 'Konfigurátor', sub: 'podvozek, rám, nápravy', onClick: () => go('#novy'), testid: 'start-cfg', hot, setHot, cfg: true },
    { label: 'HIAB', logo: 'brand/logo-hiab-color.svg', sub: 'Katalog dostupných jeřábů', onClick: () => go('#jeraby'), testid: 'start-crane', hot: craneHot, setHot: setCraneHot, cfg: true },
    { label: 'MULTILIFT', logo: 'brand/logo-multilift-color.svg', sub: 'Katalog dostupných nosičů', onClick: () => go('#multilift'), testid: 'start-multilift', hot: hookHot, setHot: setHookHot, cfg: true },
    { label: 'PŘÍDAVNÉ PODPĚRY', sub: 'Katalog dostupných přídavných podpěr', onClick: () => go('#podpery'), testid: 'start-aux', hot: auxHot, setHot: setAuxHot, cfg: true },
  ]
  return (
    <section className={drive ? 'start-hero is-driving' : 'start-hero'} aria-label="Hala ContSystem – vstup do CS Studia">
      <Canvas frameloop="demand" dpr={[1, 2]} camera={{ fov: 42, near: 100, far: 200000, position: [-9000, 9000, 9000] }}
        gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}>
        <color attach="background" args={['#b4c3cf']} />
        <StudioLights />
        <hemisphereLight args={['#d5dbe0', '#2a3036', 0.38]} />
        <ambientLight intensity={0.16} />
        <directionalLight position={[2500, 9000, 5200]} intensity={3.0} />
        <directionalLight position={[-6000, 4000, -2500]} intensity={0.85} />
        <Surroundings doorLift={doorLift} />
        {/* configurator dummy hidden for now (route #novy stays; imports still drive out → configurator) */}
        {SHOW_CFG ? <DummyChassis hidden={!!drive} hot={hot} setHot={setHot} open={() => go('#novy')} /> : null}
        {/* hidden (not unmounted) during the show: no rebuild / shader compile when it ends */}
        <group visible={!drive}>
        {items.slice(0, 3).map((it, i) => (
          <Sign3D key={it.testid} name={'sign-' + it.testid} w={DW * 0.8} h={1900} title={it.label} sub={it.sub} hot={doorHot === i}
            position={[DOORS[i], 3500, H.z1 - 250 + 90]} onOver={() => setDoorHot(i)} onOut={() => setDoorHot(-1)} onOpen={() => { if (!driving.current) it.onClick() }} />
        ))}
        {items.slice(4).map((it) => (
          <ExhibitSign key={it.testid} name={'sign-' + it.testid} {...SIGN_AT[it.testid]} title={it.label} sub={it.sub}
            logo={it.logo ? import.meta.env.BASE_URL + it.logo : undefined} hot={!!it.hot} setHot={it.setHot!} open={it.onClick} />
        ))}
        </group>
        {drive ? <Suspense fallback={null}><DriveOut state={drive} cam={SHOW_CAM} doorLift={doorLift} onDone={finish} onReady={() => setDriveReady(true)} /></Suspense> : null}
        <group visible={!drive}>
        <Exhibit name="start-crane" x={CRANE_AT.x} z={CRANE_AT.z} r={1900} standLen={1400} hot={craneHot} setHot={setCraneHot} open={() => go('#jeraby')}>
          <ExhibitMesh file="crane142.glb" x={CRANE_AT.x} y={FRAME_TOP} hot={craneHot} alignBottom={false} />
        </Exhibit>
        <Exhibit name="start-multilift" x={HOOK_AT.x} z={HOOK_AT.z} r={3600} standLen={HOOK_AT.len} rot={HOOK_AT.rot} hot={hookHot} setHot={setHookHot} open={() => go('#multilift')}>
          <ExhibitMesh file="multilift21s.glb" x={HOOK_AT.x} y={FRAME_TOP} hot={hookHot} alignBottom />
        </Exhibit>
        <Exhibit name="start-aux" x={AUX_AT.x} z={AUX_AT.z} r={1900} standLen={2600} hot={auxHot} setHot={setAuxHot} open={() => go('#podpery')}>
          <AuxExhibitMesh x={AUX_AT.x} y={FRAME_TOP} hot={auxHot} />
        </Exhibit>
        </group>
        <OrbitControls makeDefault enabled={!drive} target={TARGET} enableDamping minDistance={4000} maxDistance={60000} maxPolarAngle={Math.PI / 2 - 0.04} minAzimuthAngle={-1.75} maxAzimuthAngle={0.5} rotateSpeed={0.6} />
        <HeroCamera />
      </Canvas>
      {drive && !driveReady ? <div className="drive-loading" role="status"><span className="drive-spinner" aria-hidden="true" />Připravuji vozidlo…</div> : null}
      {/* labels live in the 3D scene; these buttons are visually hidden, for keyboard / screen readers */}
      {items.filter((it) => SHOW_CFG || it.testid !== 'start-cfg').map((it) => (
        <button key={it.testid} type="button" data-testid={it.testid} className="sr-only"
          onFocus={() => it.setHot?.(true)} onBlur={() => it.setHot?.(false)} onClick={it.onClick}>{it.label} – {it.sub}</button>
      ))}
      <input ref={dxf} hidden type="file" accept=".dxf,.dwg,.gz,.tgz,.zip,application/dxf,application/acad,application/octet-stream"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) startDrive('dxf', f) }} />
      <input ref={spec} hidden type="file" accept=".pdf,application/pdf"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) startDrive('spec', f) }} />
      <input ref={trw} hidden type="file" accept=".trw,.json,application/json,application/octet-stream"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) startDrive('trw', f) }} />
    </section>
  )
}

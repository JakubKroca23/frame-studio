import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
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

const DriveOut = lazy(() => import('./home/DriveOut').then((m) => ({ default: m.DriveOut })))
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
/** Generation slower than this → skip the show and go straight to the target page. */
const MAX_WAIT_MS = 12000
/** Show framing: hall front from the front-left, low, all three doors on the right; the vehicle parks front-left. */
const SHOW_CAM = (s: { x: number; z: number }) => ({ pos: new THREE.Vector3(s.x + 15000, 13000, s.z + 15000), target: new THREE.Vector3(s.x - 1000, 0, s.z - 2000) })
import { StudioLights } from './view/Viewport'

/**
 * Start page hero: the ContSystem hall with a dummy chassis, a HIAB crane and a Multilift in front of it.
 * Performance: one canvas, render on demand (OrbitControls invalidates while moving), dpr ≤ 2, hall merged per material,
 * exhibits are decimated single-mesh GLBs (scripts/hero-models.mjs, ~24k tris each, meshopt), baked floor shadows,
 * HTML labels are moved through refs (no React re-render per frame).
 */
const TARGET = new THREE.Vector3(-3500, 3200, H.z1 + 500)
/** Dummy chassis in front of the middle door: centre x, z; length along X. */
/** Configurator dummy + any vehicle shown on the home scene: well out in the yard, clear of the door aprons. */
export const VEHICLE_SPOT = spotForDoor(1)
const CH = { ...VEHICLE_SPOT, len: 9000 }
// Exhibits stand on the yard beside the LEFT gable wall of the hall (x < H.x0), not in front of the doors.
const CRANE_AT = { x: H.x0 - 9500, z: H.z1 - 2500 }
const HOOK_AT = { x: H.x0 - 3300, z: H.z1 - 3000, len: 5900, rot: Math.PI / 2 }
const FRAME_TOP = 1000
const MODELS = `${import.meta.env.BASE_URL}models/hero/`

const railMat = new THREE.MeshStandardMaterial({ color: '#2b2f35', metalness: 0.4, roughness: 0.5 })
const railHot = new THREE.MeshStandardMaterial({ color: '#2b2f35', metalness: 0.4, roughness: 0.5, emissive: '#3ee6c4', emissiveIntensity: 0.45 })
const tyreMat = new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.9 })
const rimMat = new THREE.MeshStandardMaterial({ color: '#b9c0c6', metalness: 0.6, roughness: 0.35 })
const exhibitMat = new THREE.MeshStandardMaterial({ color: '#202225', metalness: 0.35, roughness: 0.5, side: THREE.DoubleSide })
const exhibitHot = new THREE.MeshStandardMaterial({ color: '#202225', metalness: 0.35, roughness: 0.5, side: THREE.DoubleSide, emissive: '#3ee6c4', emissiveIntensity: 0.35 })
const standMat = new THREE.MeshStandardMaterial({ color: '#3a4048', roughness: 0.45, metalness: 0.55 })

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
  const m = h.hot ? railHot : railMat, x0 = CH.x - CH.len / 2, axles = [x0 + 1500, x0 + 6400, x0 + 7750]
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
              <mesh material={tyreMat}><cylinderGeometry args={[520, 520, 320, 28]} /></mesh>
              <mesh material={rimMat} position={[0, s * -165, 0]}><cylinderGeometry args={[300, 300, 20, 20]} /></mesh>
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
  return <mesh geometry={geo} material={hot ? exhibitHot : exhibitMat} position={[x, y, 0]} />
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

const CAM_HOME = (k: number) => new THREE.Vector3(TARGET.x - 10000 * k, 11500 + 1500 * (k - 1), H.z1 + 32000 * k)
const ANCHORS: [number, number, number][] = [...DOORS.map((x): [number, number, number] => [x, 3300, H.z1 + 300]), [CH.x, 2700, CH.z], [CRANE_AT.x, 5600, CRANE_AT.z], [HOOK_AT.x, 3600, HOOK_AT.z]]

/** Default view on the hall front (pulled back on portrait); free orbit afterwards. Moves the HTML labels via refs. */
function HeroCamera({ labels }: { labels: RefObject<(HTMLElement | null)[]> }) {
  const { camera, size, gl, invalidate } = useThree()
  useEffect(() => { (window as unknown as { __heroInfo?: unknown }).__heroInfo = gl.info }, [gl])
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height)
    camera.position.copy(CAM_HOME(aspect < 1.2 ? 1.2 / aspect : 1))
    camera.lookAt(TARGET)
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, size, invalidate])
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    camera.updateMatrixWorld()
    ANCHORS.forEach((p, i) => {
      const el = labels.current?.[i]
      if (!el) return
      v.set(...p).project(camera)
      const off = v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2
      el.style.visibility = off ? 'hidden' : 'visible'
      el.style.left = `${((v.x + 1) / 2) * size.width}px`
      el.style.top = `${((1 - v.y) / 2) * size.height}px`
    })
  })
  return null
}

type Label = { label: string; sub: string; logo?: string; onClick: () => void; testid: string; hot?: boolean; setHot?: (h: boolean) => void; cfg?: boolean }

export function StartHero() {
  const dxf = useRef<HTMLInputElement>(null), trw = useRef<HTMLInputElement>(null), spec = useRef<HTMLInputElement>(null)
  const loadFile = useApp((s) => s.loadFile)
  const labels = useRef<(HTMLElement | null)[]>([])
  const [hot, setHot] = useState(false), [craneHot, setCraneHot] = useState(false), [hookHot, setHookHot] = useState(false)
  const go = (h: string) => { document.body.style.cursor = ''; window.location.hash = h }
  // --- drive-out show after a file pick: door rolls up, vehicle drives to VEHICLE_SPOT, door closes, then the target page
  const doorLift = useRef<number[]>([0, 0, 0]) as DoorLift
  const [drive, setDrive] = useState<DriveState | null>(null)
  const finishRef = useRef<(() => void) | null>(null)
  const finish = useCallback(() => { const f = finishRef.current; finishRef.current = null; doorLift.current = [0, 0, 0]; setDrive(null); f?.() }, [doorLift])
  /** The original action of each door; DXF parsing already started by the show (state.loadFile) is not repeated. */
  const proceed = (kind: DoorKind, f: File, loading = false) => {
    if (kind === 'dxf') { window.location.hash = '#vykres'; if (!loading) void loadFile(f) }
    else { queueProjectFile(f); window.location.hash = '#novy' }
  }
  const startDrive = (kind: DoorKind, f: File) => {
    useSceneFilters.getState().importDefaults()
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
        <DummyChassis hidden={!!drive} hot={hot} setHot={setHot} open={() => go('#novy')} />
        {drive ? <Suspense fallback={null}><DriveOut state={drive} cam={SHOW_CAM} doorLift={doorLift} onDone={finish} /></Suspense> : null}
        {drive ? null : <>
        <Exhibit name="start-crane" x={CRANE_AT.x} z={CRANE_AT.z} r={1900} standLen={1400} hot={craneHot} setHot={setCraneHot} open={() => go('#jeraby')}>
          <ExhibitMesh file="crane142.glb" x={CRANE_AT.x} y={FRAME_TOP} hot={craneHot} alignBottom={false} />
        </Exhibit>
        <Exhibit name="start-multilift" x={HOOK_AT.x} z={HOOK_AT.z} r={3600} standLen={HOOK_AT.len} rot={HOOK_AT.rot} hot={hookHot} setHot={setHookHot} open={() => go('#multilift')}>
          <ExhibitMesh file="multilift21s.glb" x={HOOK_AT.x} y={FRAME_TOP} hot={hookHot} alignBottom />
        </Exhibit>
        </>}
        <OrbitControls makeDefault target={TARGET} enableDamping minDistance={4000} maxDistance={60000} maxPolarAngle={Math.PI / 2 - 0.04} minAzimuthAngle={-1.75} maxAzimuthAngle={0.5} rotateSpeed={0.6} />
        <HeroCamera labels={labels} />
      </Canvas>
      {items.map((it, i) => (
        <button key={it.testid} ref={(el) => { labels.current[i] = el }} type="button" data-testid={it.testid}
          className={it.cfg ? (it.hot ? 'door-btn cfg-btn is-hot' : 'door-btn cfg-btn') : 'door-btn'} style={{ left: -9999, top: -9999 }}
          onMouseEnter={() => it.setHot?.(true)} onMouseLeave={() => it.setHot?.(false)} onClick={it.onClick}>
          {it.logo ? <img className="start-logo" src={import.meta.env.BASE_URL + it.logo} alt={it.label} draggable={false} /> : <strong>{it.label}</strong>}
          <span>{it.sub}</span>
        </button>
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

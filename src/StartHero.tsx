import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Billboard, OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { queueProjectFile } from './openProject'
import { useApp } from './state'
import { Boundary } from './trw/HookliftModel'
import { DOORS, H } from './view/Environment'
import { Surroundings, type DoorLift } from './view/Environment'
import { type DoorKind } from './home/vehicleFromFile'
import { spotForDoor, HEADING, setPendingDrive } from './home/pose'
import { useSceneFilters } from './view/sceneFilters'
import { Sign3D } from './home/Sign3D'
import { DW } from './view/Environment'
import { DB_HASH } from './home/homeNav'

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
import { StudioLights } from './view/Viewport'

/**
 * Start page hero: the ContSystem hall with a dummy chassis, a HIAB crane and a Multilift in front of it.
 * Performance: one canvas, render on demand (OrbitControls invalidates while moving), dpr ≤ 2, hall merged per material,
 * exhibits are decimated single-mesh GLBs (scripts/hero-models.mjs, ~24k tris each, meshopt), baked floor shadows,
 * HTML labels are moved through refs (no React re-render per frame).
 */
/** Dummy chassis in front of the middle door: centre x, z; length along X. */
/** Configurator dummy + any vehicle shown on the home scene: well out in the yard, clear of the door aprons. */
/** Home dummy stands where it always did (12.5 m out, perpendicular); the drive-out parks further (pose.STOP_Z). */
export const VEHICLE_SPOT = { x: spotForDoor(1).x, z: H.z1 + 12500 }
const CH = { ...VEHICLE_SPOT, len: 9000 }
// Exhibits stand in a row along the LEFT outer wall of the hall, going back (−z): hidden behind the hall from the
// fixed door view, shown by the database view that looks at the wall from the left.
const ROW_X = H.x0 - 3000
const CRANE_AT = { x: ROW_X, z: H.z1 - 12000 }
const HOOK_AT = { x: ROW_X, z: H.z1 - 20000, len: 5900, rot: Math.PI / 2 }
// third in the row (furthest back): HIAB auxiliary outriggers, 5 m variant, retracted, turned along the wall
const AUX_AT = { x: ROW_X, z: H.z1 - 28000, rot: Math.PI / 2 }
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
/** ContSystem brand blue (index.css --blue) for hover highlights */
export const BRAND_BLUE = '#1f6fe0'
const REST_OPACITY = 0.6
function useFadeMats(bases: THREE.MeshStandardMaterial[], hot: boolean, glow = 0.55) {
  const { invalidate } = useThree()
  const mats = useMemo(() => bases.map((b) => {
    const m = b.clone()
    m.transparent = true; m.opacity = REST_OPACITY; m.depthWrite = true
    m.emissive = new THREE.Color(BRAND_BLUE); m.emissiveIntensity = 0
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
/** Kept for later (configurator entry on the home scene); not shown now. */
export function DummyChassis({ hidden, ...h }: Hover & { hidden?: boolean }) {
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
      <SteelStand x={x} len={standLen} brace={!rot} />
      <Boundary fallback={null}><Suspense fallback={null}>{children}</Suspense></Boundary>
    </group></group>
  )
}

/** Exhibit card above its model: identical size / fonts for all, category title + logo or short description,
 *  always facing the camera (billboard). */
const CARD = { w: 3800, h: 1900, y: 5400 }
function ExhibitSign({ x, z, title, sub, logo, hot, setHot, open, name }: Hover & { x: number; z: number; title: string; sub: string; logo?: string; name: string }) {
  return (
    <Billboard position={[x, CARD.y, z]} lockX lockZ>
      <Sign3D name={name} card w={CARD.w} h={CARD.h} title={title} sub={sub} logo={logo} hot={hot} onOver={() => setHot(true)} onOut={() => setHot(false)} onOpen={open} />
    </Billboard>
  )
}

export type HomeView = 'doors' | 'db'
/** Fixed views (no free orbit): the hall doors face-on, and the model database (3 exhibits left of the hall). */
const UP = new THREE.Vector3(0, 1, 0)
const VIEWS: Record<HomeView, { target: THREE.Vector3; dir: THREE.Vector3; halfW: number; halfH: number; tweak?: { far: number; right: number; up: number; yawLeft: number } }> = {
  doors: { target: new THREE.Vector3(DOORS[1], 5200, H.z1), dir: new THREE.Vector3(0, 0.1, 1).normalize(), halfW: (DOORS[2] - DOORS[0] + DW) / 2 + 1500, halfH: 5600,
    // Jakub: a bit farther, higher, more to the right, yawed a bit to the left
    tweak: { far: 1.2 * 1.28, right: 2500, up: 2500, yawLeft: (4 * Math.PI) / 180 } },
  // the row of exhibits along the left wall, seen from the left / slightly in front and above
  db: { target: new THREE.Vector3(ROW_X + 400, 2400, HOOK_AT.z + 2500), dir: new THREE.Vector3(-1, 0.36, 0.5).normalize(), halfW: 14500, halfH: 5200 },
}
function viewPose(v: HomeView, aspect: number, fov: number) {
  const V = VIEWS[v], t = Math.tan(((fov / 2) * Math.PI) / 180)
  const dist = Math.max(V.halfH / t, V.halfW / (t * aspect)) * (V.tweak?.far ?? 1)
  const pos = V.target.clone().addScaledVector(V.dir, dist), target = V.target.clone()
  if (V.tweak) {
    // camera moved right / up, then the view yawed to the left about the camera
    const right = new THREE.Vector3().subVectors(target, pos).cross(UP).setY(0).normalize()
    pos.addScaledVector(right, V.tweak.right).y += V.tweak.up
    target.sub(pos).applyAxisAngle(UP, V.tweak.yawLeft).add(pos)
  }
  return { pos, target }
}

/** Free look-around in both views (orbit / pan / zoom), only kept sane: zoom range, camera above the ground. */
const FREE = { minDist: 2500, maxDist: 140000, minPolar: 0.05, maxPolar: Math.PI / 2 - 0.06 }
type Ctl = { target: THREE.Vector3; enabled: boolean; update: () => void; minAzimuthAngle: number; maxAzimuthAngle: number; minPolarAngle: number; maxPolarAngle: number; minDistance: number; maxDistance: number; addEventListener: (e: string, f: () => void) => void; removeEventListener: (e: string, f: () => void) => void }

/** Camera rig: lands on the door view, glides smoothly between the view poses (from wherever the user is, controls
 *  off while gliding), then hands over to free OrbitControls. Renders on demand. */
function HeroCamera({ view }: { view: HomeView }) {
  const { camera, size, gl, invalidate, controls, scene } = useThree()
  const ctl = controls as unknown as Ctl | null
  const look = useRef<THREE.Vector3 | null>(null)
  const moving = useRef(false)
  const shownView = useRef<HomeView | null>(null)
  const userMoved = useRef(false)
  const goal = useRef(viewPose(view, 1, 42))
  useEffect(() => { Object.assign(window as unknown as object, { __heroInfo: gl.info, __heroCam: camera, __heroCtl: controls, __heroScene: scene, __heroGL: gl }) }, [gl, camera, controls, scene])
  const settle = () => {
    if (!ctl) return
    ctl.target.copy(goal.current.target)
    ctl.minAzimuthAngle = -Infinity; ctl.maxAzimuthAngle = Infinity
    ctl.minPolarAngle = FREE.minPolar; ctl.maxPolarAngle = FREE.maxPolar
    ctl.minDistance = FREE.minDist; ctl.maxDistance = FREE.maxDist
    ctl.enabled = true
    ctl.update()
  }
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera, aspect = size.width / Math.max(1, size.height)
    const changed = shownView.current !== view
    // resize only: keep the user's free camera; re-fit only while they have not moved it yet
    if (!changed && look.current && (userMoved.current || moving.current)) { if (moving.current) goal.current = viewPose(view, aspect, cam.fov); invalidate(); return }
    goal.current = viewPose(view, aspect, cam.fov)
    if (!look.current) {
      // landing: always on the door view; another requested view (#databaze) then glides in from there
      const d = viewPose('doors', aspect, cam.fov)
      camera.position.copy(d.pos); look.current = d.target.clone(); camera.lookAt(look.current); camera.updateMatrixWorld()
    }
    shownView.current = view
    userMoved.current = false
    if (ctl) ctl.enabled = false
    if (reducedMotion() || camera.position.distanceTo(goal.current.pos) < 5) {
      camera.position.copy(goal.current.pos); look.current.copy(goal.current.target); camera.lookAt(look.current); camera.updateMatrixWorld()
      moving.current = false; settle()
    } else {
      // glide from wherever the user looked around to
      if (ctl && changed) look.current.copy(ctl.target)
      moving.current = true
    }
    invalidate()
  }, [camera, size, view, invalidate, ctl]) // eslint-disable-line react-hooks/exhaustive-deps
  // user camera: remember it was moved; keep the orbit target on / above the ground
  useEffect(() => {
    if (!ctl) return
    const onStart = () => { userMoved.current = true }
    const onChange = () => {
      if (moving.current || ctl.target.y >= 0) return
      const dy = -ctl.target.y; ctl.target.y = 0; camera.position.y += dy
    }
    ctl.addEventListener('start', onStart); ctl.addEventListener('change', onChange)
    return () => { ctl.removeEventListener('start', onStart); ctl.removeEventListener('change', onChange) }
  }, [ctl, camera])
  useFrame((_, dt) => {
    if (!moving.current || !look.current) return
    const k = 1 - Math.exp(-dt * 3.2), g = goal.current
    camera.position.lerp(g.pos, k); look.current.lerp(g.target, k); camera.lookAt(look.current); camera.updateMatrixWorld()
    if (ctl) ctl.target.copy(look.current)
    if (camera.position.distanceTo(g.pos) > 5 || look.current.distanceTo(g.target) > 5) invalidate()
    else { camera.position.copy(g.pos); look.current.copy(g.target); camera.lookAt(look.current); moving.current = false; settle(); invalidate() }
  })
  return null
}

type Label = { label: string; sub: string; logo?: string; onClick: () => void; testid: string; hot?: boolean; setHot?: (h: boolean) => void; cfg?: boolean }

const SIGN_AT: Record<string, { x: number; z: number }> = {
  // centred above each exhibit
  'start-crane': { x: CRANE_AT.x, z: CRANE_AT.z },
  'start-multilift': { x: HOOK_AT.x, z: HOOK_AT.z },
  'start-aux': { x: AUX_AT.x, z: AUX_AT.z },
}

export function StartHero() {
  const dxf = useRef<HTMLInputElement>(null), trw = useRef<HTMLInputElement>(null), spec = useRef<HTMLInputElement>(null)
  const loadFile = useApp((s) => s.loadFile)
  const [doorHot, setDoorHot] = useState(-1)
  const [view, setViewRaw] = useState<HomeView>(() => (window.location.hash === DB_HASH ? 'db' : 'doors'))
  // #databaze = home screen in the database view (top bar 'Databáze' from any page); back to the doors clears it
  const setView = (v: HomeView) => {
    setViewRaw(v)
    if (v === 'doors' && window.location.hash === DB_HASH) history.replaceState(null, '', window.location.pathname + window.location.search)
  }
  useEffect(() => {
    const onHash = () => { if (window.location.hash === DB_HASH) setViewRaw('db') }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setView('doors') }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const [craneHot, setCraneHot] = useState(false), [hookHot, setHookHot] = useState(false), [auxHot, setAuxHot] = useState(false)
  const driving = useRef(false)
  const go = (h: string) => { if (driving.current) return; document.body.style.cursor = ''; window.location.hash = h }
  // Door import: the drive-out now plays inside the configurator scene itself (view/DriveEnv) – final UI from the
  // start, camera locked during the drive, no second scene / hand-off. DXF goes to the drawing flow directly.
  const drive = null as null | true
  const doorLift = useRef<number[]>([0, 0, 0]) as DoorLift
  const startDrive = (kind: DoorKind, f: File) => {
    useSceneFilters.getState().importDefaults()
    if (kind === 'dxf') { window.location.hash = '#vykres'; void loadFile(f); return }
    if (!reducedMotion()) setPendingDrive({ door: kind === 'trw' ? 1 : 2 })
    queueProjectFile(f); window.location.hash = '#novy'
  }
  // doors: left = model database (camera glides to the exhibits), middle = TRW import, right = empty for now.
  // DXF / PDF imports stay in code (inputs below, #vykres, configurator) but are not offered on the home screen.
  const doors: (Label | null)[] = [
    { label: 'Databáze modelů', sub: 'HIAB · Multilift · přídavné podpěry', onClick: () => setView('db'), testid: 'door-db' },
    { label: 'Import TRW', sub: '.trw projekt nebo export .json', onClick: () => trw.current?.click(), testid: 'door-trw' },
    null,
  ]
  const items: Label[] = [
    { label: 'Hydraulický jeřáb', logo: 'brand/logo-hiab-color.svg', sub: 'Katalog dostupných jeřábů', onClick: () => go('#jeraby'), testid: 'start-crane', hot: craneHot, setHot: setCraneHot, cfg: true },
    { label: 'Nosič kontejnerů', logo: 'brand/logo-multilift-color.svg', sub: 'Katalog dostupných nosičů', onClick: () => go('#multilift'), testid: 'start-multilift', hot: hookHot, setHot: setHookHot, cfg: true },
    { label: 'Přídavné podpěry', sub: 'Katalog přídavných podpěr', onClick: () => go('#podpery'), testid: 'start-aux', hot: auxHot, setHot: setAuxHot, cfg: true },
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
        {/* hidden (not unmounted) during the show: no rebuild / shader compile when it ends */}
        <group visible={!drive}>
        {doors.map((it, i) => it && (
          <Sign3D key={it.testid} name={'sign-' + it.testid} w={DW * 0.8} h={1900} title={it.label} sub={it.sub} hot={doorHot === i}
            position={[DOORS[i], 3500, H.z1 - 250 + 90]} onOver={() => setDoorHot(i)} onOut={() => setDoorHot(-1)} onOpen={() => { if (!driving.current) it.onClick() }} />
        ))}
        {view === 'db' && items.map((it) => (
          <ExhibitSign key={it.testid} name={'sign-' + it.testid} {...SIGN_AT[it.testid]} title={it.label} sub={it.sub}
            logo={it.logo ? import.meta.env.BASE_URL + it.logo : undefined} hot={!!it.hot} setHot={it.setHot!} open={it.onClick} />
        ))}
        </group>
        <group visible={!drive}>
        <Exhibit name="start-crane" x={CRANE_AT.x} z={CRANE_AT.z} r={1900} standLen={1400} hot={craneHot} setHot={setCraneHot} open={() => go('#jeraby')}>
          <ExhibitMesh file="crane142.glb" x={CRANE_AT.x} y={FRAME_TOP} hot={craneHot} alignBottom={false} />
        </Exhibit>
        <Exhibit name="start-multilift" x={HOOK_AT.x} z={HOOK_AT.z} r={3600} standLen={HOOK_AT.len} rot={HOOK_AT.rot} hot={hookHot} setHot={setHookHot} open={() => go('#multilift')}>
          <ExhibitMesh file="multilift21s.glb" x={HOOK_AT.x} y={FRAME_TOP} hot={hookHot} alignBottom />
        </Exhibit>
        <Exhibit name="start-aux" x={AUX_AT.x} z={AUX_AT.z} r={1900} standLen={2600} rot={AUX_AT.rot} hot={auxHot} setHot={setAuxHot} open={() => go('#podpery')}>
          <AuxExhibitMesh x={AUX_AT.x} y={FRAME_TOP} hot={auxHot} />
        </Exhibit>
        </group>
        <OrbitControls makeDefault enabled={false} enableDamping={false} rotateSpeed={0.5} zoomSpeed={0.6} panSpeed={0.6} />
        <HeroCamera view={view} />
      </Canvas>
      {/* labels live in the 3D scene; these buttons are visually hidden, for keyboard / screen readers */}
      {view === 'db' ? (
        <button type="button" className="hero-back" data-testid="hero-back" onClick={() => setView('doors')} title="Zpět ke dveřím (Esc)">← Zpět</button>
      ) : null}
      {[...doors.filter((d): d is Label => !!d), ...items].map((it) => (
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

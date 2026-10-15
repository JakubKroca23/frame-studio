import { OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import * as THREE from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { queueProjectFile } from './openProject'
import { useApp } from './state'
import { Boundary } from './trw/HookliftModel'
import { DOORS, H } from './view/Environment'
import { Surroundings } from './view/Environment'
import { StudioLights } from './view/Viewport'

/**
 * Start page hero: the ContSystem hall with a dummy chassis, a HIAB crane and a Multilift in front of it.
 * Performance: one canvas, render on demand (OrbitControls invalidates while moving), dpr ≤ 2, hall merged per material,
 * exhibits are decimated single-mesh GLBs (scripts/hero-models.mjs, ~24k tris each, meshopt), baked floor shadows,
 * HTML labels are moved through refs (no React re-render per frame).
 */
const TARGET = new THREE.Vector3(6000, 3600, H.z1 + 2500)
/** Dummy chassis in front of the middle door: centre x, z; length along X. */
const CH = { x: 6000, z: H.z1 + 7500, len: 9000 }
const CRANE_AT = { x: CH.x - CH.len / 2 - 3800, z: CH.z }
const HOOK_AT = { x: CH.x + CH.len / 2 + 7200, z: CH.z, len: 5900 }
const FRAME_TOP = 1000
const MODELS = `${import.meta.env.BASE_URL}models/hero/`

const railMat = new THREE.MeshStandardMaterial({ color: '#2b2f35', metalness: 0.4, roughness: 0.5 })
const railHot = new THREE.MeshStandardMaterial({ color: '#2b2f35', metalness: 0.4, roughness: 0.5, emissive: '#3ee6c4', emissiveIntensity: 0.45 })
const tyreMat = new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.9 })
const rimMat = new THREE.MeshStandardMaterial({ color: '#b9c0c6', metalness: 0.6, roughness: 0.35 })
const exhibitMat = new THREE.MeshStandardMaterial({ color: '#202225', metalness: 0.35, roughness: 0.5, side: THREE.DoubleSide })
const exhibitHot = new THREE.MeshStandardMaterial({ color: '#202225', metalness: 0.35, roughness: 0.5, side: THREE.DoubleSide, emissive: '#3ee6c4', emissiveIntensity: 0.35 })
const standMat = new THREE.MeshStandardMaterial({ color: '#3a4048', roughness: 0.7 })

/** Baked soft shadow (radial gradient) – static, no shadow map. */
const shadowMat = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64
  const c = cv.getContext('2d')!, g = c.createRadialGradient(32, 32, 4, 32, 32, 32)
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)')
  c.fillStyle = g; c.fillRect(0, 0, 64, 64)
  return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })
})()
function FloorShadow({ x, z = 0, sx, sz }: { x: number; z?: number; sx: number; sz: number }) {
  return <mesh position={[x, 3, z]} rotation={[-Math.PI / 2, 0, 0]} scale={[sx, sz, 1]} material={shadowMat}><planeGeometry args={[1, 1]} /></mesh>
}

type Hover = { hot: boolean; setHot: (h: boolean) => void; open: () => void }
const hoverProps = ({ setHot, open }: Hover) => ({
  onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHot(true); document.body.style.cursor = 'pointer' },
  onPointerOut: () => { setHot(false); document.body.style.cursor = '' },
  // click without drag only (OrbitControls drag ends with a click too)
  onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (e.delta <= 6) open() },
})

/** Frame + wheels only (no cab, no body) – the configurator entry. */
function DummyChassis(h: Hover) {
  const m = h.hot ? railHot : railMat, x0 = CH.x - CH.len / 2, axles = [x0 + 1500, x0 + 6400, x0 + 7750]
  return (
    <group name="start-dummy-chassis" position={[0, 0, CH.z]} {...hoverProps(h)}>
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
    </group>
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

/** Clickable showpiece on a stand: hover ring + glow, click (not drag) opens the link. */
function Exhibit({ name, x, z, r, standLen, children, ...h }: Hover & { name: string; x: number; z: number; r: number; standLen: number; children: ReactNode }) {
  return (
    <group name={name} position={[0, 0, z]} {...hoverProps(h)}>
      <FloorShadow x={x} sx={standLen + 2200} sz={3000} />
      <mesh position={[x, 6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r - 140, r, 64]} />
        <meshBasicMaterial color={h.hot ? '#3ee6c4' : '#5b6573'} transparent opacity={h.hot ? 0.95 : 0.45} />
      </mesh>
      <mesh position={[x, FRAME_TOP / 2, 0]} material={standMat}><boxGeometry args={[standLen, FRAME_TOP, 900]} /></mesh>
      <Boundary fallback={null}><Suspense fallback={null}>{children}</Suspense></Boundary>
    </group>
  )
}

const CAM_HOME = (k: number) => new THREE.Vector3(TARGET.x - 15500 * k, 9200 + 1500 * (k - 1), H.z1 + 21000 * k)
const ANCHORS: [number, number, number][] = [...DOORS.slice(0, 2).map((x): [number, number, number] => [x, 3300, H.z1 + 300]), [DOORS[1], 1700, H.z1 + 300], [CH.x, 2700, CH.z], [CRANE_AT.x, 4300, CRANE_AT.z], [HOOK_AT.x, 3600, HOOK_AT.z]]

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

type Label = { label: string; sub: string; onClick: () => void; testid: string; hot?: boolean; setHot?: (h: boolean) => void; cfg?: boolean }

export function StartHero() {
  const dxf = useRef<HTMLInputElement>(null), trw = useRef<HTMLInputElement>(null), spec = useRef<HTMLInputElement>(null)
  const loadFile = useApp((s) => s.loadFile)
  const labels = useRef<(HTMLElement | null)[]>([])
  const [hot, setHot] = useState(false), [craneHot, setCraneHot] = useState(false), [hookHot, setHookHot] = useState(false)
  const go = (h: string) => { document.body.style.cursor = ''; window.location.hash = h }
  const items: Label[] = [
    { label: 'Import DXF podvozku', sub: 'bokorys / půdorys · DXF, DWG', onClick: () => dxf.current?.click(), testid: 'door-dxf' },
    { label: 'Import TRW', sub: '.trw projekt nebo export .json', onClick: () => trw.current?.click(), testid: 'door-trw' },
    { label: 'Specifikace PDF', sub: 'popis vozidla výrobce · MAN', onClick: () => spec.current?.click(), testid: 'door-spec' },
    { label: 'Konfigurátor', sub: 'podvozek, rám, nápravy', onClick: () => go('#novy'), testid: 'start-cfg', hot, setHot, cfg: true },
    { label: 'Jeřáby HIAB', sub: 'katalog, X-HiPro 142', onClick: () => go('#jeraby'), testid: 'start-crane', hot: craneHot, setHot: setCraneHot, cfg: true },
    { label: 'Multilift', sub: 'nosiče kontejnerů', onClick: () => go('#multilift'), testid: 'start-multilift', hot: hookHot, setHot: setHookHot, cfg: true },
  ]
  return (
    <section className="start-hero" aria-label="Hala ContSystem – vstup do CS Studia">
      <Canvas frameloop="demand" dpr={[1, 2]} camera={{ fov: 42, near: 100, far: 200000, position: [-9000, 9000, 9000] }}
        gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}>
        <color attach="background" args={['#b4c3cf']} />
        <StudioLights />
        <hemisphereLight args={['#d5dbe0', '#2a3036', 0.38]} />
        <ambientLight intensity={0.16} />
        <directionalLight position={[2500, 9000, 5200]} intensity={3.0} />
        <directionalLight position={[-6000, 4000, -2500]} intensity={0.85} />
        <Surroundings />
        <DummyChassis hot={hot} setHot={setHot} open={() => go('#novy')} />
        <Exhibit name="start-crane" x={CRANE_AT.x} z={CRANE_AT.z} r={1900} standLen={1400} hot={craneHot} setHot={setCraneHot} open={() => go('#jeraby')}>
          <ExhibitMesh file="crane142.glb" x={CRANE_AT.x} y={FRAME_TOP} hot={craneHot} alignBottom={false} />
        </Exhibit>
        <Exhibit name="start-multilift" x={HOOK_AT.x} z={HOOK_AT.z} r={3600} standLen={HOOK_AT.len} hot={hookHot} setHot={setHookHot} open={() => go('#multilift')}>
          <ExhibitMesh file="multilift21s.glb" x={HOOK_AT.x} y={FRAME_TOP} hot={hookHot} alignBottom />
        </Exhibit>
        <OrbitControls makeDefault target={TARGET} enableDamping minDistance={4000} maxDistance={60000} maxPolarAngle={Math.PI / 2 - 0.04} minAzimuthAngle={-1.75} maxAzimuthAngle={0.5} rotateSpeed={0.6} />
        <HeroCamera labels={labels} />
      </Canvas>
      {items.map((it, i) => (
        <button key={it.testid} ref={(el) => { labels.current[i] = el }} type="button" data-testid={it.testid}
          className={it.cfg ? (it.hot ? 'door-btn cfg-btn is-hot' : 'door-btn cfg-btn') : 'door-btn'} style={{ left: -9999, top: -9999 }}
          onMouseEnter={() => it.setHot?.(true)} onMouseLeave={() => it.setHot?.(false)} onClick={it.onClick}>
          <strong>{it.label}</strong>
          <span>{it.sub}</span>
        </button>
      ))}
      <input ref={dxf} hidden type="file" accept=".dxf,.dwg,.gz,.tgz,.zip,application/dxf,application/acad,application/octet-stream"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { window.location.hash = '#vykres'; void loadFile(f) } }} />
      <input ref={spec} hidden type="file" accept=".pdf,application/pdf"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { queueProjectFile(f); window.location.hash = '#novy' } }} />
      <input ref={trw} hidden type="file" accept=".trw,.json,application/json,application/octet-stream"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { queueProjectFile(f); window.location.hash = '#novy' } }} />
    </section>
  )
}

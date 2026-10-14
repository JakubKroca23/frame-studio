import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CraneModel, craneModelFor } from './trw/CraneModel'
import { HookliftModel } from './trw/HookliftModel'
import { hookliftPlacement } from './trw/hooklift'
import * as THREE from 'three'
import { queueProjectFile } from './openProject'
import { useApp } from './state'
import { DOORS, H } from './view/Environment'
import { Surroundings } from './view/Environment'
import { StudioLights } from './view/Viewport'

const TARGET = new THREE.Vector3(6000, 3600, H.z1 + 2500)
/** Dummy chassis in front of the middle door: centre x, z; length along X. */
const CH = { x: 6000, z: H.z1 + 7500, len: 9000 }

const railMat = new THREE.MeshStandardMaterial({ color: '#2b2f35', metalness: 0.4, roughness: 0.5 })
const railHot = new THREE.MeshStandardMaterial({ color: '#2b2f35', metalness: 0.4, roughness: 0.5, emissive: '#3ee6c4', emissiveIntensity: 0.45 })
const tyreMat = new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.9 })
const rimMat = new THREE.MeshStandardMaterial({ color: '#b9c0c6', metalness: 0.6, roughness: 0.35 })

/** Frame + wheels only (no cab, no body) – the configurator entry. */
function DummyChassis({ hot, setHot, open }: { hot: boolean; setHot: (h: boolean) => void; open: () => void }) {
  const m = hot ? railHot : railMat, x0 = CH.x - CH.len / 2, axles = [x0 + 1500, x0 + 6400, x0 + 7750]
  return (
    <group name="start-dummy-chassis" position={[0, 0, CH.z]}
      onPointerOver={(e) => { e.stopPropagation(); setHot(true); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { setHot(false); document.body.style.cursor = '' }}
      onClick={(e) => { e.stopPropagation(); if (e.delta <= 6) open() }}>
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

/** A crane and a Multilift on display next to the dummy chassis (same z, either side). */
const CRANE_AT = { x: CH.x - CH.len / 2 - 3800, z: CH.z }
const HOOK_AT = { x: CH.x + CH.len / 2 + 7200, z: CH.z, len: 5900 }
const FRAME_TOP = 1000

/** Clickable showpiece: hover ring on the floor, click (not drag) opens the link. */
function Exhibit({ name, x, z, r, hot, setHot, open, children }: { name: string; x: number; z: number; r: number; hot: boolean; setHot: (h: boolean) => void; open: () => void; children: ReactNode }) {
  return (
    <group name={name} position={[0, 0, z]}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHot(true); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { setHot(false); document.body.style.cursor = '' }}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (e.delta <= 6) open() }}>
      <mesh position={[x, 6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r - 140, r, 64]} />
        <meshBasicMaterial color={hot ? '#3ee6c4' : '#5b6573'} transparent opacity={hot ? 0.95 : 0.45} />
      </mesh>
      {/* pedestal = frame stand-in */}
      <mesh position={[x, FRAME_TOP / 2, 0]}><boxGeometry args={[x === CRANE_AT.x ? 1400 : HOOK_AT.len, FRAME_TOP, 900]} /><meshStandardMaterial color={hot ? '#2f6f66' : '#3a4048'} roughness={0.7} /></mesh>
      {children}
    </group>
  )
}

const CAM_HOME = (k: number) => new THREE.Vector3(TARGET.x - 15500 * k, 9200 + 1500 * (k - 1), H.z1 + 21000 * k)

/** Default view on the hall front (pulled back on portrait); free orbit afterwards. Projects the label anchors every frame. */
function HeroCamera({ anchors, onProject }: { anchors: [number, number, number][]; onProject: (pts: [number, number][]) => void }) {
  const { camera, size } = useThree()
  const last = useRef('')
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height)
    camera.position.copy(CAM_HOME(aspect < 1.2 ? 1.2 / aspect : 1))
    camera.lookAt(TARGET)
    camera.updateProjectionMatrix()
  }, [camera, size])
  useFrame(() => {
    camera.updateMatrixWorld()
    const pts = anchors.map((p): [number, number] => { const v = new THREE.Vector3(...p).project(camera); return v.z > 1 ? [-9999, -9999] : [Math.round(((v.x + 1) / 2) * size.width), Math.round(((1 - v.y) / 2) * size.height)] })
    const key = JSON.stringify(pts)
    if (key !== last.current) { last.current = key; onProject(pts) }
  })
  return null
}

const ANCHORS: [number, number, number][] = [...DOORS.slice(0, 2).map((x): [number, number, number] => [x, 3300, H.z1 + 300]), [CH.x, 2700, CH.z], [CRANE_AT.x, 4300, CRANE_AT.z], [HOOK_AT.x, 3600, HOOK_AT.z]]

type Door = { label: string; sub: string; onClick: () => void; testid: string }

/** Start page hero: the ContSystem hall, its doors are the entry points (DXF chassis, trw project, new project). */
export function StartHero() {
  const dxf = useRef<HTMLInputElement>(null), trw = useRef<HTMLInputElement>(null)
  const loadFile = useApp((s) => s.loadFile)
  const [pts, setPts] = useState<[number, number][]>([])
  const [hot, setHot] = useState(false), [craneHot, setCraneHot] = useState(false), [hookHot, setHookHot] = useState(false)
  const crane = craneModelFor('X-HiPro 142')
  const hook = hookliftPlacement({ name: 'ULT21S 5900', xFrom: null, xTo: null, length: null, height: null }, HOOK_AT.x + HOOK_AT.len / 2)
  const go = (h: string) => { document.body.style.cursor = ''; window.location.hash = h }
  const openCfg = () => { document.body.style.cursor = ''; window.location.hash = '#novy' }
  const doors: Door[] = [
    { label: 'Import DXF podvozku', sub: 'bokorys / půdorys · DXF, DWG', onClick: () => dxf.current?.click(), testid: 'door-dxf' },
    { label: 'Import TRW', sub: '.trw projekt nebo export .json', onClick: () => trw.current?.click(), testid: 'door-trw' },
  ]
  return (
    <section className="start-hero" aria-label="Hala ContSystem – vstup do CS Studia">
      <Canvas frameloop="always" dpr={[1, 1.5]} camera={{ fov: 42, near: 100, far: 200000, position: [-9000, 9000, 9000] }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}>
        <color attach="background" args={['#b4c3cf']} />
        <StudioLights />
        <hemisphereLight args={['#d5dbe0', '#2a3036', 0.38]} />
        <ambientLight intensity={0.16} />
        <directionalLight position={[2500, 9000, 5200]} intensity={3.0} />
        <directionalLight position={[-6000, 4000, -2500]} intensity={0.85} />
        <Surroundings />
        <DummyChassis hot={hot} setHot={setHot} open={openCfg} />
        <Exhibit name="start-crane" x={CRANE_AT.x} z={CRANE_AT.z} r={1900} hot={craneHot} setHot={setCraneHot} open={() => go('#jeraby')}>
          {crane ? <CraneModel file={crane.file} x={CRANE_AT.x} frameTop={FRAME_TOP} slewDeg={0} fallback={null} /> : null}
        </Exhibit>
        <Exhibit name="start-multilift" x={HOOK_AT.x} z={HOOK_AT.z} r={3600} hot={hookHot} setHot={setHookHot} open={() => go('#multilift')}>
          <HookliftModel xRear={hook.xRear} frameTop={FRAME_TOP} params={hook.params} mesh={hook.mesh} fallback={null} />
        </Exhibit>
        <OrbitControls makeDefault target={TARGET} enableDamping minDistance={4000} maxDistance={60000} maxPolarAngle={Math.PI / 2 - 0.04} minAzimuthAngle={-1.75} maxAzimuthAngle={0.5} rotateSpeed={0.6} />
        <HeroCamera anchors={ANCHORS} onProject={setPts} />
      </Canvas>
      {pts[2] ? (
        <button type="button" className={hot ? 'door-btn cfg-btn is-hot' : 'door-btn cfg-btn'} data-testid="start-cfg" style={{ left: pts[2][0], top: pts[2][1] }}
          onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)} onClick={openCfg}>
          <strong>Konfigurátor</strong><span>podvozek, rám, nápravy</span>
        </button>
      ) : null}
      {pts[3] ? (
        <button type="button" className={craneHot ? 'door-btn cfg-btn is-hot' : 'door-btn cfg-btn'} data-testid="start-crane" style={{ left: pts[3][0], top: pts[3][1] }}
          onMouseEnter={() => setCraneHot(true)} onMouseLeave={() => setCraneHot(false)} onClick={() => go('#jeraby')}>
          <strong>Jeřáby HIAB</strong><span>katalog, X-HiPro 142</span>
        </button>
      ) : null}
      {pts[4] ? (
        <button type="button" className={hookHot ? 'door-btn cfg-btn is-hot' : 'door-btn cfg-btn'} data-testid="start-multilift" style={{ left: pts[4][0], top: pts[4][1] }}
          onMouseEnter={() => setHookHot(true)} onMouseLeave={() => setHookHot(false)} onClick={() => go('#multilift')}>
          <strong>Multilift</strong><span>nosiče kontejnerů</span>
        </button>
      ) : null}
      {pts.slice(0, 2).map(([x, y], i) => (
        <button key={doors[i].testid} type="button" className="door-btn" data-testid={doors[i].testid} onClick={doors[i].onClick} style={{ left: x, top: y }}>
          <strong>{doors[i].label}</strong>
          <span>{doors[i].sub}</span>
        </button>
      ))}
      <input ref={dxf} hidden type="file" accept=".dxf,.dwg,.gz,.tgz,.zip,application/dxf,application/acad,application/octet-stream"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { window.location.hash = '#vykres'; void loadFile(f) } }} />
      <input ref={trw} hidden type="file" accept=".trw,.json,application/json,application/octet-stream"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { queueProjectFile(f); window.location.hash = '#novy' } }} />
    </section>
  )
}

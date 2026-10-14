import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { queueProjectFile } from './openProject'
import { useApp } from './state'
import { DOORS, H } from './view/Environment'
import { Surroundings } from './view/Environment'
import { StudioLights } from './view/Viewport'

const TARGET = new THREE.Vector3(6000, 4300, H.z1)

/** Fixed view on the hall front; pulls back on portrait screens so all three doors stay in frame. */
function HeroCamera({ onProject }: { onProject: (pts: [number, number][]) => void }) {
  const { camera, size } = useThree()
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height)
    const k = aspect < 1.2 ? 1.2 / aspect : 1
    camera.position.set(TARGET.x - 15500 * k, 9200 + 1500 * (k - 1), H.z1 + 21000 * k)
    camera.lookAt(TARGET)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    onProject(DOORS.map((x) => { const v = new THREE.Vector3(x, 3300, H.z1 + 300).project(camera); return [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height] }))
  }, [camera, size, onProject])
  return null
}

type Door = { label: string; sub: string; onClick: () => void; testid: string }

/** Start page hero: the ContSystem hall, its doors are the entry points (DXF chassis, trw project, new project). */
export function StartHero() {
  const dxf = useRef<HTMLInputElement>(null), trw = useRef<HTMLInputElement>(null)
  const loadFile = useApp((s) => s.loadFile)
  const [pts, setPts] = useState<[number, number][]>([])
  const doors: Door[] = [
    { label: 'Import DXF podvozku', sub: 'bokorys / půdorys · DXF, DWG', onClick: () => dxf.current?.click(), testid: 'door-dxf' },
    { label: 'Import TRW', sub: '.trw projekt nebo export .json', onClick: () => trw.current?.click(), testid: 'door-trw' },
    { label: 'Nový projekt', sub: 'konfigurátor podvozku', onClick: () => { window.location.hash = '#novy' }, testid: 'door-new' },
  ]
  return (
    <section className="start-hero" aria-label="Hala ContSystem – vstup do CS Studia">
      <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ fov: 42, near: 100, far: 200000, position: [-9000, 9000, 9000] }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}>
        <color attach="background" args={['#b4c3cf']} />
        <StudioLights />
        <hemisphereLight args={['#d5dbe0', '#2a3036', 0.38]} />
        <ambientLight intensity={0.16} />
        <directionalLight position={[2500, 9000, 5200]} intensity={3.0} />
        <directionalLight position={[-6000, 4000, -2500]} intensity={0.85} />
        <Surroundings />
        <HeroCamera onProject={setPts} />
      </Canvas>
      {pts.map(([x, y], i) => (
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

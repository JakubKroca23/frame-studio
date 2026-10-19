import { OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { queueProjectFile } from './openProject'
import { useApp } from './state'
import { DOORS, DW, H, Surroundings, type DoorLift } from './view/Environment'
import { type DoorKind } from './home/vehicleFromFile'
import { setPendingDrive } from './home/pose'
import { useSceneFilters } from './view/sceneFilters'
import { Sign3D } from './home/Sign3D'
import { StudioLights } from './view/Viewport'

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Start page hero: the ContSystem hall, middle door = TRW import (the models live in the #databaze browser now).
 * One canvas, render on demand (OrbitControls invalidates while moving), dpr ≤ 2, hall merged per material.
 */
const UP = new THREE.Vector3(0, 1, 0)
/** Door view: the hall doors face-on – Jakub: a bit farther, higher, more to the right, yawed a bit to the left. */
const DOOR_VIEW = { target: new THREE.Vector3(DOORS[1], 5200, H.z1), dir: new THREE.Vector3(0, 0.1, 1).normalize(), halfW: (DOORS[2] - DOORS[0] + DW) / 2 + 1500, halfH: 5600,
  tweak: { far: 1.2 * 1.28, right: 2500, up: 2500, yawLeft: (4 * Math.PI) / 180 } }
function doorPose(aspect: number, fov: number) {
  const V = DOOR_VIEW, t = Math.tan(((fov / 2) * Math.PI) / 180)
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

/** Free look-around (orbit / pan / zoom), only kept sane: zoom range, camera above the ground. */
const FREE = { minDist: 2500, maxDist: 140000, minPolar: 0.05, maxPolar: Math.PI / 2 - 0.06 }
type Ctl = { target: THREE.Vector3; enabled: boolean; update: () => void; minPolarAngle: number; maxPolarAngle: number; minDistance: number; maxDistance: number; addEventListener: (e: string, f: () => void) => void; removeEventListener: (e: string, f: () => void) => void }

/** Camera rig: lands on the door view, then free OrbitControls; a resize re-fits only until the user moved it. */
function HeroCamera() {
  const { camera, size, gl, invalidate, controls, scene } = useThree()
  const ctl = controls as unknown as Ctl | null
  const userMoved = useRef(false)
  useEffect(() => { Object.assign(window as unknown as object, { __heroInfo: gl.info, __heroCam: camera, __heroCtl: controls, __heroScene: scene, __heroGL: gl }) }, [gl, camera, controls, scene])
  useEffect(() => {
    if (userMoved.current) return
    const g = doorPose(size.width / Math.max(1, size.height), (camera as THREE.PerspectiveCamera).fov)
    camera.position.copy(g.pos); camera.lookAt(g.target); camera.updateMatrixWorld()
    if (ctl) {
      ctl.target.copy(g.target)
      ctl.minPolarAngle = FREE.minPolar; ctl.maxPolarAngle = FREE.maxPolar
      ctl.minDistance = FREE.minDist; ctl.maxDistance = FREE.maxDist
      ctl.enabled = true; ctl.update()
    }
    invalidate()
  }, [camera, size, invalidate, ctl])
  // user camera: remember it was moved; keep the orbit target on / above the ground
  useEffect(() => {
    if (!ctl) return
    const onStart = () => { userMoved.current = true }
    const onChange = () => { if (ctl.target.y >= 0) return; const dy = -ctl.target.y; ctl.target.y = 0; camera.position.y += dy }
    ctl.addEventListener('start', onStart); ctl.addEventListener('change', onChange)
    return () => { ctl.removeEventListener('start', onStart); ctl.removeEventListener('change', onChange) }
  }, [ctl, camera])
  return null
}

type Label = { label: string; sub: string; onClick: () => void; testid: string }

export function StartHero() {
  const dxf = useRef<HTMLInputElement>(null), trw = useRef<HTMLInputElement>(null), spec = useRef<HTMLInputElement>(null)
  const loadFile = useApp((s) => s.loadFile)
  const [doorHot, setDoorHot] = useState(-1)
  const doorLift = useRef<number[]>([0, 0, 0]) as DoorLift
  const startDrive = (kind: DoorKind, f: File) => {
    useSceneFilters.getState().importDefaults()
    if (kind === 'dxf') { window.location.hash = '#vykres'; void loadFile(f); return }
    if (!reducedMotion()) setPendingDrive({ door: kind === 'trw' ? 1 : 2 })
    queueProjectFile(f); window.location.hash = '#novy'
  }
  // doors: left empty, middle = TRW import, right empty. DXF / PDF imports stay in code (inputs below, #vykres,
  // configurator) but are not offered on the home screen; the model database is in the top bar (#databaze).
  const doors: (Label | null)[] = [
    null,
    { label: 'Import TRW', sub: '.trw projekt nebo export .json', onClick: () => trw.current?.click(), testid: 'door-trw' },
    null,
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
        <Surroundings doorLift={doorLift} />
        {doors.map((it, i) => it && (
          <Sign3D key={it.testid} name={'sign-' + it.testid} w={DW * 0.8} h={1900} title={it.label} sub={it.sub} hot={doorHot === i}
            position={[DOORS[i], 3500, H.z1 - 250 + 90]} onOver={() => setDoorHot(i)} onOut={() => setDoorHot(-1)} onOpen={it.onClick} />
        ))}
        <OrbitControls makeDefault enableDamping={false} rotateSpeed={0.5} zoomSpeed={0.6} panSpeed={0.6} />
        <HeroCamera />
      </Canvas>
      {/* labels live in the 3D scene; these buttons are visually hidden, for keyboard / screen readers */}
      {doors.filter((d): d is Label => !!d).map((it) => (
        <button key={it.testid} type="button" data-testid={it.testid} className="sr-only" onClick={it.onClick}>{it.label} – {it.sub}</button>
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

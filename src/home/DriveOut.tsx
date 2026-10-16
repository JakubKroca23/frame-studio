import { useProgress } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { buildChassisGroup, disposeGroup } from '../mesh/build'
import { TrwMarkers } from '../trw/TrwMarkers'
import { TrwExtendedView } from '../trw/TrwExtendedView'
import { outriggerStow } from '../trw/outriggerStow'
import { craneModelFor } from '../trw/CraneModel'
import { craneVariantMatch } from '../trw/craneKinematics'
import { Boundary } from '../trw/HookliftModel'
import { type DoorLift } from '../view/Environment'
import { HEADING, drivePath, originPose, setParkedPose } from './pose'
import type { HomeVehicle } from './vehicleFromFile'

/** Timeline (s): door rolls up, vehicle drives out to the spot, door closes, short hold, then onDone. */
export const T_CAM = 1.2, T_OPEN = 1.4, T_DRIVE = 6.5, T_CLOSE = 1.3, T_EXT = 4.2, T_HOLD = 0.15
/** Loading gate: no pending loads for this long (s) → everything is in; give up waiting after MAX_GATE. */
const QUIET = 0.5, MAX_GATE = 20
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

export interface DriveState {
  door: number
  /** null while the file is still being converted (door already opening). */
  vehicle: HomeVehicle | null
}

/**
 * One generated vehicle (existing buildChassisGroup + trw markers) driving out of door `door` to `spot`.
 * Everything runs in useFrame on refs; React renders only when the vehicle arrives. Times are read from the
 * frame clock so headless captures can step through via window.__driveT (debug hook).
 */
export function DriveOut({ state, doorLift, onDone, onReady, cam }: { state: DriveState; doorLift: DoorLift; onDone: () => void; onReady?: () => void; cam?: (spot: { x: number; z: number }) => { pos: THREE.Vector3; target: THREE.Vector3 } }) {
  const { invalidate, camera, controls } = useThree()
  const root = useRef<THREE.Group>(null)
  const t0 = useRef<number | null>(null), tDrive = useRef<number | null>(null), done = useRef(false)
  const { vehicle, door } = state
  // outriggers stowed for the drive; released after the stop (they extend sideways, then down)
  outriggerStow.current = true
  useEffect(() => () => { outriggerStow.current = false }, [])
  // loading gate: count loader activity (GLBs, textures) of everything mounted for the vehicle
  const quietSince = useRef<number | null>(null), tReady = useRef<number | null>(null), compiled = useRef(false)

  // Camera glide to the show framing. Orbit is locked during the show (StartHero); a user interaction ('start') cancels the
  // glide for good, so the camera never jumps or snaps back. The animation itself only reads the clock.
  const tween = useRef<{ pos: THREE.Vector3; target: THREE.Vector3; to: { pos: THREE.Vector3; target: THREE.Vector3 } } | null>(null)
  useEffect(() => {
    const c = controls as unknown as (THREE.EventDispatcher<{ start: object }> & { target: THREE.Vector3 }) | null
    if (cam) tween.current = { pos: camera.position.clone(), target: (c?.target ?? new THREE.Vector3()).clone(), to: cam(spot) }
    if (!c) return
    const stop = () => { tween.current = null }
    c.addEventListener('start', stop)
    return () => c.removeEventListener('start', stop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls])

  const built = useMemo(() => {
    if (!vehicle) return null
    const g = buildChassisGroup(vehicle.model, vehicle.params)
    const box = new THREE.Box3().setFromObject(g)
    const wheels: { o: THREE.Object3D; r: number }[] = []
    g.traverse((o) => {
      if (o.name === 'wheel') wheels.push({ o, r: Math.max(200, new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).y / 2) })
    })
    return { g, cx: (box.min.x + box.max.x) / 2, cz: (box.min.z + box.max.z) / 2, len: box.max.x - box.min.x, wheels }
  }, [vehicle])
  useEffect(() => () => { if (built) disposeGroup(built.g) }, [built])
  /** Straight out of the door, then a smooth 45° right turn (pose.drivePath). */
  const path = useMemo(() => drivePath(door, built?.len ?? 9000), [door, built])
  const spot = path.end
  // final pose of the model origin; used by the configurator to place the hall around the vehicle
  useEffect(() => { if (built) setParkedPose(originPose(path.end, built.cx, built.cz)) }, [built, path])
  const { gl, scene } = useThree()

  useFrame(({ clock }) => {
    if (done.current) return // final frame stays still (no re-render) while the target page mounts underneath
    const dbg = (window as unknown as { __driveT?: number }).__driveT
    const now = dbg ?? clock.elapsedTime
    if (t0.current === null) t0.current = now
    const t = now - t0.current
    const tw = tween.current
    const c = controls as unknown as { target?: THREE.Vector3 } | null
    if (tw) {
      const k = ease(clamp01(t / T_CAM))
      camera.position.lerpVectors(tw.pos, tw.to.pos, k)
      if (c?.target) c.target.lerpVectors(tw.target, tw.to.target, k)
      camera.lookAt(c?.target ?? tw.to.target)
      if (k >= 1) tween.current = null
    }
    const lift = doorLift.current
    // gate: vehicle built + no loader activity for QUIET s (mounted behind the closed door, so it can render/compile)
    if (tReady.current === null) {
      lift[door] = 0
      if (built && root.current) {
        root.current.visible = true
        const p0 = path.at(0)
        root.current.position.set(p0.x, 0, p0.z)
        root.current.rotation.y = HEADING
        const busy = useProgress.getState().active
        if (busy) quietSince.current = null
        else if (quietSince.current === null) quietSince.current = t
        if (!compiled.current && quietSince.current !== null && t - quietSince.current > QUIET / 2) { gl.compile(scene, camera); compiled.current = true }
        if ((quietSince.current !== null && t - quietSince.current > QUIET && compiled.current) || t > MAX_GATE) { tReady.current = t; (window as unknown as { __driveReady?: number; __driveMeshes?: number[] }).__driveReady = t; (window as unknown as { __driveMeshes?: number[] }).__driveMeshes = [countMeshes(root.current)]; onReady?.() }
      }
      invalidate()
      return
    }
    const tr = t - tReady.current
    if (tDrive.current === null && tr >= T_OPEN) tDrive.current = tr
    const td = tDrive.current === null ? -1 : tr - tDrive.current
    lift[door] = td < T_DRIVE ? ease(clamp01(tr / T_OPEN)) : 1 - ease(clamp01((td - T_DRIVE) / T_CLOSE))
    if (root.current && built) {
      const k = ease(clamp01(td / T_DRIVE))
      const sd = k * path.length, p = path.at(sd)
      root.current.position.set(p.x, 0, p.z)
      root.current.rotation.y = p.rotY
      for (const w of built.wheels) w.o.rotation.z = sd / w.r
    }
    if (td >= T_DRIVE) outriggerStow.current = false
    if (root.current) (window as unknown as { __drivePose?: number[] }).__drivePose = [root.current.position.x, root.current.position.z, td, root.current.rotation.y]
    if (!done.current && td >= T_DRIVE + Math.max(T_CLOSE, vehicle?.trw ? T_EXT : 0) + T_HOLD) { done.current = true; (window as unknown as { __driveDone?: number }).__driveDone = performance.now(); lift[door] = 0; if (root.current) (window as unknown as { __driveMeshes?: number[] }).__driveMeshes?.push(countMeshes(root.current)); onDone() }
    invalidate()
  })

  return (
    <group ref={root} visible={false} name="drive-out">
      {built ? (
        <group position={[-built.cx, 0, -built.cz]}>
          <primitive object={built.g} />
          {vehicle?.trw ? <Boundary fallback={null}><Suspense fallback={null}><Superstructure trw={vehicle.trw} /></Suspense></Boundary> as ReactNode : null}
        </group>
      ) : null}
    </group>
  )
}

/** The same superstructure the configurator shows for a trw import (crane + stabilisers, body / Multilift, aux outriggers). */
function Superstructure({ trw }: { trw: NonNullable<HomeVehicle['trw']> }) {
  const { markers, frameTop, frameRear } = trw
  const crane = markers.crane
  const radius = crane && craneModelFor(crane.name) ? craneVariantMatch(crane.name)?.variant.hydMaxMm ?? 8000 : 8000
  return (
    <>
      <TrwMarkers markers={markers} frameTop={frameTop} onCraneJoints={noop} />
      {markers.extended ? <TrwExtendedView ext={markers.extended} slewDeg={0} craneX={crane?.x ?? null} sectorRadius={radius} showSectors={false} frameRear={frameRear} frameTop={frameTop} /> : null}
    </>
  )
}
const noop = () => {}

const countMeshes = (o: THREE.Object3D | null) => { let n = 0; o?.traverse((c) => { if ((c as THREE.Mesh).isMesh) n++ }); return n }

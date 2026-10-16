import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { buildChassisGroup, disposeGroup } from '../mesh/build'
import { TrwMarkers } from '../trw/TrwMarkers'
import { Boundary } from '../trw/HookliftModel'
import { H, type DoorLift } from '../view/Environment'
import { HEADING, setParkedPose, spotForDoor } from './pose'
import type { HomeVehicle } from './vehicleFromFile'

/** Timeline (s): door rolls up, vehicle drives out to the spot, door closes, short hold, then onDone. */
export const T_CAM = 1.2, T_OPEN = 1.4, T_DRIVE = 4.6, T_CLOSE = 1.3, T_HOLD = 1.0
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
export function DriveOut({ state, doorLift, onDone, cam }: { state: DriveState; doorLift: DoorLift; onDone: () => void; cam?: (spot: { x: number; z: number }) => { pos: THREE.Vector3; target: THREE.Vector3 } }) {
  const { invalidate, camera, controls } = useThree()
  const root = useRef<THREE.Group>(null)
  const t0 = useRef<number | null>(null), tDrive = useRef<number | null>(null), done = useRef(false)
  const { vehicle, door } = state
  const spot = useMemo(() => spotForDoor(door), [door])

  // Camera glide to the show framing. Orbit stays enabled; the first user interaction ('start') cancels the
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
  // final pose of the model origin (rotY = π/2 maps local (x, z) → world (z, −x)); used by the configurator
  useEffect(() => { if (built) setParkedPose({ x: spot.x - built.cz, z: spot.z + built.cx, rotY: HEADING }) }, [built, spot])

  /** Straight out of the door, perpendicular to the facade: start fully inside, stop at the spot. */
  const zFrom = H.z1 - 400 - (built?.len ?? 9000) / 2
  const dist = spot.z - zFrom

  useFrame(({ clock }) => {
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
    if (tDrive.current === null && built && t >= T_OPEN) tDrive.current = Math.max(t, T_OPEN)
    const td = tDrive.current === null ? -1 : t - tDrive.current
    lift[door] = td < T_DRIVE ? ease(clamp01(t / T_OPEN)) : 1 - ease(clamp01((td - T_DRIVE) / T_CLOSE))
    if (root.current && built) {
      const k = ease(clamp01(td / T_DRIVE))
      root.current.visible = td >= 0
      root.current.position.set(spot.x, 0, zFrom + k * dist)
      root.current.rotation.y = HEADING
      for (const w of built.wheels) w.o.rotation.z = (k * dist) / w.r
    }
    if (root.current) (window as unknown as { __drivePose?: number[] }).__drivePose = [root.current.position.x, root.current.position.z, td]
    if (!done.current && td >= T_DRIVE + T_CLOSE + T_HOLD) { done.current = true; lift[door] = 0; onDone() }
    invalidate()
  })

  return (
    <group ref={root} visible={false} name="drive-out">
      {built ? (
        <group position={[-built.cx, 0, -built.cz]}>
          <primitive object={built.g} />
          {vehicle?.trw ? <Boundary fallback={null}><Suspense fallback={null}><TrwMarkers markers={vehicle.trw.markers} frameTop={vehicle.trw.frameTop} /></Suspense></Boundary> as ReactNode : null}
        </group>
      ) : null}
    </group>
  )
}

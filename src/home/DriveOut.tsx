import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { buildChassisGroup, disposeGroup } from '../mesh/build'
import { TrwMarkers } from '../trw/TrwMarkers'
import { Boundary } from '../trw/HookliftModel'
import { DOORS, H, type DoorLift } from '../view/Environment'
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
export function DriveOut({ state, spot, doorLift, onDone, cam }: { state: DriveState; spot: { x: number; z: number }; doorLift: DoorLift; onDone: () => void; cam?: { pos: THREE.Vector3; target: THREE.Vector3 } }) {
  const { invalidate, camera, controls } = useThree()
  // camera: glide to the show framing, give the user's view back afterwards (orbit is disabled meanwhile)
  const camFrom = useMemo(() => {
    const c = controls as unknown as { target?: THREE.Vector3 } | null
    return { pos: camera.position.clone(), target: (c?.target ?? new THREE.Vector3()).clone() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => () => {
    camera.position.copy(camFrom.pos)
    const c = controls as unknown as { target?: THREE.Vector3; update?: () => void } | null
    if (c?.target) { c.target.copy(camFrom.target); c.update?.() } else camera.lookAt(camFrom.target)
    invalidate()
  }, [camera, controls, camFrom, invalidate])
  const lookAt = useMemo(() => new THREE.Vector3(), [])
  const root = useRef<THREE.Group>(null)
  const t0 = useRef<number | null>(null), tDrive = useRef<number | null>(null), done = useRef(false)
  const { vehicle, door } = state

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

  const path = useMemo(() => {
    const dx = DOORS[door], len = built?.len ?? 9000
    const start = new THREE.Vector3(dx, 0, H.z1 - 400 - len / 2)
    return new THREE.CubicBezierCurve3(start, new THREE.Vector3(dx + 2500, 0, H.z1 + 6000), new THREE.Vector3(spot.x + 6500, 0, spot.z), new THREE.Vector3(spot.x, 0, spot.z))
  }, [door, built, spot])
  const pathLen = useMemo(() => path.getLength(), [path])
  const p = useMemo(() => new THREE.Vector3(), []), tan = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ clock }) => {
    const dbg = (window as unknown as { __driveT?: number }).__driveT
    const now = dbg ?? clock.elapsedTime
    if (t0.current === null) t0.current = now
    const t = now - t0.current
    const lift = doorLift.current
    if (cam) {
      const c = ease(clamp01(t / T_CAM))
      camera.position.lerpVectors(camFrom.pos, cam.pos, c)
      lookAt.lerpVectors(camFrom.target, cam.target, c)
      camera.lookAt(lookAt)
    }
    // door: opens immediately, stays open until the vehicle has passed, then closes
    if (tDrive.current === null && built && t >= T_OPEN) tDrive.current = Math.max(t, T_OPEN)
    const td = tDrive.current === null ? -1 : t - tDrive.current
    const open = td < T_DRIVE ? ease(clamp01(t / T_OPEN)) : 1 - ease(clamp01((td - T_DRIVE) / T_CLOSE))
    lift[door] = open
    if (root.current && built) {
      const k = ease(clamp01(td / T_DRIVE))
      path.getPointAt(k, p); path.getTangentAt(k, tan)
      root.current.visible = td >= 0
      root.current.position.copy(p)
      root.current.rotation.y = Math.atan2(tan.z, -tan.x)
      const s = k * pathLen
      for (const w of built.wheels) w.o.rotation.z = s / w.r
    }
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

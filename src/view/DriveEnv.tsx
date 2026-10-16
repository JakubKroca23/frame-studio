import { useProgress } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { drivePath, originPose, setParkedPose } from '../home/pose'
import { DOORS, H } from './Environment'
import { outriggerStow } from '../trw/outriggerStow'
import { Surroundings, type DoorLift } from './Environment'

/** Timeline (s) after the loading gate: door rolls up quickly, the vehicle starts while it is still opening and
 *  drives the whole path (straight + 45° left turn) on ONE ease-in-out curve, door closes right after. ≈ 3.6 s. */
export const T_OPEN = 0.6, T_START = 0.3, T_DRIVE = 3.1, T_CLOSE = 0.5
const QUIET = 0.5, MAX_GATE = 20
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

/**
 * Configurator-side drive-out in a STATIC world: the hall stands where it will be after the drive (inverse of the
 * final vehicle pose, i.e. the same placement the configurator uses afterwards), and the vehicle group really drives
 * from the door to the origin. The camera is set once to a fixed view framing the door and the stop spot and is never
 * touched again – OrbitControls stay enabled all the time; the animation is clock-based so input cannot affect it.
 * Esc / Space skip to the end. Debug: window.__driveT (clock override), __driveT0, __driveReady, __drivePose,
 * __driveDone, __driveFrames.
 */
export function DriveEnv({ door, ready, groupRef, vehicleRef, onDone }: { door: number; ready: boolean; groupRef: RefObject<THREE.Group | null>; vehicleRef: RefObject<THREE.Group | null>; onDone?: () => void }) {
  const { invalidate, controls, gl, scene, camera } = useThree()
  const hall = useRef<THREE.Group>(null)
  const doorLift = useRef<number[]>([0, 0, 0]) as DoorLift
  const st = useRef({ t0: null as number | null, quiet: null as number | null, compiled: false, tReady: null as number | null, done: false, skip: false, camLen: -1 })
  const geo = useRef<{ cx: number; cz: number; len: number; wheels: { o: THREE.Object3D; r: number }[] } | null>(null)
  const path = useRef<ReturnType<typeof drivePath> | null>(null)
  const endInv = useRef(new THREE.Matrix4())
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), r: new THREE.Matrix4() }), [])
  /** world (hall) pose of the vehicle origin → matrix; envMat = its inverse */
  const envMat = (o: { x: number; z: number; rotY: number }, out = new THREE.Matrix4()) => out.makeRotationY(-o.rotY).multiply(tmp.r.makeTranslation(-o.x, 0, -o.z))
  useEffect(() => () => { outriggerStow.current = false }, [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === ' ') { st.current.skip = true; invalidate() } }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [invalidate])
  /** vehicle group transform for world origin pose o: hall-frame → config frame (E_end · W(o)) */
  const placeVehicle = (o: { x: number; z: number; rotY: number }) => {
    const v = vehicleRef.current
    if (!v) return
    tmp.m.copy(envMat(o, new THREE.Matrix4())).invert().premultiply(endInv.current)
    v.matrixAutoUpdate = false
    v.matrix.copy(tmp.m)
    v.matrixWorldNeedsUpdate = true
  }

  useFrame(({ clock }) => {
    const s = st.current
    if (s.done) return
    const now = (window as unknown as { __driveT?: number }).__driveT ?? clock.elapsedTime
    if (s.t0 === null) { s.t0 = now; (window as unknown as { __driveT0?: number }).__driveT0 = now }
    const t = now - s.t0
    const lift = doorLift.current
    outriggerStow.current = s.tReady === null || (s.skip ? false : t - s.tReady - T_START < T_DRIVE)
    if (s.tReady === null) {
      lift[door] = 0
      const g = groupRef.current, v = vehicleRef.current
      if (g && v && hall.current) {
        // vehicle box in its own frame (vehicle group reset to identity for the measurement)
        v.matrixAutoUpdate = false; v.matrix.identity(); v.updateMatrixWorld(true)
        const box = new THREE.Box3().setFromObject(g)
        const wheels: { o: THREE.Object3D; r: number }[] = []
        g.traverse((o) => { if (o.name === 'wheel') wheels.push({ o, r: Math.max(200, new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).y / 2) }) })
        geo.current = { cx: (box.min.x + box.max.x) / 2, cz: (box.min.z + box.max.z) / 2, len: box.max.x - box.min.x, wheels }
        ;(window as unknown as { __driveFrames?: number[] }).__driveFrames = []
        path.current = drivePath(door, geo.current.len)
        const end = originPose(path.current.end, geo.current.cx, geo.current.cz)
        envMat(end, endInv.current)
        hall.current.matrixAutoUpdate = false
        hall.current.matrix.copy(endInv.current); hall.current.matrixWorldNeedsUpdate = true
        placeVehicle(originPose(path.current.at(0), geo.current.cx, geo.current.cz))
        // fixed camera framing the door and the stop spot – held while loading (overrides the configurator's own
        // framing), released at the start and never touched again
        {
          const doorPt = new THREE.Vector3(DOORS[door], 2500, H.z1).applyMatrix4(endInv.current)
          const target = doorPt.clone().lerp(new THREE.Vector3(geo.current.cx, 1500, 0), 0.62)
          const span = doorPt.distanceTo(new THREE.Vector3(geo.current.cx, 1500, 0)) + geo.current.len
          const dir = new THREE.Vector3(0.55, 0.45, 1).normalize().transformDirection(endInv.current)
          camera.position.copy(target).addScaledVector(dir, Math.max(18000, span * 1.35))
          camera.lookAt(target)
          const ct = controls as unknown as { target?: THREE.Vector3; update?: () => void } | null
          if (ct?.target) { ct.target.copy(target); ct.update?.() }
        }
        if (ready) {
          const busy = useProgress.getState().active
          if (busy) s.quiet = null
          else if (s.quiet === null) s.quiet = t
          if (!s.compiled && s.quiet !== null && t - s.quiet > QUIET / 2) { gl.compile(scene, camera); s.compiled = true }
        }
        if ((ready && s.quiet !== null && t - s.quiet > QUIET && s.compiled) || t > MAX_GATE || s.skip) {
          s.tReady = t; (window as unknown as { __driveReady?: number }).__driveReady = t
        }
      }
      invalidate()
      return
    }
    const p = path.current!, tr = s.skip ? 1e9 : t - s.tReady, td = tr - T_START
    lift[door] = td < T_DRIVE ? ease(clamp01(tr / T_OPEN)) : 1 - ease(clamp01((td - T_DRIVE) / T_CLOSE))
    const k = ease(clamp01(td / T_DRIVE)), sd = k * p.length
    const o = originPose(p.at(sd), geo.current!.cx, geo.current!.cz)
    placeVehicle(o)
    for (const w of geo.current!.wheels) w.o.rotation.z = sd / w.r
    ;(window as unknown as { __drivePose?: number[] }).__drivePose = [o.x, o.z, td, o.rotY]
    ;(window as unknown as { __driveFrames?: number[] }).__driveFrames?.push(performance.now())
    if (td >= T_DRIVE + T_CLOSE) {
      s.done = true; lift[door] = 0
      for (const w of geo.current!.wheels) w.o.rotation.z = 0
      // the vehicle ends exactly at the origin: identity, normal matrix updates again
      const v = vehicleRef.current
      if (v) { v.matrix.identity(); v.matrixAutoUpdate = true; v.position.set(0, 0, 0); v.rotation.set(0, 0, 0); v.updateMatrix() }
      setParkedPose(o)
      ;(window as unknown as { __driveDone?: number }).__driveDone = performance.now()
      onDone?.()
    }
    invalidate()
  })
  return <group ref={hall}><Surroundings doorLift={doorLift} /></group>
}

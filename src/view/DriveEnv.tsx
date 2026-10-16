import { useProgress } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { drivePath, originPose, setParkedPose } from '../home/pose'
import { outriggerStow } from '../trw/outriggerStow'
import { Surroundings, type DoorLift } from './Environment'

/** Timeline (s) after the loading gate: door rolls up quickly, the vehicle starts while it is still opening and
 *  drives the whole path (straight + 45° left turn) on ONE ease-in-out curve, door closes right after. ≈ 3.6 s. */
export const T_OPEN = 0.6, T_START = 0.3, T_DRIVE = 3.1, T_CLOSE = 0.5
const QUIET = 0.5, MAX_GATE = 20
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

/**
 * Configurator-side drive-out: the configurator scene (vehicle at the origin, final UI and filters) is shown from
 * the start; only the surroundings move – the hall is placed with the inverse of the vehicle's pose along the
 * drive path each frame, so the truck appears to roll out of the door. Orbit is locked until the stop.
 * Nothing is remounted at the end: the same groups simply stay at the final pose.
 * Debug: window.__driveT (clock override), __driveReady, __drivePose, __driveDone.
 */
export function DriveEnv({ door, ready, groupRef, onDone }: { door: number; ready: boolean; groupRef: RefObject<THREE.Group | null>; onDone?: () => void }) {
  const { invalidate, controls, gl, scene, camera } = useThree()
  const rot = useRef<THREE.Group>(null), pos = useRef<THREE.Group>(null)
  const doorLift = useRef<number[]>([0, 0, 0]) as DoorLift
  const st = useRef({ t0: null as number | null, quiet: null as number | null, compiled: false, tReady: null as number | null, done: false, skip: false })
  const geo = useRef<{ cx: number; cz: number; len: number; wheels: { o: THREE.Object3D; r: number }[] } | null>(null)
  const path = useRef<ReturnType<typeof drivePath> | null>(null)
  // camera stays fixed relative to the HALL at its final configurator pose: C(t) = E(t)·E_final⁻¹·C_final
  const cam = useRef<{ pos: THREE.Vector3; target: THREE.Vector3; invFinal: THREE.Matrix4 } | null>(null)
  const envMat = (o: { x: number; z: number; rotY: number }) => new THREE.Matrix4().makeRotationY(-o.rotY).multiply(new THREE.Matrix4().makeTranslation(-o.x, 0, -o.z))
  // per-frame scratch objects (no allocation in the animation loop)
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), r: new THREE.Matrix4(), tg: new THREE.Vector3() }), [])
  const follow = (o: { x: number; z: number; rotY: number }) => {
    const k = cam.current
    if (!k) return
    const m = tmp.m.makeRotationY(-o.rotY).multiply(tmp.r.makeTranslation(-o.x, 0, -o.z)).multiply(k.invFinal), ct = controls as unknown as { target?: THREE.Vector3 } | null
    camera.position.copy(k.pos).applyMatrix4(m)
    const tg = tmp.tg.copy(k.target).applyMatrix4(m)
    if (ct?.target) ct.target.copy(tg)
    camera.lookAt(tg)
  }
  outriggerStow.current = !st.current.done
  useEffect(() => () => { outriggerStow.current = false; const c = controls as unknown as { enabled: boolean } | null; if (c) c.enabled = true }, [controls])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === ' ') { st.current.skip = true; invalidate() } }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [invalidate])
  const place = useMemo(() => (p: { x: number; z: number; rotY: number }) => {
    const g = geo.current!, o = originPose(p, g.cx, g.cz)
    rot.current!.rotation.y = -o.rotY
    pos.current!.position.set(-o.x, 0, -o.z)
    return o
  }, [])

  useFrame(({ clock }) => {
    const s = st.current
    if (s.done) return
    const c = controls as unknown as { enabled: boolean } | null
    if (c) c.enabled = false
    const now = (window as unknown as { __driveT?: number }).__driveT ?? clock.elapsedTime
    if (s.t0 === null) { s.t0 = now; (window as unknown as { __driveT0?: number }).__driveT0 = now }
    const t = now - s.t0
    const lift = doorLift.current
    // re-asserted every frame (an effect cleanup, e.g. when the orbit controls mount, may have reset it)
    outriggerStow.current = s.tReady === null || (s.skip ? false : t - s.tReady - T_START < T_DRIVE)
    if (s.tReady === null) {
      lift[door] = 0
      const g = groupRef.current
      if (g && rot.current && pos.current) {
        // vehicle box in its own frame (X rearward from axle 1, Z lateral) → path in the home frame
        const box = new THREE.Box3().setFromObject(g)
        const wheels: { o: THREE.Object3D; r: number }[] = []
        ;(window as unknown as { __driveFrames?: number[] }).__driveFrames = []
        g.traverse((o) => { if (o.name === 'wheel') wheels.push({ o, r: Math.max(200, new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).y / 2) }) })
        geo.current = { cx: (box.min.x + box.max.x) / 2, cz: (box.min.z + box.max.z) / 2, len: box.max.x - box.min.x, wheels }
        path.current = drivePath(door, geo.current.len)
        place(path.current.at(0))
        if (ready) {
          const busy = useProgress.getState().active
          if (busy) s.quiet = null
          else if (s.quiet === null) s.quiet = t
          if (!s.compiled && s.quiet !== null && t - s.quiet > QUIET / 2) { gl.compile(scene, camera); s.compiled = true }
        }
        if ((ready && s.quiet !== null && t - s.quiet > QUIET && s.compiled) || t > MAX_GATE || s.skip) {
          s.tReady = t; (window as unknown as { __driveReady?: number }).__driveReady = t
          const ct = controls as unknown as { target?: THREE.Vector3 } | null
          const end = originPose(path.current.end, geo.current.cx, geo.current.cz)
          cam.current = { pos: camera.position.clone(), target: (ct?.target ?? new THREE.Vector3()).clone(), invFinal: envMat(end).invert() }
          follow(originPose(path.current.at(0), geo.current.cx, geo.current.cz))
        }
      }
      invalidate()
      return
    }
    const p = path.current!, tr = s.skip ? 1e9 : t - s.tReady, td = tr - T_START
    lift[door] = td < T_DRIVE ? ease(clamp01(tr / T_OPEN)) : 1 - ease(clamp01((td - T_DRIVE) / T_CLOSE))
    const k = ease(clamp01(td / T_DRIVE)), sd = k * p.length
    const o = place(p.at(sd))
    follow(o)
    for (const w of geo.current!.wheels) w.o.rotation.z = sd / w.r
    if (td >= T_DRIVE) outriggerStow.current = false
    ;(window as unknown as { __drivePose?: number[] }).__drivePose = [o.x, o.z, td, o.rotY]
    ;(window as unknown as { __driveFrames?: number[] }).__driveFrames?.push(performance.now())
    if (td >= T_DRIVE + T_CLOSE) {
      s.done = true; lift[door] = 0
      for (const w of geo.current!.wheels) w.o.rotation.z = 0
      setParkedPose(o)
      if (c) c.enabled = true
      ;(window as unknown as { __driveDone?: number }).__driveDone = performance.now()
      onDone?.()
    }
    invalidate()
  })
  return <group ref={rot}><group ref={pos}><Surroundings doorLift={doorLift} /></group></group>
}

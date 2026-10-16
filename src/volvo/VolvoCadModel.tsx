import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, type RefObject } from 'react'
import * as THREE from 'three'
import { create } from 'zustand'
import { Boundary } from '../trw/HookliftModel'
import { VOLVO_FRONT, VOLVO_REAR, fitFront, fitRear, type AxleLike, type CadPart } from './cadParts'

/** Slider offsets [mm, along the vehicle] of the movable CAD components, by part number; load state for the panel. */
type LoadState = 'idle' | 'loading' | 'ok' | 'missing'
/** Offsets keyed `${part.key}:${movable.key}`; load state per part. */
export const useVolvoCad = create<{ offsets: Record<string, number>; state: LoadState; front: LoadState; set: (k: string, v: number) => void; setState: (s: LoadState, part?: 'rear' | 'front') => void }>((set) => ({
  offsets: {},
  state: 'idle',
  front: 'idle',
  set: (k, v) => set((s) => ({ offsets: { ...s.offsets, [k]: v } })),
  setState: (st, part = 'rear') => set(part === 'front' ? { front: st } : { state: st }),
}))
export const mvKey = (part: CadPart, key: string) => `${part.key}:${key}`
if (typeof window !== 'undefined') (window as unknown as { __volvoCad?: unknown }).__volvoCad = useVolvoCad

const TYRE = new THREE.MeshStandardMaterial({ color: '#1b1c1e', roughness: 0.9, metalness: 0 })
const mats = new Map<string, THREE.MeshStandardMaterial>()
function muted(hsl: { h: number; s: number; l: number }) {
  const key = `${hsl.h.toFixed(2)}|${hsl.s.toFixed(1)}|${hsl.l.toFixed(1)}`
  let m = mats.get(key)
  if (!m) mats.set(key, (m = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hsl.h, hsl.s * 0.18, 0.12 + hsl.l * 0.32), metalness: 0.35, roughness: 0.6 })))
  return m
}
const url = (p: CadPart) => `${import.meta.env.BASE_URL}models/${p.file}`

/** Volvo rear CAD on the vehicle (tandem axles, suspension, fenders, rear end); falls back silently if not served. */
export function VolvoCadModel(props: { axles: AxleLike[]; frameRear: number; cabBackFromAxle: number; chassis: RefObject<THREE.Group | null>; token: unknown }) {
  const fit = fitRear(props.axles, props.frameRear)
  return (
    <>
      {fit.ok ? (
        <Boundary fallback={<Missing part="rear" />}>
          <Suspense fallback={null}>
            <Rear {...props} fit={fit} />
          </Suspense>
        </Boundary>
      ) : null}
      <Boundary fallback={<Missing part="front" />}>
        <Suspense fallback={null}>
          <Front tx={fitFront(props.axles, props.cabBackFromAxle)} chassis={props.chassis} token={props.token} />
        </Suspense>
      </Boundary>
    </>
  )
}
function Missing({ part }: { part: 'rear' | 'front' }) {
  const setState = useVolvoCad((s) => s.setState)
  useEffect(() => { setState('missing', part) }, [setState, part])
  return null
}

/** Load a CAD part, hide replaced nodes, mute colours; returns the root and its top-level component list. */
function useCadScene(part: CadPart) {
  const gltf = useGLTF(url(part))
  return useMemo(() => {
    const root = gltf.scene.clone(true)
    const asm = root.children[0] ?? root
    for (const c of asm.children) {
      if (part.hide.some((h) => c.name.includes(h))) c.visible = false
      c.userData.x0 = c.position.x
      c.userData.behind = new THREE.Box3().setFromObject(c).min.x > (part.behindX ?? Infinity)
      c.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        m.castShadow = true; m.receiveShadow = true
        const src = m.material as THREE.MeshStandardMaterial
        const hsl = { h: 0, s: 0, l: 0 }
        src.color?.getHSL(hsl)
        let tyre = false
        for (let q: THREE.Object3D | null = m; q && !tyre; q = q.parent) tyre = /21257099|21321145/.test(q.name)
        m.material = tyre ? TYRE : muted(hsl)
        // the front file ships without normals (smaller): smooth them here
        if (!m.geometry.attributes.normal) m.geometry.computeVertexNormals()
      })
    }
    return { root, asm }
  }, [gltf, part])
}
function moveComponents(asm: THREE.Object3D, part: CadPart, offsets: Record<string, number>, shift = 0) {
  for (const c of asm.children) {
    const mv = part.movable.find((m) => m.parts.some((p) => c.name.includes(p)))
    c.position.x = c.userData.x0 + ((c.userData.behind ? shift : 0) + (mv ? offsets[mvKey(part, mv.key)] ?? 0 : 0)) / 1000
  }
}

/** Config-generated side components the front CAD replaces (fuel tank, AdBlue, battery box, air tanks; the exhaust stays). */
const REPLACED_BY_FRONT = /^(FT_fuel|BP_adblue|BB_battery|AT_air\d+)$/
function Front({ tx, chassis, token }: { tx: number; chassis: RefObject<THREE.Group | null>; token: unknown }) {
  const part = VOLVO_FRONT
  const scene = useCadScene(part)
  const offsets = useVolvoCad((s) => s.offsets)
  const setState = useVolvoCad((s) => s.setState)
  const { invalidate } = useThree()
  useEffect(() => { moveComponents(scene.asm, part, offsets); invalidate() }, [scene, offsets, part, invalidate])
  useEffect(() => {
    setState('ok', 'front')
    const hidden: THREE.Object3D[] = []
    chassis.current?.traverse((o) => { if ((REPLACED_BY_FRONT.test(o.name) || o.userData.cadReplaceable) && o.visible) hidden.push(o) })
    hidden.forEach((o) => { o.visible = false })
    invalidate()
    return () => { hidden.forEach((o) => { o.visible = true }) }
  }, [chassis, token, setState, invalidate])
  return (
    <group name="volvo-cad-front" position={[tx, part.groundY * 1000, 0]} rotation={[Math.PI, 0, 0]} scale={1000}>
      <group rotation={[part.rotX ?? 0, 0, 0]}>
        <primitive object={scene.root} />
      </group>
    </group>
  )
}

function Rear({ chassis, token, fit }: { chassis: RefObject<THREE.Group | null>; token: unknown; fit: ReturnType<typeof fitRear> }) {
  const part = VOLVO_REAR
  const scene = useCadScene(part)
  const offsets = useVolvoCad((s) => s.offsets)
  const setState = useVolvoCad((s) => s.setState)
  const { invalidate } = useThree()
  useEffect(() => {
    moveComponents(scene.asm, part, offsets, fit.rearShift)
    invalidate()
  }, [scene, offsets, fit.rearShift, part, invalidate])
  // the CAD replaces the procedural rear axles
  useEffect(() => {
    setState('ok')
    const axles = chassis.current?.getObjectByName('axles')
    const hidden: THREE.Object3D[] = []
    axles?.children.forEach((c, i) => { if (fit.replaces.includes(i) && c.visible) { c.visible = false; hidden.push(c) } })
    invalidate()
    return () => { hidden.forEach((c) => { c.visible = true }) }
  }, [chassis, token, fit.replaces.join(), setState, invalidate])
  // CAD (X rear, Y down, Z across) → scene (x rear, y up, z across): rotate 180° about X, metres → mm
  return (
    <group name="volvo-cad-rear" position={[fit.tx, part.groundY * 1000, 0]} rotation={[Math.PI, 0, 0]} scale={1000}>
      <primitive object={scene.root} />
    </group>
  )
}

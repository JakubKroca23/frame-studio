import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, type RefObject } from 'react'
import * as THREE from 'three'
import { create } from 'zustand'
import { Boundary } from '../trw/HookliftModel'
import { VOLVO_REAR, fitRear, type AxleLike, type CadPart } from './cadParts'

/** Slider offsets [mm, along the vehicle] of the movable CAD components, by part number; load state for the panel. */
export const useVolvoCad = create<{ offsets: Record<string, number>; state: 'idle' | 'loading' | 'ok' | 'missing'; set: (k: string, v: number) => void; setState: (s: 'idle' | 'loading' | 'ok' | 'missing') => void }>((set) => ({
  offsets: {},
  state: 'idle',
  set: (k, v) => set((s) => ({ offsets: { ...s.offsets, [k]: v } })),
  setState: (state) => set({ state }),
}))
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
export function VolvoCadModel(props: { axles: AxleLike[]; frameRear: number; chassis: RefObject<THREE.Group | null>; token: unknown }) {
  const fit = fitRear(props.axles, props.frameRear)
  if (!fit.ok) return null
  return (
    <Boundary fallback={<Missing />}>
      <Suspense fallback={null}>
        <Rear {...props} fit={fit} />
      </Suspense>
    </Boundary>
  )
}
function Missing() {
  const setState = useVolvoCad((s) => s.setState)
  useEffect(() => { setState('missing') }, [setState])
  return null
}

function Rear({ chassis, token, fit }: { chassis: RefObject<THREE.Group | null>; token: unknown; fit: ReturnType<typeof fitRear> }) {
  const part = VOLVO_REAR
  const gltf = useGLTF(url(part))
  const offsets = useVolvoCad((s) => s.offsets)
  const setState = useVolvoCad((s) => s.setState)
  const { invalidate } = useThree()
  const scene = useMemo(() => {
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
        // Onshape debug colours → muted chassis tones (hue kept, so parts stay distinguishable)
        const src = m.material as THREE.MeshStandardMaterial
        const hsl = { h: 0, s: 0, l: 0 }
        src.color?.getHSL(hsl)
        let tyre = false
        for (let q: THREE.Object3D | null = m; q && !tyre; q = q.parent) tyre = /21257099|21321145/.test(q.name)
        m.material = tyre ? TYRE : muted(hsl)
      })
    }
    return { root, asm }
  }, [gltf, part])
  useEffect(() => {
    for (const c of scene.asm.children) {
      const mv = part.movable.find((m) => c.name.includes(m.partNo))
      c.position.x = c.userData.x0 + ((c.userData.behind ? fit.rearShift : 0) + (mv ? offsets[mv.partNo] ?? 0 : 0)) / 1000
    }
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

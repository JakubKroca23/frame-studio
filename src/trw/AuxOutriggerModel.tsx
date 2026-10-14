import { useGLTF } from '@react-three/drei'
import { Component, Suspense, useMemo, type ReactNode } from 'react'
import * as THREE from 'three'

/**
 * HIAB auxiliary stabilizer (přídavné podpěry) – retracted housing + legs.
 * GLB in metres: X = across the truck (length of the housing), Y up, Z = along the truck.
 * 5m: from the HIAB 3D model (556-2066: zasunuto 2490, vysunuto 5041).
 * 6m: derived from the 5m model per drawing 556-2067 (zasunuto 2550, vysunuto 5980,
 * šířka 457.3): housing + výsuvná ramena prodloužena o 60 mm uprostřed, patky/válce/úchyty posunuty tuhě,
 * průřez rozšířen 426 → 457.3.
 */
export const AUX_STAB = {
  '5m': { file: 'hiab-aux-stab-5m.glb', retracted: 2490, extended: 5041 },
  '6m': { file: 'hiab-aux-stab-6m.glb', retracted: 2550, extended: 5980 },
} as const
export type AuxStabKind = keyof typeof AUX_STAB

/** Pick 5m / 6m by the total extended spread (mm), nearest catalogue value. */
export function pickAuxStab(spread: number | null | undefined): AuxStabKind {
  if (spread == null || !Number.isFinite(spread)) return '5m'
  return Math.abs(spread - AUX_STAB['6m'].extended) < Math.abs(spread - AUX_STAB['5m'].extended) ? '6m' : '5m'
}

class Boundary extends Component<{ children: ReactNode; fallback: ReactNode }, { err: boolean }> {
  state = { err: false }
  static getDerivedStateFromError() { return { err: true } }
  render() { return this.state.err ? this.props.fallback : this.props.children }
}

function Loaded({ kind, x, top }: { kind: AuxStabKind; x: number; top: number }) {
  const gltf = useGLTF(`${import.meta.env.BASE_URL}models/outrigger/${AUX_STAB[kind].file}`)
  const { obj, off } = useMemo(() => {
    const o = gltf.scene.clone(true)
    const b = new THREE.Box3().setFromObject(o)
    return { obj: o, off: new THREE.Vector3(-(b.min.x + b.max.x) / 2, -b.max.y, -(b.min.z + b.max.z) / 2) }
  }, [gltf])
  // scene mm, X along truck, Z lateral → rotate model X (across) onto scene Z
  return (
    <group position={[x, top, 0]} rotation={[0, Math.PI / 2, 0]} scale={1000}>
      <primitive object={obj} position={off} />
    </group>
  )
}

export function AuxOutriggerModel({ kind, x, top, fallback = null }: { kind: AuxStabKind; x: number; top: number; fallback?: ReactNode }) {
  return (
    <Boundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <Loaded kind={kind} x={x} top={top} />
      </Suspense>
    </Boundary>
  )
}

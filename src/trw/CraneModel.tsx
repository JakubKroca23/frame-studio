import { useGLTF } from '@react-three/drei'
import { Suspense, useMemo, type ReactNode } from 'react'
import * as THREE from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Boundary } from './HookliftModel'

/**
 * Hiab X-HiPro 142 E-4 in transport (folded) position, from the user's DXF (3DFACE, mm → m).
 * Mesh coordinates: origin on the slewing column axis at the mounting plane (y = 0 = underside of the base),
 * X lateral (outrigger beams, −1.164…1.349 m), Y up (−0.802 stowed legs … 2.261 m), Z longitudinal (−0.525…0.431 m).
 * Two groups: `base` (base, outrigger housings, legs, slewing gear) and `slew` (column + folded boom package).
 */
export const CRANE_MODELS = [{ re: /x.?hi.?pro\s*142|\b142\s*e.?4|\bex\s*142|hiab.*142/i, file: 'hiab-x-hipro-142e4.glb', name: 'HIAB X-HiPro 142 E-4' }]

export function craneModelFor(name: string | null | undefined) {
  return name ? CRANE_MODELS.find((m) => m.re.test(name)) ?? null : null
}

const material = new THREE.MeshStandardMaterial({ color: '#c8231b', metalness: 0.3, roughness: 0.5, side: THREE.DoubleSide })

export function CraneModel(props: { file: string; x: number; frameTop: number; slewDeg: number; fallback: ReactNode }) {
  return (
    <Boundary fallback={props.fallback}>
      <Suspense fallback={props.fallback}>
        <Loaded {...props} />
      </Suspense>
    </Boundary>
  )
}

function Loaded({ file, x, frameTop, slewDeg }: { file: string; x: number; frameTop: number; slewDeg: number }) {
  const gltf = useGLTF(`${import.meta.env.BASE_URL}models/crane/${file}`)
  const groups = useMemo(() => {
    gltf.scene.updateMatrixWorld(true)
    const out: Record<string, THREE.BufferGeometry[]> = { base: [], slew: [] }
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      let g: string = 'base'
      for (let p: THREE.Object3D | null = m; p; p = p.parent) if (p.name === 'slew') g = 'slew'
      const geo = new THREE.BufferGeometry()
      const pa = m.geometry.getAttribute('position')
      const arr = new Float32Array(pa.count * 3)
      const v = new THREE.Vector3()
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld)
        arr.set([v.x, v.y, v.z], i * 3)
      }
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
      if (m.geometry.index) geo.setIndex(m.geometry.index)
      out[g].push(toCreasedNormals(geo, Math.PI / 6))
    })
    return out
  }, [gltf])
  // mesh → scene: rotate +90° about Y (mesh Z → scene X along the vehicle, mesh X → lateral), ×1000 (mm)
  // slewing (trw convention: 0° forward, clockwise from above) rotates only the `slew` group about the column axis
  return (
    <group name="trw-crane-model" position={[x, frameTop, 0]} scale={1000}>
      <group rotation={[0, Math.PI / 2, 0]}>
        {groups.base.map((g, i) => (
          <mesh key={i} geometry={g} material={material} castShadow receiveShadow />
        ))}
      </group>
      <group rotation={[0, Math.PI / 2 - (slewDeg * Math.PI) / 180, 0]} name="trw-crane-slew">
        {groups.slew.map((g, i) => (
          <mesh key={i} geometry={g} material={material} castShadow receiveShadow />
        ))}
      </group>
    </group>
  )
}

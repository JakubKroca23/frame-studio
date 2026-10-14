import { useGLTF } from '@react-three/drei'
import { Component, Suspense, useMemo, type ReactNode } from 'react'
import * as THREE from 'three'
import { makeHookliftDeform, ULT18Z59, type HookliftParams } from './hooklift'

export const HOOKLIFT_GLB = `${import.meta.env.BASE_URL}models/hooklift/ult18z59.glb`

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err: unknown) {
    console.warn('Hooklift model failed to load, using simple shape.', err)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** Lazy-loaded ULT18Z59 CAD model, stretched to params; rear end at xRear, underside at frameTop. */
export function HookliftModel(props: { xRear: number; frameTop: number; params: HookliftParams; fallback: ReactNode }) {
  return (
    <Boundary fallback={props.fallback}>
      <Suspense fallback={props.fallback}>
        <Loaded {...props} />
      </Suspense>
    </Boundary>
  )
}

const material = new THREE.MeshStandardMaterial({ color: '#c9d2ef', metalness: 0.35, roughness: 0.55, side: THREE.DoubleSide })

function Loaded({ xRear, frameTop, params }: { xRear: number; frameTop: number; params: HookliftParams }) {
  const gltf = useGLTF(HOOKLIFT_GLB)
  const geoms = useMemo(() => {
    gltf.scene.updateMatrixWorld(true)
    const deform = makeHookliftDeform(params)
    const out: THREE.BufferGeometry[] = []
    const v = new THREE.Vector3()
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      let isArm = false
      for (let p: THREE.Object3D | null = m; p; p = p.parent) if (p.name === 'arm' || p.name === 'front') isArm = true
      const src = m.geometry
      const pos = src.getAttribute('position')
      const arr = new Float32Array(pos.count * 3)
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)
        deform(v, isArm)
        arr[i * 3] = v.x
        arr[i * 3 + 1] = v.y
        arr[i * 3 + 2] = v.z
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
      if (src.index) g.setIndex(src.index)
      const n = src.getAttribute('normal')
      if (n) g.setAttribute('normal', n)
      else g.computeVertexNormals()
      out.push(g)
    })
    return out
  }, [gltf, params])
  // model → scene: X = xRear - (z - zMin)·1000, Y = frameTop + (y - yMin)·1000, Z = x·1000 (rotation −90° about Y)
  return (
    <group name="trw-hooklift-model" position={[xRear + ULT18Z59.zMin * 1000, frameTop - ULT18Z59.yMin * 1000, 0]} rotation={[0, -Math.PI / 2, 0]} scale={1000}>
      {geoms.map((g, i) => (
        <mesh key={i} geometry={g} material={material} castShadow receiveShadow />
      ))}
    </group>
  )
}

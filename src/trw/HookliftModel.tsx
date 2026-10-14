import { useGLTF } from '@react-three/drei'
import { Component, Suspense, useMemo, type ReactNode } from 'react'
import * as THREE from 'three'
import { deformPieces, ULT18Z59, type HookliftMesh, type HookliftParams } from './hooklift'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const glbUrl = (m: HookliftMesh) => `${import.meta.env.BASE_URL}models/hooklift/${m.file}`

export class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
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
export function HookliftModel(props: { xRear: number; frameTop: number; params: HookliftParams; mesh?: HookliftMesh; fallback: ReactNode }) {
  return (
    <Boundary fallback={props.fallback}>
      <Suspense fallback={props.fallback}>
        <Loaded {...props} />
      </Suspense>
    </Boundary>
  )
}

const edgeMat = new THREE.LineBasicMaterial({ color: '#5b6573', transparent: true, opacity: 0.55 })
const material = new THREE.MeshStandardMaterial({ color: '#1e1e1e', metalness: 0.3, roughness: 0.5, emissive: '#0b0d10', side: THREE.DoubleSide })

function Loaded({ xRear, frameTop, params, mesh = ULT18Z59 }: { xRear: number; frameTop: number; params: HookliftParams; mesh?: HookliftMesh }) {
  const gltf = useGLTF(glbUrl(mesh))
  const geoms = useMemo(() => {
    gltf.scene.updateMatrixWorld(true)
    const v = new THREE.Vector3()
    const parts: { src: THREE.BufferGeometry; off: number; count: number }[] = []
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) parts.push({ src: m.geometry, off: 0, count: m.geometry.getAttribute('position').count, m } as never)
    })
    const total = parts.reduce((a, p) => a + p.count, 0)
    const pos = new Float32Array(total * 3), piece = new Float32Array(total), arm = new Uint8Array(total)
    let off = 0
    for (const part of parts as (typeof parts[number] & { m: THREE.Mesh })[]) {
      let isArm = false
      for (let p: THREE.Object3D | null = part.m; p; p = p.parent) if (p.name === 'arm' || p.name === 'front') isArm = true
      const pa = part.src.getAttribute('position'), pc = part.src.getAttribute('_piece')
      part.off = off
      for (let i = 0; i < part.count; i++) {
        v.fromBufferAttribute(pa, i).applyMatrix4(part.m.matrixWorld)
        pos.set([v.x, v.y, v.z], (off + i) * 3)
        piece[off + i] = pc ? pc.getX(i) : -1
        arm[off + i] = isArm ? 1 : 0
      }
      off += part.count
    }
    const hidden = deformPieces(pos, piece, arm, params, mesh)
    const out: THREE.BufferGeometry[] = []
    for (const part of parts) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos.slice(part.off * 3, (part.off + part.count) * 3), 3))
      const idx = part.src.index
      if (idx) {
        const keep: number[] = []
        for (let t = 0; t < idx.count; t += 3) {
          const a = idx.getX(t)
          if (hidden.has(piece[part.off + a])) continue
          keep.push(a, idx.getX(t + 1), idx.getX(t + 2))
        }
        g.setIndex(keep)
      }
      const n = part.src.getAttribute('normal')
      if (n) {
        g.setAttribute('normal', n)
        out.push(g)
      } else out.push(toCreasedNormals(g, Math.PI / 6)) // mesh without normals (3MF source): keep CAD edges sharp
    }
    return out
  }, [gltf, params, mesh])
  const edges = useMemo(() => geoms.map((g) => new THREE.EdgesGeometry(g, 35)), [geoms])
  // model → scene: X = xRear - (z - zMin)·1000, Y = frameTop + (y - yMin)·1000, Z = x·1000 (rotation −90° about Y)
  return (
    <group name="trw-hooklift-model" position={[xRear + mesh.zMin * 1000, frameTop - mesh.yMin * 1000, 0]} rotation={[0, -Math.PI / 2, 0]} scale={1000}>
      {geoms.map((g, i) => (
        <group key={i}>
          <mesh geometry={g} material={material} castShadow receiveShadow />
          <lineSegments geometry={edges[i]} material={edgeMat} />
        </group>
      ))}
    </group>
  )
}

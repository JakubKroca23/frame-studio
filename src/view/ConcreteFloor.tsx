import * as THREE from 'three'

/**
 * The one floor used by every 3D scene: a single plain grey concrete plane (no grid, no texture, no second plane).
 * Pushed back in the depth buffer (polygonOffset) and a hair below y = 0, so tyres, shadows and floor marks
 * resting on it never z-fight / flicker at grazing angles.
 */
export const concreteMat = new THREE.MeshStandardMaterial({ color: '#9a9d9e', roughness: 0.92, metalness: 0.04, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 })

export function ConcreteFloor({ size = 80000, x = 0, z = 0, y, name = 'floor' }: { size?: number; x?: number; z?: number; y?: number; name?: string }) {
  return (
    <mesh name={name} rotation={[-Math.PI / 2, 0, 0]} position={[x, y ?? -size * 2.5e-5, z]} material={concreteMat} receiveShadow>
      <planeGeometry args={[size, size]} />
    </mesh>
  )
}

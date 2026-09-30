import * as THREE from 'three'

function std(color: number, metalness: number, roughness: number, extras: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    envMapIntensity: 1.05,
    ...extras,
  })
  mat.userData.shared = true
  return mat
}

/** Painted chassis steel, near-black so the frame reads against the cab. */
export const cranePaint = std(0xc4891a, 0.42, 0.55)
export const paint = std(0x16191d, 0.48, 0.52)
export const paintDark = std(0x0e1013, 0.4, 0.62)
export const castIron = std(0x2a2e33, 0.78, 0.38)
export const steel = std(0xc5ccd2, 0.9, 0.24)
export const alloy = std(0xe4e8ec, 0.94, 0.18)
export const rubber = std(0x101114, 0.0, 0.72, { side: THREE.DoubleSide })
export const rubberTrim = std(0x1a1d21, 0.02, 0.7)
export const glass = std(0x102028, 0.7, 0.06, { transparent: true, opacity: 0.78 })
export const cabPaint = std(0x155a9e, 0.22, 0.38)
export const cabRoof = std(0x1d6ec0, 0.2, 0.36)
export const cabTrim = std(0xd7dbe0, 0.55, 0.32)
export const lamp = std(0xfff6e4, 0.1, 0.2, { emissive: 0xffe7b0, emissiveIntensity: 0.85 })
export const lampRed = std(0x8c1c16, 0.2, 0.35, { emissive: 0x5a100c, emissiveIntensity: 0.4 })
export const tank = std(0xb9c3cb, 0.82, 0.28)
export const tankStrap = std(0x2c3238, 0.55, 0.45)
export const adblue = std(0x1f5c96, 0.2, 0.42)
export const toolbox = std(0x343b42, 0.32, 0.5)
export const exhaust = std(0x8d734c, 0.72, 0.34)
export const plastic = std(0x1c2126, 0.12, 0.55)
export const battery = std(0x23272c, 0.25, 0.48)
export const gasket = std(0x8a3a28, 0.15, 0.7)

export function shade(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.isMesh && !mesh.userData.noShadow) {
      mesh.castShadow = true
      mesh.receiveShadow = true
    }
  })
}

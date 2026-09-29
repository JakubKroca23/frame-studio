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

/** Painted chassis steel, the usual dark European frame colour. */
export const paint = std(0x2a3036, 0.42, 0.58)
export const paintDark = std(0x1c2126, 0.38, 0.64)
export const castIron = std(0x3a3e44, 0.72, 0.42)
export const steel = std(0xb7bcc2, 0.86, 0.28)
export const alloy = std(0xd5d8dc, 0.9, 0.22)
export const rubber = std(0x1a1c1f, 0.02, 0.86)
export const rubberTrim = std(0x2a2e32, 0.04, 0.78)
export const glass = std(0x1a2833, 0.55, 0.08, { transparent: true, opacity: 0.72 })
export const cabPaint = std(0xe7e4dc, 0.22, 0.46)
export const cabTrim = std(0x8e9294, 0.5, 0.4)
export const lamp = std(0xf4f1e6, 0.15, 0.25, { emissive: 0xf0e6c8, emissiveIntensity: 0.35 })
export const tank = std(0xc5cdd3, 0.78, 0.32)
export const tankStrap = std(0x4a5158, 0.5, 0.5)
export const exhaust = std(0x6a5848, 0.7, 0.38)
export const plastic = std(0x23282c, 0.08, 0.62)
export const battery = std(0x25282c, 0.2, 0.55)
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

import * as THREE from 'three'
import type { CabBrand } from '../model/types'
import { CAB_DEFAULT_COLOR } from '../presets/cabLayout'

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
/** Tinted glazing: dark, with a crisp reflection of the environment. */
export const glass = std(0x1b2a33, 0.78, 0.03, { transparent: true, opacity: 0.9, envMapIntensity: 2.2 })
export const cabPaint = std(0x155a9e, 0.22, 0.38)
export const cabRoof = std(0x1d6ec0, 0.2, 0.36)
export const cabTrim = std(0xd7dbe0, 0.55, 0.32)
export const lamp = std(0xfff6e4, 0.1, 0.2, { emissive: 0xffe7b0, emissiveIntensity: 0.85 })
/** Headlamp lens on the cab front: bright but not a blown-out white block. */
export const lampLens = std(0xaeb8bf, 0.6, 0.14, { emissive: 0x5d666d, emissiveIntensity: 0.3 })
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

export interface CabMaterials {
  paint: THREE.Material
  glass: THREE.Material
  black: THREE.Material
  grille: THREE.Material
  grilleBar: THREE.Material
  chrome: THREE.Material
  lens: THREE.Material
  drl: THREE.Material
  amber: THREE.Material
  badgeDark: THREE.Material
  badgeAccent: THREE.Material
  bumperUpper: THREE.Material
  bumperLower: THREE.Material
  step: THREE.Material
  mirror: THREE.Material
  rubber: THREE.Material
  reflector: THREE.Material
}


const chrome = std(0xdfe4e8, 1, 0.12, { envMapIntensity: 1.4 })
const cabBlack = std(0x111316, 0.15, 0.6)
const grilleGloss = std(0x14171a, 0.35, 0.32)
const grilleBar = std(0x2c3136, 0.65, 0.3)
const headLens = std(0xc9d2d8, 0.85, 0.08, { emissive: 0x2a3036, emissiveIntensity: 0.25, envMapIntensity: 1.6 })
const drl = std(0xffffff, 0.0, 0.25, { emissive: 0xf4f8ff, emissiveIntensity: 1.6 })
const amber = std(0xd9861a, 0.2, 0.3, { emissive: 0x7a4300, emissiveIntensity: 0.5 })
const factoryGrey = std(0x7c8086, 0.18, 0.55)
const darkGrey = std(0x3a3e43, 0.2, 0.5)
const mirrorPane = std(0xa9b2ba, 1, 0.04, { envMapIntensity: 1.6 })
const badgeNavy = std(0x1d3a7c, 0.4, 0.3)
const badgeInk = std(0x1a1f27, 0.4, 0.35)
const badgeSilver = std(0xd4d8dc, 0.9, 0.2)
const stepGrip = std(0x2a2d31, 0.6, 0.45)
const reflector = std(0x8d969e, 1, 0.18, { emissive: 0x30363c, emissiveIntensity: 0.4 })

const cabPaints = new Map<string, THREE.Material>()
/** Body paint of a configurator cab (cached per colour). */
export function cabPaintOf(color: number): THREE.Material {
  const key = color.toString(16)
  let mat = cabPaints.get(key)
  if (!mat) {
    mat = std(color, 0.35, 0.3, { envMapIntensity: 1.2 })
    cabPaints.set(key, mat)
  }
  return mat
}

/**
 * Materials of a brand's cab. MAN delivers bumper, wings and step area in factory grey
 * (MAN UK TGX/TGS cab specification, "Lower cab parts in standard factory grey"); the other
 * brand palettes are typical showroom finishes.
 */
export function cabMaterials(brand: string, variant: string, color?: number): CabMaterials {
  const paint = cabPaintOf(color ?? CAB_DEFAULT_COLOR[brand as CabBrand] ?? 0x155a9e)
  const rugged = variant === 'FMX' || variant === 'Arocs'
  const lowerGrey = brand === 'man'
  return {
    paint,
    glass,
    black: cabBlack,
    grille: grilleGloss,
    grilleBar,
    chrome,
    lens: headLens,
    drl,
    amber,
    badgeDark: brand === 'scania' ? badgeNavy : badgeInk,
    badgeAccent: badgeSilver,
    bumperUpper: lowerGrey ? factoryGrey : rugged || brand === 'mercedes' ? darkGrey : paint,
    bumperLower: lowerGrey ? factoryGrey : cabBlack,
    step: stepGrip,
    mirror: mirrorPane,
    rubber,
    reflector,
  }
}

import type { Pt } from '../lib/geom'
import type { CabFeatureSpec } from '../model/types'
import type { CabConfig, CabStyle } from './types'

/**
 * Parametric cab outlines for the configurator. They feed the same watertight silhouette builder
 * as cabs traced from drawings (side ∩ plan ∩ front). Proportions follow the published overall
 * dimensions; the shaping numbers below (windscreen rake, corner radii…) are visual estimates.
 */
interface StyleShape {
  /** Windscreen rake from vertical, degrees. */
  rake: number
  /** Lean of the grille face from vertical, degrees. */
  lean: number
  /** Plan radius of the front corners. */
  corner: number
  /** Front-view radius of the roof edges. */
  roof: number
  /** Narrowing of the glasshouse towards the roof, per side. */
  tumble: number
  /** Windscreen height (glass). */
  screen: number
  /** Grille width as a fraction of the half width. */
  grille: number
}

const STYLES: Record<CabStyle, StyleShape> = {
  volvo: { rake: 17, lean: 5, corner: 300, roof: 230, tumble: 95, screen: 1000, grille: 0.66 },
  scania: { rake: 9, lean: 2, corner: 200, roof: 170, tumble: 80, screen: 980, grille: 0.6 },
  man: { rake: 13, lean: 3, corner: 250, roof: 200, tumble: 85, screen: 960, grille: 0.62 },
  daf: { rake: 21, lean: 7, corner: 360, roof: 260, tumble: 100, screen: 1020, grille: 0.64 },
}

export interface CabShapeInput {
  cab: CabConfig
  frontOverhang: number
  frameTop: number
  /** Front tyre radius and axle height. */
  wheelRadius: number
  axleZ: number
}

export interface CabShape {
  side: Pt[]
  top: Pt[]
  front: Pt[]
  features: CabFeatureSpec[]
  box: { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number }
  stepX: number
  stepZ: number
}

const BUMPER = 360
const STEP = 470

export function cabShape(input: CabShapeInput): CabShape {
  const { cab } = input
  const s = STYLES[cab.style]
  const xf = -input.frontOverhang
  const xb = Math.max(cab.backFromAxle, xf + 1400)
  const len = xb - xf
  const height = Math.max(cab.height, input.frameTop + 1500)
  const half = cab.width / 2
  const ra = input.wheelRadius + 70
  const ac = input.axleZ

  // Heights: cab floor sits above the frame; the glass band follows from there.
  const floor = input.frameTop + 200
  const sill = input.frameTop + 110
  const screenLow = floor + 830
  const screenTop = Math.min(screenLow + s.screen, height - 170)
  const faceTop = screenLow - 40

  const side: Pt[] = []
  const push = (x: number, y: number) => side.push({ x, y })
  // Nose: bumper, grille face leaning back, windscreen.
  push(xf + 60, BUMPER)
  push(xf + 8, BUMPER + 40)
  push(xf, BUMPER + 140)
  const leanRun = Math.tan((s.lean * Math.PI) / 180)
  const xFace = xf + leanRun * (faceTop - BUMPER - 140)
  push(xFace, faceTop)
  const rake = Math.tan((s.rake * Math.PI) / 180)
  const xScreenLow = xFace + 25
  push(xScreenLow, screenLow)
  const xScreenTop = xScreenLow + rake * (screenTop - screenLow)
  push(xScreenTop, screenTop)
  // Roof cap: a rounded rise from the screen header to the roof.
  const cap = height - screenTop
  const capRun = Math.min(len * 0.35, 120 + cap * 0.55)
  for (let i = 1; i <= 8; i++) {
    const t = i / 8
    const ease = Math.sin((t * Math.PI) / 2)
    push(xScreenTop + capRun * t, screenTop + cap * ease)
  }
  // Roof to the rear wall with a rounded corner.
  const rr = Math.min(140, cap * 0.5 + 40)
  push(xb - rr, height)
  // Three arc points only: the plan builder owns a 40 mm band at the tail, keep vertices out of it.
  for (let i = 1; i <= 3; i++) {
    const angle = (i / 3) * (Math.PI / 2)
    push(xb - rr + Math.sin(angle) * rr, height - rr + Math.cos(angle) * rr)
  }
  // Underside, rear to front: sill behind the wheel, wheel arch, step corner, bumper.
  const archZ = (x: number) => ac + Math.sqrt(Math.max(0, ra * ra - x * x))
  const stepFront = xf + 330
  const bottom = (x: number) => {
    if (x < stepFront) return BUMPER
    if (x < -ra) return STEP
    if (x < 0) return Math.max(STEP, archZ(x))
    return Math.max(sill, x < ra ? archZ(x) : 0)
  }
  push(xb, bottom(xb))
  const keys = [-ra + 1, -ra - 1, stepFront + 1, stepFront - 1, 0].filter((x) => x < xb - 20 && x > xf + 80)
  const samples: number[] = [...keys]
  for (let x = xb - 40; x > xf + 80; x -= 40) if (keys.every((key) => Math.abs(key - x) > 12)) samples.push(x)
  const xs = [...new Set(samples.map((x) => Math.round(x)))].sort((p, q) => q - p)
  for (const x of xs) push(x, bottom(x))

  // Plan: rounded nose corners, slightly bowed front.
  const top: Pt[] = []
  const rc = Math.min(s.corner, half * 0.4)
  const tpush = (x: number, y: number) => top.push({ x, y })
  tpush(xb, -half)
  tpush(xb, half)
  for (let i = 0; i <= 8; i++) {
    const angle = (i / 8) * (Math.PI / 2)
    tpush(xf + rc - Math.sin(angle) * rc, half - rc + Math.cos(angle) * rc)
  }
  tpush(xf - 12, 0)
  for (let i = 0; i <= 8; i++) {
    const angle = Math.PI / 2 - (i / 8) * (Math.PI / 2)
    tpush(xf + rc - Math.sin(angle) * rc, -half + rc - Math.cos(angle) * rc)
  }

  // Front view: full width below the glass, tumblehome above, rounded roof edges.
  const front: Pt[] = []
  const shoulder = screenLow - 120
  const topHalf = half - s.tumble
  const roofR = Math.min(s.roof, topHalf * 0.4)
  const fpush = (x: number, y: number) => front.push({ x, y })
  const lowest = Math.min(BUMPER, STEP)
  fpush(-half + 30, lowest)
  fpush(half - 30, lowest)
  fpush(half, lowest + 60)
  fpush(half, shoulder)
  fpush(topHalf + (half - topHalf) * 0.35, (shoulder + height) / 2)
  for (let i = 0; i <= 8; i++) {
    const angle = (i / 8) * (Math.PI / 2)
    fpush(topHalf - roofR + Math.cos(angle) * roofR, height - roofR + Math.sin(angle) * roofR)
  }
  for (let i = 0; i <= 8; i++) {
    const angle = Math.PI / 2 + (i / 8) * (Math.PI / 2)
    fpush(-topHalf + roofR + Math.cos(angle) * roofR, height - roofR + Math.sin(angle) * roofR)
  }
  fpush(-topHalf - (half - topHalf) * 0.35, (shoulder + height) / 2)
  fpush(-half, shoulder)
  fpush(-half, lowest + 60)

  // Surface features as fractions of the body box (height from the lowest point, x from the nose).
  const z0 = lowest
  const hy = (z: number) => Math.min(1, Math.max(0, (z - z0) / (height - z0)))
  const fx = (x: number) => Math.min(1, Math.max(0, (x - xf) / len))
  const doorFront = Math.max(xScreenTop + 40, -ra - 340)
  const doorRear = Math.min(xb - 120, doorFront + 1080)
  const grilleLow = BUMPER + 330
  const features: CabFeatureSpec[] = [
    { part: 'glass', face: 'front', thickness: 9, y: [hy(screenLow + 30), hy(screenTop - 25)], z: [0, 0.9] },
    { part: 'grille', face: 'front', thickness: 14, y: [hy(grilleLow + (faceTop - grilleLow) * 0.3), hy(faceTop - 110)], z: [0, s.grille] },
    { part: 'grille', face: 'front', thickness: 14, y: [hy(BUMPER + 340), hy(BUMPER + 420)], z: [0, s.grille * 0.8] },
    { part: 'lamp', face: 'front', thickness: 18, y: [hy(BUMPER + 310), hy(BUMPER + 530)], z: [s.grille + 0.03, 0.92] },
    { part: 'bumper', face: 'front', thickness: 22, y: [hy(BUMPER + 10), hy(BUMPER + 290)], z: [0, 0.97] },
    { part: 'glass', face: 'side', thickness: 7, y: [hy(screenLow + 40), hy(screenTop - 120)], z: [0, 1], x: [fx(doorFront + 90), fx(doorRear - 60)] },
    { part: 'seam', face: 'side', thickness: 3, y: [hy(STEP + 140), hy(screenTop - 60)], z: [0, 1], x: [fx(doorFront), fx(doorFront + 7)] },
    { part: 'seam', face: 'side', thickness: 3, y: [hy(STEP + 140), hy(screenTop - 60)], z: [0, 1], x: [fx(doorRear), fx(doorRear + 7)] },
  ]
  if (cab.style === 'volvo') features.push({ part: 'trim', face: 'front', thickness: 10, y: [hy(faceTop - 80), hy(faceTop - 20)], z: [0, 0.66] })
  if (cab.style === 'scania') features.push({ part: 'trim', face: 'front', thickness: 10, y: [hy(grilleLow - 60), hy(grilleLow - 20)], z: [0, 0.8] })
  if (cab.style === 'daf') features.push({ part: 'trim', face: 'front', thickness: 10, y: [hy(faceTop - 60), hy(faceTop - 10)], z: [0, 0.5] })
  if (cab.style === 'man') features.push({ part: 'trim', face: 'front', thickness: 10, y: [hy(grilleLow + 120), hy(grilleLow + 170)], z: [0, 0.7] })

  return {
    side,
    top,
    front,
    features,
    box: { x0: xf, x1: xb, z0, z1: height, y0: -half, y1: half },
    stepX: (stepFront - ra) / 2,
    stepZ: STEP - 70,
  }
}

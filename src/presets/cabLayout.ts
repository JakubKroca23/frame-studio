import type { Pt } from '../lib/geom'
import type { CabBrand, ParametricCabSpec } from '../model/types'

/**
 * Shaping numbers of the parametric configurator cabs. The overall cab length, height and width
 * come from the presets (manufacturer data); everything in this table is a visual estimate
 * ("≈ odhad") read off press photos and side views, not manufacturer geometry.
 */
export interface CabStyleShape {
  /** Windscreen rake from vertical, degrees. */
  rake: number
  /** Lean of the grille face from vertical, degrees. */
  lean: number
  /** Cab floor (door sill) above the frame top. */
  floor: number
  /** Windscreen bottom above the cab floor. */
  belt: number
  /** Windscreen glass height. */
  screen: number
  /** Set-back of the windscreen base behind the grille face (wiper ledge). */
  ledge: number
  /** Plan rounding of the front face below the glass: depth from the centre line to the side wall, superellipse exponent. */
  noseDepth: number
  noseN: number
  /** The same at the glasshouse (wrap-around corners of the windscreen). */
  glassDepth: number
  glassN: number
  /** Narrowing of the glasshouse towards the roof, per side. */
  tumble: number
  /** Radius of the roof side edges and the rear roof edge. */
  roofR: number
  rearR: number
  /** High roofs: lean of the roof cap above the windscreen, degrees from vertical. */
  capSlope: number
  /** Bumper bottom above the road and bumper height. */
  bumperLow: number
  bumperH: number
  /** Plan radius of the rear vertical corners. */
  rearCorner: number
}

const BASE: Record<CabBrand, CabStyleShape> = {
  volvo: { rake: 14, lean: 5, floor: 250, belt: 800, screen: 1040, ledge: 35, noseDepth: 330, noseN: 3.6, glassDepth: 390, glassN: 3, tumble: 70, roofR: 190, rearR: 130, capSlope: 24, bumperLow: 360, bumperH: 400, rearCorner: 90 },
  scania: { rake: 7, lean: 2, floor: 250, belt: 790, screen: 1010, ledge: 18, noseDepth: 230, noseN: 5.5, glassDepth: 270, glassN: 4.5, tumble: 45, roofR: 130, rearR: 110, capSlope: 12, bumperLow: 380, bumperH: 380, rearCorner: 70 },
  man: { rake: 12, lean: 4, floor: 250, belt: 770, screen: 990, ledge: 28, noseDepth: 300, noseN: 4.2, glassDepth: 340, glassN: 3.6, tumble: 60, roofR: 160, rearR: 120, capSlope: 16, bumperLow: 380, bumperH: 390, rearCorner: 80 },
  daf: { rake: 18, lean: 7, floor: 250, belt: 790, screen: 1060, ledge: 38, noseDepth: 390, noseN: 3, glassDepth: 450, glassN: 2.7, tumble: 80, roofR: 220, rearR: 140, capSlope: 22, bumperLow: 360, bumperH: 400, rearCorner: 100 },
  mercedes: { rake: 17, lean: 6, floor: 250, belt: 800, screen: 1050, ledge: 32, noseDepth: 360, noseN: 3.4, glassDepth: 420, glassN: 3, tumble: 75, roofR: 200, rearR: 130, capSlope: 20, bumperLow: 370, bumperH: 400, rearCorner: 90 },
}

/** Series that share a brand face but differ in proportions (all ≈ odhad). */
const VARIANTS: Record<string, Partial<CabStyleShape>> = {
  'volvo:FM': { belt: 690, screen: 960, rake: 13, roofR: 170 },
  'volvo:FMX': { belt: 690, screen: 960, rake: 13, roofR: 170, bumperLow: 470, bumperH: 380 },
  'scania:S': { floor: 330, belt: 800, screen: 1060 },
  'scania:G': { belt: 720, screen: 960 },
  'scania:P': { belt: 640, screen: 920, floor: 200 },
  'man:TGS': { belt: 720, screen: 960 },
  'man:TGM': { belt: 640, screen: 930, rake: 14, floor: 200 },
  'daf:XG': { noseDepth: 520, glassDepth: 560, rake: 20 },
  'daf:XD': { belt: 700, screen: 990, rake: 15, noseDepth: 330, glassDepth: 380, glassN: 3.2 },
  'daf:CF': { belt: 700, screen: 990, rake: 15, noseDepth: 330, glassDepth: 380, glassN: 3.2 },
  'mercedes:Arocs': { rake: 13, bumperLow: 450, noseN: 4.5, noseDepth: 300 },
}

export function cabStyle(brand: CabBrand, variant: string): CabStyleShape {
  return { ...BASE[brand], ...(VARIANTS[`${brand}:${variant}`] ?? {}) }
}

/** Default body colours per brand (typical showroom colours); the form keeps them editable. */
export const CAB_DEFAULT_COLOR: Record<CabBrand, number> = { volvo: 0x1d4f86, scania: 0xa3161f, man: 0xdadad6, daf: 0x2a3a55, mercedes: 0xc9ccd0 }

/** Default series per brand when the cab style differs from the chassis make. */
export const DEFAULT_VARIANT: Record<CabBrand, string> = { volvo: 'FH', scania: 'R', man: 'TGX', daf: 'XF', mercedes: 'Actros' }

/** The bumper stands this far proud of the body; the spec's xFront is the bumper face. */
export const BUMPER_PROUD = 50

export interface CabPlan {
  /** Front of the body on the centre line, rear wall, half width. */
  xf: number
  xr: number
  w: number
  /** Superellipse of the front corners: depth and exponent; xc = xf + d is where the side wall starts. */
  d: number
  n: number
  xc: number
  /** Plan radius of the rear corners. */
  rc: number
}

export interface CabLayout {
  spec: ParametricCabSpec
  style: CabStyleShape
  zLow: number
  zBumperTop: number
  zFloor: number
  /** Top of the grille face (bottom of the wiper ledge). */
  zFace: number
  zScreenLow: number
  zScreenTop: number
  height: number
  /** Top of the front wheel arch (clearance circle) and its radius. */
  zArch: number
  archR: number
  /** Body plan at a height. */
  plan(z: number): CabPlan
  /** Front surface x at height z and lateral y (|y| clamped to the half width). */
  frontAt(z: number, y: number): number
  /** Side surface |lateral| at height z and x (inside the front rounding it follows the corner). */
  sideAt(z: number, x: number): number
  /** Ring heights of the body loft, bottom to top. */
  rings: number[]
  /** Side-view outline (x, z), closed. */
  side: Pt[]
}

const rad = (deg: number) => (deg * Math.PI) / 180
const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t))
  return c * c * (3 - 2 * c)
}

export function cabLayout(spec: ParametricCabSpec): CabLayout {
  const style = cabStyle(spec.brand, spec.variant)
  const H = spec.height
  const half = spec.width / 2
  const zLow = style.bumperLow
  const zBumperTop = zLow + style.bumperH
  const zFloor = spec.frameTop + style.floor
  let zScreenTop = Math.min(zFloor + style.belt + style.screen, H - 150)
  let zScreenLow = Math.min(zFloor + style.belt, zScreenTop - 620)
  if (zScreenLow < zBumperTop + 500) {
    zScreenLow = zBumperTop + 500
    zScreenTop = Math.max(zScreenTop, zScreenLow + 500)
  }
  const zFace = zScreenLow - 40
  const archR = spec.wheelRadius + 75
  const zArch = spec.axleZ + archR
  const xBody = spec.xFront + BUMPER_PROUD

  // Side profile of the nose, bottom to top: bumper zone, grille face, wiper ledge, windscreen, roof cap.
  const nose: Pt[] = []
  nose.push({ x: xBody + 25, y: zLow }, { x: xBody, y: zLow + 60 }, { x: xBody, y: zBumperTop })
  const lean = Math.tan(rad(style.lean))
  const xFaceTop = xBody + lean * (zFace - zBumperTop)
  for (let i = 1; i <= 6; i++) {
    const z = zBumperTop + ((zFace - zBumperTop) * i) / 6
    nose.push({ x: xBody + lean * (z - zBumperTop), y: z })
  }
  // Ledge: a short rounded step back to the windscreen base.
  for (let i = 1; i <= 4; i++) {
    const t = i / 4
    nose.push({ x: xFaceTop + style.ledge * Math.sin((t * Math.PI) / 2), y: zFace + (zScreenLow - zFace) * t })
  }
  const rake = Math.tan(rad(style.rake))
  const xScreenLow = xFaceTop + style.ledge
  const xScreenTop = xScreenLow + rake * (zScreenTop - zScreenLow)
  for (let i = 1; i <= 8; i++) {
    const z = zScreenLow + ((zScreenTop - zScreenLow) * i) / 8
    nose.push({ x: xScreenLow + rake * (z - zScreenLow), y: z })
  }
  // Roof cap: cubic from the screen header (along the rake) to the roof (horizontal tangent).
  const cap = H - zScreenTop
  const high = spec.roof === 'high' || spec.roof === 'xhigh' || cap > 520
  const slope = high ? Math.tan(rad(style.capSlope)) : rake
  const capRun = high ? slope * cap + 240 : 140 + cap * 0.85
  const p0 = { x: xScreenTop, y: zScreenTop }
  const lift = high ? cap * 0.62 : cap * 0.5
  const p1 = { x: xScreenTop + slope * lift, y: zScreenTop + lift }
  const p3 = { x: xScreenTop + capRun, y: H }
  const p2 = { x: p3.x - (high ? 200 : capRun * 0.5), y: H }
  const capPts: Pt[] = []
  const capTs: number[] = []
  for (let i = 1; i <= 24; i++) {
    const t = 1 - (1 - i / 24) ** 1.6
    capTs.push(t)
    const u = 1 - t
    capPts.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    })
  }
  nose.push(...capPts)
  const xRoofFront = p3.x

  const frontX = (z: number): number => {
    if (z <= nose[0].y) return nose[0].x
    for (let i = 1; i < nose.length; i++) {
      const a = nose[i - 1]
      const b = nose[i]
      if (z <= b.y) {
        if (b.y - a.y < 1e-6) return b.x
        return a.x + ((z - a.y) / (b.y - a.y)) * (b.x - a.x)
      }
    }
    return xRoofFront
  }

  const tumbleStart = zScreenLow - 120
  const roofShrink = (z: number, r: number) => {
    const d = z - (H - r)
    return d <= 0 ? 0 : r - Math.sqrt(Math.max(0, r * r - d * d))
  }
  const halfAt = (z: number) => {
    const t = Math.max(0, (z - tumbleStart) / Math.max(1, H - tumbleStart))
    return half - style.tumble * t ** 1.15 - roofShrink(z, style.roofR)
  }
  const rearAt = (z: number) => {
    if (z < zArch) {
      const dz = z - spec.axleZ
      return -Math.sqrt(Math.max(0, archR * archR - dz * dz))
    }
    return spec.xRear - roofShrink(z, style.rearR)
  }

  const plan = (z: number): CabPlan => {
    const xf = frontX(z)
    const xr = Math.max(rearAt(z), xf + 260)
    const w = halfAt(z)
    const blend = smooth((z - (zFace - 250)) / (zScreenLow + 300 - (zFace - 250)))
    let d = style.noseDepth + (style.glassDepth - style.noseDepth) * blend
    const n = style.noseN + (style.glassN - style.noseN) * blend
    d = Math.min(d, (xr - xf) * 0.6)
    const xc = xf + d
    const rc = Math.max(10, Math.min(style.rearCorner, (xr - xc) * 0.45, w * 0.4))
    return { xf, xr, w, d, n, xc, rc }
  }

  const frontAt = (z: number, y: number) => {
    const p = plan(z)
    const a = Math.min(0.99999, Math.abs(y) / p.w)
    return p.xc - p.d * Math.pow(1 - Math.pow(a, p.n), 1 / p.n)
  }
  const sideAt = (z: number, x: number) => {
    const p = plan(z)
    if (x >= p.xc) return p.w
    const a = Math.min(1, Math.max(0, (p.xc - x) / p.d))
    return p.w * Math.pow(Math.max(0, 1 - Math.pow(a, p.n)), 1 / p.n)
  }

  // Ring heights: even steps, every nose vertex, the roof roll-over and both sides of the arch step.
  const zs: number[] = []
  for (let z = zLow; z < H - style.roofR; z += 40) zs.push(z)
  for (const p of nose) if (p.y < H) zs.push(p.y)
  for (const r of [style.roofR, style.rearR]) for (let i = 0; i < 12; i++) zs.push(H - r + r * Math.sin(((i + 0.5) / 12) * (Math.PI / 2)))
  zs.push(zArch - 0.6, zArch, zBumperTop, zFace, zScreenLow, zScreenTop)
  zs.sort((a, b) => a - b)
  const rings: number[] = []
  for (const z of zs) {
    if (z < zLow || z >= H - 0.5) continue
    const last = rings[rings.length - 1]
    if (last !== undefined && z - last < 3 && !(Math.abs(z - zArch) < 1 || Math.abs(last - zArch) < 1)) continue
    rings.push(z)
  }
  rings.push(H)

  // Side outline: nose up, roof, rear wall, underside with the wheel arch.
  const side: Pt[] = []
  for (const z of rings) side.push({ x: plan(z).xf, y: z })
  for (const z of rings.slice().reverse()) {
    if (z < zArch) break
    side.push({ x: plan(z).xr, y: z })
  }
  side.push({ x: 0, y: zArch - 0.6 })
  for (let i = 1; i <= 10; i++) {
    const z = zArch - 0.6 - ((zArch - 0.6 - zLow) * i) / 10
    side.push({ x: rearAt(z), y: z })
  }

  return {
    spec,
    style,
    zLow,
    zBumperTop,
    zFloor,
    zFace,
    zScreenLow,
    zScreenTop,
    height: H,
    zArch,
    archR,
    plan,
    frontAt,
    sideAt,
    rings,
    side: dedupe(side),
  }
}

function dedupe(points: Pt[]): Pt[] {
  const out: Pt[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && Math.hypot(last.x - p.x, last.y - p.y) < 0.5) continue
    out.push(p)
  }
  return out
}

/** Plan outline at a height, as a closed ring (x along the vehicle, y lateral). */
export function planRing(plan: CabPlan, counts = { front: 64, side: 20, corner: 8, rear: 14 }): Pt[] {
  const { xr, w, d, n, xc, rc } = plan
  // Dense superellipse, resampled by arc length so rings stay in step.
  const dense: Pt[] = []
  const steps = 240
  for (let i = 0; i <= steps; i++) {
    const theta = -Math.PI / 2 + (Math.PI * i) / steps
    const s = Math.sin(theta)
    const c = Math.cos(theta)
    dense.push({ x: xc - d * Math.pow(Math.abs(c), 2 / n), y: w * Math.sign(s) * Math.pow(Math.abs(s), 2 / n) })
  }
  const front = resample(dense, counts.front)
  const ring: Pt[] = [...front]
  const sx0 = xc
  const sx1 = Math.max(xc + 1, xr - rc)
  for (let i = 1; i <= counts.side; i++) ring.push({ x: sx0 + ((sx1 - sx0) * i) / (counts.side + 1), y: w })
  for (let i = 0; i <= counts.corner; i++) {
    const a = (Math.PI / 2) * (i / counts.corner)
    ring.push({ x: sx1 + Math.sin(a) * rc, y: w - rc + Math.cos(a) * rc })
  }
  for (let i = 1; i <= counts.rear; i++) ring.push({ x: xr, y: w - rc - ((2 * (w - rc)) * i) / (counts.rear + 1) })
  for (let i = 0; i <= counts.corner; i++) {
    const a = (Math.PI / 2) * (i / counts.corner)
    ring.push({ x: sx1 + Math.cos(a) * rc, y: -w + rc - Math.sin(a) * rc })
  }
  for (let i = 1; i <= counts.side; i++) ring.push({ x: sx1 - ((sx1 - sx0) * i) / (counts.side + 1), y: -w })
  return ring
}

export function resample(points: Pt[], count: number): Pt[] {
  const lengths = [0]
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y))
  const total = lengths[lengths.length - 1] || 1
  const out: Pt[] = []
  let k = 1
  for (let i = 0; i < count; i++) {
    const target = (total * i) / (count - 1)
    while (k < points.length - 1 && lengths[k] < target) k++
    const span = lengths[k] - lengths[k - 1] || 1
    const t = Math.min(1, Math.max(0, (target - lengths[k - 1]) / span))
    out.push({ x: points[k - 1].x + (points[k].x - points[k - 1].x) * t, y: points[k - 1].y + (points[k].y - points[k - 1].y) * t })
  }
  return out
}

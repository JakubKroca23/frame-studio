/**
 * Articulation of the Multilift CAD mesh (ULT18Z59 / ULTIMA 21S.56), kinematics from the Multilift dimension
 * drawings GDZ0073 (XR18Z59 HH1570 BL250) and GDS0352 (XR18S59 HH1570 BL250) – only derived numbers here, no drawing
 * geometry. Both drawings show the same mechanism (stowed → hook slid rearwards → loading swing → tipping):
 *  - 'sub'   subframe on the truck frame (outer rails, front ends) – fixed,
 *  - 'frame' tipping main frame incl. the REAR ROLLERS (the drawings show the roller moving when tipped) – rotates
 *            about the rear tipping pivot, ~100 mm behind / ~100 mm below the roller axle,
 *  - 'mid'   middle frame (narrow inner beams) – rotates on the main frame about the knuckle K (loading swing),
 *  - 'arm'   hook arm (column + hook) – slides along the middle frame (posunutí) and swings with it.
 * Model space (metres): z forward from the rear, y up from the truck frame top (roller axle at y 0.175, z 0.10).
 */
import type { HookliftSpec } from './hookliftCatalog'
import type { HookliftMesh } from './hooklift'

/**
 * 'barrel' / 'rod' = the paired main cylinders. They do both loading and tipping (standard hooklift): barrel base pin
 * on the SUBFRAME (front), rod eye pin on the MIDDLE FRAME. Loading: main frame locked → middle frame swings about the
 * knuckle; tipping: middle frame locked to the main frame → both rotate about the rear pivot. 'arm' = everything that
 * slides with the hook: hook column + the telescopic inner beam (incl. its part inside the middle frame) + slide rod.
 */
export type HookPart = 'sub' | 'frame' | 'mid' | 'arm' | 'barrel' | 'rod'

export interface HookGeom {
  /** Tipping pivot (main frame on subframe) [m, model y/z]. */
  tip: { y: number; z: number }
  /** Knuckle (middle frame on main frame) [m]. */
  knuckle: { y: number; z: number }
  tipDeg: number
  /** Loading swing of the middle frame (hook from the slid-back position over the top to the rear) [deg]. */
  swingDeg: number
  slideMm: number
  /** Main cylinder pins [m, undeformed model]: A rod eye on the middle frame, B barrel base on the subframe. */
  cyl: { A: { y: number; z: number }; B: { y: number; z: number } }
  source: string
}

/** Roller axle in both meshes (rear group, Ø≈290 roller): y 0.175, z 0.10. */
const ROLLER = { y: 0.175, z: 0.1 }
export const GEOM: Record<'Z' | 'S', HookGeom> = {
  // GDZ0073: pivot 100 behind / 97 below the roller axle (y ≈ 80 above frame top), knuckle 3 959 behind the stowed
  // hook = 1 921 ahead of the roller, 81 above frame top; hook slide 1 100; tipping 51.7°; swing 148.7° → 356° = 152.7°.
  // Main cylinder pins from the CAD (rod eye in the middle-frame lug, base in the front subframe bracket). Cross-check
  // with GDZ0073: eye 2 980 ahead of the roller / 285 above the frame = z 3.08, y 0.285 ✓; with the base fixed, the
  // eye positions of the tipped (51.7°) and the loading pose give the same pin distance 4.62 m (closed 2.53 m) → base
  // on the subframe, one cylinder pair does both motions.
  Z: { tip: { y: 0.08, z: ROLLER.z - 0.1 }, knuckle: { y: 0.081, z: ROLLER.z + 1.921 }, tipDeg: 51.7, swingDeg: 152.7, slideMm: 1100, cyl: { A: { y: 0.285, z: 3.085 }, B: { y: 0.068, z: 5.6 } }, source: 'GDZ0073 (XR18Z59)' },
  // GDS0352: pivot 101 behind / 114 below the axle (y ≈ 63), knuckle 4 160 behind the hook = 1 700 ahead of the
  // roller, 65 above frame top; hook slide 1 450 (= HM of 18S.59); tipping 52.1°; swing 147° → 357° = 150°.
  S: { tip: { y: 0.063, z: ROLLER.z - 0.101 }, knuckle: { y: 0.065, z: ROLLER.z + 1.7 }, tipDeg: 52.1, swingDeg: 150, slideMm: 1450, cyl: { A: { y: 0.29, z: 2.78 }, B: { y: 0.09, z: 5.14 } }, source: 'GDS0352 (XR18S59)' },
}

export const isSliding = (m: HookliftMesh) => /21s56/i.test(m.file)
export const geomFor = (m: HookliftMesh) => GEOM[isSliding(m) ? 'S' : 'Z']

/** Piece bounding box in undeformed model space [m]. */
export interface PieceBox { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }
export const SUB_TOP = 0.165
/**
 * Explicit segmentation rule per CAD piece (group from the GLB + its box):
 *  arm group, and the tall column of the front group → arm; narrow inner beams (|x| ≤ 0.13) starting at/after the
 *  knuckle → middle frame; wide low rails / front ends (|x| ≥ 0.30, top ≤ SUB_TOP) → subframe; rest (incl. rear
 *  rollers, main-frame beams, tipping cylinders) → tipping main frame; centre slide-cylinder rod → arm; paired lift
 *  cylinders ahead of the knuckle → 'cyl' (stretched between main frame and middle frame).
 */
export function classifyPiece(group: string, b: PieceBox, g: HookGeom): HookPart {
  if (group === 'arm') return 'arm'
  const ax = Math.max(Math.abs(b.x0), Math.abs(b.x1))
  // front group: hook column and the central parts at its foot slide with the hook; low / outer parts = subframe ends
  if (group === 'front') return b.y1 > 0.6 || (b.y1 > 0.2 && ax <= 0.2) ? 'arm' : 'sub'
  const xc = Math.abs(b.x0 + b.x1) / 2
  const len = b.z1 - b.z0
  const k = g.knuckle.z, A = g.cyl.A
  if (group === 'rails') {
    // container rests (kozlíky): full-width cross pieces at the rest stations and the outboard rest blocks/brackets –
    // bolted to the fixed subframe, they must not tip
    if (b.x1 - b.x0 > 0.72 && len < 0.3 && b.y1 < 0.31) return 'sub'
    if (Math.min(Math.abs(b.x0), Math.abs(b.x1)) >= 0.37 && b.x0 * b.x1 > 0 && b.y1 <= 0.32 && len < 0.4) return 'sub'
    // main cylinders: long tubes beside the middle frame; the rod (incl. the part hidden in the barrel) is slimmer
    if (len > 1.5 && xc >= 0.17 && xc <= 0.34 && b.y1 < 0.4 && b.z0 > k) return b.y1 - b.y0 < 0.3 ? 'rod' : 'barrel'
    // small parts at the rod eye / barrel gland
    if (len < 0.4 && xc >= 0.17 && xc <= 0.34 && b.z0 >= A.z - 0.12 && b.z1 <= A.z + 0.25) return b.z1 <= A.z + 0.12 ? 'rod' : 'barrel'
    // the middle-frame lug carrying the rod eye
    if (xc >= 0.14 && xc <= 0.34 && b.z0 >= A.z - 0.4 && b.z1 <= A.z + 0.25) return 'mid'
    // telescopic inner beam (sliding with the hook) incl. its rear part inside the middle frame, and the slide rod
    if (ax <= 0.111 && b.y1 > 0.095 && b.z0 >= k + 1.27) return 'arm'
  }
  if (group !== 'rear' && b.y1 <= SUB_TOP && Math.min(Math.abs(b.x0), Math.abs(b.x1)) >= 0.3) return 'sub'
  if (group !== 'rear' && ax <= 0.16 && b.z0 >= k - 0.25) return 'mid'
  return 'frame'
}

/** Rotation about the model x axis as used by the scene groups (rotation.x = −deg): lifts points ahead of the pivot. */
export function rotYZ(p: { y: number; z: number }, c: { y: number; z: number }, deg: number) {
  const t = (deg * Math.PI) / 180, y = p.y - c.y, z = p.z - c.z
  return { y: c.y + y * Math.cos(t) + z * Math.sin(t), z: c.z - y * Math.sin(t) + z * Math.cos(t) }
}
/** Rod eye pin for a pose: swing about the knuckle, then tip about the rear pivot (pins already deformed). */
export function eyeAt(A: { y: number; z: number }, knuckle: { y: number; z: number }, tip: { y: number; z: number }, pose: { tipDeg: number; swingDeg: number }) {
  return rotYZ(rotYZ(A, knuckle, pose.swingDeg), tip, pose.tipDeg)
}

export function hookLimits(mesh: HookliftMesh, spec?: HookliftSpec | null) {
  const g = geomFor(mesh)
  return {
    tipMax: spec?.tippingAngleDeg ?? g.tipDeg,
    swingMax: g.swingDeg,
    slideMaxMm: (isSliding(mesh) ? spec?.horizontalMovementMm : null) ?? g.slideMm,
    source: g.source,
  }
}

export interface HookPose { tipDeg: number; swingDeg: number; slideMm: number }
export const STOWED: HookPose = { tipDeg: 0, swingDeg: 0, slideMm: 0 }
export function clampPose(p: HookPose, l: ReturnType<typeof hookLimits>): HookPose {
  const c = (v: number, hi: number) => Math.min(hi, Math.max(0, v))
  return { tipDeg: c(p.tipDeg, l.tipMax), swingDeg: c(p.swingDeg, l.swingMax), slideMm: c(p.slideMm, l.slideMaxMm) }
}

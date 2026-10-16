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

/** 'cyl' = lift cylinder between the main frame (rear eye) and the middle frame (front eye), stretched per pose. */
export type HookPart = 'sub' | 'frame' | 'mid' | 'arm' | 'cyl'

export interface HookGeom {
  /** Tipping pivot (main frame on subframe) [m, model y/z]. */
  tip: { y: number; z: number }
  /** Knuckle (middle frame on main frame) [m]. */
  knuckle: { y: number; z: number }
  tipDeg: number
  /** Loading swing of the middle frame (hook from the slid-back position over the top to the rear) [deg]. */
  swingDeg: number
  slideMm: number
  source: string
}

/** Roller axle in both meshes (rear group, Ø≈290 roller): y 0.175, z 0.10. */
const ROLLER = { y: 0.175, z: 0.1 }
export const GEOM: Record<'Z' | 'S', HookGeom> = {
  // GDZ0073: pivot 100 behind / 97 below the roller axle (y ≈ 80 above frame top), knuckle 3 959 behind the stowed
  // hook = 1 921 ahead of the roller, 81 above frame top; hook slide 1 100; tipping 51.7°; swing 148.7° → 356° = 152.7°.
  Z: { tip: { y: 0.08, z: ROLLER.z - 0.1 }, knuckle: { y: 0.081, z: ROLLER.z + 1.921 }, tipDeg: 51.7, swingDeg: 152.7, slideMm: 1100, source: 'GDZ0073 (XR18Z59)' },
  // GDS0352: pivot 101 behind / 114 below the axle (y ≈ 63), knuckle 4 160 behind the hook = 1 700 ahead of the
  // roller, 65 above frame top; hook slide 1 450 (= HM of 18S.59); tipping 52.1°; swing 147° → 357° = 150°.
  S: { tip: { y: 0.063, z: ROLLER.z - 0.101 }, knuckle: { y: 0.065, z: ROLLER.z + 1.7 }, tipDeg: 52.1, swingDeg: 150, slideMm: 1450, source: 'GDS0352 (XR18S59)' },
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
  if (group === 'front' && b.y1 > 0.6) return 'arm'
  const ax = Math.max(Math.abs(b.x0), Math.abs(b.x1))
  const k = g.knuckle.z
  // slide cylinder on the centre line: barrel in the middle frame, rod (front piece) pushes the hook arm
  if (group === 'rails' && ax <= 0.07 && b.y0 >= 0.15 && b.z0 >= k + 1.3) return 'arm'
  // paired lift cylinders beside the middle frame, ahead of the knuckle
  if (group === 'rails' && b.z1 - b.z0 > 1.5 && b.x1 - b.x0 < 0.12 && ax > 0.13 && ax < 0.4 && b.y1 < 0.4 && b.z0 > k) return 'cyl'
  if (group !== 'rear' && b.y1 <= SUB_TOP && Math.min(Math.abs(b.x0), Math.abs(b.x1)) >= 0.3) return 'sub'
  if (group !== 'rear' && ax <= 0.13 && b.z0 >= g.knuckle.z - 0.25) return 'mid'
  return 'frame'
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

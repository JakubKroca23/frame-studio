/**
 * Articulation of the Multilift CAD mesh (ULT18Z59 / ULTIMA 21S.56). The GLB has four groups (rear, rails, front,
 * arm) with a per-vertex `_piece` id; parts are segmented per piece into
 *  - 'sub'   subframe that stays on the truck frame: the rear group (rollers) and every low piece (top ≤ SUB_TOP),
 *  - 'frame' tipping main frame (rotates about the rear pivot),
 *  - 'jib'   hook arm: the arm group + the tall column of the front group (rotates about the knuckle / slides).
 * ASSUMPTIONS (no pivot data in the repo / datasheets – geometric estimates from the mesh, see report):
 *  - rear tipping pivot at model (y 0.20 m, z 0.15 m) – over the rear roller axle,
 *  - knuckle at the jib's lower end (bottom + 0.10 m, centre of the jib's z-extent),
 *  - jib range 0…60° rearwards (Z / articulated series), slide range = datasheet HM if known, else 1 000 mm (S series).
 * Tipping limit = datasheet tipping angle (tippingAngleDeg) when the spec is known, else 50°.
 */
import type { HookliftSpec } from './hookliftCatalog'
import type { HookliftMesh } from './hooklift'

export type HookPart = 'sub' | 'frame' | 'jib'
export const SUB_TOP = 0.165
export const JIB_MIN_TOP = 0.6
export const REAR_PIVOT = { y: 0.2, z: 0.15 }
export const JIB_MAX_DEG = 60
export const SLIDE_DEFAULT_MM = 1000
export const TIP_DEFAULT_DEG = 50

export function classifyPiece(group: string, yTop: number): HookPart {
  if (group === 'rear') return 'sub'
  if (group === 'arm') return 'jib'
  if (group === 'front' && yTop > JIB_MIN_TOP) return 'jib'
  return yTop <= SUB_TOP ? 'sub' : 'frame'
}

export const isSliding = (m: HookliftMesh) => /21s56/i.test(m.file)

export function hookLimits(mesh: HookliftMesh, spec?: HookliftSpec | null) {
  const sliding = spec ? /\d+S(L)?$/.test(spec.series) : isSliding(mesh)
  return {
    tipMax: spec?.tippingAngleDeg ?? TIP_DEFAULT_DEG,
    tipFromSpec: spec?.tippingAngleDeg != null,
    jibMax: sliding ? 0 : JIB_MAX_DEG,
    slideMaxMm: sliding ? spec?.horizontalMovementMm ?? SLIDE_DEFAULT_MM : 0,
    slideFromSpec: sliding && spec?.horizontalMovementMm != null,
  }
}

export interface HookPose { tipDeg: number; jibDeg: number; slideMm: number }
export const STOWED: HookPose = { tipDeg: 0, jibDeg: 0, slideMm: 0 }
export function clampPose(p: HookPose, l: ReturnType<typeof hookLimits>): HookPose {
  const c = (v: number, hi: number) => Math.min(hi, Math.max(0, v))
  return { tipDeg: c(p.tipDeg, l.tipMax), jibDeg: c(p.jibDeg, l.jibMax), slideMm: c(p.slideMm, l.slideMaxMm) }
}

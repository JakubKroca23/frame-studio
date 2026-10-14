/**
 * Kinematics + HiSelect load data for HIAB X-HiPro 142 E-1…E-5 / ES-1…ES-5.
 *
 * Crane boom plane (metres): r = horizontal distance from the slewing column axis along the boom azimuth,
 * h = height above the crane base underside (= frame top). Angles in degrees, a1 = main boom from horizontal,
 * rel = outer boom relative to the main boom (0 = in line, negative = knuckled down).
 *
 * MEASURED (from the user's E-4 "straight" CAD, hr-142_e4_straight.dxf, ±50 mm – pivots estimated from where parts overlap):
 *   main boom pivot P1, knuckle P2, retracted outer-boom tip, lateral offset of the outer boom.
 * FROM DRAWINGS 464-0807/0808 (table "1-3 OUTREACH"): min outreach, max hydraulic outreach, max with manual extension.
 * FROM HiSelect (user transcription): SOR/SLC load chart, HORS, MOR1/MLC1, weights.
 * ASSUMED (not in the drawings): joint limits, telescopes extend equally, slewing range centred on forward.
 */

export type CraneVariant = { id: string; family: 'E' | 'ES'; extensions: number; minOutreachMm: number; hydMaxMm: number; manMaxMm: number }

/** Table "1-3, OUTREACH" from drawings 464-0807 (E/ES 1-3) and 464-0808 (E/ES 4-5). */
export const X142_VARIANTS: CraneVariant[] = [
  { id: 'E-1', family: 'E', extensions: 1, minOutreachMm: 4670, hydMaxMm: 6570, manMaxMm: 8600 },
  { id: 'E-2', family: 'E', extensions: 2, minOutreachMm: 4750, hydMaxMm: 8600, manMaxMm: 10780 },
  { id: 'E-3', family: 'E', extensions: 3, minOutreachMm: 4800, hydMaxMm: 10780, manMaxMm: 12960 },
  { id: 'E-4', family: 'E', extensions: 4, minOutreachMm: 4810, hydMaxMm: 12810, manMaxMm: 15100 },
  { id: 'E-5', family: 'E', extensions: 5, minOutreachMm: 4890, hydMaxMm: 15090, manMaxMm: 17380 },
  { id: 'ES-1', family: 'ES', extensions: 1, minOutreachMm: 4370, hydMaxMm: 6270, manMaxMm: 8300 },
  { id: 'ES-2', family: 'ES', extensions: 2, minOutreachMm: 4450, hydMaxMm: 8300, manMaxMm: 10480 },
  { id: 'ES-3', family: 'ES', extensions: 3, minOutreachMm: 4530, hydMaxMm: 10480, manMaxMm: 12660 },
  { id: 'ES-4', family: 'ES', extensions: 4, minOutreachMm: 4510, hydMaxMm: 12510, manMaxMm: 14800 },
  { id: 'ES-5', family: 'ES', extensions: 5, minOutreachMm: 4600, hydMaxMm: 14800, manMaxMm: 17080 },
]

/** HiSelect (E only): SOR [m] / SLC [kg], manual MOR1/MLC1. */
export const X142_LOADS: Record<string, { sor: [number, number][]; mor1: number; mlc1: number; hors: number }> = {
  'E-1': { sor: [[3.0, 4350], [4.6, 2950], [6.4, 2120]], hors: 6.6, mor1: 8.5, mlc1: 1560 },
  'E-2': { sor: [[3.1, 4200], [4.7, 2800], [6.5, 2000], [8.5, 1520]], hors: 8.6, mor1: 10.7, mlc1: 1160 },
  'E-3': { sor: [[3.1, 4100], [4.8, 2650], [6.6, 1860], [8.6, 1400], [10.7, 1100]], hors: 10.8, mor1: 12.8, mlc1: 870 },
  'E-4': { sor: [[3.1, 4000], [4.8, 2550], [6.6, 1780], [8.5, 1320], [10.6, 1020], [12.7, 840]], hors: 12.8, mor1: 15.0, mlc1: 660 },
  'E-5': { sor: [[3.1, 3900], [4.9, 2420], [6.7, 1660], [8.6, 1200], [10.7, 910], [12.8, 730], [15.0, 610]], hors: 15.1, mor1: 17.2, mlc1: 490 },
}

/** Measured on the E-4 straight CAD (crane frame, m). */
export const X142_GEOM = {
  p1: { r: -0.05, h: 2.2 },
  p2: { r: 1.95, h: 2.35 },
  tipRetractedE4: { r: 4.69, h: 2.27 },
  /** Outer boom centreline is offset laterally from the column axis (CAD x ≈ 0.29 m). */
  lateralOffset: 0.29,
}
const d1 = { r: X142_GEOM.p2.r - X142_GEOM.p1.r, h: X142_GEOM.p2.h - X142_GEOM.p1.h }
const d2 = { r: X142_GEOM.tipRetractedE4.r - X142_GEOM.p2.r, h: X142_GEOM.tipRetractedE4.h - X142_GEOM.p2.h }
export const L1 = Math.hypot(d1.r, d1.h)
export const L2_E4 = Math.hypot(d2.r, d2.h)
const deg = 180 / Math.PI
/** Angles of the CAD straight pose (used to rotate mesh parts). */
export const A1_CAD = Math.atan2(d1.h, d1.r) * deg
export const REL_CAD = Math.atan2(d2.h, d2.r) * deg - A1_CAD

/** ASSUMED joint limits (drawings give no angles): main boom −10…80°, outer boom −170…+30° relative. */
export const LIMITS = { a1: [-10, 80] as [number, number], rel: [-170, 30] as [number, number], slew: [-207.5, 207.5] as [number, number] }

export interface CraneJoints { slew: number; a1: number; rel: number; ext: number }

/** Variant + whether trw named it (false = only "X-HiPro 142", E-4 picked automatically). */
export function x142VariantMatch(name: string | null | undefined): { variant: CraneVariant; exact: boolean } {
  const exact = /\b(ES|E)\s*-?\s*([1-5])\b/i.test((name ?? '').replace(/142/, ' '))
  return { variant: parseX142Variant(name), exact }
}

export function parseX142Variant(name: string | null | undefined): CraneVariant {
  const m = /\b(ES|E)\s*-?\s*([1-5])\b/i.exec((name ?? '').replace(/142/, ' '))
  const id = m ? `${m[1].toUpperCase()}-${m[2]}` : 'E-4'
  return X142_VARIANTS.find((v) => v.id === id) ?? X142_VARIANTS[3]
}

/** Retracted outer-boom length (P2 → tip) and hydraulic stroke for a variant [m]. */
export function variantBoom(v: CraneVariant) {
  return { l2: L2_E4 + (v.minOutreachMm - 4810) / 1000, stroke: (v.hydMaxMm - v.minOutreachMm) / 1000 }
}

const clamp = (x: number, [a, b]: [number, number]) => Math.min(b, Math.max(a, x))

export function straightPose(): CraneJoints {
  return { slew: 0, a1: A1_CAD, rel: REL_CAD, ext: 0 }
}

/** Forward kinematics → tip in the boom plane (r, h) [m] plus knuckle. */
export function forwardKinematics(j: CraneJoints, v: CraneVariant) {
  const { l2 } = variantBoom(v)
  const a1 = j.a1 / deg, a2 = (j.a1 + j.rel) / deg
  const k = { r: X142_GEOM.p1.r + L1 * Math.cos(a1), h: X142_GEOM.p1.h + L1 * Math.sin(a1) }
  const L = l2 + j.ext
  return { knuckle: k, tip: { r: k.r + L * Math.cos(a2), h: k.h + L * Math.sin(a2) } }
}

/**
 * IK for a tip target in the boom plane: prefer no extension; extend only when the target is beyond reach
 * with retracted booms; knuckle above the line (natural loader-crane pose). Joint limits are enforced,
 * so an unreachable target gives the closest pose within limits.
 */
export function inverseKinematics(target: { r: number; h: number }, v: CraneVariant, slew = 0): CraneJoints {
  const { l2, stroke } = variantBoom(v)
  const dx = target.r - X142_GEOM.p1.r, dy = target.h - X142_GEOM.p1.h
  const D = Math.hypot(dx, dy)
  const phi = Math.atan2(dy, dx)
  const solve = (ext: number, up: boolean): CraneJoints => {
    const L = l2 + ext
    const c = Math.min(1, Math.max(-1, (D * D - L1 * L1 - L * L) / (2 * L1 * L)))
    const q2 = (up ? -1 : 1) * Math.acos(c) // up: knuckle above the line (natural loader-crane pose)
    const a1 = clamp((phi - Math.atan2(L * Math.sin(q2), L1 + L * Math.cos(q2))) * deg, LIMITS.a1)
    // re-aim / re-extend the outer boom from the (possibly clamped) knuckle
    const k = { r: X142_GEOM.p1.r + L1 * Math.cos(a1 / deg), h: X142_GEOM.p1.h + L1 * Math.sin(a1 / deg) }
    const rel = clamp(Math.atan2(target.h - k.h, target.r - k.r) * deg - a1, LIMITS.rel)
    const e = clamp(Math.hypot(target.r - k.r, target.h - k.h) - l2, [ext > 0 ? 0 : 0, stroke])
    return { slew, a1, rel, ext: ext === 0 ? Math.min(e, Math.max(0, D - L1 - l2)) : e }
  }
  const err = (j: CraneJoints) => { const t = forwardKinematics(j, v).tip; return Math.hypot(t.r - target.r, t.h - target.h) }
  const ext0 = clamp(D - L1 - l2, [0, stroke])
  // candidates: minimal extension first (knuckle up, then down), then growing extension until reachable
  const cands: CraneJoints[] = []
  for (const e of [ext0, ...Array.from({ length: 21 }, (_, i) => (stroke * i) / 20)]) for (const up of [true, false]) cands.push(solve(e, up))
  let best = cands[0]
  for (const c of cands) if (err(c) < err(best) - 1e-4) best = c
  return best
}

/** Slew angle [deg] from a horizontal direction: dx along the vehicle (+ rearward), dy lateral (+ right). 0 = forward, clockwise. */
export function slewFromAzimuth(dx: number, dy: number, prev = 0): number {
  let s = Math.atan2(dy, -dx) * deg
  // choose the equivalent angle closest to the previous one within the 415° range
  const cands = [s - 360, s, s + 360].filter((a) => a >= LIMITS.slew[0] && a <= LIMITS.slew[1])
  s = cands.reduce((b, a) => (Math.abs(a - prev) < Math.abs(b - prev) ? a : b), cands[0] ?? s)
  return s
}

/** Indicative capacity [kg] by outreach [m] from the HiSelect table (linear). null = no data (ES variants). */
export function loadAt(variantId: string, r: number): { kg: number; manual: boolean } | null {
  const t = X142_LOADS[variantId]
  if (!t) return null
  const pts = t.sor
  if (r <= pts[0][0]) return { kg: pts[0][1], manual: false }
  for (let i = 1; i < pts.length; i++) {
    if (r <= pts[i][0]) {
      const [r0, k0] = pts[i - 1], [r1, k1] = pts[i]
      return { kg: k0 + ((k1 - k0) * (r - r0)) / (r1 - r0), manual: false }
    }
  }
  const [rl, kl] = pts[pts.length - 1]
  if (r <= t.hors) return { kg: kl, manual: false }
  if (r <= t.mor1) return { kg: kl + ((t.mlc1 - kl) * (r - rl)) / (t.mor1 - rl), manual: true }
  return { kg: 0, manual: true }
}

export type JointKey = keyof CraneJoints

/** Angle equivalent to `a` (±360°) closest to `prev` — keeps a dragged angle continuous across ±180°. */
export function nearestEquivalent(a: number, prev: number): number {
  return a + 360 * Math.round((prev - a) / 360)
}

/** Joint range [deg or m] for one joint of a variant. */
export function jointLimits(key: JointKey, v: CraneVariant): [number, number] {
  return key === 'ext' ? [0, variantBoom(v).stroke] : LIMITS[key]
}

/** Set ONE joint (others untouched), clamped to its limits. */
export function setJoint(j: CraneJoints, key: JointKey, value: number, v: CraneVariant): CraneJoints {
  return { ...j, [key]: clamp(value, jointLimits(key, v)) }
}

/**
 * Joint value from a dragged point in the boom plane (r, h) [m]:
 * a1 = direction from the main pivot, rel = direction from the knuckle minus a1, ext = projection along the outer boom.
 */
export function jointFromBoomPoint(j: CraneJoints, key: 'a1' | 'rel' | 'ext', p: { r: number; h: number }, v: CraneVariant): CraneJoints {
  const P1 = X142_GEOM.p1
  if (key === 'a1') return setJoint(j, 'a1', nearestEquivalent(Math.atan2(p.h - P1.h, p.r - P1.r) * deg, j.a1), v)
  const k = forwardKinematics(j, v).knuckle
  if (key === 'rel') return setJoint(j, 'rel', nearestEquivalent(Math.atan2(p.h - k.h, p.r - k.r) * deg - j.a1, j.rel), v)
  const a2 = (j.a1 + j.rel) / deg
  const along = (p.r - k.r) * Math.cos(a2) + (p.h - k.h) * Math.sin(a2)
  return setJoint(j, 'ext', along - variantBoom(v).l2, v)
}

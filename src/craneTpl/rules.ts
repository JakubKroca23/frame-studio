/**
 * Rules learned while building the crane catalog (see LESSONS.md — every rule has a lesson id there).
 * Code reads these instead of hard-coded constants, so a new lesson is a change here + a note in LESSONS.md.
 */
export const RULES = {
  /** L0: adapt a template part only when the drawing differs by more than this */
  adaptTolerance: 0.02,
  /** L0: model number ≥ this → 408 template (22 t·m class and up), else 142 */
  template408From: 220,
  /** R1: a variant shows exactly its n telescopes, each sized from the variant's own stroke (stroke / n) */
  realExtensions: true,
  /** R1: minimum overlap kept in a resized telescope [m] */
  minOverlap: 0.15,
  /** L2: reference reach = the template's own kinematic reach (hook offset), not the catalogue min outreach */
  hookOffsetFromKinematics: true,
  /** L3: kóta 1-1 is calibrated on the 142 only; on the 408 template it is reported, never used to resize the column */
  heightFrom11: { '142': true, '408': false } as Record<string, boolean>,
  /** L5: several sheets of one crane must agree on 1-1 within this, else the template height is kept */
  sheetAgreement: 0.03,
  /** L4: unlabelled iQ / X-HiPro sheets — generic DIMENSION scale counts as confirmed with this many agreeing dims */
  unlabelledScaleMinDims: 10,
} as const

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

/** '142' | '408' or a derived template key ('tpl142-1' …, see src/craneTpl). */
export type CraneModelKey = string
import CATALOG from './craneCatalog.json'
export type CraneVariant = { id: string; family: 'E' | 'ES'; extensions: number; minOutreachMm: number; hydMaxMm: number; manMaxMm: number; model?: CraneModelKey }

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
].map((v) => ({ ...v, family: v.family as 'E' | 'ES', model: '142' as const }))

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
  tipRetracted: { r: 4.69, h: 2.27 },
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

// ---------------------------------------------------------------------------------------------------------
// Crane definitions (one per model): mesh, pivots, limits, extensions, variant + load table.
// ---------------------------------------------------------------------------------------------------------

type RH = { r: number; h: number }
export type LoadTable = { sor: [number, number][]; mor1: number; mlc1: number; hors: number }

export interface CraneDef {
  key: CraneModelKey
  name: string
  /** recognises the trw crane name */
  match: RegExp
  /** articulated GLB (groups base, column, cyl1?, main, outer, ext1…extN), mesh frame: x lateral, y up, z = r */
  file: string
  /** separate folded GLB (142); without it the folded pose is the articulated mesh at `foldedPose` */
  foldedFile?: string
  /** geometry in the boom plane of the mesh pose [m] */
  geom: { p1: RH; p2: RH; tipRetracted: RH; lateralOffset: number; extDir?: RH }
  /** min outreach of the variant the mesh was built from (shifts the retracted outer boom for other variants) */
  refMinOutreachMm: number
  limits: { a1: [number, number]; rel: [number, number]; slew: [number, number] }
  variants: CraneVariant[]
  defaultVariantId: string
  loads: Record<string, LoadTable> | null
  /** telescopic sections present in the mesh (ext1…extN groups) */
  meshExtSections: number
  /** folded transport pose (from the mesh pose) — only for models without a separate folded GLB */
  folded?: CraneJoints
  /** default "Rozložený" pose; absent = the mesh pose */
  unfolded?: Omit<CraneJoints, 'slew'>
  /** label for missing load data */
  noLoadText: string
  /**
   * Relative stroke of each telescope (ext1…extN), measured on a sample model; absent = all equal.
   * Scaled to the variant stroke; a variant with fewer sections uses the first n.
   */
  extStrokes?: number[]
  /** derived from a template + drawing (src/craneTpl): mesh adaptation of the template parts */
  /** crane outriggers in the mesh (groups stabL/stabR = beam + leg housing, legL/legR = inner leg + foot), base frame [m] */
  /** lift cylinder pins (A on the column, B on the main boom, mesh pose) — groups liftCyl (barrel) / liftRod */
  liftCyl?: { a: RH; b: RH; source: string }
  stab?: { footX: { left: number; right: number }; footBottom: number; maxExt: number; legStroke: number; telescopes?: number; source: string }
  adapt?: { dh: number; baseX: number; template: string; /** stroke of each template telescope [m] (sections are lengthened when a variant needs more) */ secStroke?: number[] }
}

/**
 * HIAB X-HiPro 408 E-8, measured from the user's SolidWorks GLB (1824 parts, metres, folded transport pose).
 * Mesh frame: origin on the slewing axis (GLB x −0.485, z −0.107) at the crane underside (GLB y 0.419 = lowest point,
 * ASSUMED to be the mounting plane), y up (= −y of the GLB), z = r along the boom plane of the folded pose.
 * Pins measured (centres of cylindrical parts, ±5 mm): P1 = main boom pivot (part 55), P2 = knuckle (part 220),
 * tip = hook pin of the innermost section (part 115). The outer boom package runs 0.44 m beside the main boom plane.
 * GLB has 6 nested telescopic profiles; E-8 = 8 hydraulic extensions → the ~166 mm one and the smallest (~101 mm) were
 * modelled by cloning/scaling the neighbouring profile (approved by the user), the hook moved 90 mm out to the 8th section
 * (tip measured on part 115 + 0.09 m along the extension axis).
 * hydMax 20.9 m / manMax 22.4 m: Hiab X-HiPro 408 E-8 technical data. minOutreach = retracted straight reach from
 * the measured geometry (not a drawing value) → stroke 16.0 m ≈ 8 × 2.0 m.
 */
const X408_GEOM = { p1: { r: -0.31, h: 2.384 }, p2: { r: 1.244, h: 0.555 }, tipRetracted: { r: -1.067, h: 2.268 }, lateralOffset: 0.44, extDir: { r: -0.845, h: 0.535 } }
const len = (a: RH) => Math.hypot(a.r, a.h)
const sub = (a: RH, b: RH): RH => ({ r: a.r - b.r, h: a.h - b.h })
const X408_MIN_OUT = Math.round((X408_GEOM.p1.r + len(sub(X408_GEOM.p2, X408_GEOM.p1)) + len(sub(X408_GEOM.tipRetracted, X408_GEOM.p2))) * 1000)

export const CRANE_DEFS: CraneDef[] = [
  {
    key: '142', name: 'HIAB X-HiPro 142', match: /x.?hi.?pro\s*142|\b142\s*e.?4|\bex\s*142|hiab.*142|(^|\D)142(?!\d)/i,
    file: 'hiab-x-hipro-142e4-articulated.glb', foldedFile: 'hiab-x-hipro-142e4.glb',
    geom: X142_GEOM, refMinOutreachMm: 4810, limits: { a1: [-10, 80], rel: [-170, 30], slew: [-207.5, 207.5] },
    variants: X142_VARIANTS, defaultVariantId: 'E-4', loads: X142_LOADS, meshExtSections: 4, noLoadText: 'nosnost n/a (ES)',
  },
  {
    key: '408', name: 'HIAB X-HiPro 408', match: /x.?hi.?pro\s*408|(^|\D)408(?!\d)/i,
    file: 'hiab-x-hipro-408e8-articulated.glb',
    geom: X408_GEOM, refMinOutreachMm: X408_MIN_OUT,
    // ASSUMED limits (no drawing yet); must contain the measured folded pose (a1 −49.6°, rel −167°). Slewing: continuous.
    limits: { a1: [-52, 80], rel: [-170, 30], slew: [-360, 360] },
    // hydMax from the Hiab datasheet; E-4…E-7: retracted length ASSUMED equal to the E-8 (no drawing), no manual extension
    // per-telescope stroke [m] from the extended 408 E-8 GLB (all 8 real sections, straight): extended overlap of each
    // section vs. the folded GLB; ext5/ext6/ext8 retracted overlap ASSUMED 90 mm (those were clones in the folded GLB).
    extStrokes: [1.505, 1.824, 1.825, 1.999, 2.1, 2.2, 2.3, 2.296],
    variants: [
      ...([[4, 11600], [5, 13800], [6, 16100], [7, 18500]] as const).map(([n, hyd]) => ({ id: `E-${n}`, family: 'E' as const, extensions: n, minOutreachMm: X408_MIN_OUT, hydMaxMm: hyd, manMaxMm: hyd, model: '408' as const })),
      { id: 'E-8', family: 'E', extensions: 8, minOutreachMm: X408_MIN_OUT, hydMaxMm: 20900, manMaxMm: 22400, model: '408' },
    ],
    defaultVariantId: 'E-8', loads: null, meshExtSections: 8, noLoadText: 'nosnost n/a',
    // folded = the GLB pose; booms over the right-hand side (ASSUMED side: the GLB does not say which side is which)
    folded: { slew: 90, a1: 0, rel: 0, ext: 0 },
    unfolded: { a1: 15, rel: -10, ext: 0 }, // ASSUMED working pose
  },
  {
    // Jonsered iZ.18R 100 HD (HiSeat, Platform, B4500), drawing 465-1037 sheet 1 (real-mm model space) + user's SolidWorks
    // GLB (1 mesh, parked pose) split by connectivity + planes + contact-island check (/workspace/jons/build2.py, LESSONS L9, L11).
    // Mesh frame: origin on the slewing axis = column spline-shaft ring fit (GLB x 0.345, z −0.3235, MEASURED ±0.1 mm),
    // mounting plane = P1 − 2449 (kóta 1-4). Pins = concentric pin-bore rings in the GLB (MEASURED):
    // P1 r 40 mm rings → 296 mm behind the axis = kóta 1-7 296 (exact), P2 r 40/66 mm, |P1P2| 3287.5 (drawing 3297).
    // Lift cylinder pins A (column, rings r 35–38) and B (main, rod eye r 72): MEASURED; the rod tube is not in the
    // CAD (hidden in the barrel) → synthetic Ø90 rod (ASSUMED Ø, visual only). Outer cylinder + knuckle links ride on the
    // main boom (ASSUMED: link system not articulated). Tip = drawing retracted tip pin mapped through the outer boom.
    key: 'iz18r', name: 'Jonsered iZ.18R HD', match: /jonsered|\bi\s*z[._ ]?\s*18\s*r/i,
    file: 'jonsered-iz18r-articulated.glb',
    geom: { p1: { r: -0.296, h: 2.449 }, p2: { r: 1.4191, h: -0.3557 }, tipRetracted: { r: 0.6721, h: 2.5543 }, lateralOffset: 0, extDir: { r: -0.409, h: 0.912 } },
    liftCyl: { a: { r: 0.2481, h: 0.6563 }, b: { r: -0.035, h: 1.9535 }, source: 'GLB pin rings (A column, B main)' },
    refMinOutreachMm: 5933,
    // ASSUMED limits: 465-1037 has no working diagram / end positions (only MAX OUTREACH, CLOSE IN, PARKED views).
    // Must contain the parked mesh pose (a1 −58.6°, rel +165°). Outer boom down to −90° relative (typical knuckle
    // crane, Jakub: tip must go below the knuckle pin); lift cylinder 1320→2373 mm over a1 −62…80 (barrel 1.25 m, fits).
    limits: { a1: [-62, 80], rel: [-90, 170], slew: [-207.5, 207.5] },
    // 2 hydraulic extensions (drawing: 2nd head ring set moves 2016 mm, tip 4028 mm = kóta 1-3 4030)
    extStrokes: [2.016, 2.012],
    variants: [{ id: '100', family: 'E', extensions: 2, minOutreachMm: 5933, hydMaxMm: 9963, manMaxMm: 9963, model: 'iz18r' }],
    defaultVariantId: '100', loads: null, meshExtSections: 2, noLoadText: 'nosnost n/a (Jonsered – jen dosahy z výkresu)',
    folded: { slew: -94.5, a1: 0, rel: 0, ext: 0 }, // parked = mesh pose; boom plane is slewed 4.5° in the GLB (MEASURED from pin axes)
    unfolded: { a1: 7.6, rel: -18.7, ext: 0 }, // MAX OUTREACH view of the drawing: P1(−296,2449)→P2(2972,2886) 7.6°, P2→tip(5935,2308) −11.0°
    // outriggers B4500: ONE telescope per side (Jakub). Foot axes in the GLB ±1116 mm around the outrigger-box centre;
    // the slewing axis is 345 mm to the right of it = real "column R" placement (column ring fit x 0.23–0.33 vs box
    // centre 0, trw line "column R"), not a measuring error → spread is split about the box centre, not the axis.
    // stroke per side = (6-11 4457 − 2232) / 2 = 1112.5 (derived from the table, both sides equal); leg stroke 580 = leg H (6-1 1298 drawn = leg H, ASSUMED same in the GLB)
    stab: { footX: { left: -1.4635, right: 0.7735 }, footBottom: -0.9087, maxExt: 1.1125, legStroke: 0.58, telescopes: 1, source: '465-1037 tabulka 6 (B4500, noha H) + GLB' },
  },
]

const DEG = 180 / Math.PI
/** Angles of the mesh pose (used to rotate mesh parts). */
export function meshAngles(def: CraneDef) {
  const d1 = sub(def.geom.p2, def.geom.p1), d2 = sub(def.geom.tipRetracted, def.geom.p2)
  const a1 = Math.atan2(d1.h, d1.r) * DEG
  let rel = Math.atan2(d2.h, d2.r) * DEG - a1
  rel = rel - 360 * Math.round(rel / 360)
  const e = def.geom.extDir ?? d2
  let delta = (Math.atan2(e.h, e.r) - Math.atan2(d2.h, d2.r)) * DEG
  delta = delta - 360 * Math.round(delta / 360)
  return { a1, rel, l1: len(d1), l2: len(d2), d2, delta }
}
for (const d of CRANE_DEFS) if (d.folded) { const m = meshAngles(d); d.folded = { ...d.folded, a1: m.a1, rel: m.rel } }

/** One crane of the drawing catalog (generated by src/craneTpl/catalog.local.test.ts from the HIAB sheets). */
export interface CatalogEntry {
  key: string
  name: string
  /** model number + line, e.g. "192" / "eX" */
  model: string
  match: string
  template: '142' | '408'
  dh: number
  baseX: number
  defaultVariantId: string
  variants: { id: string; boom: string; extensions: number; minOutreachMm: number; hydMaxMm: number; manMaxMm: number; sheet: string; /** LESSONS L7: jib reach from the JIB sheet (not modelled) */ jib?: { minMm: number; maxMm: number; manMm: number } | null }[]
  /** other model names using the same drawings (LESSONS L6) */
  aliases?: string[]
  report: { name: string; drawing: number | null; template: number | null; deviation: number | null; used: string; note: string }[]
  sheets: string[]
  notes: string[]
}

/** Stroke of each telescope of a template mesh in its own default variant [m]. */
export function templateSectionStrokes(tpl: CraneDef): number[] {
  const v = tpl.variants.find((x) => x.id === tpl.defaultVariantId)!
  const st = (v.hydMaxMm - v.minOutreachMm) / 1000
  return Array.from({ length: tpl.meshExtSections }, (_, i) => st * (extFraction(tpl, tpl.meshExtSections, i + 1) - extFraction(tpl, tpl.meshExtSections, i)))
}

/** CraneDef that reuses a template mesh, adapted per part (see src/craneTpl/adaptMesh.ts). */
export function deriveDef(tpl: CraneDef, e: Pick<CatalogEntry, 'key' | 'name' | 'match' | 'dh' | 'baseX' | 'defaultVariantId'> & { variants: Omit<CraneVariant, 'model'>[]; loads?: Record<string, LoadTable> | null }): CraneDef {
  const lift = (p: RH) => ({ r: p.r, h: p.h + e.dh })
  // LESSONS L2: reference reach = template's own kinematic reach at full stroke (hook offset), so derived variants hit 1-3 MAX
  const v0 = tpl.variants.find((v) => v.id === tpl.defaultVariantId)!
  const hookDev = forwardKinematics({ slew: 0, a1: 0, rel: -meshAngles(tpl).delta, ext: variantBoom(v0).stroke }, v0).tip.r * 1000 - v0.hydMaxMm
  const variants = e.variants.map((v) => ({ id: v.id, family: v.family, extensions: v.extensions, minOutreachMm: v.minOutreachMm, hydMaxMm: v.hydMaxMm, manMaxMm: v.manMaxMm, model: e.key }))
  return {
    ...tpl,
    key: e.key,
    name: e.name,
    match: new RegExp(e.match, 'i'),
    // the 142 folded GLB is a fixed mesh: only usable while the template parts stay unchanged
    foldedFile: e.dh === 0 && e.baseX === 1 ? tpl.foldedFile : undefined,
    geom: { ...tpl.geom, p1: lift(tpl.geom.p1), p2: lift(tpl.geom.p2), tipRetracted: lift(tpl.geom.tipRetracted) },
    refMinOutreachMm: tpl.refMinOutreachMm + hookDev,
    variants,
    defaultVariantId: variants.find((v) => v.id === e.defaultVariantId)?.id ?? variants[variants.length - 1].id,
    loads: e.loads ?? null,
    noLoadText: 'nosnost n/a (jen dosahy z výkresu)',
    adapt: { dh: e.dh, baseX: e.baseX, template: tpl.key, secStroke: templateSectionStrokes(tpl) },
  }
}

export const CRANE_CATALOG: CatalogEntry[] = (CATALOG as { entries: CatalogEntry[] }).entries

export function craneDefFor(name: string | null | undefined): CraneDef | null {
  if (!name) return null
  // 408 first: "408" never matches the 142 pattern, but keep the explicit order
  return CRANE_DEFS.find((d) => d.key === '408' && d.match.test(name)) ?? CRANE_DEFS.find((d) => d.match.test(name)) ?? null
}
export const defOf = (v: CraneVariant): CraneDef => CRANE_DEFS.find((d) => d.key === (v.model ?? '142'))!

/** Add / replace a derived crane definition (template + drawing). */
export function registerCraneDef(def: CraneDef) {
  const i = CRANE_DEFS.findIndex((d) => d.key === def.key)
  if (i >= 0) CRANE_DEFS[i] = def
  else CRANE_DEFS.push(def)
}

/**
 * Cumulative extension fraction of telescope k (1-based) of n sections. RULE (LESSONS.md R1): a variant shows exactly
 * its n telescopes; the drawing only gives the total stroke, so each gets stroke/n — except the sample model's own
 * measured variant (n = measured sections, not derived), which keeps its measured per-section strokes.
 */
export function extFraction(def: CraneDef, n: number, k: number): number {
  const s = def.extStrokes
  if (!s || def.adapt || s.length !== n) return k / n
  const tot = s.reduce((a, b) => a + b, 0)
  return s.slice(0, k).reduce((a, b) => a + b, 0) / tot
}

/** Variant of a crane + whether trw named it exactly. */
export function craneVariantMatch(name: string | null | undefined): { def: CraneDef; variant: CraneVariant; exact: boolean } | null {
  const def = craneDefFor(name)
  if (!def) return null
  const n = name ?? ''
  const m = /(?:^|[^A-Z])(BSS|BS|B|DLL|DLS|DS|D|EP|ES|E)\s*-?\s*(\d{1,2})(?!\d)/i.exec(n.replace(/\b(?:i|e)?X?[.-]?\s*\d{3}L?\b/gi, ' '))
  const id = m ? `${m[1].toUpperCase()}-${m[2]}` : null
  // all defs of the same model (E/ES, B/BS, D/DS … are separate defs): take the one that has the named variant
  const same = CRANE_DEFS.filter((d) => d.match.test(n))
  if (id) for (const d of same) {
    const v = d.variants.find((x) => x.id === id) ?? d.variants.find((x) => x.id.startsWith(`${id} `))
    if (v) return d.key === '142' ? { def: d, ...x142VariantMatch(name) } : { def: d, variant: v, exact: true }
  }
  if (def.key === '142') return { def, ...x142VariantMatch(name) }
  return { def, variant: def.variants.find((x) => x.id === def.defaultVariantId)!, exact: false }
}

/** Retracted outer-boom length (P2 → tip) and hydraulic stroke for a variant [m]. */
export function variantBoom(v: CraneVariant) {
  const def = defOf(v)
  return { l2: meshAngles(def).l2 + (v.minOutreachMm - def.refMinOutreachMm) / 1000, stroke: (v.hydMaxMm - v.minOutreachMm) / 1000 }
}

const clamp = (x: number, [a, b]: [number, number]) => Math.min(b, Math.max(a, x))

/** Mesh pose of the 142 (straight CAD). */
export function straightPose(): CraneJoints {
  return { slew: 0, a1: A1_CAD, rel: REL_CAD, ext: 0 }
}
/** "Rozložený" preset of a model. */
export function unfoldedPose(def: CraneDef, slew = 0): CraneJoints {
  const m = meshAngles(def)
  return { slew, ...(def.unfolded ?? { a1: m.a1, rel: m.rel, ext: 0 }) }
}

/** Outer-boom vector in its own frame (x along P2→tip of the mesh pose) for an extension e. */
function outerVec(v: CraneVariant, e: number) {
  const { delta } = meshAngles(defOf(v))
  const { l2 } = variantBoom(v)
  const x = l2 + e * Math.cos(delta / DEG), y = e * Math.sin(delta / DEG)
  return { L: Math.hypot(x, y), beta: Math.atan2(y, x) }
}

/** Forward kinematics → tip in the boom plane (r, h) [m] plus knuckle. */
export function forwardKinematics(j: CraneJoints, v: CraneVariant) {
  const def = defOf(v)
  const { l1 } = meshAngles(def)
  const P1 = def.geom.p1
  const a1 = j.a1 / DEG
  const k = { r: P1.r + l1 * Math.cos(a1), h: P1.h + l1 * Math.sin(a1) }
  const { L, beta } = outerVec(v, j.ext)
  const a2 = (j.a1 + j.rel) / DEG + beta
  return { knuckle: k, tip: { r: k.r + L * Math.cos(a2), h: k.h + L * Math.sin(a2) } }
}

/** Extension e that puts the tip at distance d from the knuckle. */
function extForDistance(v: CraneVariant, d: number) {
  const { delta } = meshAngles(defOf(v))
  const { l2 } = variantBoom(v)
  const c = Math.cos(delta / DEG), s = Math.sin(delta / DEG)
  return -l2 * c + Math.sqrt(Math.max(0, d * d - l2 * l2 * s * s))
}

/**
 * IK for a tip target in the boom plane: prefer no extension; extend only when the target is beyond reach
 * with retracted booms; knuckle above the line (natural loader-crane pose). Joint limits are enforced,
 * so an unreachable target gives the closest pose within limits.
 */
export function inverseKinematics(target: { r: number; h: number }, v: CraneVariant, slew = 0): CraneJoints {
  const def = defOf(v)
  const { l1: L1d } = meshAngles(def)
  const P1 = def.geom.p1
  const { l2, stroke } = variantBoom(v)
  const dx = target.r - P1.r, dy = target.h - P1.h
  const D = Math.hypot(dx, dy)
  const phi = Math.atan2(dy, dx)
  const solve = (ext: number, up: boolean): CraneJoints => {
    const { L } = outerVec(v, ext)
    const c = Math.min(1, Math.max(-1, (D * D - L1d * L1d - L * L) / (2 * L1d * L)))
    const q2 = (up ? -1 : 1) * Math.acos(c) // up: knuckle above the line (natural loader-crane pose)
    const a1 = clamp((phi - Math.atan2(L * Math.sin(q2), L1d + L * Math.cos(q2))) * DEG, def.limits.a1)
    // re-aim / re-extend the outer boom from the (possibly clamped) knuckle
    const k = { r: P1.r + L1d * Math.cos(a1 / DEG), h: P1.h + L1d * Math.sin(a1 / DEG) }
    const e = clamp(extForDistance(v, Math.hypot(target.r - k.r, target.h - k.h)), [0, stroke])
    const eFinal = ext === 0 ? Math.min(e, Math.max(0, D - L1d - l2)) : e
    const rel = clamp(nearestEquivalent(Math.atan2(target.h - k.h, target.r - k.r) * DEG - a1 - outerVec(v, eFinal).beta * DEG, 0), def.limits.rel)
    return { slew, a1, rel, ext: eFinal }
  }
  const err = (j: CraneJoints) => { const t = forwardKinematics(j, v).tip; return Math.hypot(t.r - target.r, t.h - target.h) }
  const ext0 = clamp(D - L1d - l2, [0, stroke])
  // candidates: minimal extension first (knuckle up, then down), then growing extension until reachable
  const cands: CraneJoints[] = []
  for (const e of [ext0, ...Array.from({ length: 21 }, (_, i) => (stroke * i) / 20)]) for (const up of [true, false]) cands.push(solve(e, up))
  let best = cands[0]
  for (const c of cands) if (err(c) < err(best) - 1e-4) best = c
  return best
}

/** Slew angle [deg] from a horizontal direction: dx along the vehicle (+ rearward), dy lateral (+ right). 0 = forward, clockwise. */
export function slewFromAzimuth(dx: number, dy: number, prev = 0, limits: [number, number] = LIMITS.slew): number {
  let s = Math.atan2(dy, -dx) * DEG
  // choose the equivalent angle closest to the previous one within the slewing range
  const cands = [s - 720, s - 360, s, s + 360, s + 720].filter((a) => a >= limits[0] && a <= limits[1])
  s = cands.reduce((b, a) => (Math.abs(a - prev) < Math.abs(b - prev) ? a : b), cands[0] ?? s)
  return s
}

/** Indicative capacity [kg] by outreach [m] from the model's load table (linear). null = no data (ES, 408). */
export function loadAt(variant: string | CraneVariant, r: number): { kg: number; manual: boolean } | null {
  const t = typeof variant === 'string' ? X142_LOADS[variant] : defOf(variant).loads?.[variant.id]
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
  return key === 'ext' ? [0, variantBoom(v).stroke] : defOf(v).limits[key]
}

/** Set ONE joint (others untouched), clamped to its limits. */
export function setJoint(j: CraneJoints, key: JointKey, value: number, v: CraneVariant): CraneJoints {
  return { ...j, [key]: clamp(value, jointLimits(key, v)) }
}

/**
 * Joint value from a dragged point in the boom plane (r, h) [m]:
 * a1 = direction from the main pivot, rel = direction from the knuckle minus a1, ext = projection along the extension direction.
 */
export function jointFromBoomPoint(j: CraneJoints, key: 'a1' | 'rel' | 'ext', p: { r: number; h: number }, v: CraneVariant): CraneJoints {
  const P1 = defOf(v).geom.p1
  if (key === 'a1') return setJoint(j, 'a1', nearestEquivalent(Math.atan2(p.h - P1.h, p.r - P1.r) * DEG, j.a1), v)
  const k = forwardKinematics(j, v).knuckle
  if (key === 'rel') return setJoint(j, 'rel', nearestEquivalent(Math.atan2(p.h - k.h, p.r - k.r) * DEG - j.a1 - outerVec(v, j.ext).beta * DEG, j.rel), v)
  const { delta } = meshAngles(defOf(v))
  const a = (j.a1 + j.rel + delta) / DEG
  const along = (p.r - k.r) * Math.cos(a) + (p.h - k.h) * Math.sin(a)
  return setJoint(j, 'ext', along - variantBoom(v).l2 * Math.cos(delta / DEG), v)
}

// registered last: deriveDef needs the kinematics helpers (defOf …) initialised
for (const e of CRANE_CATALOG) {
  const tpl = CRANE_DEFS.find((d) => d.key === e.template)!
  CRANE_DEFS.push(deriveDef(tpl, { ...e, variants: e.variants.map((v) => ({ ...v, family: (v.boom.endsWith('S') && v.boom.length > 1 ? 'ES' : 'E') as 'E' | 'ES' })) }))
}

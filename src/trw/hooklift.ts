/**
 * Parametric hooklift (hákový nosič) derived from the MULTILIFT ULT18Z59 DIN CAD model
 * (public/models/hooklift/ult18z59.glb, built by scripts/build-hooklift-glb.mjs).
 *
 * Model coordinates (metres, Onshape export): +Z along the vehicle from the REAR roller (z≈-0.09)
 * to the hook/arm at the FRONT (z≈6.46), +Y up from the subframe underside (y≈-0.01), X lateral (±0.62).
 * Scene (configurator) coordinates: mm, X rearward from axle 1, Y up, Z lateral → X = xRear - (z - zMin)·1000.
 */
import type { ExtAccessory, ExtBody } from './trwExtended'
import { findHookliftMatch, type HookliftSpec } from './hookliftCatalog'

export const ULT18Z59 = {
  name: 'MULTILIFT ULT18Z59 DIN',
  /** Subframe length SL per datasheet (ULTIMA 18Z.59) [mm]; the CAD mesh itself measures nativeLengthMm. */
  lengthMm: 6583,
  nativeLengthMm: 6553,
  /** Installation height h (subframe above truck frame) per datasheet [mm]. */
  installHeightMm: 250,
  massKg: 2520,
  /** DIN 30722 hook height (hook centre above container runners) [mm]. */
  hookHeightMm: 1570,
  capacityT: 18,
  /** Width over rear rollers [mm]. */
  widthMm: 1238,
  /** Overall height (subframe underside → arm top) [mm]. */
  heightMm: 2017,
  /** Model-space break points [m]: rear ends below zRear, front (arm) above zFront, stretch section between. */
  zMin: -0.09,
  zMax: 6.463,
  zRear: 0.6,
  zFront: 5.2,
  yMin: -0.01,
  /** Vertical stretch band of the arm [m] for hook height changes. */
  armY0: 0.6,
  armY1: 1.6,
  file: 'ult18z59.glb',
} as const

export type HookliftMesh = { [K in keyof typeof ULT18Z59]: (typeof ULT18Z59)[K] extends number ? number : string }

/** MULTILIFT ULTIMA 21S.56 CAD (FreeCAD 3MF, mm → m; same axes as ULT18Z59). Sliding (S) arm, no articulated jib. */
export const ULTIMA21S56: HookliftMesh = {
  name: 'MULTILIFT ULTIMA 21S.56',
  lengthMm: 6563,
  nativeLengthMm: 6563,
  installHeightMm: 250,
  massKg: 2500,
  hookHeightMm: 1570,
  capacityT: 21,
  widthMm: 1238,
  heightMm: 1996,
  zMin: -0.1,
  zMax: 6.463,
  zRear: 0.8,
  zFront: 4.75,
  yMin: 0,
  armY0: 0.6,
  armY1: 1.45,
  file: 'ultima21s56.glb',
}

/**
 * Mesh per series by arm type: series letter S / SL (straight sliding arm) → ULTIMA 21S.56 mesh;
 * Z (articulated jib) and unknown → ULT18Z59 mesh.
 */
export function meshForSeries(series: string | null | undefined): HookliftMesh {
  return series && /\d+S(L)?$/.test(series) ? ULTIMA21S56 : ULT18Z59
}

export interface HookliftParams {
  lengthMm: number
  hookHeightMm: number
  capacityT: number
  /** Installation height h [mm] – scales the low subframe section (default 250). */
  installHeightMm?: number
}

const HOOK_RE = /multilift|\bult(?:ima)?\s*\d|hakov|hook|ampliroll|abroll|roll.?off|hakovy/i
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export function isHookliftAccessory(a: Pick<ExtAccessory, 'name' | 'kind' | 'isOutrigger'>): boolean {
  if (a.isOutrigger) return false
  return HOOK_RE.test(norm(`${a.kind ?? ''} ${a.name}`)) || !!findHookliftMatch(a.name)?.exact
}

/** Capacity [t] from a name like "ULT18Z59", "Multilift XR21S", "hákový nosič 20 t". */
export function capacityFromName(name: string): number | null {
  const s = norm(name)
  const m = /\b(?:ult|xr|xr\w?|ultima|hl|al)\s*(\d{1,2})/i.exec(s) ?? /(\d{1,2}(?:[.,]\d)?)\s*t\b/i.exec(s)
  const v = m ? Number(m[1].replace(',', '.')) : NaN
  return v >= 3 && v <= 40 ? v : null
}

/**
 * Hooklift parameters + placement from a trw accessory or body. The model name is looked up in the
 * datasheet catalog (fuzzy); without a match x_from/x_to length is used; remaining values fall back to ULT18Z59.
 */
export function hookliftPlacement(src: { xFrom: number | null; xTo: number | null; x?: number | null; length: number | null; height: number | null; name?: string; typeRaw?: string | null }, frameRear: number) {
  const name = src.name ?? src.typeRaw ?? ''
  let xRear = src.xTo ?? null
  let length = src.length ?? (src.xFrom != null && src.xTo != null ? src.xTo - src.xFrom : null)
  const match = findHookliftMatch(name, length)
  // series-only names need a length to pick a model; without one the ULT18Z59 defaults apply
  const spec: HookliftSpec | null = match && (match.exact || length != null) ? match.spec : null
  const exact = !!match?.exact
  if (xRear == null && src.xFrom != null && length != null) xRear = src.xFrom + length
  if (xRear == null) xRear = frameRear
  if (spec) length = spec.subframeLengthMm
  if (length == null || length < 2500 || length > 9000) length = ULT18Z59.lengthMm
  const params: HookliftParams = {
    lengthMm: length,
    hookHeightMm: spec?.hookHeightMm ?? ULT18Z59.hookHeightMm,
    capacityT: spec?.capacityT ?? capacityFromName(name) ?? ULT18Z59.capacityT,
    installHeightMm: spec?.installHeightMm ?? ULT18Z59.installHeightMm,
  }
  return { xRear, params, spec, exact, mesh: meshForSeries(spec?.series) }
}

export function bodyHookliftPlacement(b: ExtBody, frameRear: number) {
  return hookliftPlacement({ ...b, name: b.typeRaw ?? '' }, frameRear)
}

/** Length/height cut planes [m, model space] chosen in constant-cross-section rail zones (few vertices, no rigid parts). */
export const CUTS: Record<string, { z: [number, number]; y: number; armY: number }> = {
  'ult18z59.glb': { z: [1.7, 4.4], y: 0.07, armY: 1.0 },
  'ultima21s56.glb': { z: [1.25, 4.55], y: 0.07, armY: 1.0 },
}
/** Pieces longer than this [m] are treated as prismatic beams and cut-and-shifted; shorter pieces are rigid. */
export const LONG_PIECE_M = 1.2

/**
 * Cut-and-shift deformation (in place, model space, metres). Nothing is scaled:
 * - length: the delta is split over the mesh's cut planes; vertices of long (beam) pieces beyond a plane
 *   shift by d (lengthening extrudes the prismatic section across the plane; shortening collapses the
 *   removed slice onto the plane); short rigid pieces move as a whole, or are hidden if they lie in a removed slice.
 * - installation height h: same at a horizontal plane through the rails; pieces above move up/down rigidly.
 * - hook height: same at a plane through the arm (arm pieces only).
 * pos: xyz triplets; piece: piece id per vertex (null → one piece per vertex group); arm: 1 for arm/front vertices.
 * Returns ids of hidden pieces.
 */
export function deformPieces(pos: Float32Array, piece: ArrayLike<number> | null, arm: ArrayLike<number>, p: HookliftParams, M: HookliftMesh = ULT18Z59): Set<number> {
  const cuts = CUTS[M.file] ?? { z: [M.zRear, M.zFront], y: 0.07, armY: 1.0 }
  const n = pos.length / 3
  const pid = (i: number) => (piece ? piece[i] : arm[i])
  // piece bounding boxes
  const bb = new Map<number, { z0: number; z1: number; y0: number; y1: number }>()
  for (let i = 0; i < n; i++) {
    const id = pid(i), y = pos[i * 3 + 1], z = pos[i * 3 + 2]
    const b = bb.get(id)
    if (!b) bb.set(id, { z0: z, z1: z, y0: y, y1: y })
    else { if (z < b.z0) b.z0 = z; if (z > b.z1) b.z1 = z; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y }
  }
  const hidden = new Set<number>()
  /** One cut along axis (1 = y, 2 = z) at plane c by d, restricted to pieces passing `use`. */
  const cut = (axis: 1 | 2, c: number, d: number, use: (id: number, i: number) => boolean) => {
    if (Math.abs(d) < 1e-6) return
    const shift = new Map<number, number | 'cut'>()
    for (const [id, b] of bb) {
      const lo = axis === 2 ? b.z0 : b.y0, hi = axis === 2 ? b.z1 : b.y1
      if (lo < c && hi > c && (axis === 1 || hi - lo > LONG_PIECE_M)) shift.set(id, 'cut')
      else if (lo >= c || (lo + hi) / 2 > c) {
        shift.set(id, d) // rigid piece beyond the plane: moved as a whole
      } else {
        if (d < 0 && (lo + hi) / 2 > c + d) hidden.add(id) // rigid piece inside the removed slice
        shift.set(id, 0)
      }
    }
    for (let i = 0; i < n; i++) {
      const id = pid(i)
      if (!use(id, i)) continue
      const s = shift.get(id)!
      const k = i * 3 + axis
      const v = pos[k]
      if (s === 'cut') pos[k] = v > c ? v + d : d < 0 && v > c + d ? c + d : v
      else pos[k] = v + s
    }
    for (const b of bb.values()) {
      const key0 = axis === 2 ? 'z0' : 'y0', key1 = axis === 2 ? 'z1' : 'y1'
      if (b[key0] > c) b[key0] += d
      if (b[key1] > c) b[key1] += d
    }
  }
  const all = () => true
  const dLen = (p.lengthMm - M.nativeLengthMm) / 1000
  const zc = [...cuts.z].sort((a, b) => b - a) // front cut first so the rear plane stays valid
  for (const c of zc) cut(2, c, dLen / zc.length, all)
  if (p.installHeightMm != null) cut(1, cuts.y, (p.installHeightMm - M.installHeightMm) / 1000, all)
  const dh = (p.hookHeightMm - M.hookHeightMm) / 1000
  if (dh) cut(1, cuts.armY + (p.installHeightMm != null ? (p.installHeightMm - M.installHeightMm) / 1000 : 0), dh, (_id, i) => arm[i] === 1)
  return hidden
}

/** Point-wise convenience for a single vertex (one piece per call → treated as a rigid part). */
export function makeHookliftDeform(p: HookliftParams, M: HookliftMesh = ULT18Z59) {
  return (v: { x: number; y: number; z: number }, isArm: boolean) => {
    const a = new Float32Array([v.x, v.y, v.z])
    deformPieces(a, null, [isArm ? 1 : 0], p, M)
    v.x = a[0]; v.y = a[1]; v.z = a[2]
  }
}

/**
 * trw may list several hooklift entries (body + accessories, or several G lengths of one series).
 * Only ONE is shown: the first naming an exact model (series + G code), else the first one.
 * Returns 'body', an accessory index, or null when there is no hooklift.
 */
export function pickHooklift(ext: { body?: ExtBody | null; accessories?: ExtAccessory[] }): 'body' | number | null {
  const cands: { id: 'body' | number; name: string }[] = []
  if (ext.body?.type === 'hooklift') cands.push({ id: 'body', name: ext.body.typeRaw ?? '' })
  ;(ext.accessories ?? []).forEach((a, i) => { if (isHookliftAccessory(a)) cands.push({ id: i, name: a.name }) })
  if (!cands.length) return null
  return (cands.find((c) => findHookliftMatch(c.name)?.exact) ?? cands[0]).id
}

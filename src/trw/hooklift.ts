/**
 * Parametric hooklift (hákový nosič) derived from the MULTILIFT ULT18Z59 DIN CAD model
 * (public/models/hooklift/ult18z59.glb, built by scripts/build-hooklift-glb.mjs).
 *
 * Model coordinates (metres, Onshape export): +Z along the vehicle from the REAR roller (z≈-0.09)
 * to the hook/arm at the FRONT (z≈6.46), +Y up from the subframe underside (y≈-0.01), X lateral (±0.62).
 * Scene (configurator) coordinates: mm, X rearward from axle 1, Y up, Z lateral → X = xRear - (z - zMin)·1000.
 */
import type { ExtAccessory, ExtBody } from './trwExtended'
import { findHookliftSpec, type HookliftSpec } from './hookliftCatalog'

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
} as const

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
  return HOOK_RE.test(norm(`${a.kind ?? ''} ${a.name}`))
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
  const spec: HookliftSpec | null = findHookliftSpec(name, length)
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
  return { xRear, params, spec }
}

export function bodyHookliftPlacement(b: ExtBody, frameRear: number) {
  return hookliftPlacement({ ...b, name: b.typeRaw ?? '' }, frameRear)
}

/**
 * Piecewise stretch of a model-space point [m] (in place): rear ends fixed, middle section scaled,
 * front/arm shifted; arm band stretched vertically for hook height; section height scaled by capacity.
 */
export function makeHookliftDeform(p: HookliftParams) {
  const M = ULT18Z59
  const mid = M.zFront - M.zRear
  const fixedEnds = M.nativeLengthMm / 1000 - mid
  const k = Math.max(0.3, (p.lengthMm / 1000 - fixedEnds) / mid)
  const dz = (k - 1) * mid
  const dh = (p.hookHeightMm - M.hookHeightMm) / 1000
  // section height: installation height h when known, else a mild capacity-based guess
  const sy = p.installHeightMm != null ? Math.min(1.4, Math.max(0.6, p.installHeightMm / M.installHeightMm)) : Math.min(1.15, Math.max(0.85, Math.cbrt(p.capacityT / M.capacityT)))
  return (v: { x: number; y: number; z: number }, isArm: boolean) => {
    const z = v.z
    v.z = z <= M.zRear ? z : z >= M.zFront ? z + dz : M.zRear + (z - M.zRear) * k
    let y = v.y
    if (isArm && dh !== 0) y = y <= M.armY0 ? y : y >= M.armY1 ? y + dh : y + (dh * (y - M.armY0)) / (M.armY1 - M.armY0)
    // capacity: scale the low subframe section (rails/rollers) only, arm keeps its shape above it
    v.y = y <= M.armY0 ? M.yMin + (y - M.yMin) * sy : y + (M.armY0 - M.yMin) * (sy - 1)
  }
}

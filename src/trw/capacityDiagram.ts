import { defOf, loadAt, type CraneVariant, type LoadTable } from './craneKinematics'
import { classify, factorAt, type SectorStatus } from './stabilitySectors'
import type { ExtStability } from './trwExtended'

/**
 * CraneWIN-style capacity / stability diagram data – only from real sources:
 *  - load chart rings: manufacturer HiSelect table of the crane variant (SOR/SLC, manual MOR1/MLC1),
 *  - colour per slew angle: trw stability factor vs required_n (stability.angles),
 *  - design case: trw crane.hook_kg at crane.radius_m (Mk_kNm).
 * Nothing is interpolated beyond the table and no stability-limited capacity is derived (would need CraneWIN's moment split).
 */
export interface CapacityRing { rMm: number; kg: number; manual: boolean }
export interface CapacityInfo {
  table: LoadTable | null
  rings: CapacityRing[]
  /** capacity at the current reach (load chart), null = no chart */
  atReach: { reachMm: number; kg: number; manual: boolean } | null
  /** stability at the current slew from trw */
  atSlew: { deg: number; factor: number | null; status: SectorStatus } | null
  design: { hookKg: number | null; radiusM: number | null; momentKNm: number | null; chartKg: number | null; withinChart: boolean | null } | null
  missing: string[]
}

export function loadTableOf(v: CraneVariant | null): LoadTable | null {
  if (!v) return null
  try { return defOf(v).loads?.[v.id] ?? null } catch { return null }
}

export function capacityRings(t: LoadTable | null): CapacityRing[] {
  if (!t) return []
  const out = t.sor.map(([r, kg]) => ({ rMm: Math.round(r * 1000), kg, manual: false }))
  if (t.mor1 > (t.sor.at(-1)?.[0] ?? 0)) out.push({ rMm: Math.round(t.mor1 * 1000), kg: t.mlc1, manual: true })
  return out
}

/** Status of each 1° slew bin (0° = forward, clockwise from above), from the trw factors. */
export function slewStatus(st: ExtStability | null | undefined): SectorStatus[] {
  return Array.from({ length: 360 }, (_, d) => {
    if (!st?.angles.length) return 'unknown'
    const f = factorAt(st, d + 0.5)
    return classify(f.factor, st.requiredN, f.pass)
  })
}

export function capacityInfo(opts: {
  variant: CraneVariant | null
  craneName?: string | null
  reachMm?: number | null
  slewDeg?: number | null
  stability?: ExtStability | null
  design?: { hookKg?: number | null; radiusM?: number | null; momentKNm?: number | null } | null
}): CapacityInfo {
  const { variant, reachMm, slewDeg, stability, design } = opts
  const table = loadTableOf(variant)
  const missing: string[] = []
  if (!variant) missing.push(`Jeřáb „${opts.craneName ?? '?'}“ není v katalogu – bez zátěžné tabulky a kinematiky.`)
  else if (!table) missing.push(`Zátěžná tabulka pro ${variant.model} ${variant.id} chybí (HiSelect přepsán jen pro X-HiPro 142 E-1…E-5) – kruhy nosnosti se nekreslí.`)
  const ld = table && variant && reachMm != null ? loadAt(variant, reachMm / 1000) : null
  let atSlew: CapacityInfo['atSlew'] = null
  if (!stability?.angles.length) missing.push('trw neobsahuje stabilitu po úhlech natočení (stability.angles) – sektory stability se nebarví.')
  else if (slewDeg != null) {
    const f = factorAt(stability, slewDeg)
    atSlew = { deg: Math.round(((slewDeg % 360) + 360) % 360), factor: f.factor, status: classify(f.factor, stability.requiredN, f.pass) }
  }
  if (stability && stability.requiredN == null) missing.push('trw nemá požadovaný součinitel stability (required_n) – hranice „blízko limitu“ chybí.')
  if (stability && !stability.verified) missing.push('Stabilita z trw není ověřená proti CraneWIN (verified = false).')
  missing.push('Nosnost omezená stabilitou pro každý úhel se nepočítá – trw neexportuje stabilizující/klopné momenty zvlášť (CraneWIN interní výpočet).')
  let d: CapacityInfo['design'] = null
  if (design && (design.hookKg != null || design.radiusM != null)) {
    const chart = variant && table && design.radiusM != null ? loadAt(variant, design.radiusM) : null
    d = { hookKg: design.hookKg ?? null, radiusM: design.radiusM ?? null, momentKNm: design.momentKNm ?? null, chartKg: chart ? Math.round(chart.kg) : null, withinChart: chart && design.hookKg != null ? design.hookKg <= chart.kg : null }
  } else missing.push('trw neobsahuje návrhový případ jeřábu (crane.hook_kg / radius_m).')
  return { table, rings: capacityRings(table), atReach: ld && reachMm != null ? { reachMm, kg: Math.round(ld.kg), manual: ld.manual } : null, atSlew, design: d, missing }
}

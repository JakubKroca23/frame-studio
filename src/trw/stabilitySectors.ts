import type { ExtStability, ExtStabilityAngle } from './trwExtended'

/**
 * Sector status from the stability factor k and the required factor n (trw `required_n`):
 *  - utilisation u = n / k  (1.0 = exactly at the limit)
 *  - 'fail'  : pass === false, or k < n            (u > 100 %)
 *  - 'warn'  : n ≤ k < n / 0.85                     (85 % < u ≤ 100 %, i.e. less than ~18 % reserve)
 *  - 'ok'    : k ≥ n / 0.85                         (u ≤ 85 %)
 *  - 'unknown': no factor
 * Without required_n the trw `pass` flag decides fail/ok (no warn band).
 */
export type SectorStatus = 'ok' | 'warn' | 'fail' | 'unknown'
export const WARN_UTILISATION = 0.85

export function classify(factor: number | null | undefined, requiredN: number | null | undefined, pass?: boolean | null): SectorStatus {
  if (pass === false) return 'fail'
  if (factor == null || !Number.isFinite(factor)) return pass === true ? 'ok' : 'unknown'
  if (requiredN == null || requiredN <= 0) return pass === true || pass == null ? 'ok' : 'fail'
  if (factor < requiredN) return 'fail'
  if (factor < requiredN / WARN_UTILISATION) return 'warn'
  return 'ok'
}

export const utilisation = (factor: number | null, requiredN: number | null) => (factor && requiredN ? requiredN / factor : null)

export const STATUS_COLOR: Record<SectorStatus, string> = { ok: '#2a9d3a', warn: '#f08c00', fail: '#d62828', unknown: '#8a8f94' }
export const STATUS_LABEL: Record<SectorStatus, string> = { ok: 'bezpečné', warn: 'blízko limitu', fail: 'nevyhovuje', unknown: 'neznámé' }

const norm = (d: number) => ((d % 360) + 360) % 360

/** Factor at any slew angle, linearly interpolated between the two neighbouring trw angles (wraps at 360°). */
export function factorAt(st: ExtStability, deg: number): { factor: number | null; pass: boolean | null; nearest: ExtStabilityAngle | null } {
  const a = st.angles.filter((x) => x.factor != null)
  if (!a.length) return { factor: null, pass: null, nearest: null }
  const d = norm(deg)
  const list = a.map((x) => ({ ...x, n: norm(x.angleDeg) })).sort((p, q) => p.n - q.n)
  let lo = list[list.length - 1], hi = list[0]
  for (let i = 0; i < list.length; i++) {
    if (list[i].n <= d) lo = list[i]
    if (list[i].n >= d) { hi = list[i]; break }
    if (i === list.length - 1) hi = list[0]
  }
  const span = norm(hi.n - lo.n) || 0
  const t = span ? norm(d - lo.n) / span : 0
  const factor = lo.factor! + (hi.factor! - lo.factor!) * t
  const nearest = t < 0.5 ? lo : hi
  const pass = st.requiredN != null ? factor >= st.requiredN : nearest.pass
  return { factor, pass, nearest }
}

export interface Sector { fromDeg: number; toDeg: number; status: SectorStatus; minFactor: number | null }

/** 1° samples merged into sectors of equal status. */
export function mergeSectors(st: ExtStability, stepDeg = 1): Sector[] {
  const out: Sector[] = []
  for (let d = 0; d < 360; d += stepDeg) {
    const { factor, pass } = factorAt(st, d + stepDeg / 2)
    const status = classify(factor, st.requiredN, pass)
    const last = out[out.length - 1]
    if (last && last.status === status) {
      last.toDeg = d + stepDeg
      if (factor != null) last.minFactor = last.minFactor == null ? factor : Math.min(last.minFactor, factor)
    } else out.push({ fromDeg: d, toDeg: d + stepDeg, status, minFactor: factor })
  }
  if (out.length > 1 && out[0].status === out[out.length - 1].status) {
    const l = out.pop()!
    out[0].fromDeg = l.fromDeg - 360
    out[0].minFactor = Math.min(out[0].minFactor ?? Infinity, l.minFactor ?? Infinity)
  }
  return out
}

/**
 * One triangle-fan BufferGeometry (positions + vertex colours) on the ground plane, centred at the column.
 * Slew convention: 0° = forward (−X), clockwise from above, 90° = right (+Z). Returns raw arrays (testable without three).
 */
export function sectorFan(sectors: Sector[], radius: number, innerRadius = 0, segPerDeg = 1) {
  const pos: number[] = [], col: number[] = []
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const pt = (deg: number, r: number) => { const t = (deg * Math.PI) / 180; return [-Math.cos(t) * r, 0, Math.sin(t) * r] }
  for (const s of sectors) {
    const c = rgb(STATUS_COLOR[s.status])
    const n = Math.max(1, Math.ceil((s.toDeg - s.fromDeg) * segPerDeg))
    for (let i = 0; i < n; i++) {
      const a0 = s.fromDeg + ((s.toDeg - s.fromDeg) * i) / n, a1 = s.fromDeg + ((s.toDeg - s.fromDeg) * (i + 1)) / n
      const p0 = pt(a0, innerRadius), p1 = pt(a0, radius), p2 = pt(a1, radius), p3 = pt(a1, innerRadius)
      // CCW seen from above (+Y): clockwise slew → swap order
      pos.push(...p0, ...p2, ...p1, ...p0, ...p3, ...p2)
      for (let k = 0; k < 6; k++) col.push(...c)
    }
  }
  return { positions: new Float32Array(pos), colors: new Float32Array(col) }
}

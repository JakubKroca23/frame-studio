/**
 * Import of CS Sim results `cs-sim/trw-export@1` (sim.propoj.app, Mezirám na podvozku).
 * x is from the front end of the frame (same as trw); converted to configurator coordinates
 * (x behind axle 1) by subtracting axle_x_mm[0]. Parsing is tolerant: missing fields become null.
 */
export const CS_SIM_SCHEMA = 'cs-sim/trw-export@1'

export interface CsUtil {
  check: string
  role: string | null
  profile: string | null
  steel: string | null
  pct: number
  /** Configurator x (mm behind axle 1) or null. */
  x: number | null
}

export interface ProfileDims {
  H: number
  B: number
  t: number
}

export interface CsSimResult {
  generated: string | null
  chassisName: string | null
  craneName: string | null
  /** Offset subtracted from source x values (axle 1 from the frame front end). */
  x0: number
  axles: number[]
  frameLength: number | null
  chassisProfile: string | null
  load: { craneX: number | null; Mk: number | null; Fv: number | null; slew: number | null; outriggers: boolean; spread: number | null }
  maxMoment: { value: number; x: number | null; chassis: number | null; subframe: number | null; composite: number | null } | null
  stress: { subframe: number | null; chassis: number | null }
  deflection: { value: number | null; x: number | null; vertical: number | null; verticalX: number | null } | null
  utilization: CsUtil[]
  governing: { check: string; pct: number | null; ok: boolean | null; x: number | null } | null
  reactions: { label: string; x: number | null; Fz: number | null }[]
  subframe: {
    from: number
    to: number
    profile: string | null
    dims: ProfileDims
    steel: string | null
    /** Utilization curve along x (configurator x, %), sorted. Empty → use `uniformPct`. */
    curve: [number, number][]
    uniformPct: number | null
    /** True when the span or profile was not in the file. */
    estimated: boolean
  }
  warnings: string[]
}

type Rec = Record<string, unknown>
const obj = (v: unknown): Rec | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : null)
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

/** "UC 200x80x8", "U 160×60×6", "220x80x85x6" → web height, flange, thickness (last number). */
export function parseProfileDims(name: string | null | undefined): ProfileDims | null {
  const m = (name ?? '').match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×]\s*(\d+(?:[.,]\d+)?))?(?:\s*[x×]\s*(\d+(?:[.,]\d+)?))?/)
  if (!m) return null
  const n = m.slice(1).filter(Boolean).map((s) => Number(s.replace(',', '.')))
  if (n.length < 3) return null
  return { H: n[0], B: n[1], t: n[n.length - 1] }
}

export function parseCsSimResult(data: unknown): CsSimResult {
  const root = obj(data)
  if (!root || root.schema !== CS_SIM_SCHEMA) throw new Error(`Soubor není výsledek CS Sim (očekáváno schema "${CS_SIM_SCHEMA}").`)
  const inputs = obj(root.inputs) ?? {}
  const results = obj(root.results)
  if (!results) throw new Error('Výsledek CS Sim neobsahuje blok results.')
  const warnings: string[] = []
  const axlesRaw = (Array.isArray(inputs.axle_x_mm) ? inputs.axle_x_mm : []).map(num).filter((v): v is number => v !== null).sort((a, b) => a - b)
  if (!axlesRaw.length) warnings.push('V souboru chybí polohy náprav – x se bere od čela rámu bez převodu.')
  const x0 = axlesRaw[0] ?? 0
  const X = (v: unknown) => {
    const n = num(v)
    return n === null ? null : n - x0
  }
  const frameLength = num(inputs.frame_length_mm)
  const lc = obj(inputs.load_case) ?? {}
  const load = {
    craneX: X(lc.crane_x_mm),
    Mk: num(lc.Mk_kNm),
    Fv: num(lc.Fv_kN),
    slew: num(lc.slew_deg),
    outriggers: lc.outriggers === true,
    spread: num(lc.outrigger_spread_mm),
  }

  const mm = obj(results.max_bending_moment)
  const maxMoment = mm && num(mm.value_kNm) !== null
    ? { value: num(mm.value_kNm)!, x: X(mm.x_mm), chassis: num(mm.chassis_kNm), subframe: num(mm.subframe_kNm), composite: num(mm.composite_Ne_kNm) }
    : null
  const ms = obj(results.max_normal_stress) ?? {}
  const stress = { subframe: num(ms.subframe_MPa), chassis: num(ms.chassis_MPa) }
  const md = obj(results.max_deflection)
  const deflection = md ? { value: num(md.value_mm), x: X(md.x_mm), vertical: num(md.vertical_mm), verticalX: X(md.vertical_x_mm) } : null
  const utilization: CsUtil[] = (Array.isArray(results.utilization) ? results.utilization : [])
    .map(obj)
    .filter((u): u is Rec => !!u && num(u.pct) !== null)
    .map((u) => ({ check: str(u.check) ?? '?', role: str(u.role), profile: str(u.profile), steel: str(u.steel), pct: num(u.pct)!, x: X(u.x_mm) }))
  if (!utilization.length) warnings.push('Výsledek neobsahuje využití prvků (utilization).')
  const g = obj(results.governing)
  const governing = g
    ? { check: str(g.check) ?? '?', pct: num(g.pct), ok: typeof g.ok === 'boolean' ? g.ok : null, x: utilization.find((u) => u.check === g.check)?.x ?? maxMoment?.x ?? null }
    : null
  const reactions = (Array.isArray(results.support_reactions_kN) ? results.support_reactions_kN : [])
    .map(obj)
    .filter((r): r is Rec => !!r)
    .map((r) => ({ label: str(r.label) ?? '?', x: X(r.x_mm), Fz: num(r.Fz_kN) }))

  // Subframe block (optional, from Analýza): inside results or at the root.
  const sb = obj(results.subframe) ?? obj(root.subframe)
  const subUtil = utilization.filter((u) => u.role === 'sub')
  const profileName = str(sb?.profile) ?? str(obj(sb?.profile)?.name) ?? str(inputs.subframe_profile) ?? subUtil[0]?.profile ?? null
  let dims = parseProfileDims(profileName)
  const pObj = obj(sb?.profile)
  if (pObj && num(pObj.H_mm) && num(pObj.B_mm)) dims = { H: num(pObj.H_mm)!, B: num(pObj.B_mm)!, t: num(pObj.tw_mm) ?? num(pObj.t_mm) ?? dims?.t ?? 6 }
  let estimated = !sb
  if (!dims) {
    dims = { H: 160, B: 60, t: 6 }
    estimated = true
    warnings.push('Profil mezirámu neznámý – kreslen jako odhad U 160×60×6.')
  }
  let from = X(sb?.x_from_mm)
  let to = X(sb?.x_to_mm)
  const frameFront = -x0
  const frameRear = frameLength !== null ? frameLength - x0 : (axlesRaw.length ? axlesRaw[axlesRaw.length - 1] - x0 + 1500 : 8000)
  if (from === null || to === null) {
    estimated = true
    // No span: from the crane region (≈ 600 mm ahead of the crane) to the frame end.
    from = load.craneX !== null ? Math.max(frameFront, load.craneX - 600) : frameFront
    to = frameRear
    warnings.push(sb ? 'Rozsah mezirámu (x_from/x_to) chybí – odhad od jeřábu po konec rámu.' : 'Výsledek neobsahuje blok subframe – mezirám kreslen jako odhad (od jeřábu po konec rámu).')
  }
  if (from > to) [from, to] = [to, from]
  const curveRaw = Array.isArray(sb?.utilization) ? sb.utilization : []
  const curve = curveRaw
    .map((p): [number, number] | null => {
      if (Array.isArray(p)) return num(p[0]) !== null && num(p[1]) !== null ? [num(p[0])! - x0, num(p[1])!] : null
      const o = obj(p)
      const x = num(o?.x_mm ?? o?.x)
      const pct = num(o?.pct ?? o?.utilization_pct ?? o?.value)
      return x !== null && pct !== null ? [x - x0, pct] : null
    })
    .filter((p): p is [number, number] => !!p)
    .sort((a, b) => a[0] - b[0])
  const uniformPct = subUtil.length ? Math.max(...subUtil.map((u) => u.pct)) : null
  if (!curve.length) warnings.push('Průběh využití mezirámu po délce chybí – obarven jednotně podle nejvyššího využití.')
  if (!frameLength) warnings.push('Délka rámu chybí.')
  if (load.outriggers) warnings.push('Polohy podpěr v x výsledek neuvádí – kresleny u jeřábu (nebo podle importu z trw).')

  return {
    generated: str(root.generated),
    chassisName: str(inputs.chassis_name),
    craneName: str(inputs.crane_name),
    x0,
    axles: axlesRaw.map((x) => x - x0),
    frameLength,
    chassisProfile: str(inputs.chassis_profile),
    load,
    maxMoment,
    stress,
    deflection,
    utilization,
    governing,
    reactions,
    subframe: { from, to, profile: profileName, dims, steel: str(sb?.steel) ?? str(obj(sb?.steel)?.name) ?? subUtil[0]?.steel ?? null, curve, uniformPct, estimated },
    warnings,
  }
}

/** Utilization at x: linear interpolation of the curve, else the uniform value. */
export function utilizationAt(curve: [number, number][], uniform: number | null, x: number): number | null {
  if (!curve.length) return uniform
  if (x <= curve[0][0]) return curve[0][1]
  for (let i = 1; i < curve.length; i++) {
    const [xa, pa] = curve[i - 1]
    const [xb, pb] = curve[i]
    if (x <= xb) return xb === xa ? pb : pa + ((pb - pa) * (x - xa)) / (xb - xa)
  }
  return curve[curve.length - 1][1]
}

/** green < 60 %, orange < 90 %, red ≥ 90 %, interpolated between. Returns [r,g,b] 0..1. */
export function utilColor(pct: number | null): [number, number, number] {
  if (pct === null) return [0.55, 0.58, 0.6]
  const green: [number, number, number] = [0.2, 0.72, 0.3]
  const orange: [number, number, number] = [0.95, 0.6, 0.12]
  const red: [number, number, number] = [0.86, 0.15, 0.12]
  const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * Math.min(1, Math.max(0, t))) as [number, number, number]
  if (pct < 60) return mix(green, orange, pct / 60 - 0.75 > 0 ? (pct / 60 - 0.75) * 0.4 : 0)
  if (pct < 90) return mix(green, orange, 0.1 + ((pct - 60) / 30) * 0.9)
  return mix(orange, red, 0.6 + Math.min(1, (pct - 90) / 20) * 0.4)
}

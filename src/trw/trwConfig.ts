import { trwAuthHeaders } from './trwToken'
/**
 * Import of the trw export format `trw/config@1` (https://trw.propoj.app, záložka Mezirám).
 * trw measures x from the front end of the vehicle (FOH ahead of axle 1); the configurator measures
 * from the first axle. Every value trw leaves null is taken from the closest chassis preset and
 * marked as estimated (same `approx` mechanism as the presets).
 */
import { PRESETS, cloneConfig } from '../presets'
import { mapExtended, type TrwExtended } from './trwExtended'
import type { ChassisConfig, ChassisPreset, Make } from '../presets/types'

export const TRW_SCHEMA = 'trw/config@1'
export const TRW_URL = 'https://trw.propoj.app'
export const TRW_EXPORT_URL = `${TRW_URL}/api/config/export`

type Num = number | null | undefined

export interface TrwProfile {
  kind: 'FRU' | 'FRR' | 'FRP' | string
  name?: string | null
  source?: string | null
  dims_raw?: number[]
  H_mm?: Num
  B_mm?: Num
  B_bottom_mm?: Num
  tw_mm?: Num
  tf_mm?: Num
  tf_bottom_mm?: Num
  t_mm?: Num
}

export interface TrwSteel {
  name?: string | null
  re_MPa?: Num
  source?: string | null
}

export interface TrwExport {
  schema: string
  generated?: string
  name?: string | null
  chassis: {
    id?: number | null
    name?: string | null
    manufacturer?: string | null
    axle_x_mm: number[]
    n_front_axles?: Num
    wheelbase_mm?: Num
    front_overhang_mm?: Num
    rear_overhang_mm?: Num
    frame_length_mm?: Num
    frame_height_mm?: Num
    frame_width_mm?: Num
    gvw_kg?: Num
    rail_profile?: TrwProfile | null
    rail_steel?: TrwSteel | null
    raw?: Record<string, unknown> | null
  }
  axles?: { index: number; x_mm: number; permitted_kg?: Num; track_mm?: Num; tyre_diameter_mm?: Num }[]
  subframe?: { profile?: TrwProfile | null; steel?: TrwSteel | null; connection?: string | null } | null
  crane?: {
    name?: string | null
    manufacturer?: string | null
    mass_kg?: Num
    x_mm?: Num
    outrigger_spread_mm?: Num
    outrigger_x_mm?: { left?: Num; right?: Num } | null
    /** Design load case of the trw project: hook load at radius, lifting moment (CraneWIN input). */
    hook_kg?: Num
    radius_m?: Num
    Mk_kNm?: Num
    lifting_moment_raw?: unknown
  } | null
  body?: { x_from_mm?: Num; x_to_mm?: Num; height_mm?: Num } | null
  /** User-entered payload items (cargo, hookloader, exhaust, bumper…). Field names parsed tolerantly. */
  payloads?: TrwPayload[] | null
  /** Raw TrailerWIN data block – ignored by the importer. */
  config?: { trailerwin?: unknown } & Record<string, unknown>
}

export interface TrwPayload {
  name?: string | null
  label?: string | null
  type?: string | null
  x_mm?: Num
  x_from_mm?: Num
  x_to_mm?: Num
  x_from?: Num
  x_to?: Num
  mass_kg?: Num
  cog_x_mm?: Num
  cog?: Num | { x_mm?: Num; x?: Num } | null
  [k: string]: unknown
}

export interface TrwPayloadMarker {
  x: number | null
  xFrom?: number
  xTo?: number
  name: string
  massKg: number | null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Parses one payload item; x values are converted relative to x0 (first axle). */
export function mapPayload(p: unknown, i: number, x0: number): TrwPayloadMarker {
  const o = (p && typeof p === 'object' ? p : {}) as TrwPayload
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const name = str(o.name) ?? str(o.label) ?? str(o.type) ?? `položka ${i + 1}`
  const from = num(o.x_from_mm) ?? num(o.x_from)
  const to = num(o.x_to_mm) ?? num(o.x_to)
  const cog = o.cog
  const cogX = num(o.cog_x_mm) ?? num(cog) ?? (cog && typeof cog === 'object' ? num(cog.x_mm) ?? num(cog.x) : null)
  const x = cogX ?? num(o.x_mm) ?? (from != null && to != null ? (from + to) / 2 : from ?? to)
  const m: TrwPayloadMarker = { x: x == null ? null : x - x0, name, massKg: num(o.mass_kg) }
  if (from != null && to != null) {
    m.xFrom = Math.min(from, to) - x0
    m.xTo = Math.max(from, to) - x0
  }
  return m
}

/** Marker positions in configurator coordinates (x behind the first axle, mm). */
export interface TrwMarkers {
  crane?: { x: number; name: string; massKg?: number | null; hookKg?: number | null; radiusM?: number | null; momentKNm?: number | null }
  outriggers: { x: number; side: 'left' | 'right'; spread: number }[]
  payloads?: TrwPayloadMarker[]
  /** body / accessories / stability (extended export, tolerant parse). */
  extended?: TrwExtended
}

export interface TrwImport {
  preset: ChassisPreset
  /** Preset the estimated values come from. */
  basePresetId: string
  steel: TrwSteel | null
  subframe: TrwExport['subframe']
  markers: TrwMarkers
  warnings: string[]
  /** trw document (or saved calculation id) for the live stability API; null when the import has neither */
  liveDoc?: { document?: unknown; document_id?: number | string } | null
}

/** document / document_id carried by a trw export or request body (several spellings). */
export function liveDocOf(data: unknown): TrwImport['liveDoc'] {
  const o = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  const src = (o.source && typeof o.source === 'object' ? o.source : {}) as Record<string, unknown>
  const id = o.document_id ?? o.calculation_id ?? src.document_id ?? src.calculation_id
  if (typeof id === 'number' || (typeof id === 'string' && id)) return { document_id: id }
  if (o.document && typeof o.document === 'object') return { document: o.document }
  return null
}

const ok = (v: Num): v is number => typeof v === 'number' && Number.isFinite(v)

function leafPaths(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => leafPaths(item, `${path}.${i}`))
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => leafPaths(v, path ? `${path}.${k}` : k))
  return [path]
}

function makeOf(manufacturer: string | null | undefined): Make | null {
  const m = (manufacturer ?? '').toLowerCase()
  for (const make of ['volvo', 'scania', 'man', 'daf'] as Make[]) if (m.includes(make)) return make
  return null
}

/** Preset with the same make and axle count and the closest wheelbase (falls back across makes). */
export function closestPreset(make: Make | null, axleCount: number, wheelbase: number, rigid: boolean): ChassisPreset {
  const score = (p: ChassisPreset) => {
    const c = p.config
    const wb = (c.axles[1]?.position ?? 0) - 0
    return (p.make === make ? 0 : 10000) + Math.abs(c.axles.length - axleCount) * 3000 + (rigid === (c.kind === 'rigid') ? 0 : 1500) + Math.abs(wb - wheelbase) / 10
  }
  return [...PRESETS].sort((a, b) => score(a) - score(b))[0]
}

export function isTrwExport(data: unknown): data is TrwExport {
  const d = data as TrwExport | null
  return !!d && typeof d === 'object' && d.schema === TRW_SCHEMA && !!d.chassis && Array.isArray(d.chassis.axle_x_mm)
}

/** Pure mapper trw/config@1 → configurator chassis. Throws on an invalid document. */
export function mapTrwExport(data: unknown): TrwImport {
  if (!data || typeof data !== 'object' || (data as TrwExport).schema !== TRW_SCHEMA)
    throw new Error(`Soubor není export trw (očekáváno schema "${TRW_SCHEMA}").`)
  if (!isTrwExport(data)) throw new Error('Export trw neobsahuje polohy náprav (chassis.axle_x_mm).')
  const t = data
  const ch = t.chassis
  const xs = [...ch.axle_x_mm].filter(ok).sort((a, b) => a - b)
  if (xs.length < 2) throw new Error('Export trw musí mít alespoň dvě nápravy.')
  const warnings: string[] = []
  const measured = new Set<string>(['name', 'series', 'make'])
  const x0 = xs[0]
  const rigid = true
  const make = makeOf(ch.manufacturer)
  const base = closestPreset(make, xs.length, xs[1] - x0, rigid)
  const cfg: ChassisConfig = cloneConfig(base.config)
  if (!make) warnings.push(`Výrobce „${ch.manufacturer ?? '?'}“ není mezi předlohami – tvar kabiny a výbava podle ${base.make.toUpperCase()}.`)

  cfg.make = make ?? base.make
  cfg.series = base.series
  cfg.name = t.name || ch.name || 'Podvozek z trw'
  cfg.kind = 'rigid'
  measured.add('kind')
  if (cfg.cab.style !== cfg.make && make) cfg.cab.style = make

  const nFront = ok(ch.n_front_axles) ? ch.n_front_axles : 1
  const baseFront = base.config.axles.filter((a) => a.steered && a.position < 2600).length || 1
  const baseRear = base.config.axles.slice(baseFront)
  const raw = ch.raw ?? {}
  const tyreFront = typeof raw.TYRE === 'string' ? raw.TYRE : null
  const tyreRear = typeof raw.TYR2 === 'string' ? raw.TYR2 : tyreFront
  cfg.axles = xs.map((x, i) => {
    const front = i < nFront
    const src = front ? base.config.axles[Math.min(i, baseFront - 1)] : baseRear[Math.min(i - nFront, baseRear.length - 1)] ?? base.config.axles[base.config.axles.length - 1]
    const ta = t.axles?.find((a) => Math.abs(a.x_mm - x) < 1) ?? t.axles?.[i]
    const axle = { ...src, position: Math.round(x - x0), steered: front ? true : src.steered }
    measured.add(`axles.${i}.position`)
    if (front) measured.add(`axles.${i}.steered`)
    if (ok(ta?.permitted_kg) && ta.permitted_kg > 0) {
      axle.maxLoad = ta.permitted_kg
      measured.add(`axles.${i}.maxLoad`)
    }
    if (ok(ta?.track_mm)) {
      axle.track = ta.track_mm
      measured.add(`axles.${i}.track`)
    }
    const tyre = front ? tyreFront : tyreRear
    if (tyre) axle.tyre = tyre // TrailerWIN TYRE/TYR2 – přiřazení k nápravám neověřeno → zůstává odhad
    return axle
  })
  if (tyreFront) warnings.push('Pneumatiky převzaty z TrailerWIN TYRE/TYR2 (přiřazení k nápravám neověřeno); průměr kola z rozměru pneu.')
  else warnings.push('Rozměr pneu v exportu chybí – použit z předlohy.')
  warnings.push('Rozchod kol (track_mm) trw neexportuje – použit z předlohy.')

  const last = xs[xs.length - 1]
  if (ok(ch.front_overhang_mm)) {
    cfg.frontOverhang = ch.front_overhang_mm
    measured.add('frontOverhang')
    if (Math.abs(ch.front_overhang_mm - x0) > 1) warnings.push(`FOH (${ch.front_overhang_mm} mm) ≠ poloha 1. nápravy (${x0} mm) – počátek x v trw je nejistý.`)
  } else {
    cfg.frontOverhang = x0
    measured.add('frontOverhang')
  }
  if (ok(ch.rear_overhang_mm)) {
    cfg.rearOverhang = ch.rear_overhang_mm
    measured.add('rearOverhang')
  } else if (ok(ch.frame_length_mm)) {
    cfg.rearOverhang = ch.frame_length_mm - last
    measured.add('rearOverhang')
  } else warnings.push('Zadní převis (ROH) chybí – použit z předlohy.')
  if (ok(ch.frame_length_mm) && ok(ch.rear_overhang_mm) && Math.abs(ch.frame_length_mm - last - ch.rear_overhang_mm) > 1)
    warnings.push(`Délka rámu ${ch.frame_length_mm} mm neodpovídá poslední nápravě + ROH.`)

  // Frame front end: trw x=0 is the vehicle front (FOH), not necessarily the frame end.
  cfg.frame.frontEnd = Math.min(cfg.frame.frontEnd, cfg.frontOverhang)
  warnings.push('Začátek rámu před 1. nápravou není v datech trw (x=0 je čelo vozidla) – odhad z předlohy.')

  if (ok(ch.frame_height_mm)) {
    cfg.frame.topHeight = ch.frame_height_mm
    measured.add('frame.topHeight')
    warnings.push('Výška rámu HFRA bez uvedení stavu zatížení.')
  } else warnings.push('Výška rámu nad vozovkou chybí – použita z předlohy.')
  if (ok(ch.frame_width_mm)) {
    cfg.frame.widthRear = ch.frame_width_mm
    cfg.frame.widthFront = ch.frame_width_mm
    measured.add('frame.widthRear')
    measured.add('frame.widthFront')
  } else warnings.push('Šířka rámu (vnější rozteč podélníků) v trw není – odhad z předlohy.')

  const p = ch.rail_profile
  if (p && p.kind === 'FRU' && ok(p.H_mm)) {
    cfg.frame.sectionHeight = p.H_mm
    measured.add('frame.sectionHeight')
    if (ok(p.B_mm)) {
      cfg.frame.flange = p.B_mm
      measured.add('frame.flange')
    }
    const th = ok(p.tw_mm) ? p.tw_mm : p.tf_mm
    if (ok(th)) {
      cfg.frame.thickness = th
      measured.add('frame.thickness')
    }
    if (ok(p.B_bottom_mm) && ok(p.B_mm) && p.B_bottom_mm !== p.B_mm)
      warnings.push(`Profil má různé pásnice (${p.B_mm}/${p.B_bottom_mm} mm) – model použije horní.`)
    if (ok(p.tf_mm) && ok(p.tw_mm) && p.tf_mm !== p.tw_mm) warnings.push(`Tloušťka pásnice ${p.tf_mm} ≠ stojiny ${p.tw_mm} mm – model použije stojinu.`)
    if (p.source?.includes('estimated')) warnings.push('Profil podélníku je v trw označen jako odhad.')
  } else warnings.push(p ? `Profil podélníku typu ${p.kind} model nepodporuje – použit z předlohy.` : 'Profil podélníku chybí – použit z předlohy.')
  if (!ch.rail_steel) warnings.push('Materiál rámu chybí.')

  if (ok(ch.gvw_kg) && ch.gvw_kg > 0) {
    cfg.gvw = ch.gvw_kg
    measured.add('gvw')
  }
  cfg.gcw = Math.max(cfg.gcw, cfg.gvw)
  cfg.fifthWheel = { ...cfg.fifthWheel, enabled: false }

  const markers: TrwMarkers = { outriggers: [] }
  const c = t.crane
  if (c) {
    if (ok(c.x_mm)) markers.crane = { x: c.x_mm - x0, name: c.name ?? 'jeřáb', massKg: ok(c.mass_kg) ? c.mass_kg : null, hookKg: ok(c.hook_kg) ? c.hook_kg : null, radiusM: ok(c.radius_m) ? c.radius_m : null, momentKNm: ok(c.Mk_kNm) ? c.Mk_kNm : null }
    const spread = ok(c.outrigger_spread_mm) ? c.outrigger_spread_mm : 0
    for (const side of ['left', 'right'] as const) {
      const ox = c.outrigger_x_mm?.[side]
      if (ok(ox)) markers.outriggers.push({ x: ox - x0, side, spread })
    }
    if (!spread && markers.outriggers.length) warnings.push('Rozpětí podpěr jeřábu chybí.')
  }

  if (Array.isArray(t.payloads)) {
    const items = t.payloads.map((p, i) => mapPayload(p, i, x0))
    for (const m of items) {
      const miss = [m.x == null ? 'polohu' : null, m.massKg == null ? 'hmotnost' : null].filter(Boolean)
      if (miss.length) warnings.push(`Náklad „${m.name}“ nemá ${miss.join(' ani ')}${m.x == null ? ' – nezobrazen' : ''}.`)
    }
    markers.payloads = items
  }

  const extended = mapExtended(t, x0, warnings)
  if (extended) markers.extended = extended

  const approx = leafPaths(cfg).filter((path) => !measured.has(path))
  const preset: ChassisPreset = {
    id: `trw-${ch.id ?? 'manual'}`,
    make: cfg.make,
    series: cfg.series,
    label: `z trw: ${ch.name ?? cfg.name}`,
    wheelbases: [cfg.axles[nFront]?.position ?? cfg.axles[1].position],
    wheelbaseRef: 'firstRear',
    source: `trw (${TRW_SCHEMA}${t.generated ? `, ${t.generated}` : ''}); odhady z předlohy ${base.id}`,
    note: p?.name ? `profil ${p.name}${ch.rail_steel?.name ? `, ${ch.rail_steel.name}` : ''}` : undefined,
    config: cfg,
    approx,
  }
  return { preset, basePresetId: base.id, steel: ch.rail_steel ?? null, subframe: t.subframe ?? null, markers, warnings, liveDoc: liveDocOf(data) }
}

export class TrwAuthError extends Error {}

/** POST /api/config/export with the trw session cookie. Body = { document, meziram }. */
export async function fetchTrwExport(body: unknown, fetcher: typeof fetch = fetch): Promise<TrwImport> {
  const res = await fetcher(TRW_EXPORT_URL, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...trwAuthHeaders() },
    body: JSON.stringify(body),
  })
  if (res.status === 401) throw new TrwAuthError('Nejste přihlášeni v trw.')
  if (!res.ok) throw new Error(`trw vrátil chybu ${res.status}.`)
  const json = await res.json()
  const r = mapTrwExport(json)
  // the request body's document is what the live API needs (unless trw returned a saved id)
  return { ...r, liveDoc: r.liveDoc ?? liveDocOf(body) }
}

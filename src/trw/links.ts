/** One-click links between frame-studio, trw and CS Sim (pure helpers + fetch). */
import { CS_SIM_SCHEMA, parseProfileDims, type CsSimResult } from './csSimResult'
import { TRW_SCHEMA, TRW_URL, TrwAuthError, mapTrwExport, type TrwImport } from './trwConfig'

export const TRW_ORIGIN = 'https://trw.propoj.app'
export const CS_SIM_ORIGIN = 'https://sim.propoj.app'

export type LinkRequest = { kind: 'trw'; url: string } | { kind: 'cssim' } | { kind: 'invalid'; error: string } | null

/** Accepts only absolute https URLs on exactly https://trw.propoj.app. */
export function validateTrwUrl(raw: string): { url: string } | { error: string } {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return { error: 'Parametr ?trw= neobsahuje platnou adresu URL.' }
  }
  if (u.origin !== TRW_ORIGIN || u.username || u.password) return { error: `Adresa ${u.origin} není povolena – lze načítat jen z ${TRW_ORIGIN}.` }
  return { url: u.href }
}

/** Reads ?trw=<url> or ?from=cssim from a location.search string. */
export function parseLinkParams(search: string): LinkRequest {
  const p = new URLSearchParams(search)
  const trw = p.get('trw')
  if (trw !== null) {
    const v = validateTrwUrl(trw)
    return 'url' in v ? { kind: 'trw', url: v.url } : { kind: 'invalid', error: v.error }
  }
  if (p.get('from') === 'cssim') return { kind: 'cssim' }
  return null
}

/** Current href without the link params (trw, from), keeping the rest and the hash. */
export function stripLinkParams(href: string, hash = '#novy'): string {
  const u = new URL(href)
  u.searchParams.delete('trw')
  u.searchParams.delete('from')
  u.hash = hash
  return u.pathname + u.search + u.hash
}

/** Returns the export payload of a valid CS Sim message, else null. */
export function csSimMessageData(event: { origin: string; data: unknown }): unknown | null {
  if (event.origin !== CS_SIM_ORIGIN) return null
  const d = event.data as { type?: unknown; data?: unknown } | null
  if (!d || typeof d !== 'object' || d.type !== CS_SIM_SCHEMA || !d.data || typeof d.data !== 'object') return null
  return d.data
}

export function csSimLink(trwUrl: string | null): string {
  return trwUrl ? `${CS_SIM_ORIGIN}/?trw=${encodeURIComponent(trwUrl)}` : `${CS_SIM_ORIGIN}/`
}

/** GET the URL with the trw session. 405 (endpoint wants POST with a body) → clear Czech error. */
export async function fetchTrwUrl(url: string, fetcher: typeof fetch = fetch): Promise<TrwImport> {
  const v = validateTrwUrl(url)
  if ('error' in v) throw new Error(v.error)
  let res: Response
  try {
    res = await fetcher(v.url, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } })
  } catch {
    throw new Error('trw není dostupný (síť nebo CORS).')
  }
  if (res.status === 401) throw new TrwAuthError('Nejste přihlášeni v trw.')
  if (res.status === 405)
    throw new Error('Tato adresa trw vyžaduje POST s tělem výpočtu – použijte odkaz na uložený export (GET) nebo „Načíst z trw (JSON)“.')
  if (!res.ok) throw new Error(`trw vrátil chybu ${res.status}.`)
  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new Error('trw nevrátil JSON.')
  }
  return mapTrwExport(data)
}

/** Builds a configurator chassis from CS Sim inputs (axles, frame length, profile) via the trw mapper. */
export function trwFromCsSim(sim: CsSimResult, raw: unknown): TrwImport {
  const inputs = ((raw as { inputs?: Record<string, unknown> })?.inputs ?? {}) as Record<string, unknown>
  const axles = sim.axles.map((x) => x + sim.x0)
  if (axles.length < 2) throw new Error('Export CS Sim neobsahuje polohy náprav – nelze sestavit podvozek.')
  const dims = sim.chassisRail.dims ?? parseProfileDims(sim.chassisProfile)
  const name = sim.chassisName ?? 'Podvozek z CS Sim'
  const result = mapTrwExport({
    schema: TRW_SCHEMA,
    generated: sim.generated ?? undefined,
    name,
    chassis: {
      id: typeof inputs.chassis_id === 'number' ? inputs.chassis_id : null,
      name,
      manufacturer: name.split(/\s+/)[0],
      axle_x_mm: axles,
      front_overhang_mm: axles[0],
      frame_length_mm: sim.frameLength,
      rear_overhang_mm: sim.frameLength !== null ? sim.frameLength - axles[axles.length - 1] : null,
      rail_profile: dims ? { kind: 'FRU', name: sim.chassisRail.profile, H_mm: dims.H, B_mm: dims.B, tw_mm: dims.t } : null,
      rail_steel: sim.chassisRail.steel ? { name: sim.chassisRail.steel } : null,
    },
  })
  result.warnings.unshift('Podvozek sestaven z výsledku CS Sim (bez exportu trw) – výška rámu, zatížení náprav a další hodnoty jsou z předlohy.')
  result.preset.source = `CS Sim (${CS_SIM_SCHEMA}); odhady z předlohy ${result.basePresetId}`
  return result
}

export { TRW_URL }

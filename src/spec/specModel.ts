/**
 * Brand-neutral result of reading a manufacturer specification PDF, and its mapping to the configurator.
 * Rule: only values printed in the specification are taken as measured. Everything else (component positions,
 * tank dimensions, track, cab length…) is an explicit assumption with a reason, listed in the UI. Nothing else is invented.
 */
import { tireDiameterMm } from '../lib/geom'
import type { ChassisConfig, ChassisPreset, Make, Side } from '../presets/types'

export interface SpecValue { value: number; source: string }

export interface SpecAxle {
  role: 'front' | 'drive' | 'tag' | 'pusher'
  tyre?: { size: string; diameter: number; width: number; source: string }
  load?: SpecValue
  /** Explicitly printed single/twin; undefined = not in the spec. */
  twin?: { value: boolean; source: string }
  steered?: boolean
  lift?: boolean
}

export type DimKey =
  | 'wheelbase' | 'spacing2' | 'frontOverhang' | 'rearOverhang' | 'length'
  | 'frameWidthFront' | 'frameWidthRear' | 'frameSection' | 'frameFlange' | 'frameThickness' | 'frameTop' | 'frameTopLaden'
  | 'cabWidth' | 'cabLength' | 'vehicleHeight' | 'cabToBody' | 'mirrors' | 'gvw' | 'gcw' | 'mass' | 'couplingFromEnd' | 'fuelHeight'

export interface SpecData {
  brand: Make
  model: string | null
  /** Short model series for the parametric cab (TGS, FM, XF…). */
  series: string | null
  code: string | null
  drive: string | null
  axles: SpecAxle[]
  dims: Partial<Record<DimKey, SpecValue & { approx?: boolean }>>
  cab: { code: string; description: string; kind: 'day' | 'sleeper'; roof: 'low' | 'normal' | 'high'; source: string } | null
  fuel: { liters: number; side: Side; source: string } | null
  adblue: { liters: number; side: Side; source: string } | null
  exhaust: { side: Side | null; vertical: boolean; text: string } | null
  spare: { side: Side; text: string; beforeRear: boolean } | null
  battery: { side: Side | null; text: string } | null
  coupling: string | null
  airSuspension: string[]
  leafFront: boolean
  sideGuard: boolean | null
  rearGuard: boolean | null
  /** Info rows shown in the UI only. */
  notes: { label: string; value: string; source: string }[]
}

export const SIDE = (s: string): Side => (/lev|vlevo|left/i.test(s) ? 'left' : 'right')
export const sideCz = (s: Side) => (s === 'left' ? 'vlevo' : 'vpravo')

/** "385/65R22,5" → overall diameter (exact ISO math), section width. */
export function tyreFromSize(size: string): { diameter: number; width: number } | null {
  const d = tireDiameterMm(size)
  const w = size.match(/^(\d{3})/)
  return d && w ? { diameter: Math.round(d * 10) / 10, width: Number(w[1]) } : null
}
export function specTyre(size: string, source: string): SpecAxle['tyre'] {
  const t = tyreFromSize(size)
  return t ? { size: size.replace(/\s/g, ''), ...t, source } : undefined
}

export function emptySpec(brand: Make): SpecData {
  return { brand, model: null, series: null, code: null, drive: null, axles: [], dims: {}, cab: null, fuel: null, adblue: null, exhaust: null, spare: null, battery: null, coupling: null, airSuspension: [], leafFront: false, sideGuard: null, rearGuard: null, notes: [] }
}

export interface SpecItem { path: string; label: string; value: string; source: string }

export interface SpecImport {
  spec: SpecData
  preset: ChassisPreset
  parsed: SpecItem[]
  assumptions: SpecItem[]
  warnings: string[]
}

const BRAND: Record<Make, string> = { man: 'MAN', volvo: 'Volvo', daf: 'DAF', scania: 'Scania' }
/** Typical values used only when the spec is silent – always listed as assumptions. */
const TYPICAL: Record<Make, { frameWidth: number; section: number; flange: number; thickness: number; cabLength: number; cabWidth: number; height: number; frontOverhang: number; tagSpacing: number; track: [number, number] }> = {
  man: { frameWidth: 765, section: 270, flange: 85, thickness: 8, cabLength: 2280, cabWidth: 2240, height: 3300, frontOverhang: 1475, tagSpacing: 1350, track: [2040, 1810] },
  volvo: { frameWidth: 850, section: 300, flange: 90, thickness: 8, cabLength: 2240, cabWidth: 2500, height: 3500, frontOverhang: 1395, tagSpacing: 1370, track: [2050, 1820] },
  daf: { frameWidth: 850, section: 310, flange: 75, thickness: 7, cabLength: 2360, cabWidth: 2500, height: 3700, frontOverhang: 1475, tagSpacing: 1350, track: [2050, 1820] },
  scania: { frameWidth: 768, section: 270, flange: 90, thickness: 8, cabLength: 2200, cabWidth: 2500, height: 3500, frontOverhang: 1500, tagSpacing: 1350, track: [2050, 1820] },
}

export function specToConfig(spec: SpecData, fileName = 'specifikace.pdf'): SpecImport {
  const parsed: SpecItem[] = []
  const assumptions: SpecItem[] = []
  const warnings: string[] = []
  const T = TYPICAL[spec.brand]
  const P = (path: string, label: string, value: number | string, source: string) => parsed.push({ path, label, value: String(value), source })
  const A = (path: string, label: string, value: number | string, source: string) => assumptions.push({ path, label, value: String(value), source })
  const d = spec.dims
  const dim = (k: DimKey, path: string, label: string, fallback: number, why: string): number => {
    const v = d[k]
    if (v) { P(path, label, v.approx ? `cca ${v.value}` : v.value, v.source); return v.value }
    A(path, label, fallback, why)
    return fallback
  }

  if (spec.drive) P('axles', 'Uspořádání náprav', spec.drive, 'specifikace')
  else A('axles', 'Uspořádání náprav', `${spec.axles.length} nápravy`, 'druh pohonu ve specifikaci není – počet náprav odvozen z roztečí, hnané nápravy odhad')
  if (spec.axles.length < 2) throw new Error('Ve specifikaci chybí uspořádání náprav.')
  if (!d.wheelbase) throw new Error('Ve specifikaci chybí rozvor.')
  const wb = dim('wheelbase', 'axles.1.position', 'Rozvor (1. náprava → 1. zadní)', 0, '')
  const positions = [0, wb]
  if (spec.axles.length > 2) {
    const s = dim('spacing2', 'axles.2.position', 'Rozteč zadních náprav', T.tagSpacing, 've specifikaci není – typická hodnota')
    positions.push(wb + s)
  }

  const axles = spec.axles.map((ax, i) => {
    const n = i + 1
    const steered = ax.steered ?? ax.role === 'front'
    const driven = ax.role === 'drive'
    if (ax.tyre) P(`axles.${i}.tyre`, `Pneumatiky ${n}. nápravy`, `${ax.tyre.size} (Ø ${ax.tyre.diameter} mm)`, ax.tyre.source)
    else A(`axles.${i}.tyre`, `Pneumatiky ${n}. nápravy`, '315/80R22.5', 'rozměr pneu ve specifikaci chybí')
    let twin: boolean
    if (ax.twin) { twin = ax.twin.value; P(`axles.${i}.twin`, `Dvojmontáž ${n}. nápravy`, twin ? 'ano' : 'ne', ax.twin.source) }
    else {
      twin = driven && (ax.tyre?.width ?? 315) <= 315
      A(`axles.${i}.twin`, `Dvojmontáž ${n}. nápravy`, twin ? 'ano' : 'ne', 've specifikaci není – odvozeno z role nápravy a šířky pneu (hnaná ≤ 315 → dvojmontáž)')
    }
    if (ax.load) P(`axles.${i}.maxLoad`, `Zatížení ${n}. nápravy`, ax.load.value, ax.load.source)
    if (ax.lift) P(`axles.${i}.lift`, `${n}. náprava zvedací`, 'ano', 'specifikace')
    if (ax.role === 'tag') P(`axles.${i}.steered`, `${n}. náprava vlečená`, steered ? 'řízená' : 'neřízená', 'specifikace')
    const track = steered && ax.role === 'front' ? T.track[0] : T.track[1]
    A(`axles.${i}.track`, `Rozchod ${n}. nápravy`, track, `rozchod ve specifikaci není (typická hodnota ${BRAND[spec.brand]})`)
    return { position: positions[i], steered, driven, lift: !!ax.lift, twin, maxLoad: ax.load?.value ?? 0, track, tyre: ax.tyre?.size.replace(',', '.') ?? '315/80R22.5' }
  })

  const foh = dim('frontOverhang', 'frontOverhang', 'Přední převis', T.frontOverhang, `ve specifikaci není – typická hodnota ${BRAND[spec.brand]}`)
  const roh = dim('rearOverhang', 'rearOverhang', 'Zadní převis', 1000, 've specifikaci není')
  if (d.length) {
    const sum = foh + positions[positions.length - 1] + roh
    P('length', 'Celková délka', d.length.value, d.length.source)
    if (Math.abs(d.length.value - sum) > 1) warnings.push(`Celková délka ${d.length.value} mm ≠ převis + rozvory + zadní převis = ${sum} mm (rozdíl ${d.length.value - sum} mm – přesah mimo rám, např. spojka / zadní ochrana; rám se kreslí podle zadního převisu).`)
  }
  const wr = dim('frameWidthRear', 'frame.widthRear', 'Šířka rámu vzadu', T.frameWidth, `ve specifikaci není – typická hodnota ${BRAND[spec.brand]}`)
  const wf = d.frameWidthFront ? dim('frameWidthFront', 'frame.widthFront', 'Šířka rámu vpředu', wr, '') : wr
  if (!d.frameWidthFront && d.frameWidthRear) A('frame.widthFront', 'Šířka rámu vpředu', wr, 'není uvedena – rovný rám')
  const sec = dim('frameSection', 'frame.sectionHeight', 'Profil rámu – výška', T.section, 've specifikaci není')
  const fl = dim('frameFlange', 'frame.flange', 'Profil rámu – pásnice', T.flange, `šířka pásnice ve specifikaci není – typická hodnota ${BRAND[spec.brand]}`)
  const th = dim('frameThickness', 'frame.thickness', 'Profil rámu – tloušťka', T.thickness, 've specifikaci není')
  const top = dim('frameTop', 'frame.topHeight', 'Výška horní hrany rámu', 1000, 've specifikaci není')
  if (d.frameTopLaden) parsed.push({ path: 'frame.topHeightLaden', label: 'Výška rámu (naložené)', value: String(d.frameTopLaden.value), source: `${d.frameTopLaden.source} (jen informace)` })
  A('frame.taperEnd', 'Konec zúžení rámu za 1. nápravou', 900, 'poloha přechodu šířek rámu ve specifikaci není')
  A('frame.frontEnd', 'Začátek rámu před 1. nápravou', Math.round(foh - 430), 'čelo rámu ve specifikaci není (přední převis − 430 mm nárazník)')

  if (spec.cab) P('cab.style', 'Kabina', `${spec.cab.code}${spec.cab.description ? ` – ${spec.cab.description}` : ''}`, spec.cab.source)
  else A('cab.style', 'Kabina', `${BRAND[spec.brand]} denní`, 'typ kabiny ve specifikaci chybí')
  const cabW = dim('cabWidth', 'cab.width', 'Šířka kabiny', T.cabWidth, `ve specifikaci není – typická hodnota ${BRAND[spec.brand]}`)
  const vh = d.vehicleHeight
  let height = T.height
  if (vh && !vh.approx) { height = vh.value; P('cab.height', 'Výška vozidla (nenaložené)', vh.value, vh.source) }
  else A('cab.height', 'Výška kabiny', height, vh ? `ve specifikaci jen „${vh.source}“ (${vh.value} mm) – typická výška kabiny ${BRAND[spec.brand]}` : `ve specifikaci není – typická hodnota ${BRAND[spec.brand]}`)
  if (d.mirrors) parsed.push({ path: 'mirrors', label: 'Šířka přes zrcátka', value: String(d.mirrors.value), source: `${d.mirrors.source} (jen informace)` })
  let back: number, cabLen: number
  if (d.cabLength) {
    cabLen = d.cabLength.value
    P('cab.length', 'Délka kabiny', cabLen, d.cabLength.source)
    back = cabLen - foh
    A('cab.backFromAxle', 'Zadní stěna kabiny za 1. nápravou', back, 'délka kabiny − přední převis (nárazník = čelo kabiny)')
  } else if (d.cabToBody) {
    P('cabToBody', '1. náprava → nástavba', d.cabToBody.value, d.cabToBody.source)
    back = d.cabToBody.value - 100
    cabLen = foh + back
    A('cab.backFromAxle', 'Zadní stěna kabiny za 1. nápravou', back, `${d.cabToBody.source} − 100 mm mezera kabina–nástavba`)
    A('cab.length', 'Délka kabiny', cabLen, 'přední převis + zadní stěna kabiny (délka kabiny ve specifikaci není)')
  } else {
    cabLen = T.cabLength
    back = cabLen - foh
    A('cab.length', 'Délka kabiny', cabLen, `ve specifikaci není – typická hodnota ${BRAND[spec.brand]}`)
    A('cab.backFromAxle', 'Zadní stěna kabiny za 1. nápravou', back, 'délka kabiny − přední převis')
  }

  if (spec.fuel) {
    P('fuel', 'Palivová nádrž', `${spec.fuel.liters} l, ${sideCz(spec.fuel.side)}`, spec.fuel.source)
    if (d.fuelHeight) P('fuel.height', 'Výška palivové nádrže', d.fuelHeight.value, d.fuelHeight.source)
    A('fuel.dims', 'Poloha a délka palivové nádrže', 'délka z objemu, za kabinou', 'poloha/délka ve specifikaci nejsou')
  } else A('fuel', 'Palivová nádrž', 'bez nádrže', 've specifikaci není')
  if (spec.adblue) {
    P('adblue', 'Nádrž AdBlue', `${spec.adblue.liters} l, ${sideCz(spec.adblue.side)}`, spec.adblue.source)
    A('adblue.dims', 'Rozměry a poloha AdBlue', '480 × 420 mm, délka z objemu', 'rozměry/poloha ve specifikaci nejsou')
  }
  if (spec.exhaust) {
    if (spec.exhaust.side) P('exhaust', 'Tlumič výfuku', `${spec.exhaust.vertical ? 'svislý' : 'vodorovný'}, ${sideCz(spec.exhaust.side)}`, spec.exhaust.text)
    else { P('exhaust', 'Tlumič výfuku', spec.exhaust.vertical ? 'svislý' : 'vodorovný', spec.exhaust.text); A('exhaust.side', 'Strana tlumiče výfuku', 'vpravo', 'strana ve specifikaci není') }
    A('exhaust.dims', 'Rozměry a poloha tlumiče', '900 × 560 × 560 mm', 'rozměry/poloha ve specifikaci nejsou')
  } else A('exhaust', 'Tlumič výfuku', 'vodorovný vpravo', 've specifikaci není')
  if (spec.battery) {
    if (spec.battery.side) P('battery', 'Akumulátory', sideCz(spec.battery.side), spec.battery.text)
    else A('battery.side', 'Strana akumulátorů', 'vlevo', 'strana ve specifikaci není')
    A('battery.dims', 'Rozměry a poloha bateriové skříně', '760 × 480 × 560 mm', 'rozměry/poloha ve specifikaci nejsou')
  }
  if (spec.spare) {
    P('spare', 'Rezervní kolo', sideCz(spec.spare.side), spec.spare.text)
    A('spare.pos', 'Poloha rezervního kola', spec.spare.beforeRear ? 'těsně před 1. zadní nápravou' : 'za palivovou nádrží / mezi nápravami', 'přesná poloha ve specifikaci není')
  }
  if (spec.coupling) {
    P('coupling', 'Závěs přívěsu', spec.coupling, 'specifikace')
    if (d.couplingFromEnd) P('coupling.x', 'Tažná příčka od konce rámu', d.couplingFromEnd.value, d.couplingFromEnd.source)
    A('coupling.dims', 'Geometrie závěsu', 'symbolická čelist na konci rámu', 'geometrie ve specifikaci není')
  }
  if (spec.airSuspension.length) P('airSuspension', 'Vzduchové pérování', spec.airSuspension.join(', '), 'specifikace')
  if (spec.leafFront) P('leafFront', 'Přední náprava', 'listové / parabolické pružiny', 'specifikace')
  if (spec.sideGuard === null) A('sideGuards', 'Boční ochrana proti podjetí', 'ano', 've specifikaci není uvedena – zákonná výbava')
  else P('sideGuards', 'Boční ochrana proti podjetí', spec.sideGuard ? 'ano' : 'ne', 'specifikace')
  if (spec.rearGuard !== null) P('rearUnderrun', 'Zadní ochrana proti podjetí', spec.rearGuard ? 'ano' : 'ne', 'specifikace')
  A('airTanks', 'Vzduchojemy', '4 ks', 've specifikaci bez polohy a rozměrů')
  for (const n of spec.notes) parsed.push({ path: `note.${n.label}`, label: n.label, value: n.value, source: `${n.source} (jen informace)` })

  const gvw = d.gvw ? (P('gvw', 'Celková hmotnost', d.gvw.value, d.gvw.source), d.gvw.value) : 26000
  const gcw = d.gcw ? (P('gcw', 'Hmotnost soupravy', d.gcw.value, d.gcw.source), d.gcw.value) : 0
  if (d.mass) parsed.push({ path: 'mass', label: 'Hmotnost podvozku', value: String(d.mass.value), source: `${d.mass.source} (jen informace)` })

  const cfg: ChassisConfig = {
    make: spec.brand,
    series: spec.series ?? 'TGS',
    name: `${BRAND[spec.brand]} ${spec.model ?? 'ze specifikace'}`,
    kind: 'rigid',
    axles,
    frontOverhang: foh,
    rearOverhang: roh,
    frame: { widthRear: wr, widthFront: wf, taperEnd: 900, sectionHeight: sec, flange: fl, thickness: th, topHeight: top, frontEnd: Math.round(foh - 430) },
    gvw,
    gcw,
    cab: { style: spec.brand, kind: spec.cab?.kind ?? 'day', roof: spec.cab?.roof ?? 'normal', length: cabLen, height, width: cabW, backFromAxle: back, color: 0xd9dadb, code: spec.cab?.code },
    fuel: spec.fuel ? { enabled: true, liters: spec.fuel.liters, side: spec.fuel.side } : { enabled: false, liters: 0, side: 'right' },
    adblue: spec.adblue ? { enabled: true, liters: spec.adblue.liters, side: spec.adblue.side } : { enabled: false, liters: 0, side: 'left' },
    battery: { enabled: !!spec.battery, side: spec.battery?.side ?? 'left' },
    airTanks: { enabled: true, count: 4 },
    exhaust: { kind: spec.exhaust?.vertical ? 'vertical' : 'horizontal', side: spec.exhaust?.side ?? 'right' },
    fifthWheel: { enabled: false, lead: 0, height: 1250 },
    sideGuards: spec.sideGuard ?? true,
    rearUnderrun: spec.rearGuard ?? true,
    mudguards: true,
    spare: spec.spare ? { enabled: true, side: spec.spare.side, beforeRear: spec.spare.beforeRear, diameter: spec.axles[1]?.tyre?.diameter } : undefined,
    coupling: !!spec.coupling,
    airSuspension: spec.airSuspension.length > 0,
  }

  const exact = new Set(['make', 'series', 'name', 'kind', 'cab.style', 'cab.kind', 'cab.roof', 'cab.color', 'cab.code', 'fifthWheel.enabled', 'fifthWheel.lead', 'fifthWheel.height', 'gvw', 'gcw', 'mudguards', 'rearUnderrun', 'sideGuards'])
  for (const p of parsed) exact.add(p.path)
  axles.forEach((_, i) => { for (const k of ['steered', 'driven', 'lift', 'maxLoad']) exact.add(`axles.${i}.${k}`) })
  if (spec.fuel) for (const k of ['enabled', 'liters', 'side']) exact.add(`fuel.${k}`)
  if (spec.adblue) for (const k of ['enabled', 'liters', 'side']) exact.add(`adblue.${k}`)
  if (spec.battery?.side) { exact.add('battery.enabled'); exact.add('battery.side') }
  if (spec.exhaust) { exact.add('exhaust.kind'); if (spec.exhaust.side) exact.add('exhaust.side') }
  const approx = leafPaths(cfg).filter((p) => !exact.has(p))

  const preset: ChassisPreset = {
    id: `spec-${spec.brand}-${spec.code ?? 'pdf'}`,
    make: spec.brand,
    series: cfg.series,
    label: `ze specifikace: ${spec.model ?? fileName}`,
    wheelbases: [wb],
    wheelbaseRef: 'firstRear',
    source: `Specifikace ${BRAND[spec.brand]} (PDF ${fileName}${spec.code ? `, kód ${spec.code}` : ''})`,
    config: cfg,
    approx,
  }
  return { spec, preset, parsed, assumptions, warnings }
}

function leafPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return prefix ? [prefix] : []
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => leafPaths(v, prefix ? `${prefix}.${k}` : k))
}

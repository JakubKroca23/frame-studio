/**
 * MAN "Popis vozidla" specification (PDF text) → configurator chassis.
 * Only values printed in the specification are taken as measured. Everything the specification does not
 * contain (component positions along the frame, tank dimensions, track, cab length…) is an explicit
 * assumption with a reason and is listed in the UI. Nothing else is invented.
 */
import { tireDiameterMm } from '../lib/geom'
import type { ChassisConfig, ChassisPreset, Side } from '../presets/types'

export interface TdValue {
  code: string
  label: string
  /** Raw value text as printed ("945.0", "270 x 85 x 10", "-"). */
  raw: string
  /** Numeric value, null for "-" or a non-numeric value. */
  value: number | null
}

export interface SpecTyre {
  axle: string
  size: string
  /** Overall diameter computed from the ISO size: rim × 25.4 + 2 × width × aspect. */
  diameter: number
  width: number
}

export interface ManSpec {
  model: string | null
  manCode: string | null
  drive: string | null
  /** e.g. TM; description e.g. "komfortní (úzká, dlouhá, středně vysoká)". */
  cab: { code: string; description: string } | null
  /** "Rozvor kol" (front axle → first rear axle). */
  wheelbase: number | null
  td: Record<string, TdValue>
  tyres: SpecTyre[]
  fuel: { liters: number; side: Side } | null
  adblue: { liters: number; side: Side } | null
  exhaust: { side: Side; vertical: boolean; text: string } | null
  spare: { side: Side; text: string } | null
  battery: { side: Side | null; text: string } | null
  coupling: string | null
  airSuspension: string[]
  leafFront: boolean
  sideGuard: boolean
  rearGuard: boolean
  /** Technical axle loads (kg), front → rear. */
  axleLoads: number[]
}

const SIDE = (s: string): Side => (/vlevo/i.test(s) ? 'left' : 'right')
const num = (s: string) => Number(s.replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'))
const TD_VALUE = /\s(-|\d+(?:[.,]\d+)?(?:\s*x\s*\d+(?:[.,]\d+)?)*)\s*$/

/** TDxxx rows. Two-column layout: a line may hold text of the left column and a TD row of the right one. */
export function parseTd(text: string): Record<string, TdValue> {
  const out: Record<string, TdValue> = {}
  const lines = text.split(/\r?\n/)
  lines.forEach((line, i) => {
    const segs = line.split(/(?=\bTD\d{3}\s)/)
    for (const seg of segs) {
      const m = seg.match(/^TD(\d{3})\s+(.*)$/)
      if (!m) continue
      const body = m[2].trimEnd()
      const v = body.match(TD_VALUE)
      if (!v) continue
      let raw = v[1].trim()
      // "270 x 85" continued as "x 10" on the next line (frame profile)
      const next = lines[i + 1]?.trim() ?? ''
      if (/x/.test(raw) && /^x\s*\d+(?:[.,]\d+)?$/.test(next)) raw = `${raw} ${next}`
      const label = body.slice(0, body.length - v[0].length).trim()
      const code = `TD${m[1]}`
      if (out[code]) continue
      out[code] = { code, label, raw, value: raw === '-' || /x/.test(raw) ? null : Number(raw.replace(',', '.')) }
    }
  })
  return out
}

/** "385/65R22,5" → overall diameter (exact ISO math), section width. */
export function tyreFromSize(size: string): { diameter: number; width: number } | null {
  const d = tireDiameterMm(size)
  const w = size.match(/^(\d{3})/)
  return d && w ? { diameter: Math.round(d * 10) / 10, width: Number(w[1]) } : null
}

export function parseManSpec(text: string): ManSpec {
  const flat = text.replace(/[ \t]+/g, ' ')
  const get = (re: RegExp) => flat.match(re)
  const td = parseTd(text)
  const model = get(/Popis variant\w*\s+(.+?)\s*$/m)?.[1] ?? get(/Popis vozidla pro:\s*(.+?)\s*$/m)?.[1] ?? null
  const cabM = get(/Kabina řidiče ([A-Z]{2}):\s*([^\n]*?(?:\)|$))/m)
  let cabDesc = cabM?.[2]?.trim() ?? ''
  if (cabM && !cabDesc.includes(')') && cabDesc.includes('(')) {
    // description wrapped onto the next line
    const after = flat.slice(flat.indexOf(cabM[0]) + cabM[0].length).split('\n')[1]?.trim() ?? ''
    cabDesc = `${cabDesc} ${after.split(/\s{2,}| TD\d/)[0]}`.trim()
  }
  const wb = get(/Rozvor kol\s+(\d[\d .]*?)\s*mm/) ?? get(/([\d.]+) mm hlavní rozvor\s*$/m)
  const tyres: SpecTyre[] = []
  for (const m of flat.matchAll(/Pneumatiky ((?:\d\. )?(?:přední|zadní) nápravy)\s.*?(\d{3}\/\d{2}\s*R\s*\d{2}(?:[.,]\d)?)/g)) {
    const t = tyreFromSize(m[2])
    if (t && !tyres.some((x) => x.axle === m[1])) tyres.push({ axle: m[1], size: m[2].replace(/\s/g, ''), ...t })
  }
  const fuel = get(/(\d+) l objem nádrže, palivová nádrž, (vlevo|vpravo)/)
  const ad = get(/(\d+) l objem nádrže, zásobník AdBlue, (vlevo|vpravo)/)
  const ex = get(/(Tlumič výfuku, [^\n]*?(vlevo|vpravo))/)
  const vertical = /Výfuk[^\n]*svisl/i.test(flat)
  const spare = get(/(Držák rezervního kola, [^\n]*?(vlevo|vpravo)[^\n]*?)(?:\s{2,}|\s0P\w{3}|$)/m)
  const batSide = get(/Prostor baterií, (vlevo|vpravo)/)
  const batBox = get(/(Prostor baterií, [^\n]*?\d baterie)/) ?? get(/(\d baterie, 12 V, \d+ Ah)/)
  const coup = get(/(Spojka pro připojení přívěsu[^\n]*?)(?:\s0P\w{3}|\s*$)/m)
  const air = [...flat.matchAll(/Pneumatické pérování na ((?:\d\. )?(?:přední|zadní) nápravě)/g)].map((m) => m[1])
  return {
    model: model?.trim() ?? null,
    manCode: get(/Kód MAN\s+(\S+)/)?.[1] ?? null,
    drive: get(/Druh pohonu:\s*(\d+x\d+(?:\/\d+)?(?:-\d)?)/)?.[1] ?? model?.match(/\b(\d+x\d+(?:\/\d+)?)\b/)?.[1] ?? null,
    cab: cabM ? { code: cabM[1], description: cabDesc } : null,
    wheelbase: wb ? num(wb[1]) : null,
    td,
    tyres,
    fuel: fuel ? { liters: Number(fuel[1]), side: SIDE(fuel[2]) } : null,
    adblue: ad ? { liters: Number(ad[1]), side: SIDE(ad[2]) } : null,
    exhaust: ex ? { side: SIDE(ex[2]), vertical, text: ex[1].trim() } : null,
    spare: spare ? { side: SIDE(spare[2]), text: spare[1].trim() } : null,
    battery: batSide || batBox ? { side: batSide ? SIDE(batSide[1]) : null, text: [batBox?.[1], batSide?.[0]].filter(Boolean).join('; ') } : null,
    coupling: coup ? coup[1].trim() : null,
    airSuspension: air,
    sideGuard: /Ochrana proti podjetí, boční/.test(flat),
    rearGuard: /Ochrana proti podjetí, zadní/.test(flat),
    axleLoads: [...flat.matchAll(/^\s*(?:Přední|Zadní) náprava(?: \d)? ([\d ]+?) kg ([\d ]+?) kg/gm)].map((m) => num(m[2])),
    leafFront: /Listov\w+ pružiny na přední nápravě/.test(flat),
  }
}

/** MAN cab code → parametric cab variant (letters per MAN: width / length / roof from the printed description). */
export function manCabVariant(code: string, description: string) {
  const d = description.toLowerCase()
  const kind: 'day' | 'sleeper' = /dlouh/.test(d) ? 'sleeper' : 'day'
  const roof = /vysok/.test(d) && !/středně/.test(d) ? 'high' : /středně/.test(d) ? 'high' : /nízk/.test(d) ? 'low' : 'normal'
  const width = /úzk/.test(d) ? 'narrow' : /širok/.test(d) ? 'wide' : null
  const length = /dlouh/.test(d) ? 'long' : /střední|středně dlouh/.test(d) ? 'medium' : /krátk|kompakt/.test(d) ? 'short' : null
  return { code, kind, roof: roof as 'low' | 'normal' | 'high', width, length }
}

export interface SpecItem { path: string; label: string; value: string; source: string }

export interface SpecImport {
  spec: ManSpec
  preset: ChassisPreset
  /** Read from the PDF (with the TD code or the spec line). */
  parsed: SpecItem[]
  /** Not in the PDF: value used and why. */
  assumptions: SpecItem[]
  warnings: string[]
}

/** Builds the configurator chassis. Throws when the essentials (axles / wheelbase) are missing. */
export function specToConfig(spec: ManSpec, fileName = 'specifikace.pdf'): SpecImport {
  const parsed: SpecItem[] = []
  const assumptions: SpecItem[] = []
  const warnings: string[] = []
  const td = (c: string) => spec.td[c]?.value ?? null
  const P = (path: string, label: string, value: number | string, source: string) => parsed.push({ path, label, value: String(value), source })
  const A = (path: string, label: string, value: number | string, source: string) => assumptions.push({ path, label, value: String(value), source })

  const extra = ['TD058', 'TD059', 'TD060'].filter((c) => (td(c) ?? 0) > 0).length
  const drive = spec.drive ?? `${(2 + extra) * 2}x${extra ? 4 : 2}`
  const [wheels] = drive.split('/')
  const [nw, nd] = wheels.split('x').map(Number)
  const axleCount = Math.max(2, Math.round(nw / 2))
  if (spec.drive) P('axles', 'Uspořádání náprav', spec.drive, 'Druh pohonu')
  else A('axles', 'Uspořádání náprav', drive, 'druh pohonu ve specifikaci chybí – počet náprav z nenulových TD058–TD060, hnané nápravy odhad')

  const wb = spec.wheelbase ?? (td('TD057') || null)
  if (!wb) throw new Error('Ve specifikaci chybí rozvor (Rozvor kol / TD057).')
  P('axles.1.position', 'Rozvor (1. náprava → 1. zadní)', wb, spec.wheelbase ? 'Rozvor kol' : 'TD057')
  // rear axle spacings: TD058 (pusher→rear), TD059 (rear→2nd rear), TD060 (rear→tag); 0 = n/a
  const spacing = ['TD058', 'TD059', 'TD060'].map((c) => ({ c, v: td(c) })).filter((s) => s.v && s.v > 0)
  const positions = [0, wb]
  for (const s of spacing) {
    if (positions.length >= axleCount) break
    positions.push(positions[positions.length - 1] + (s.v as number))
    P(`axles.${positions.length - 1}.position`, `Rozteč zadních náprav (${s.c})`, s.v as number, s.c)
  }
  if (positions.length < axleCount) throw new Error(`Specifikace ${drive} má ${axleCount} náprav, ale rozteče zadních náprav (TD058–TD060) chybí.`)

  const tyreFor = (i: number) => {
    const name = i === 0 ? 'přední nápravy' : i === 1 ? 'zadní nápravy' : `${i}. zadní nápravy`
    return spec.tyres.find((t) => t.axle === name) ?? (i > 0 ? spec.tyres.find((t) => t.axle === 'zadní nápravy') : undefined)
  }
  const drivenCount = Math.max(1, Math.round(nd / 2))
  const axles = positions.map((position, i) => {
    const t = tyreFor(i)
    const steered = i === 0
    const driven = i > 0 && i <= drivenCount
    if (t) P(`axles.${i}.tyre`, `Pneumatiky ${i + 1}. nápravy`, `${t.size} (Ø ${t.diameter} mm)`, `Pneumatiky ${t.axle}`)
    else A(`axles.${i}.tyre`, `Pneumatiky ${i + 1}. nápravy`, '315/80R22.5', 'rozměr pneu ve specifikaci chybí')
    // twin: not printed by MAN; driven rear axles with ≤ 315 mm section are twin-tyred (single 315 carries ~4 t, axle 9.5–13 t)
    const twin = driven && (t?.width ?? 315) <= 315
    A(`axles.${i}.twin`, `Dvojmontáž ${i + 1}. nápravy`, twin ? 'ano' : 'ne', 'MAN ji neuvádí – odvozeno z hnané nápravy a šířky pneu ≤ 315')
    A(`axles.${i}.track`, `Rozchod ${i + 1}. nápravy`, steered ? 2040 : 1810, 'rozchod ve specifikaci není (typická hodnota MAN)')
    return { position, steered, driven, lift: false, twin, maxLoad: spec.axleLoads[i] ?? 0, track: steered ? 2040 : 1810, tyre: t?.size.replace(',', '.') ?? '315/80R22.5' }
  })
  spec.axleLoads.forEach((l, i) => P(`axles.${i}.maxLoad`, `Technické zatížení ${i + 1}. nápravy`, l, 'Svislé zatížení'))
  const foh = td('TD063')
  const roh = td('TD064')
  if (foh == null) throw new Error('Ve specifikaci chybí přední převis TD063.')
  P('frontOverhang', 'Přední převis', foh, 'TD063')
  if (roh != null) P('rearOverhang', 'Zadní převis rámu', roh, 'TD064')
  else A('rearOverhang', 'Zadní převis rámu', 1000, 'TD064 chybí')
  const len = td('TD071')
  if (len != null) {
    const sum = foh + positions[positions.length - 1] + (roh ?? 0)
    P('length', 'Celková délka', len, 'TD071')
    if (Math.abs(len - sum) > 1) warnings.push(`TD071 ${len} mm ≠ TD063 + rozvory + TD064 = ${sum} mm (rozdíl ${len - sum} mm – přesah mimo rám, např. spojka / zadní ochrana; model kreslí rám podle TD064).`)
  }

  const wf = td('TD009'), wr = td('TD010')
  if (wf) P('frame.widthFront', 'Šířka rámu vpředu', wf, 'TD009')
  if (wr) P('frame.widthRear', 'Šířka rámu vzadu', wr, 'TD010')
  const prof = spec.td.TD078?.raw.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)(?:\s*x\s*(\d+(?:[.,]\d+)?))?/)
  if (prof) {
    P('frame.sectionHeight', 'Profil rámu – výška', prof[1], 'TD078')
    P('frame.flange', 'Profil rámu – pásnice', prof[2], 'TD078')
    if (prof[3]) P('frame.thickness', 'Profil rámu – tloušťka', prof[3], 'TD078')
  }
  const h035 = td('TD035')
  if (h035) P('frame.topHeight', 'Výška rámu (nenaložené)', h035, 'TD035')
  if (td('TD036')) parsed.push({ path: 'frame.topHeightLaden', label: 'Výška rámu (naložené)', value: String(td('TD036')), source: 'TD036 (jen informace)' })
  A('frame.taperEnd', 'Konec zúžení rámu za 1. nápravou', 900, 'poloha přechodu TD009→TD010 ve specifikaci není')
  A('frame.frontEnd', 'Začátek rámu před 1. nápravou', Math.round(foh - 430), 'čelo rámu ve specifikaci není (TD063 − 430 mm nárazník)')

  const cab = spec.cab ? manCabVariant(spec.cab.code, spec.cab.description) : null
  if (spec.cab) P('cab.style', 'Kabina', `${spec.cab.code} – ${spec.cab.description}`, 'Kabina řidiče')
  else A('cab.style', 'Kabina', 'MAN denní', 'typ kabiny ve specifikaci chybí')
  const cabW = td('TD001')
  if (cabW) P('cab.width', 'Šířka kabiny', cabW, 'TD001')
  const height = td('TD033')
  if (height) P('cab.height', 'Výška vozidla (nenaložené)', height, 'TD033')
  if (td('TD008')) parsed.push({ path: 'mirrors', label: 'Šířka přes zrcátka', value: String(td('TD008')), source: 'TD008 (jen informace)' })
  const cabBody = td('TD072')
  if (cabBody) P('cabToBody', '1. náprava → nástavba', cabBody, 'TD072')
  const back = cabBody ? cabBody - 100 : 805
  A('cab.backFromAxle', 'Zadní stěna kabiny za 1. nápravou', back, cabBody ? 'TD072 − 100 mm mezera kabina–nástavba' : 'TD072 chybí')
  A('cab.length', 'Délka kabiny', foh + back, 'TD063 + zadní stěna kabiny (délka kabiny MAN neuvádí)')

  const side = (s: Side) => (s === 'left' ? 'vlevo' : 'vpravo')
  if (spec.fuel) {
    P('fuel', 'Palivová nádrž', `${spec.fuel.liters} l, ${side(spec.fuel.side)}`, 'Nádrže')
    A('fuel.dims', 'Rozměry a poloha palivové nádrže', 'výška 620 mm, délka z objemu, za kabinou', 'rozměry/poloha ve specifikaci nejsou')
  } else A('fuel', 'Palivová nádrž', 'bez nádrže', 've specifikaci není')
  if (spec.adblue) {
    P('adblue', 'Nádrž AdBlue', `${spec.adblue.liters} l, ${side(spec.adblue.side)}`, 'Nádrže')
    A('adblue.dims', 'Rozměry a poloha AdBlue', '480 × 420 mm, délka z objemu', 'rozměry/poloha ve specifikaci nejsou')
  }
  if (spec.exhaust) {
    P('exhaust', 'Tlumič výfuku', `${spec.exhaust.vertical ? 'svislý' : 'na boku'}, ${side(spec.exhaust.side)}`, spec.exhaust.text)
    A('exhaust.dims', 'Rozměry a poloha tlumiče', '900 × 560 × 560 mm', 'rozměry/poloha ve specifikaci nejsou')
  }
  if (spec.battery) {
    if (spec.battery.side) P('battery', 'Prostor baterií', side(spec.battery.side), spec.battery.text)
    else A('battery.side', 'Strana prostoru baterií', 'vlevo', 'strana ve specifikaci není')
    A('battery.dims', 'Rozměry a poloha bateriové skříně', '760 × 480 × 560 mm', 'rozměry/poloha ve specifikaci nejsou')
  }
  if (spec.spare) {
    P('spare', 'Rezervní kolo', side(spec.spare.side), spec.spare.text)
    A('spare.pos', 'Poloha rezervního kola', /před zadní nápravou/.test(spec.spare.text) ? 'těsně před 1. zadní nápravou' : 'mezi nápravami', 'přesná poloha ve specifikaci není')
  }
  if (spec.coupling) {
    P('coupling', 'Závěs přívěsu', spec.coupling, 'Rozhraní k přívěsu')
    A('coupling.dims', 'Rozměry závěsu', 'symbolický čelist na konci rámu', 'geometrie ve specifikaci není')
  }
  if (spec.airSuspension.length) P('airSuspension', 'Vzduchové pérování', spec.airSuspension.join(', '), 'Vedení náprav a odpružení')
  if (spec.leafFront) P('leafFront', 'Přední náprava', 'listové pružiny', 'Vedení náprav a odpružení')
  A('airTanks', 'Vzduchojemy', '4 ks mezi podélníky', 've specifikaci bez polohy a rozměrů')

  const cfg: ChassisConfig = {
    make: 'man',
    series: spec.model?.match(/\b(TG[SXML]|TGE)\b/)?.[1] ?? 'TGS',
    name: `MAN ${spec.model ?? 'ze specifikace'}`,
    kind: 'rigid',
    axles,
    frontOverhang: foh,
    rearOverhang: roh ?? 1000,
    frame: {
      widthRear: wr ?? 765,
      widthFront: wf ?? wr ?? 765,
      taperEnd: 900,
      sectionHeight: prof ? Number(prof[1]) : 270,
      flange: prof ? Number(prof[2]) : 85,
      thickness: prof?.[3] ? Number(prof[3].replace(',', '.')) : 8,
      topHeight: h035 ?? 1000,
      frontEnd: Math.round(foh - 430),
    },
    gvw: td('TD018') ?? td('TD025') ?? 26000,
    gcw: td('TD031') ?? 0,
    cab: {
      style: 'man',
      kind: cab?.kind ?? 'day',
      roof: cab?.roof ?? 'normal',
      length: foh + back,
      height: height ?? 3200,
      width: cabW ?? 2240,
      backFromAxle: back,
      color: 0xd9dadb,
      code: spec.cab?.code,
    },
    fuel: spec.fuel ? { enabled: true, ...spec.fuel } : { enabled: false, liters: 0, side: 'right' },
    adblue: spec.adblue ? { enabled: true, ...spec.adblue } : { enabled: false, liters: 0, side: 'left' },
    battery: { enabled: !!spec.battery, side: spec.battery?.side ?? 'left' },
    airTanks: { enabled: true, count: 4 },
    exhaust: { kind: spec.exhaust?.vertical ? 'vertical' : 'horizontal', side: spec.exhaust?.side ?? 'right' },
    fifthWheel: { enabled: false, lead: 0, height: 1250 },
    sideGuards: spec.sideGuard,
    rearUnderrun: spec.rearGuard,
    mudguards: true,
    spare: spec.spare ? { enabled: true, side: spec.spare.side, beforeRear: /před zadní nápravou/.test(spec.spare.text), diameter: tyreFor(1)?.diameter } : undefined,
    coupling: !!spec.coupling,
    airSuspension: spec.airSuspension.length > 0,
  }
  if (td('TD018')) P('gvw', 'Celková hmotnost', td('TD018')!, 'TD018')
  if (td('TD031')) P('gcw', 'Hmotnost soupravy', td('TD031')!, 'TD031')
  if (td('TD026')) parsed.push({ path: 'mass', label: 'Hmotnost podvozku', value: String(td('TD026')), source: 'TD026 (jen informace)' })

  // Every config leaf that is not in `parsed` is approximate (≈ in the configurator form).
  const exact = new Set(['make', 'series', 'name', 'kind', 'cab.style', 'cab.kind', 'cab.roof', 'cab.color', 'cab.code', 'fifthWheel.enabled', 'fifthWheel.lead', 'fifthWheel.height', 'gvw', 'gcw', 'mudguards', 'rearUnderrun', 'sideGuards'])
  for (const p of parsed) exact.add(p.path)
  axles.forEach((_, i) => { exact.add(`axles.${i}.steered`); exact.add(`axles.${i}.driven`); exact.add(`axles.${i}.lift`); exact.add(`axles.${i}.maxLoad`); if (spec.tyres.length) exact.add(`axles.${i}.tyre`) })
  if (spec.fuel) { exact.add('fuel.enabled'); exact.add('fuel.liters'); exact.add('fuel.side') }
  if (spec.adblue) { exact.add('adblue.enabled'); exact.add('adblue.liters'); exact.add('adblue.side') }
  if (spec.battery?.side) { exact.add('battery.enabled'); exact.add('battery.side') }
  if (spec.exhaust) { exact.add('exhaust.kind'); exact.add('exhaust.side') }
  const approx = leafPaths(cfg).filter((p) => !exact.has(p))

  const preset: ChassisPreset = {
    id: `spec-${spec.manCode ?? 'man'}`,
    make: 'man',
    series: cfg.series,
    label: `ze specifikace: ${spec.model ?? fileName}`,
    wheelbases: [wb],
    wheelbaseRef: 'firstRear',
    source: `Specifikace MAN (PDF ${fileName}${spec.manCode ? `, kód ${spec.manCode}` : ''})`,
    config: cfg,
    approx,
  }
  return { spec, preset, parsed, assumptions, warnings }
}

function leafPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return prefix ? [prefix] : []
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => leafPaths(v, prefix ? `${prefix}.${k}` : k))
}

export function isManSpecText(text: string): boolean {
  return /\bTD0\d{2}\b/.test(text) && /MAN/.test(text)
}

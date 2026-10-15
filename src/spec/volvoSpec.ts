/**
 * Volvo "Technická specifikace" (bullet list). Its PDF font drops some glyphs: "á" comes out as a space or nothing
 * and "fi" as "R" ("Technick speciRkace", "n prava"). Patterns are therefore written through `rx`, which tolerates both.
 */
import { dimSet } from './manSpec'
import { SIDE, emptySpec, specTyre, type SpecAxle, type SpecData } from './specModel'

/** Pattern text → RegExp tolerant to the lost "á" / "ý" glyphs and the "fi" → "R" ligature. */
export function rx(src: string, flags = 'm'): RegExp {
  return new RegExp(src.replace(/fi/g, '(?:fi|R)').replace(/á/g, '[á ]?'), flags)
}
const n = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'))
const t2kg = (s: string) => Math.round(n(s) * 1000)

export function isVolvoSpecText(text: string): boolean {
  return /Volvo Group|volvotrucks/i.test(text) && /Technick\S* ?speci(?:fi|R)?kace/.test(text)
}

export function parseVolvoSpec(text: string): SpecData {
  const flat = text.replace(/[ \t]+/g, ' ')
  const get = (src: string) => flat.match(rx(src))
  const spec = emptySpec('volvo')
  const model = flat.match(/^\s*((?:FH|FM|FMX|FE|FL)\d*\s.*?(?:Rigid|Tractor).*?)\s*$/m)?.[1] ?? null
  spec.model = model
  spec.series = model?.match(/^(FMX|FH16|FH|FM|FE|FL)/)?.[1]?.replace('FH16', 'FH') ?? null
  const cfg = model?.match(/\b(\d)(\d)\b/) // "62" = 6x2
  const tag = /Tag Axle/i.test(model ?? '') || !!get('Vlečen. n.?prava')
  const pusher = /Pusher/i.test(model ?? '')
  if (cfg) spec.drive = `${cfg[1]}x${cfg[2]}`
  spec.code = null

  const cab = get('(Denní|Spací|Prodloužená denní|Globetrotter[^\\n]*?) kabina (FH|FM|FMX)')
  if (cab) spec.cab = { code: `${cab[2]} ${cab[1].toLowerCase()}`, description: cab[0].trim(), kind: /Spací|Globe/.test(cab[1]) ? 'sleeper' : 'day', roof: /Globetrotter XL/i.test(cab[1]) ? 'high' : 'normal', source: 'Hlavní komponenty' }

  const wb = get('Rozvor (\\d[\\d ]*) mm')
  dimSet(spec, 'wheelbase', wb ? n(wb[1]) : null, 'Rozvor')
  const roh = get('Délka zadního převisu (\\d[\\d ]*) mm')
  dimSet(spec, 'rearOverhang', roh ? n(roh[1]) : null, 'Délka zadního převisu')
  const prof = get('Pro(?:fi|R)l r.?mu (\\d+) mm')
  dimSet(spec, 'frameSection', prof ? n(prof[1]) : null, 'Profil rámu')
  const th = get('Tloušťka r.?mu (\\d+(?:[.,]\\d+)?) mm')
  dimSet(spec, 'frameThickness', th ? n(th[1]) : null, 'Tloušťka rámu')
  const hi = get('podvozek, cca (\\d+) mm')
  dimSet(spec, 'frameTop', hi ? n(hi[1]) : null, `${get('(\\S+ podvozek), cca')?.[1] ?? 'Podvozek'}, cca`, true)
  const vh = get('Výška vozidla do (\\d+(?:[.,]\\d+)?) m')
  dimSet(spec, 'vehicleHeight', vh ? Math.round(n(vh[1]) * 1000) : null, 'Výška vozidla do (max.)', true)
  const body = get('šířku n.?stavby (\\d+) mm')
  if (body) spec.notes.push({ label: 'Šířka nástavby', value: `${body[1]} mm`, source: 'Použití vozidla' })
  const gcw = get('Hmotnost soupravy (\\d+) tun')
  dimSet(spec, 'gcw', gcw ? n(gcw[1]) * 1000 : null, 'Hmotnost soupravy')
  const cpl = get('Vzd.?lenost tažné příčky od konce r.?mu (\\d+) mm')
  dimSet(spec, 'couplingFromEnd', cpl ? n(cpl[1]) : null, 'Vzdálenost tažné příčky od konce rámu')

  // Axles: front, drive, then tag (or pusher before the drive axle – not handled: listed order front, drive, tag).
  const front: SpecAxle = { role: 'front' }
  const driveAx: SpecAxle = { role: 'drive' }
  const axles: SpecAxle[] = pusher ? [front, { role: 'pusher' }, driveAx] : [front, driveAx]
  if (tag && !pusher) axles.push({ role: 'tag' })
  const tf = get('Přední n.?prava, (\\d{3}/\\d{2}R\\d{2}(?:[.,]\\d)?)')
  if (tf) front.tyre = specTyre(tf[1], 'Přední náprava')
  const td = get('Hnací n.?prava, (\\d{3}/\\d{2}R\\d{2}(?:[.,]\\d)?)')
  if (td) driveAx.tyre = specTyre(td[1], 'Hnací náprava')
  const tt = get('Vlečen.? n.?prava, (\\d{3}/\\d{2}R\\d{2}(?:[.,]\\d)?)')
  const tagAx = axles.find((a) => a.role === 'tag' || a.role === 'pusher')
  if (tagAx && tt) tagAx.tyre = specTyre(tt[1], 'Vlečená náprava')
  const fl = get('Zatížení přední n.?pravy (\\d+(?:[.,]\\d+)?) t')
  if (fl) front.load = { value: t2kg(fl[1]), source: 'Zatížení přední nápravy' }
  const tl = get('Zatížení vlečen.? n.?pravy (\\d+(?:[.,]\\d+)?) tun')
  if (tagAx && tl) tagAx.load = { value: t2kg(tl[1]), source: 'Zatížení vlečené nápravy' }
  const dl = get('Omezovač zatížení hnací n.?pravy (\\d+(?:[.,]\\d+)?) t')
  const rl = get('Zatížení zadních n.?prav (\\d+(?:[.,]\\d+)?) t')
  if (dl) driveAx.load = { value: t2kg(dl[1]), source: 'Omezovač zatížení hnací nápravy' }
  else if (rl && tagAx?.load) driveAx.load = { value: t2kg(rl[1]) - tagAx.load.value, source: 'Zatížení zadních náprav − vlečená' }
  if (rl) spec.notes.push({ label: 'Zatížení zadních náprav', value: `${t2kg(rl[1])} kg`, source: 'Provedení podvozku' })
  const tagLine = get('Vlečen.? n.?prava, (jednomont.?ž|dvojmont.?ž)[^\\n]*')
  if (tagAx && tagLine) {
    tagAx.twin = { value: /dvoj/.test(tagLine[1]), source: tagLine[0].trim() }
    tagAx.steered = /řízen/.test(tagLine[0])
  }
  if (tagAx && get('zvedací n.?pravy')) tagAx.lift = true
  spec.axles = axles
  if (front.load && driveAx.load && tagAx?.load) dimSet(spec, 'gvw', front.load.value + driveAx.load.value + tagAx.load.value, 'součet zatížení náprav')

  const fuel = get('(Prav|Lev)á? n.?drž (\\d+) L')
  if (fuel) spec.fuel = { liters: Number(fuel[2]), side: SIDE(fuel[1]), source: fuel[0].trim() }
  const adSide = get('AdBlue n.?drž (vlevo|vpravo)')
  const adVol = get('AdBlue n.?drž (\\d+) litrů(?: \\((\\d+) mm\\))?')
  if (adVol) spec.adblue = { liters: Number(adVol[1]), side: adSide ? SIDE(adSide[1]) : 'left', source: [adVol[0], adSide?.[0]].filter(Boolean).join('; ') }
  if (adVol?.[2]) spec.notes.push({ label: 'AdBlue rozměr', value: `${adVol[2]} mm (není jasné, který rozměr)`, source: adVol[0].trim() })
  const ex = get('(Horizont.?lní|Vertik.?lní|Svisl[^ ]*) tlumič výfuku[^\\n]*')
  if (ex) spec.exhaust = { side: /vlevo|levé/.test(ex[0]) ? 'left' : /vpravo|pravé/.test(ex[0]) ? 'right' : null, vertical: !/Horizont/.test(ex[1]), text: ex[0].trim() }
  const bat = get('Schr.?nka na akumul.?tory na (levé|pravé) straně')
  const batN = get('Baterie AGM, (\\d x \\d+ Ah)')
  if (bat || batN) spec.battery = { side: bat ? SIDE(bat[1]) : null, text: [bat?.[0], batN?.[0]].filter(Boolean).join('; ') }
  const cp = get('Tažné zařízení ([^\\n]+?)\\s*$')
  spec.coupling = cp ? cp[1].trim() : null
  const spare = get('(Drž.?k rezervního kola[^\\n]*)')
  if (spare) spec.spare = { side: /vlevo|lev/.test(spare[1]) ? 'left' : 'right', text: spare[1].trim(), beforeRear: /před/.test(spare[1]) }
  if (get('Vzduchové odpružení|Vzduchové pérov.?ní')) spec.airSuspension = ['zadní nápravy']
  spec.leafFront = !!get('Přední n.?prava odpružen.? parabolickými pery')
  spec.rearGuard = get('zadní ochrana proti podjetí|Zadní ochrana proti podjetí') ? true : null
  spec.sideGuard = get('Boční ochrana proti podjetí') ? true : null
  return spec
}

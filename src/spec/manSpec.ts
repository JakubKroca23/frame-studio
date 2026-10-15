/**
 * MAN "Popis vozidla" specification (PDF text) → configurator chassis.
 * Only values printed in the specification are taken as measured. Everything the specification does not
 * contain (component positions along the frame, tank dimensions, track, cab length…) is an explicit
 * assumption with a reason and is listed in the UI. Nothing else is invented.
 */
import { SIDE, emptySpec, specTyre, type SpecAxle, type SpecData } from './specModel'
export { specToConfig, tyreFromSize, type SpecImport } from './specModel'

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

export function parseManSpec(text: string): SpecData {
  const flat = text.replace(/[ \t]+/g, ' ')
  const get = (re: RegExp) => flat.match(re)
  const td = parseTd(text)
  const tv = (c: string) => td[c]?.value ?? null
  const spec = emptySpec('man')
  const model = get(/Popis variant\w*\s+(.+?)\s*$/m)?.[1] ?? get(/Popis vozidla pro:\s*(.+?)\s*$/m)?.[1] ?? null
  spec.model = model?.trim() ?? null
  spec.series = spec.model?.match(/\b(TG[SXML])\b/)?.[1] ?? 'TGS'
  spec.code = get(/Kód MAN\s+(\S+)/)?.[1] ?? null
  const cabM = get(/Kabina řidiče ([A-Z]{2}):\s*([^\n]*?(?:\)|$))/m)
  let cabDesc = cabM?.[2]?.trim() ?? ''
  if (cabM && !cabDesc.includes(')') && cabDesc.includes('(')) {
    const after = flat.slice(flat.indexOf(cabM[0]) + cabM[0].length).split('\n')[1]?.trim() ?? ''
    cabDesc = `${cabDesc} ${after.split(/\s{2,}| TD\d/)[0]}`.trim()
  }
  if (cabM) { const v = manCabVariant(cabM[1], cabDesc); spec.cab = { code: cabM[1], description: cabDesc, kind: v.kind, roof: v.roof, source: 'Kabina řidiče' } }

  const set = (k: Parameters<typeof dimSet>[1], v: number | null, source: string) => dimSet(spec, k, v, source)
  const wb = get(/Rozvor kol\s+(\d[\d .]*?)\s*mm/)
  set('wheelbase', wb ? num(wb[1]) : tv('TD057') || null, wb ? 'Rozvor kol' : 'TD057')
  const sp = ['TD058', 'TD059', 'TD060'].find((c) => (tv(c) ?? 0) > 0)
  if (sp) set('spacing2', tv(sp), sp)
  set('frontOverhang', tv('TD063'), 'TD063')
  set('rearOverhang', tv('TD064'), 'TD064')
  set('length', tv('TD071'), 'TD071')
  set('frameWidthFront', tv('TD009'), 'TD009')
  set('frameWidthRear', tv('TD010'), 'TD010')
  const prof = td.TD078?.raw.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)(?:\s*x\s*(\d+(?:[.,]\d+)?))?/)
  if (prof) { set('frameSection', Number(prof[1]), 'TD078'); set('frameFlange', Number(prof[2]), 'TD078'); if (prof[3]) set('frameThickness', Number(prof[3].replace(',', '.')), 'TD078') }
  set('frameTop', tv('TD035'), 'TD035')
  set('frameTopLaden', tv('TD036'), 'TD036')
  set('cabWidth', tv('TD001'), 'TD001')
  set('vehicleHeight', tv('TD033'), 'TD033')
  set('cabToBody', tv('TD072'), 'TD072')
  set('mirrors', tv('TD008'), 'TD008')
  set('gvw', tv('TD018'), 'TD018')
  set('gcw', tv('TD031'), 'TD031')
  set('mass', tv('TD026'), 'TD026')

  spec.drive = get(/Druh pohonu:\s*(\d+x\d+(?:\/\d+)?(?:-\d)?)/)?.[1] ?? spec.model?.match(/\b(\d+x\d+(?:\/\d+)?)\b/)?.[1] ?? null
  const extra = sp ? 1 : 0
  const drive = spec.drive ?? `${(2 + extra) * 2}x${extra ? 4 : 2}`
  const [nw, nd] = drive.split('/')[0].split('x').map(Number)
  const count = Math.max(2, Math.round(nw / 2))
  const driven = Math.max(1, Math.round(nd / 2))
  const loads = [...flat.matchAll(/^\s*(?:Přední|Zadní) náprava(?: \d)? ([\d ]+?) kg ([\d ]+?) kg/gm)].map((m) => num(m[2]))
  const tyres = new Map<string, string>()
  for (const m of flat.matchAll(/Pneumatiky ((?:\d\. )?(?:přední|zadní) nápravy)\s.*?(\d{3}\/\d{2}\s*R\s*\d{2}(?:[.,]\d)?)/g)) if (!tyres.has(m[1])) tyres.set(m[1], m[2])
  for (let i = 0; i < count; i++) {
    const name = i === 0 ? 'přední nápravy' : i === 1 ? 'zadní nápravy' : `${i}. zadní nápravy`
    const size = tyres.get(name) ?? (i > 0 ? tyres.get('zadní nápravy') : undefined)
    const ax: SpecAxle = { role: i === 0 ? 'front' : i <= driven ? 'drive' : 'tag' }
    if (size) ax.tyre = specTyre(size, `Pneumatiky ${tyres.has(name) ? name : 'zadní nápravy'}`)
    if (loads[i]) ax.load = { value: loads[i], source: 'Svislé zatížení (technické)' }
    spec.axles.push(ax)
  }
  if (!spec.drive && count > 2) spec.notes.push({ label: 'Uspořádání náprav', value: drive, source: 'odvozeno z nenulových TD058–TD060' })

  const fuel = get(/(\d+) l objem nádrže, palivová nádrž, (vlevo|vpravo)/)
  if (fuel) spec.fuel = { liters: Number(fuel[1]), side: SIDE(fuel[2]), source: 'Nádrže' }
  const ad = get(/(\d+) l objem nádrže, zásobník AdBlue, (vlevo|vpravo)/)
  if (ad) spec.adblue = { liters: Number(ad[1]), side: SIDE(ad[2]), source: 'Nádrže' }
  const ex = get(/(Tlumič výfuku, [^\n]*?(vlevo|vpravo))/)
  if (ex) spec.exhaust = { side: SIDE(ex[2]), vertical: /Výfuk[^\n]*svisl/i.test(flat), text: ex[1].trim() }
  const spare = get(/(Držák rezervního kola, [^\n]*?(vlevo|vpravo)[^\n]*?)(?:\s{2,}|\s0P\w{3}|$)/m)
  if (spare) spec.spare = { side: SIDE(spare[2]), text: spare[1].trim(), beforeRear: /před zadní nápravou/.test(spare[1]) }
  const batSide = get(/Prostor baterií, (vlevo|vpravo)/)
  const batBox = get(/(Prostor baterií, [^\n]*?\d baterie)/) ?? get(/(\d baterie, 12 V, \d+ Ah)/)
  if (batSide || batBox) spec.battery = { side: batSide ? SIDE(batSide[1]) : null, text: [batBox?.[1], batSide?.[0]].filter(Boolean).join('; ') }
  spec.coupling = get(/(Spojka pro připojení přívěsu[^\n]*?)(?:\s0P\w{3}|\s*$)/m)?.[1].trim() ?? null
  spec.airSuspension = [...flat.matchAll(/Pneumatické pérování na ((?:\d\. )?(?:přední|zadní) nápravě)/g)].map((m) => m[1])
  spec.leafFront = /Listov\w+ pružiny na přední nápravě/.test(flat)
  if (/Ochrana proti podjetí/.test(flat)) {
    spec.sideGuard = /Ochrana proti podjetí, boční/.test(flat)
    spec.rearGuard = /Ochrana proti podjetí, zadní/.test(flat)
  }
  return spec
}

export function dimSet(spec: SpecData, k: keyof SpecData['dims'], v: number | null | undefined, source: string, approx = false) {
  if (v != null && Number.isFinite(v) && v > 0 && !spec.dims[k]) spec.dims[k] = { value: v, source, ...(approx ? { approx } : {}) }
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

export function isManSpecText(text: string): boolean {
  return /\bTD0\d{2}\b/.test(text) && /MAN/.test(text)
}

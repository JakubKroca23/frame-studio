/** DAF "Specifikace … Podvozek" (dealer text, NAPA format): prose bullets, dimensions inside sentences. */
import { dimSet } from './manSpec'
import { SIDE, emptySpec, specTyre, type SpecAxle, type SpecData } from './specModel'

const n = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'))
const tkg = (s: string) => Math.round(n(s) * 1000)

export function isDafSpecText(text: string): boolean {
  return /Specifikace (XF|XG\+?|XD|XDC|CF|LF|XFC)\b/.test(text) || /\bDAF\b.*(Podvozek|Tahač)/s.test(text)
}

export function parseDafSpec(text: string): SpecData {
  // sentences wrap across lines: join to one string, keep "-  " bullets as separators
  const flat = text.replace(/[ \t]+/g, ' ').replace(/\n(?!\s*-\s)/g, ' ')
  const get = (re: RegExp) => flat.match(re)
  const spec = emptySpec('daf')
  const head = get(/Specifikace ((XF|XG\+?|XD|XDC|CF|LF|XFC) \d+ \w+ (\d)X(\d)(?:\/\d)? [^\s-]+)/)
  spec.model = head?.[1] ?? null
  spec.series = head?.[2]?.replace('+', '').replace('XDC', 'XD').replace('XFC', 'XF') ?? null
  if (head) spec.drive = `${head[3]}x${head[4]}`
  spec.code = head ? head[1].split(' ').slice(0, 3).join('-') : null

  const cab = get(/(Space Cab|Sleeper High Cab|Sleeper Cab|Day Cab|Super Space Cab|Comfort Cab|Space Cab)/)
  if (cab) spec.cab = { code: cab[1], description: cab[1], kind: /Sleeper|Space/.test(cab[1]) ? 'sleeper' : 'day', roof: /High|Super Space/.test(cab[1]) ? 'high' : 'normal', source: 'Kabina - exteriér' }
  const cl = get(/Délka kabiny: (\d+) mm/)
  dimSet(spec, 'cabLength', cl ? n(cl[1]) : null, 'Délka kabiny')
  const cw = get(/šířka kabiny: (\d+) mm/)
  dimSet(spec, 'cabWidth', cw ? n(cw[1]) : null, 'Šířka kabiny')
  const wb = get(/Rozvor (\d+(?:,\d+)?) m \/ zadní převis (\d+(?:,\d+)?) ?m/)
  if (wb) { dimSet(spec, 'wheelbase', Math.round(n(wb[1]) * 1000), 'Rozvor … m'); dimSet(spec, 'rearOverhang', Math.round(n(wb[2]) * 1000), 'zadní převis … m') }
  const rail = get(/Podélný nosník, výška (\d+) mm, tloušťka (\d+(?:,\d+)?) mm/)
  if (rail) { dimSet(spec, 'frameSection', n(rail[1]), 'Podélný nosník, výška'); dimSet(spec, 'frameThickness', n(rail[2]), 'Podélný nosník, tloušťka') }
  const fh = get(/palivová nádrž na (levé|pravé) straně, výška (\d+) mm/)
  dimSet(spec, 'fuelHeight', fh ? n(fh[2]) : null, 'Palivová nádrž, výška')
  const gvw = get(/max\. CHV (\d[\d ]*) kg/)
  dimSet(spec, 'gvw', gvw ? n(gvw[1]) : null, 'technická max. CHV')
  const gcw = get(/S hnací soust\. souv\. max\. CHJS (\d[\d ]*) kg/)
  dimSet(spec, 'gcw', gcw ? n(gcw[1]) : null, 'max. CHJS (hnací soustava)')

  const tyre = (re: RegExp, src: string) => { const m = get(re); return m ? specTyre(m[1], src) : undefined }
  const front: SpecAxle = { role: 'front', tyre: tyre(/Přední náprava\(-y\): rozměr pneumatik (\d{3}\/\d{2}R\d{2}(?:[.,]\d)?)/, 'Přední náprava(-y): rozměr pneumatik') }
  const drive: SpecAxle = { role: 'drive', tyre: tyre(/Hnaná zadní náprava \(nápravy\): rozměr pneumatik (\d{3}\/\d{2}R\d{2}(?:[.,]\d)?)/, 'Hnaná zadní náprava: rozměr pneumatik') }
  const axles: SpecAxle[] = [front, drive]
  const hasTag = /vlečen/i.test(flat)
  const count = spec.drive ? Number(spec.drive[0]) / 2 : hasTag ? 3 : 2
  let tag: SpecAxle | undefined
  if (count > 2) {
    tag = { role: 'tag', tyre: tyre(/Vlečená náprava, rozměr pneumatik (\d{3}\/\d{2}R\d{2}(?:[.,]\d)?)/, 'Vlečená náprava, rozměr pneumatik') }
    tag.steered = /řízen\w* zadní vlečen/.test(flat)
    tag.lift = /Zvedací zařízení pro [^.]*vlečen/.test(flat)
    axles.push(tag)
  }
  const fl = get(/Přední náprava typu [^.]*\.[^-]*?Maximální zatížení (\d+(?:,\d+)?) t/)
  if (fl) front.load = { value: tkg(fl[1]), source: 'Přední náprava – maximální zatížení' }
  const tl = get(/Zatížení vlečené nápravy (\d+(?:,\d+)?) t/)
  if (tag && tl) tag.load = { value: tkg(tl[1]), source: 'Zatížení vlečené nápravy' }
  const group = get(/Max\. zatížení skupiny: (\d+(?:,\d+)?) t/)
  if (group) {
    spec.notes.push({ label: 'Zatížení skupiny zadních náprav', value: `${tkg(group[1])} kg`, source: 'Odpružení a nápravy' })
    if (tag?.load) drive.load = { value: tkg(group[1]) - tag.load.value, source: 'zatížení skupiny − vlečená' }
  }
  const lim = get(/Omezovač zatížení nápravy (\d+(?:,\d+)?) t/)
  if (lim) spec.notes.push({ label: 'Omezovač zatížení nápravy', value: `${tkg(lim[1])} kg`, source: 'Odpružení a nápravy' })
  spec.axles = axles

  const fuel = get(/(\d+) litrová [^-]*?palivová nádrž na (levé|pravé) straně/)
  if (fuel) spec.fuel = { liters: Number(fuel[1]), side: SIDE(fuel[2]), source: fuel[0].trim() }
  const ad = get(/(\d+)litrová nádrž kapaliny AdBlue\S* umístěná nad (levým|pravým) blatníkem/)
  if (ad) spec.adblue = { liters: Number(ad[1]), side: SIDE(ad[2]), source: ad[0].trim() }
  const exSide = get(/Vyústění výfuku (vlevo|vpravo)/)
  const exUnit = get(/Vodorovné vyústění výfuku[^-]*/)
  if (exSide || exUnit) spec.exhaust = { side: exSide ? SIDE(exSide[1]) : null, vertical: false, text: [exUnit?.[0]?.trim(), exSide?.[0]].filter(Boolean).join('; ') }
  const bat = get(/skříň akumulátoru na (levé|pravé) straně/)
  const batN = get(/akumulátory (\d+x ?\d+ Ah)/)
  if (bat || batN) spec.battery = { side: bat ? SIDE(bat[1]) : null, text: [bat?.[0], batN?.[0]].filter(Boolean).join('; ') }
  const spare = get(/Držák náhradního kola (pravá|levá) strana/)
  if (spare) spec.spare = { side: SIDE(spare[1]), text: spare[0], beforeRear: false }
  const cp = get(/Příčník se závěsným zařízením pro přívěs ([^:]+): ([^-]*?kN)/)
  spec.coupling = cp ? `${cp[1].trim()} (${cp[2].trim()})` : null
  if (/vzduchovým odpružením/.test(flat)) spec.airSuspension = ['hnaná a vlečená náprava']
  spec.leafFront = /parabolickými pružinami|Přední parabolické odpružení/.test(flat)
  if (/Přední ochrana proti podjetí/.test(flat) || /zadní ochran/i.test(flat)) spec.rearGuard = /Zadní ochrana proti podjetí/i.test(flat) ? true : null
  return spec
}

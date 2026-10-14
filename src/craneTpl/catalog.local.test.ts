/**
 * Generates src/trw/craneCatalog.json from the HIAB exterior drawings (local files, not in the repo).
 * Run: CRANE_CATALOG=1 npx vitest run src/craneTpl/catalog.local.test.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { CRANE_DEFS, type CatalogEntry } from '../trw/craneKinematics'
import { readCraneSheet, type CraneSheet } from './sheet'
import { TEMPLATE_MEASURES } from './template'

const D = '/home/box/Downloads/', W = '/workspace/crane/dr/'
const E142 = [`${W}iX. 142 HiPro GD-E-ES-1-3 464-0807.dxf`, `${W}iX. 142 HiPro GD-E-ES-4-5 464-0808.dxf`]
const DDS = [`${D}eX. 142 HIPRO GD-D-DS-1-3 465-1105.dxf`, `${D}eX. 142 HIPRO GD-D-DS-4-5 465-1106.dxf`]
type Spec = { model: string; line: 'eX' | 'iX'; series: string; booms: string; sheets: string[]; note?: string }
export const SPECS: Spec[] = [
  { model: '142', line: 'eX', series: 'HiPro', booms: 'B/BS', sheets: [`${D}eX. 142 HIPRO GD-B-BS 464-0805.dxf`] },
  { model: '142', line: 'eX', series: 'HiPro', booms: 'BSS', sheets: [`${D}eX. 142 HIPRO GD-BSS 464-0806.dxf`] },
  { model: '142', line: 'eX', series: 'HiPro', booms: 'D/DS', sheets: DDS },
  { model: '162', line: 'eX', series: 'HiPro', booms: 'E/ES', sheets: E142, note: 'výkresy 464-0807/0808 platí pro 128–162' },
  { model: '162', line: 'eX', series: 'HiPro', booms: 'B/BS', sheets: [`${D}eX. 162 HIPRO GD-B_BS 1-3 462-4906_drw.dxf`] },
  { model: '162', line: 'eX', series: 'HiPro', booms: 'BSS', sheets: [`${D}eX. 162 HIPRO GD-BSS -2 462-4922_drw.dxf`] },
  { model: '162', line: 'eX', series: 'HiPro', booms: 'D/DS', sheets: DDS },
  { model: '148', line: 'iX', series: 'Duo', booms: 'B/BS', sheets: [`${D}iX.148 DUO GD- E-ES 1-3 462-4906 drw.dxf`], note: 'soubor je pojmenován E-ES, ale je to výkres 462-4906 B/BS 1-3 (platí pro 148/158/162)' },
  { model: '192', line: 'eX', series: 'HiPro', booms: 'E/ES', sheets: [`${D}eX.192 HIPRO GD-E-ES 1-3 387-3200.dxf`, `${D}eX.192 HIPRO GD-E-ES 3-6 387-2399.dxf`] },
  { model: '188', line: 'iX', series: 'HiDuo', booms: 'B/BS', sheets: [`${D}iX.188 HIDUO GD-B-BS 1-3 466-7980 drw.dxf`, `${D}iX.188 HIDUO GD-B_BS 3-4 466-7981 drw.dxf`] },
  { model: '188', line: 'iX', series: 'HiDuo', booms: 'E/ES', sheets: [`${D}iX.188 HIDUO GD-E_ES 1-3 466-7982 drw.dxf`, `${D}iX.188 HIDUO GD-E_ES 3-6 466-7983 drw.dxf`] },
  { model: '228', line: 'iX', series: 'HiDuo', booms: 'B/BS', sheets: [`${D}iX.228 HIDUO GD-B_BS 1-3 466-7975 drw.dxf`, `${D}iX.228 HIDUO GD- B-BS 3-4 466-7976 drw.dxf`] },
  { model: '228', line: 'iX', series: 'HiDuo', booms: 'E/ES', sheets: [`${D}iX.228 HIDUO GD- E-ES 1-3 466-7977 drw.dxf`, `${D}iX.228 HIDUO GD- E-ES 3-6 466-7978 drw.dxf`] },
  { model: '232', line: 'eX', series: 'HiPro', booms: 'E/ES', sheets: [`${D}eX.232 HIPRO GD- E-ES 1-3 387-6560 drw.dxf`, `${D}eX.232 HIPRO GD- E-ES 3-6 454-0176 drw.dxf`] },
  { model: '225L', line: 'iX', series: 'HiDuo', booms: 'DL/DLL', sheets: [`${D}iX.225L HIDUO GD- DL-DLL 1-3 466-7989 drw.dxf`] },
  { model: '235L', line: 'eX', series: 'HiPro', booms: 'DL/DLL', sheets: [`${D}eX.235L HIPRO GD- 455-8760_drw.dxf`] },
  { model: '262', line: 'eX', series: 'HiPro', booms: 'E', sheets: [`${D}eX.262 HIPRO GD-E-466-4147_drw_1.dxf`] },
  { model: '262', line: 'eX', series: 'HiPro', booms: 'EP', sheets: [`${D}eX.262 HIPRO GD-EP-466-4146_drw.dxf`] },
  { model: '302', line: 'eX', series: 'HiPro', booms: 'E', sheets: [`${D}eX.302 HIPRO GD-E 466-4147 drw.dxf`] },
  { model: '302', line: 'eX', series: 'HiPro', booms: 'EP', sheets: [`${D}eX.302 HIPRO GD-EP 466-4146 drw_1.dxf`] },
]

const TOL = 0.02
/** Larger cranes (≥ 22 t·m class: 225L, 228, 232, 235L, 262, 302) use the 408 template, the rest the 142. */
const templateFor = (model: string): '142' | '408' => (Number.parseInt(model, 10) >= 220 ? '408' : '142')

it('crane catalog from drawings', () => {
  if (!process.env.CRANE_CATALOG || !existsSync(D)) return
  const cache = new Map<string, CraneSheet>()
  const read = (f: string) => { if (!cache.has(f)) cache.set(f, readCraneSheet(new TextDecoder('windows-1252').decode(readFileSync(f)))); return cache.get(f)! }
  const entries: CatalogEntry[] = []
  const skipped: string[] = []
  for (const sp of SPECS) {
    const sheets = sp.sheets.map((f) => ({ f: f.split('/').pop()!, s: read(f) }))
    const tag = `${sp.line}.${sp.model} ${sp.booms}`
    const bad = sheets.filter((x) => !x.s.isCrane || !x.s.variants.length)
    for (const b of bad) skipped.push(`${tag}: ${b.f} — ve výkresu není tabulka dosahů 1-3 OUTREACH (${b.s.scale.label}, ${b.s.reason}) → přeskočeno`)
    const ok = sheets.filter((x) => x.s.isCrane && x.s.variants.length)
    if (!ok.length) continue
    const template = templateFor(sp.model)
    const tm = TEMPLATE_MEASURES[template]
    const tpl = CRANE_DEFS.find((d) => d.key === template)!
    const report: CatalogEntry['report'] = []
    const notes: string[] = sp.note ? [sp.note] : []
    // variants: ids unique within the crane; an id repeated on a 2nd sheet (other boom set) gets the sheet range
    const variants: CatalogEntry['variants'] = []
    for (const { f, s } of ok) {
      const range = /\b(\d-\d)\b/.exec(f.replace(/\d{3}-\d{4}/, ''))?.[1] ?? f
      for (const v of s.variants) {
        const id = variants.some((x) => x.id === v.id) ? `${v.id} (${range})` : v.id
        variants.push({ id, boom: v.boom, extensions: v.extensions, minOutreachMm: v.minOutreachMm, hydMaxMm: v.hydMaxMm, manMaxMm: v.manMaxMm, sheet: f })
      }
    }
    // height 1-1: confirmed scale only, sheets must agree
    const hs = ok.map(({ f, s }) => ({ f, h: s.dims.find((d) => d.key === 'height')?.mm ?? null, conf: s.scaleConfirmed, all: s.heights }))
    const usable = hs.filter((x) => x.h != null && x.conf)
    let dh = 0
    let hDrawing: number | null = null
    let hNote = ''
    if (!usable.length) hNote = hs.some((x) => x.h != null) ? 'měřítko výkresu nepotvrzeno kótami proti tabulkám → výška ze šablony' : 'kóta 1-1 chybí'
    else {
      const vals = usable.map((x) => x.h!)
      const spread = (Math.max(...vals) - Math.min(...vals)) / Math.min(...vals)
      if (spread > 0.03) hNote = `výkresy se neshodují (${usable.map((x) => `${x.f.match(/\d{3}-\d{4}/)?.[0] ?? x.f}: ${x.h}`).join(', ')}) → výška ze šablony`
      else hDrawing = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
    }
    const hDev = hDrawing != null ? hDrawing - tm.heightAtColumn : null
    const hUse = hDev != null && Math.abs(hDev / tm.heightAtColumn) > TOL
    if (hUse) dh = hDev! / 1000
    report.push({ name: 'Výška u osy otoče (1-1)', drawing: hDrawing, template: tm.heightAtColumn, deviation: hDev, used: hUse ? 'výkres' : 'šablona', note: hNote || (hUse ? 'sloup natažen/zkrácen svisle' : 'odchylka ≤ 2 % → šablona') })
    const folds = ok.map(({ s }) => s.dims.find((d) => d.key === 'stabFolded')?.mm).filter((x): x is number => x != null)
    const fold = folds.length ? Math.round(folds.reduce((a, b) => a + b, 0) / folds.length) : null
    const fDev = fold != null ? fold - tm.stabFolded : null
    const fUse = fDev != null && Math.abs(fDev / tm.stabFolded) > TOL
    const baseX = fUse ? fold! / tm.stabFolded : 1
    report.push({ name: 'Šířka zasunutých podpěr (3-5a+3-5b)', drawing: fold, template: tm.stabFolded, deviation: fDev, used: fUse ? 'výkres' : 'šablona', note: fold == null ? 've výkresu chybí → šablona' : fUse ? 'základ škálován v ose podpěr' : 'odchylka ≤ 2 % → šablona' })
    const s0 = ok[0].s
    const spread = s0.dims.find((d) => d.key === 'stabSpread')?.perVariant
    if (spread) report.push({ name: `Rozpětí podpěr vysunuto (${Object.keys(spread).join(' / ')})`, drawing: Math.max(...Object.values(spread)), template: null, deviation: null, used: 'výkres', note: `${Object.entries(spread).map(([k, v]) => `${k}: ${v}`).join(', ')} — jen údaj, podpěry šablony zasunuté` })
    const bw = s0.dims.find((d) => d.key === 'baseWidth')?.perVariant
    if (bw) { const v = Object.entries(bw).find(([k]) => /hipro|duo/i.test(k)); if (v) report.push({ name: `Max. šířka základu 5-1 (${v[0]})`, drawing: v[1], template: tm.baseDepth, deviation: v[1] - tm.baseDepth, used: 'šablona', note: 'závisí na rozvaděči, jen kontrola' }) }
    const L1 = Math.round(Math.hypot(tpl.geom.p2.r - tpl.geom.p1.r, tpl.geom.p2.h - tpl.geom.p1.h) * 1000)
    report.push({ name: 'Hlavní výložník P1→P2', drawing: null, template: L1, deviation: null, used: 'šablona', note: 've výkresu nekótováno' })
    const S = tpl.meshExtSections
    const maxExt = Math.max(...variants.map((v) => v.extensions))
    report.push({ name: 'Počet výsuvů', drawing: maxExt, template: S, deviation: maxExt - S, used: 'výkres', note: maxExt > S ? `${maxExt - S} výsuv(y) navíc = kopie nejmenšího výsuvu šablony` : 'nadbytečné výsuvy šablony skryty' })
    const minO = Math.min(...variants.map((v) => v.minOutreachMm)), maxO = Math.max(...variants.map((v) => v.minOutreachMm))
    report.push({ name: 'Dosah zasunuto (1-3 MIN) – rozsah variant', drawing: maxO, template: tpl.refMinOutreachMm, deviation: maxO - tpl.refMinOutreachMm, used: 'výkres', note: `${minO}–${maxO} mm → vnější výložník natažen od kloubu o ${((minO - tpl.refMinOutreachMm) / 1000).toFixed(2)}…${((maxO - tpl.refMinOutreachMm) / 1000).toFixed(2)} m` })
    if ((maxO - tpl.refMinOutreachMm) / tpl.refMinOutreachMm > 0.15) notes.push(`vnější výložník natažen o víc než 15 % (zasunutý dosah ${maxO} mm proti ${tpl.refMinOutreachMm} mm šablony ${template}) — dlouhé rameno (L) šablona nemá, tvar je jen natažený`)
    if (!ok.every((x) => x.s.scaleConfirmed)) notes.push(`měřítko nepotvrzeno: ${ok.filter((x) => !x.s.scaleConfirmed).map((x) => `${x.f} ${x.s.scale.label}`).join(', ')}`)
    const boomKey = sp.booms.replace(/\//g, '')
    const key = `${sp.line}${sp.model}-${boomKey}`.toLowerCase()
    const num = sp.model.replace(/L$/, '')
    entries.push({
      key, model: sp.model, template,
      name: `HIAB ${sp.line} ${sp.model} ${sp.series} ${sp.booms}`,
      // "HIAB X-HiPro 192 E-4", "iX.188", "eX 232" … (model number not part of a longer number; L suffix required for 225L/235L)
      match: sp.model.endsWith('L') ? `(^|\\D)${num}\\s*L(?![a-z\\d])` : `(^|\\D)${num}(?!\\d|\\s*L\\b)`,
      dh, baseX, defaultVariantId: variants[variants.length - 1].id, variants, report,
      sheets: ok.map((x) => x.f), notes,
    })
  }
  writeFileSync(new URL('../trw/craneCatalog.json', import.meta.url), JSON.stringify({ generated: 'src/craneTpl/catalog.local.test.ts', skipped, entries }, null, 1) + '\n')
}, 1800000)

/**
 * Generates src/trw/craneCatalog.json from the HIAB exterior drawings (local files, not in the repo).
 * Run: CRANE_CATALOG=1 npx vitest run src/craneTpl/catalog.local.test.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { CRANE_DEFS, type CatalogEntry } from '../trw/craneKinematics'
import { readCraneSheet, type CraneSheet } from './sheet'
import { RULES } from './rules'
import { TEMPLATE_MEASURES } from './template'

const D = '/home/box/Downloads/', W = '/workspace/crane/dr/'
const E142 = [`${W}iX. 142 HiPro GD-E-ES-1-3 464-0807.dxf`, `${W}iX. 142 HiPro GD-E-ES-4-5 464-0808.dxf`]
const DDS = [`${D}eX. 142 HIPRO GD-D-DS-1-3 465-1105.dxf`, `${D}eX. 142 HIPRO GD-D-DS-4-5 465-1106.dxf`]
type Spec = { model: string; line: string; series: string; booms: string; sheets: string[]; note?: string; template?: '142' | '408'; aliases?: string[]; key?: string }
export const SPECS: Spec[] = [
  { model: '142', line: 'eX', series: 'HiPro', booms: 'B/BS', aliases: ['iX 142 HiPro', 'iX 138'], sheets: [`${D}eX. 142 HIPRO GD-B-BS 464-0805.dxf`] },
  { model: '142', line: 'eX', series: 'HiPro', booms: 'BSS', aliases: ['iX 142 HiPro', 'iX 138'], sheets: [`${D}eX. 142 HIPRO GD-BSS 464-0806.dxf`] },
  { model: '142', line: 'eX', series: 'HiPro', booms: 'D/DS', aliases: ['iX 142 HiPro', 'iX 138'], sheets: DDS },
  { model: '162', line: 'eX', series: 'HiPro', booms: 'E/ES', aliases: ['iX 138', 'iX 158'], sheets: E142, note: 'výkresy 464-0807/0808 platí pro 128–162' },
  { model: '162', line: 'eX', series: 'HiPro', booms: 'B/BS', aliases: ['iX 158'], sheets: [`${D}eX. 162 HIPRO GD-B_BS 1-3 462-4906_drw.dxf`] },
  { model: '162', line: 'eX', series: 'HiPro', booms: 'BSS', aliases: ['iX 158'], sheets: [`${D}eX. 162 HIPRO GD-BSS -2 462-4922_drw.dxf`] },
  { model: '162', line: 'eX', series: 'HiPro', booms: 'D/DS', aliases: ['iX 158'], sheets: DDS },
  { model: '148', line: 'iX', series: 'Duo', booms: 'B/BS', sheets: [`${D}iX.148 DUO GD- E-ES 1-3 462-4906 drw.dxf`], note: 'soubor je pojmenován E-ES, ale je to výkres 462-4906 B/BS 1-3 (platí pro 148/158/162)' },
  { model: '192', line: 'eX', series: 'HiPro', booms: 'E/ES', sheets: [`${D}eX.192 HIPRO GD-E-ES 1-3 387-3200.dxf`, `${D}eX.192 HIPRO GD-E-ES 3-6 387-2399.dxf`] },
  { model: '188', line: 'iX', series: 'HiDuo', booms: 'B/BS', aliases: ['CLX 178'], sheets: [`${D}iX.188 HIDUO GD-B-BS 1-3 466-7980 drw.dxf`, `${D}iX.188 HIDUO GD-B_BS 3-4 466-7981 drw.dxf`] },
  { model: '188', line: 'iX', series: 'HiDuo', booms: 'E/ES', aliases: ['CLX 178'], sheets: [`${D}iX.188 HIDUO GD-E_ES 1-3 466-7982 drw.dxf`, `${D}iX.188 HIDUO GD-E_ES 3-6 466-7983 drw.dxf`] },
  { model: '228', line: 'iX', series: 'HiDuo', booms: 'B/BS', aliases: ['CLX 218'], sheets: [`${D}iX.228 HIDUO GD-B_BS 1-3 466-7975 drw.dxf`, `${D}iX.228 HIDUO GD- B-BS 3-4 466-7976 drw.dxf`] },
  { model: '228', line: 'iX', series: 'HiDuo', booms: 'E/ES', aliases: ['CLX 218'], sheets: [`${D}iX.228 HIDUO GD- E-ES 1-3 466-7977 drw.dxf`, `${D}iX.228 HIDUO GD- E-ES 3-6 466-7978 drw.dxf`] },
  { model: '232', line: 'eX', series: 'HiPro', booms: 'E/ES', sheets: [`${D}eX.232 HIPRO GD- E-ES 1-3 387-6560 drw.dxf`, `${D}eX.232 HIPRO GD- E-ES 3-6 454-0176 drw.dxf`] },
  { model: '225L', line: 'iX', series: 'HiDuo', booms: 'DL/DLL', sheets: [`${D}iX.225L HIDUO GD- DL-DLL 1-3 466-7989 drw.dxf`] },
  { model: '235L', line: 'eX', series: 'HiPro', booms: 'DL/DLL', sheets: [`${D}eX.235L HIPRO GD- 455-8760_drw.dxf`] },
  { model: '262', line: 'eX', series: 'HiPro', booms: 'E', sheets: [`${D}eX.262 HIPRO GD-E-466-4147_drw_1.dxf`] },
  { model: '262', line: 'eX', series: 'HiPro', booms: 'EP', sheets: [`${D}eX.262 HIPRO GD-EP-466-4146_drw.dxf`] },
  { model: '302', line: 'eX', series: 'HiPro', booms: 'E', sheets: [`${D}eX.302 HIPRO GD-E 466-4147 drw.dxf`] },
  { model: '302', line: 'eX', series: 'HiPro', booms: 'EP', aliases: ['CLX 248', 'CLX 288'], sheets: [`${D}eX.302 HIPRO GD-EP 466-4146 drw_1.dxf`] },
  { model: '19', line: 'CL', series: '', booms: 'B/BS', template: '142', key: 'cl19-bbs', note: 'řada CL (lesní/recyklační provedení) — tabulky dosahů B/BS jako iX.188, odvozeno jako B/BS, tvar CL (sloup, ovládací místo) šablona nemá', sheets: [`${D}19 CL-2-3 GD 466-7987.dxf`, `${D}19 CL-4 GD 466-7988.dxf`] },
  { model: '23', line: 'CL', series: '', booms: 'B/BS', template: '408', key: 'cl23-bbs', note: 'řada CL (lesní/recyklační provedení) — tabulky dosahů B/BS jako iX.228, odvozeno jako B/BS, tvar CL šablona nemá', sheets: [`${D}23 CL-2-3 GD 466-7985.dxf`, `${D}23 CL-4 GD 466-7986.dxf`] },
  { model: '708', line: 'iQ', series: 'HiPro', booms: 'E', sheets: ['E-6 GD 556-7913_00', 'E-7 GD 556-7607_00', 'E-8 GD 556-7914_00', 'E-9 GD 556-7915_00'].map((x) => `${D}iQ.708 HiPro ${x}.dxf`) },
  { model: '708', line: 'iQ', series: 'HiPro', booms: 'E+JIB', key: 'iq708-ejib', note: 'JIB 155Q-6: dosah jibu z výkresu uložen, jib sám nemodelován (LESSONS L7)', sheets: ['E-6 JIB155Q-6 GD 556-7916_00', 'E-7 JIB155Q-6 GD 556-7917_00', 'E-8 JIB155Q-6 GD 556-7499_00'].map((x) => `${D}iQ.708 HiPro ${x}.dxf`) },
  { model: '1188', line: 'iQ', series: 'HiPro', booms: 'E', aliases: ['iQ 958'], sheets: ['GD-E-8 556-3054', 'GD-E-9 556-3055', 'GD-E-10 556-3056'].map((x) => `${D}iQ.1188 HiPro ${x}.dxf`) },
  { model: '1188', line: 'iQ', series: 'HiPro', booms: 'E+JIB', key: 'iq1188-ejib', aliases: ['iQ 958'], note: 'JIB 155Q: dosah jibu z výkresu uložen, jib sám nemodelován (LESSONS L7)', sheets: ['GD-E-8 JIB 155Q GD 556-3073', 'GD-E-9 JIB 155Q GD 556-3074'].map((x) => `${D}iQ.1188 HiPro ${x}.dxf`) },
  { model: '638', line: 'X', series: 'HiPro', booms: 'E', sheets: ['E-6 549-3958', 'E-8 549-3959', 'E-9 549-3960'].map((x) => `${D}X-HIPRO 638 GD-${x}.dxf`) },
  { model: '191', line: 'Z', series: 'HiPro', booms: 'C', sheets: [`${D}Z-HIPRO 191 GD-C 387-4974.dxf`] },
  { model: '230W', line: 'S', series: 'HiPro', booms: 'W', sheets: [`${D}S-HIPRO 230W GD-W 456-9645.dxf`] },
]

const TOL = RULES.adaptTolerance
/** Larger cranes (≥ 22 t·m class: 225L, 228, 232, 235L, 262, 302) use the 408 template, the rest the 142. */
const templateFor = (model: string): '142' | '408' => (Number.parseInt(model, 10) >= RULES.template408From ? '408' : '142')

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
    // LESSONS L8: Z-folding cranes have nothing in common with the 142/408 knuckle boom geometry
    if (sp.line === 'Z') { skipped.push(`${tag}: Z-skládací jeřáb — geometrie není odvoditelná ze šablony 142/408 (výkres navíc v měřítku 1:1 bez tabulky dosahů) → přeskočeno`); continue }
    const template = sp.template ?? templateFor(sp.model)
    const tm = TEMPLATE_MEASURES[template]
    const tpl = CRANE_DEFS.find((d) => d.key === template)!
    const report: CatalogEntry['report'] = []
    const notes: string[] = sp.note ? [sp.note] : []
    // variants: ids unique within the crane; an id repeated on a 2nd sheet (other boom set) gets the sheet range
    const variants: CatalogEntry['variants'] = []
    for (const { f, s } of ok) {
      const range = /\b(\d-\d)\b/.exec(f.replace(/\d{3}-\d{4}/, ''))?.[1] ?? /CL-(\d)/.exec(f)?.[1] ?? f
      for (const v of s.variants) {
        const base = s.jib ? `${v.id} JIB` : v.id
        const id = variants.some((x) => x.id === base) ? `${base} (${range})` : base
        variants.push({ id, boom: v.boom, extensions: v.extensions, minOutreachMm: v.minOutreachMm, hydMaxMm: v.hydMaxMm, manMaxMm: v.manMaxMm, sheet: f, ...(s.jib ? { jib: s.jib } : {}) })
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
      if (spread > RULES.sheetAgreement) hNote = `výkresy se neshodují (${usable.map((x) => `${x.f.match(/\d{3}-\d{4}/)?.[0] ?? x.f}: ${x.h}`).join(', ')}) → výška ze šablony`
      else hDrawing = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
    }
    const hDev = hDrawing != null ? hDrawing - tm.heightAtColumn : null
    // LESSONS L3: 1-1 calibrated on the 142 only
    const hAllowed = RULES.heightFrom11[template]
    if (hDev != null && !hAllowed) hNote = `kóta 1-1 na šabloně ${template} nekalibrována (LESSONS L3) → jen kontrola, sloup ze šablony`
    const hUse = hAllowed && hDev != null && Math.abs(hDev / tm.heightAtColumn) > TOL
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
    report.push({ name: 'Počet výsuvů (max. varianta)', drawing: maxExt, template: S, deviation: maxExt - S, used: 'výkres', note: `R1: každá varianta ukazuje přesně svůj počet výsuvů (${[...new Set(variants.map((v) => v.extensions))].join(', ')}), každý se zdvihem (MAX − MIN)/n; ${maxExt > S ? `${maxExt - S} výsuv(y) navíc = kopie nejmenšího výsuvu šablony` : 'nadbytečné výsuvy šablony odstraněny'}` })
    if (variants.some((v) => v.jib)) report.push({ name: 'Dosah s jibem (max.)', drawing: Math.max(...variants.map((v) => v.jib?.maxMm ?? 0)), template: null, deviation: null, used: 'výkres', note: 'jen údaj — jib nemodelován (LESSONS L7)' })
    if (ok.every((x) => !x.s.dims.some((d) => d.key === 'height' && d.mm != null)) && ok.every((x) => !x.s.labelled.length)) notes.push('výkres bez popsaných kót a tabulek (iQ/X-HiPro, LESSONS L4): jen dosahy, výška a základ ze šablony')
    const minO = Math.min(...variants.map((v) => v.minOutreachMm)), maxO = Math.max(...variants.map((v) => v.minOutreachMm))
    report.push({ name: 'Dosah zasunuto (1-3 MIN) – rozsah variant', drawing: maxO, template: tpl.refMinOutreachMm, deviation: maxO - tpl.refMinOutreachMm, used: 'výkres', note: `${minO}–${maxO} mm → vnější výložník natažen od kloubu o ${((minO - tpl.refMinOutreachMm) / 1000).toFixed(2)}…${((maxO - tpl.refMinOutreachMm) / 1000).toFixed(2)} m` })
    if ((maxO - tpl.refMinOutreachMm) / tpl.refMinOutreachMm > 0.15) notes.push(`vnější výložník natažen o víc než 15 % (zasunutý dosah ${maxO} mm proti ${tpl.refMinOutreachMm} mm šablony ${template}) — dlouhé rameno (L) šablona nemá, tvar je jen natažený`)
    if (!ok.every((x) => x.s.scaleConfirmed)) notes.push(`měřítko nepotvrzeno: ${ok.filter((x) => !x.s.scaleConfirmed).map((x) => `${x.f} ${x.s.scale.label}`).join(', ')}`)
    const boomKey = sp.booms.replace(/\//g, '')
    const key = sp.key ?? `${sp.line}${sp.model}-${boomKey}`.toLowerCase()
    const num = sp.model.replace(/L$/, '')
    entries.push({
      key, model: sp.model, template,
      name: `HIAB ${sp.line} ${sp.model} ${sp.series} ${sp.booms}${sp.aliases ? ` (= ${sp.aliases.join(', ')})` : ''}`.replace(/\s+/g, ' '),
      // "HIAB X-HiPro 192 E-4", "iX.188", "eX 232" … (model number not part of a longer number; L suffix required for 225L/235L)
      match: [sp.model.endsWith('L') ? `(^|\\D)${num}\\s*L(?![a-z\\d])` : sp.line === 'CL' ? `(^|\\D)${num}\\s*CL\\b` : `(^|\\D)${num}(?!\\d|\\s*L\\b|\\s*CL\\b)`, ...(sp.aliases ?? []).map((a) => `(^|\\D)${a.replace(/^\D+/, '').replace(/\s+/g, '\\s*')}(?!\\d)`)].join('|'),
      aliases: sp.aliases,
      dh, baseX, defaultVariantId: variants[variants.length - 1].id, variants, report,
      sheets: ok.map((x) => x.f), notes,
    })
  }
  writeFileSync(new URL('../trw/craneCatalog.json', import.meta.url), JSON.stringify({ generated: 'src/craneTpl/catalog.local.test.ts', skipped, entries }, null, 1) + '\n')
}, 1800000)

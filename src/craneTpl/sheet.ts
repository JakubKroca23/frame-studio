/**
 * Read a HIAB "EXTERIOR DRAWING" crane sheet: ACAD_TABLE cells, labelled DIMENSIONs ("1-1", "3-5a" …), the drawing
 * scale and the key crane dimensions. Every value records where it came from — nothing is invented here; what the
 * sheet does not give stays null and the template keeps its own value (see template.ts).
 */
import { parseDxf } from '../dxf/parse'
import type { DxfDb } from '../dxf/types'
import { collectDimEntities, rawScaleStrings } from '../dxf3d/analyze'
import { collectDims, detectScale } from '../dxf3d/scale'
import type { DimRecord, ScaleInfo } from '../dxf3d/types'

export interface AcadTable { x: number; y: number; rows: number; cols: number; cells: string[][] }

/** ACAD_TABLE entities from raw DXF text: grid of cell strings (merged cells are ''). */
export function parseAcadTables(raw: string): AcadTable[] {
  const lines = raw.split(/\r?\n/)
  const out: AcadTable[] = []
  for (let i = 0; i + 1 < lines.length; i++) {
    if (lines[i].trim() !== '0' || lines[i + 1].trim() !== 'ACAD_TABLE') continue
    let x = 0, y = 0, rows = 0, cols = 0
    const cells: string[] = []
    let cur: string | null = null
    let j = i + 2
    for (; j + 1 < lines.length; j += 2) {
      const code = lines[j].trim(), val = lines[j + 1].replace(/\r$/, '')
      if (code === '0') break
      if (code === '10' && !x) x = +val
      else if (code === '20' && !y) y = +val
      else if (code === '91' && !rows && cells.length === 0 && cur === null) rows = +val
      else if (code === '92' && !cols && cells.length === 0 && cur === null) cols = +val
      else if (code === '171') { if (cur !== null) cells.push(cur); cur = '' }
      else if ((code === '1' || code === '2' || code === '3') && cur !== null && rows && cols) cur += val
    }
    if (cur !== null) cells.push(cur)
    i = j - 1
    if (!rows || !cols) continue
    const grid: string[][] = []
    for (let r = 0; r < rows; r++) grid.push(Array.from({ length: cols }, (_, c) => cleanCell(cells[r * cols + c] ?? '')))
    out.push({ x, y, rows, cols, cells: grid })
  }
  return out
}

function cleanCell(s: string): string {
  return s.replace(/\\[A-Za-z][^;\\]*;/g, '').replace(/\\P/g, ' ').replace(/[{}]/g, '').trim()
}

const LABEL = /^\s*(\d-\d+[a-z]?)\b/i
const num = (s: string): number | null => { const m = /^\(?\s*(\d+(?:[.,]\d+)?)\s*\)?$/.exec(s.trim()); return m ? +m[1].replace(',', '.') : null }

/** Table column values keyed by a dimension label, with the row name (variant / option) of each value. */
export interface LabelValue { label: string; row: string; value: number; table: string }

export function tableLabelValues(tables: readonly AcadTable[]): LabelValue[] {
  const out: LabelValue[] = []
  for (const t of tables) {
    const title = t.cells[0]?.find((c) => c) ?? ''
    for (let r = 0; r < t.rows; r++) for (let c = 0; c < t.cols; c++) {
      const m = LABEL.exec(t.cells[r][c])
      if (!m || t.cells[r][c].length > 16) continue
      const label = m[1].toLowerCase()
      let rowName = ''
      for (let rr = r + 1; rr < t.rows; rr++) {
        const first = t.cells[rr].find((x) => x) ?? ''
        if (LABEL.test(t.cells[rr][c])) break // next header block
        if (num(first) === null && first) rowName = t.cells[rr][0] || first
        const v = num(t.cells[rr][c])
        if (v !== null && v > 0) out.push({ label, row: t.cells[rr][0] || rowName, value: v, table: title })
      }
    }
  }
  return out
}

export interface SheetVariant { id: string; family: 'E' | 'ES'; /** boom type as printed (E, ES, B, BS, BSS, D, DS, DLL, DLS, EP …) */ boom: string; extensions: number; minOutreachMm: number; hydMaxMm: number; manMaxMm: number }

/** Table "1-3, OUTREACH": rows "E-3 | 4800 | 10780 | 12960". */
export function outreachVariants(tables: readonly AcadTable[]): SheetVariant[] {
  const out: SheetVariant[] = []
  for (const t of tables) {
    if (!t.cells.flat().some((c) => /OUTREACH/i.test(c))) continue
    const flat = t.cells.flat()
    for (let i = 0; i < flat.length; i++) {
      const m = /^([A-Z]{1,4})\s*-\s*(\d{1,2})$/i.exec(flat[i].trim())
      if (!m) continue
      // "MIN | MAX | MAX" (hyd min, hyd max, +man max) or "MIN | MAX | MIN | MAX" (hyd min/max, +man min/max) or hyd only
      const vals: number[] = []
      for (let j = i + 1; j < flat.length && vals.length < 4; j++) { const v = num(flat[j]); if (v === null) break; vals.push(v) }
      if (vals.length < 2) continue
      const [min, hyd] = vals
      const man = vals.length >= 4 ? vals[3] : vals.length === 3 ? vals[2] : hyd
      out.push({ id: `${m[1].toUpperCase()}-${m[2]}`, family: m[1].toUpperCase() as 'E' | 'ES', boom: m[1].toUpperCase(), extensions: +m[2], minOutreachMm: min, hydMaxMm: hyd, manMaxMm: man })
    }
  }
  return out.sort((a, b) => a.family.localeCompare(b.family) || a.extensions - b.extensions)
}

export interface LabelledDim { label: string; text: string; paper: number; dir: 'h' | 'v' | 'o'; mm: number; override: number | null; a: { x: number; y: number }; b: { x: number; y: number } }

export type Source = 'výkres-tabulka' | 'výkres-kóta' | 'šablona' | 'odvozeno'
export interface KeyDim { key: string; name: string; mm: number | null; source: Source; ref: string; perVariant?: Record<string, number> }

export interface CraneSheet {
  isCrane: boolean
  /** jib reach from an iQ JIB sheet (L7: stored, not modelled) */
  jib?: { minMm: number; maxMm: number; manMm: number } | null
  reason: string
  title: string
  /** model number read from the sheet ("142", "408" …) */
  model: string | null
  scale: ScaleInfo
  scaleNote: string
  /** generic dims-vs-geometry scale confirmed by labelled dims against table values */
  scaleConfirmed: boolean
  /** all 1-1 heights (without REEL / BOOM COVER) [mm] */
  heights: number[]
  variants: SheetVariant[]
  labelled: LabelledDim[]
  tableValues: LabelValue[]
  dims: KeyDim[]
}

/**
 * Scale: the HIAB sheets store paper lengths as the DIMENSION measurement (the printed value is a "<>" × DIMLFAC
 * label), so the generic dims-vs-geometry ratio is 1. Labelled dims are matched to their table values instead and the
 * ratios fed to the same detectScale (src/dxf3d/scale.ts): a ratio cluster ⇒ the scale.
 */
function sheetScale(dims: DimRecord[], labelled: Omit<LabelledDim, 'mm'>[], values: LabelValue[], units: number, titles: string[]): { scale: ScaleInfo; note: string } {
  const generic = detectScale(dims, units, titles)
  // one candidate per labelled dim: the table value whose ratio is most common
  const cand: { d: Omit<LabelledDim, 'mm'>; r: number[] }[] = labelled.map((d) => ({ d, r: values.filter((v) => v.label === d.label).map((v) => v.value / d.paper) }))
  const all = cand.flatMap((c) => c.r)
  let best = 0, bestN = 0
  for (const r of all) { const n = cand.filter((c) => c.r.some((x) => Math.abs(x / r - 1) < 0.01)).length; if (n > bestN) { bestN = n; best = r } }
  const recs: DimRecord[] = []
  let id = 0
  for (const c of cand) {
    const x = c.r.find((v) => Math.abs(v / best - 1) < 0.01)
    if (x === undefined) continue
    recs.push({ id: id++, kind: 'linear', value: x * c.d.paper, text: c.d.label, geom: c.d.paper, ratio: x, island: null, dir: c.d.dir, a: c.d.a, b: c.d.b })
  }
  const s = detectScale(recs, units, titles)
  // labelled dims vs. table values agree (≥ 3) → that scale; otherwise the generic dims-vs-geometry scale
  if (recs.length < 3 || s.source !== 'dims') return { scale: generic, note: `${generic.note} (kóty s popisem nepotvrdily: ${recs.length})` }
  if (generic.source === 'dims' && Math.abs(generic.mmPerUnit / s.mmPerUnit - 1) < 0.03) return { scale: generic, note: `${generic.note} Potvrzeno ${recs.length} kótami s popisem proti tabulkám.` }
  return { scale: s, note: `Měřítko z kót s popisem (${recs.length} kót souhlasí s hodnotami v tabulkách: ${recs.map((r) => r.text).join(', ')}). ${s.titleHint ? `Razítko: ${s.titleHint}.` : ''}` }
}

/**
 * LESSONS L4: iQ / X-HiPro "GEN. DIM." sheets have no tables. One variant per sheet (E8 / E-9 in the title);
 * outreach = dim text "Min. A / Max. B" (largest Max, "(v8)" = main boom), "Manual extension Min/Max", jib "(v8+v6)".
 */
export function unlabelledOutreach(texts: readonly string[]): { variants: SheetVariant[]; jib: { minMm: number; maxMm: number; manMm: number } | null } {
  const title = texts.find((t) => /GEN(\.|ERAL)\s*DIM/i.test(t)) ?? ''
  const em = /E\s*-?\s*(\d{1,2})\b/.exec(title.replace(/\\P/g, ' ').replace(/GEN(\.|ERAL)\s*DIM\w*\.?/i, ''))
  if (!em) return { variants: [], jib: null }
  const lines = texts.flatMap((t) => t.split('\\P')).map((t) => t.trim())
  const rx = /Min\.\s*(\d{3,5})\s*\/\s*Max\.\s*(\d{3,5})\s*(?:\(([^)]*)\))?/i
  const hyd: { a: number; b: number }[] = [], plus: { a: number; b: number }[] = []
  let man = 0
  for (const l of lines) {
    const m = rx.exec(l)
    if (!m) continue
    const a = +m[1], b = +m[2], tag = m[3] ?? ''
    if (/manual/i.test(l)) man = Math.max(man, b)
    else if (/\+\s*1\s*m?$/i.test(tag)) plus.push({ a, b }) // "(v6+1m)" = + manual extension of the jib
    else hyd.push({ a, b })
  }
  const top = (xs: { a: number; b: number }[]) => xs.reduce<{ a: number; b: number } | null>((p, x) => (!p || x.b > p.b ? x : p), null)
  let jib: { minMm: number; maxMm: number; manMm: number } | null = null
  let rest = hyd
  if (texts.some((t) => /GEN(\.|ERAL)\s*DIM.*JIB/i.test(t) || /\(v\d+\s*\+\s*v\d+/i.test(t))) {
    const j = top(hyd)
    if (j) { jib = { minMm: j.a, maxMm: j.b, manMm: top(plus.filter((x) => x.a === j.a))?.b ?? j.b }; rest = hyd.filter((x) => x.b !== j.b && x.a >= 4000) }
  }
  const mm = top(rest)
  if (!mm) return { variants: [], jib: null }
  const main: [number, number] = [mm.a, mm.b]
  const n = +em[1]
  return { variants: [{ id: `E-${n}`, family: 'E', boom: 'E', extensions: n, minOutreachMm: main[0], hydMaxMm: main[1], manMaxMm: Math.max(man, main[1]) }], jib }
}

export function readCraneSheet(raw: string, db: DxfDb = parseDxf(raw)): CraneSheet {
  const tables = parseAcadTables(raw)
  const texts = [...db.entities.filter((e) => e.text).map((e) => e.text!), ...tables.flatMap((t) => t.cells.flat())]
  const allText = texts.join('\n')
  const unl = unlabelledOutreach([...texts, ...(raw.match(/^[^\n]*(Min\.|GEN(\.|ERAL)\s*DIM)[^\n]*$/gm) ?? []).map((l) => l.replace(/\r$/, ''))])
  const variants = unl.variants.length && !outreachVariants(tables).length ? unl.variants : outreachVariants(tables)
  const hiab = /HIAB/i.test(allText) || /HIAB/i.test(raw.slice(0, 2_000_000))
  const exterior = /EXTERIOR DRAWING/i.test(allText)
  const isCrane = hiab && (variants.length > 0 || exterior)
  const titleCell = tables.flatMap((t) => t.cells.flat()).find((c) => /EXTERIOR DRAWING/i.test(c)) ?? ''
  const title = titleCell.replace(/\\P/g, ' ')
  const mm = /\b(\d{3})\s*[-/]\s*(\d{3})\b/.exec(title) // "128-162" family range
  const valid = /valid for[^\n]*?([\d/]+)/i.exec(allText)
  let model: string | null = null
  for (const m of ['142', '408']) if (new RegExp(`(^|\\D)${m}(\\D|$)`).test(`${title} ${valid?.[1] ?? ''}`)) model = m
  if (!model && mm) model = mm[1]

  const dimEnts = collectDimEntities(db)
  const dims = collectDims(dimEnts)
  const labelled0: Omit<LabelledDim, 'mm'>[] = []
  for (const d of dims) {
    const m = LABEL.exec(d.text)
    if (!m) continue
    const ov = /\((\d+(?:[.,]\d+)?)\)/.exec(d.text)
    labelled0.push({ label: m[1].toLowerCase(), text: d.text, paper: d.geom, dir: d.dir, override: ov ? +ov[1].replace(',', '.') : null, a: d.a, b: d.b })
  }
  const values = tableLabelValues(tables)
  const { scale, note } = sheetScale(dims, labelled0, values, db.units, [...texts, ...rawScaleStrings(raw)])
  const labelled = labelled0.map((d) => ({ ...d, mm: Math.round(d.paper * scale.mmPerUnit) }))

  const tv = (label: string) => values.filter((v) => v.label === label)
  const keyDims: KeyDim[] = []
  const heights = labelled.filter((d) => d.label === '1-1' && d.dir === 'v' && !/REEL|COVER|BOOM/i.test(d.text)).map((d) => d.override ?? d.mm)
  const hMin = heights.length ? Math.min(...heights) : null
  keyDims.push(hMin != null ? { key: 'height', name: 'Výška jeřábu u osy otoče (1-1)', mm: hMin, source: 'výkres-kóta', ref: `kóta 1-1 × ${scale.mmPerUnit.toFixed(2)}${heights.length > 1 ? ` (nejnižší z ${heights.join(' / ')})` : ''}` } : { key: 'height', name: 'Výška jeřábu u osy otoče (1-1)', mm: null, source: 'šablona', ref: 'kóta 1-1 chybí' })
  const ext = variants.length ? { min: Math.min(...variants.map((v) => v.extensions)), max: Math.max(...variants.map((v) => v.extensions)) } : null
  keyDims.push({ key: 'extensions', name: 'Počet výsuvů', mm: ext?.max ?? null, source: ext ? 'výkres-tabulka' : 'šablona', ref: ext ? `tabulka 1-3 OUTREACH: ${variants.map((v) => v.id).join(', ')}` : 'tabulka chybí' })
  const pv = (f: (v: SheetVariant) => number) => Object.fromEntries(variants.map((v) => [v.id, f(v)]))
  keyDims.push({ key: 'retracted', name: 'Dosah zasunuto (1-3 MIN)', mm: variants.length ? null : null, source: variants.length ? 'výkres-tabulka' : 'šablona', ref: '1-3 OUTREACH MIN', perVariant: pv((v) => v.minOutreachMm) })
  keyDims.push({ key: 'extended', name: 'Dosah vysunuto hydr. (1-3 MAX)', mm: null, source: variants.length ? 'výkres-tabulka' : 'šablona', ref: '1-3 OUTREACH HYD. EXT. MAX', perVariant: pv((v) => v.hydMaxMm) })
  keyDims.push({ key: 'manual', name: 'Dosah + ruční výsuv', mm: null, source: variants.length ? 'výkres-tabulka' : 'šablona', ref: '1-3 OUTREACH +MAN.EXT', perVariant: pv((v) => v.manMaxMm) })
  keyDims.push({ key: 'stroke', name: 'Zdvih výsuvů celkem (MAX − MIN)', mm: null, source: variants.length ? 'odvozeno' : 'šablona', ref: 'z tabulky 1-3', perVariant: pv((v) => v.hydMaxMm - v.minOutreachMm) })
  // boom lengths: not dimensioned on the HIAB exterior drawing
  keyDims.push({ key: 'mainBoom', name: 'Hlavní (vnitřní) výložník P1→P2', mm: null, source: 'šablona', ref: 've výkresu není kóta' })
  keyDims.push({ key: 'outerBoom', name: 'Vnější výložník zasunutý P2→špička', mm: null, source: variants.length ? 'odvozeno' : 'šablona', ref: '1-3 MIN − P2.r šablony' })
  const sum = (a: string, b: string) => { const x = tv(a), y = tv(b); return x.length && y.length ? x.map((v, i) => ({ row: v.row, mm: v.value + (y[i]?.value ?? v.value) })) : null }
  const fold = sum('3-5a', '3-5b')
  keyDims.push(fold ? { key: 'stabFolded', name: 'Podpěry zasunuté – šířka (3-5a + 3-5b)', mm: fold[0].mm, source: 'výkres-tabulka', ref: `tabulka STABILISER EXTENSION (${fold.map((f) => `${f.row}: ${f.mm}`).join(', ')})` } : { key: 'stabFolded', name: 'Podpěry zasunuté – šířka', mm: null, source: 'šablona', ref: 'chybí' })
  const spread = sum('3-7a', '3-7b')
  keyDims.push(spread ? { key: 'stabSpread', name: 'Rozpětí podpěr vysunuto (3-7a + 3-7b)', mm: null, source: 'výkres-tabulka', ref: 'tabulka STABILISER EXTENSION', perVariant: Object.fromEntries(spread.map((s) => [s.row, s.mm])) } : { key: 'stabSpread', name: 'Rozpětí podpěr', mm: null, source: 'šablona', ref: 'chybí' })
  const base = tv('5-1')
  keyDims.push(base.length ? { key: 'baseWidth', name: 'Max. šířka základu (5-1)', mm: null, source: 'výkres-tabulka', ref: 'tabulka Max width crane base (dle rozvaděče)', perVariant: Object.fromEntries(base.map((b) => [b.row, b.value])) } : { key: 'baseWidth', name: 'Šířka základu', mm: null, source: 'šablona', ref: 'chybí' })
  const leg = tv('3-6a')
  keyDims.push(leg.length ? { key: 'legFolded', name: 'Noha podpěry – složená (3-6a)', mm: null, source: 'výkres-tabulka', ref: 'tabulka STABILISER LEG', perVariant: Object.fromEntries(leg.map((b, i) => [`${b.row}${i >= 4 ? ' (sklopná)' : ''}`, b.value])) } : { key: 'legFolded', name: 'Noha podpěry', mm: null, source: 'šablona', ref: 'chybí' })
  return {
    isCrane,
    reason: isCrane ? `HIAB výkres${exterior ? ' (EXTERIOR DRAWING)' : ''}, tabulka dosahů: ${variants.length} variant` : 'není výkres jeřábu HIAB',
    jib: unl.jib, title, model, scale, scaleNote: note, scaleConfirmed: /Potvrzeno/.test(note) || (unl.variants.length > 0 && scale.source === 'dims'), heights, variants, labelled, tableValues: values, dims: keyDims,
  }
}

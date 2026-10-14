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

export interface SheetVariant { id: string; family: 'E' | 'ES'; extensions: number; minOutreachMm: number; hydMaxMm: number; manMaxMm: number }

/** Table "1-3, OUTREACH": rows "E-3 | 4800 | 10780 | 12960". */
export function outreachVariants(tables: readonly AcadTable[]): SheetVariant[] {
  const out: SheetVariant[] = []
  for (const t of tables) {
    if (!t.cells.flat().some((c) => /OUTREACH/i.test(c))) continue
    const flat = t.cells.flat()
    for (let i = 0; i < flat.length; i++) {
      const m = /^(ES|E)-(\d{1,2})$/i.exec(flat[i])
      if (!m) continue
      const vals = flat.slice(i + 1, i + 4).map(num)
      if (vals.some((v) => v === null)) continue
      const [min, hyd, man] = vals as number[]
      out.push({ id: `${m[1].toUpperCase()}-${m[2]}`, family: m[1].toUpperCase() as 'E' | 'ES', extensions: +m[2], minOutreachMm: min, hydMaxMm: hyd, manMaxMm: man })
    }
  }
  return out.sort((a, b) => a.family.localeCompare(b.family) || a.extensions - b.extensions)
}

export interface LabelledDim { label: string; text: string; paper: number; dir: 'h' | 'v' | 'o'; mm: number; override: number | null; a: { x: number; y: number }; b: { x: number; y: number } }

export type Source = 'výkres-tabulka' | 'výkres-kóta' | 'šablona' | 'odvozeno'
export interface KeyDim { key: string; name: string; mm: number | null; source: Source; ref: string; perVariant?: Record<string, number> }

export interface CraneSheet {
  isCrane: boolean
  reason: string
  title: string
  /** model number read from the sheet ("142", "408" …) */
  model: string | null
  scale: ScaleInfo
  scaleNote: string
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
  if (generic.source === 'dims' && generic.ratio !== 1) return { scale: generic, note: generic.note }
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
  return { scale: s, note: `Měřítko z kót s popisem (${recs.length} kót souhlasí s hodnotami v tabulkách: ${recs.map((r) => r.text).join(', ')}). ${s.titleHint ? `Razítko: ${s.titleHint}.` : ''}` }
}

export function readCraneSheet(raw: string, db: DxfDb = parseDxf(raw)): CraneSheet {
  const tables = parseAcadTables(raw)
  const texts = [...db.entities.filter((e) => e.text).map((e) => e.text!), ...tables.flatMap((t) => t.cells.flat())]
  const variants = outreachVariants(tables)
  const allText = texts.join('\n')
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

  const first = (label: string) => labelled.find((d) => d.label === label)
  const tv = (label: string) => values.filter((v) => v.label === label)
  const keyDims: KeyDim[] = []
  const fromDim = (key: string, name: string, label: string) => {
    const d = first(label)
    keyDims.push(d ? { key, name, mm: d.override ?? d.mm, source: 'výkres-kóta', ref: `kóta ${label}${d.override ? ' (text)' : ` = ${d.paper.toFixed(2)} × ${scale.mmPerUnit.toFixed(2)}`}` } : { key, name, mm: null, source: 'šablona', ref: `kóta ${label} chybí` })
  }
  fromDim('height', 'Výška jeřábu nad osou otoče (1-1)', '1-1')
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
    title, model, scale, scaleNote: note, variants, labelled, tableValues: values, dims: keyDims,
  }
}

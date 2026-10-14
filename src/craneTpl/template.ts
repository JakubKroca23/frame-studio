/**
 * "Crane from template + drawing": pick the closest articulated sample model (142 / 408 family), compare the
 * dimensions read from the sheet with the same quantities measured on the template mesh, and derive a CraneDef that
 * reuses the template mesh with per-part adaptation (column height, base / stabiliser width, outer boom length per
 * variant, number of telescopes). Articulation, IK and gizmos run unchanged on the derived def.
 */
import { CRANE_DEFS, X142_LOADS, registerCraneDef, templateSectionStrokes, type CraneDef, type CraneVariant } from '../trw/craneKinematics'
import type { CraneSheet, KeyDim } from './sheet'

/** Template quantities measured on the sample meshes [mm] — see scripts/crane/408x/README.md for the 408. */
export const TEMPLATE_MEASURES: Record<'142' | '408', { heightAtColumn: number; stabFolded: number; baseDepth: number; legBelow: number; source: string }> = {
  // hiab-x-hipro-142e4-articulated.glb (straight E-4 pose): top of column/main boom within ±200 mm of the slewing axis,
  // base group x-extent (stabilisers retracted), base body depth, lowest point of the legs below the mounting plane.
  '142': { heightAtColumn: 2569, stabFolded: 2511, baseDepth: 883, legBelow: 802, source: 'hiab-x-hipro-142e4-articulated.glb' },
  // extended 408 E-8 GLB (straight, all telescopes out), same assembly frame as the folded one.
  '408': { heightAtColumn: 2911, stabFolded: 2533, baseDepth: 1067, legBelow: 800, source: '408e8_asm-20 (vysunutý GLB)' },
}

export interface Adapt {
  /** extra height of the main pivot [m]: column + cyl1 stretched vertically, everything above lifted */
  dh: number
  /** base group scale along its x (stabiliser beam) */
  baseX: number
}

export interface ReportRow { name: string; drawing: number | null; template: number | null; deviation: number | null; used: 'výkres' | 'šablona'; note: string }

export interface Adapted {
  template: '142' | '408'
  templateReason: string
  def: CraneDef
  variants: CraneVariant[]
  scales: Adapt
  report: ReportRow[]
}

const TOL = 0.02 // adapt a part only when the drawing differs from the template by more than 2 %

export function pickTemplate(s: CraneSheet): { key: '142' | '408'; reason: string } {
  const n = s.model ? Number.parseInt(s.model, 10) : NaN
  if (n === 142 || n === 408) return { key: String(n) as '142' | '408', reason: `stejný model (${n}) ve výkresu` }
  if (Number.isFinite(n)) { const k = n >= 220 ? '408' : '142'; return { key: k, reason: `velikostní třída ${n} → ${k === '408' ? 'velké jeřáby (≥ 22 t·m) → 408' : 'střední jeřáby → 142'}` } }
  const ext = Math.max(0, ...s.variants.map((v) => v.extensions))
  return ext > 5 ? { key: '408', reason: `${ext} výsuvů → rodina 408` } : { key: '142', reason: `${ext || '?'} výsuvů → rodina 142` }
}

let seq = 0
export function adaptFromSheet(s: CraneSheet, register = true): Adapted {
  const { key, reason } = pickTemplate(s)
  const tpl = CRANE_DEFS.find((d) => d.key === key)!
  const tm = TEMPLATE_MEASURES[key]
  const dim = (k: string): KeyDim | undefined => s.dims.find((d) => d.key === k)
  const report: ReportRow[] = []
  const cmp = (name: string, drawing: number | null, template: number | null, note: string, mode: 'adapt' | 'check' | 'apply' = 'adapt'): number => {
    const adaptable = mode === 'adapt'
    const dev = drawing != null && template != null ? drawing - template : null
    const rel = dev != null && template ? dev / template : 0
    const use = adaptable && drawing != null && Math.abs(rel) > TOL
    report.push({ name, drawing, template, deviation: dev, used: use || (mode === 'apply' && drawing != null) ? 'výkres' : 'šablona', note: drawing == null ? `${note}; ve výkresu chybí → šablona` : use ? `${note}; díl upraven` : mode === 'apply' ? `${note}; použito z výkresu` : `${note}${adaptable ? '; odchylka ≤ 2 % → šablona ponechána' : '; jen kontrola'}` })
    return use ? drawing! / template! : 1
  }
  const h = dim('height')?.mm ?? null
  const fh = cmp('Výška u osy otoče (1-1)', h, tm.heightAtColumn, 'sloup + válec natažen svisle')
  const dh = fh === 1 ? 0 : (h! - tm.heightAtColumn) / 1000
  const fold = dim('stabFolded')?.mm ?? null
  const baseX = cmp('Šířka zasunutých podpěr (3-5a+3-5b)', fold, tm.stabFolded, 'základ škálován v ose podpěr')
  const bw = dim('baseWidth')?.perVariant
  if (bw) for (const [row, v] of Object.entries(bw)) if (/hipro/i.test(row)) cmp(`Max. šířka základu 5-1 (${row})`, v, tm.baseDepth, 'závisí na rozvaděči', 'check')
  const leg = dim('legFolded')?.perVariant
  if (leg) for (const [row, v] of Object.entries(leg)) cmp(`Noha podpěry 3-6a (${row})`, v, null, 'šablona nemá variantu nohy', 'check')
  const spread = dim('stabSpread')?.perVariant
  if (spread) for (const [row, v] of Object.entries(spread)) cmp(`Rozpětí podpěr vysunuto ${row}`, v, null, 'šablona má podpěry jen zasunuté', 'check')
  const L1 = Math.hypot(tpl.geom.p2.r - tpl.geom.p1.r, tpl.geom.p2.h - tpl.geom.p1.h)
  cmp('Hlavní výložník P1→P2', null, Math.round(L1 * 1000), 've výkresu nekótováno')

  const dkey = `tpl${key}-${++seq}`
  const variants: CraneVariant[] = (s.variants.length ? s.variants : tpl.variants).map((v) => ({ ...v, model: dkey }))
  // template variants with the same id → compare outreach table vs. the template's (also from Hiab data)
  for (const v of variants) {
    const t = tpl.variants.find((x) => x.id === v.id)
    cmp(`Dosah zasunuto ${v.id} (1-3 MIN)`, v.minOutreachMm, t?.minOutreachMm ?? null, '→ délka vnějšího výložníku zasunutého (natažen od kloubu)', 'apply')
    cmp(`Dosah hydr. ${v.id} (1-3 MAX)`, v.hydMaxMm, t?.hydMaxMm ?? null, `zdvih ${v.extensions} výsuvů = ${v.hydMaxMm - v.minOutreachMm} mm`, 'apply')
  }
  const lift = (p: { r: number; h: number }) => ({ r: p.r, h: p.h + dh })
  const def: CraneDef = {
    ...tpl,
    key: dkey,
    name: `${tpl.name} (šablona) · ${s.title || 'výkres'}`,
    match: /(?!)/,
    foldedFile: undefined,
    geom: { ...tpl.geom, p1: lift(tpl.geom.p1), p2: lift(tpl.geom.p2), tipRetracted: lift(tpl.geom.tipRetracted) },
    variants,
    defaultVariantId: variants.find((v) => v.id === tpl.defaultVariantId)?.id ?? variants[variants.length - 1].id,
    loads: key === '142' && s.model === '142' ? X142_LOADS : null,
    adapt: { dh, baseX, template: key, secStroke: templateSectionStrokes(tpl) },
  }
  if (register) registerCraneDef(def)
  return { template: key, templateReason: reason, def, variants, scales: { dh, baseX }, report }
}

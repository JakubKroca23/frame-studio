import { parseDecimal } from '../lib/geom'
import type { DxfEntity } from '../dxf/types'
import type { Box2, DimRecord, ScaleInfo } from './types'

const INSUNITS_MM: Record<number, { name: string; toMm: number }> = {
  0: { name: 'unitless', toMm: 1 },
  1: { name: 'inches', toMm: 25.4 },
  2: { name: 'feet', toMm: 304.8 },
  3: { name: 'miles', toMm: 1_609_344 },
  4: { name: 'mm', toMm: 1 },
  5: { name: 'cm', toMm: 10 },
  6: { name: 'm', toMm: 1000 },
  7: { name: 'km', toMm: 1_000_000 },
  8: { name: 'µin', toMm: 0.0000254 },
  9: { name: 'mils', toMm: 0.0254 },
  10: { name: 'yards', toMm: 914.4 },
  11: { name: 'Å', toMm: 1e-7 },
  12: { name: 'nm', toMm: 1e-6 },
  13: { name: 'µm', toMm: 0.001 },
  14: { name: 'dm', toMm: 100 },
  15: { name: 'dam', toMm: 10_000 },
  16: { name: 'hm', toMm: 100_000 },
  17: { name: 'gigametres', toMm: 1e12 },
  18: { name: 'AU', toMm: 1.495978707e14 },
  19: { name: 'ly', toMm: 9.4607304725808e18 },
  20: { name: 'pc', toMm: 3.085677581491367e19 },
}

export function unitsInfo(units: number): { name: string; toMm: number } {
  return INSUNITS_MM[units] ?? { name: `units(${units})`, toMm: 1 }
}

/** Collect DIMENSION entities that carry both a measurement and definition points. */
export function collectDims(entities: readonly DxfEntity[]): DimRecord[] {
  const out: DimRecord[] = []
  let id = 0
  for (const entity of entities) {
    if (entity.type !== 'DIMENSION' || !entity.dim) continue
    const d = entity.dim
    const value = resolveDimValue(d.measurement, d.rawText, entity.text ?? '')
    if (value == null || !(value > 0)) continue
    const kind = dimKind(d.type)
    const { geom, dir } = dimGeom(kind, d)
    if (!(geom > 1e-6)) continue
    out.push({
      id: id++,
      kind,
      value,
      text: (entity.text ?? '').trim() || String(value),
      geom,
      ratio: value / geom,
      island: null,
      dir,
      a: kind === 'diameter' || kind === 'radius' ? d.p10 : d.p13,
      b: kind === 'diameter' || kind === 'radius' ? d.p15 : d.p14,
    })
  }
  return out
}

function resolveDimValue(measurement: number | null, raw: string, text: string): number | null {
  if (measurement != null && Number.isFinite(measurement) && measurement > 0) return measurement
  const source = (raw && raw.trim() && raw.trim() !== '<>' ? raw : text) || ''
  // Strip template flags like "1-2 (<>)" and keep a plain number.
  const cleaned = source.replace(/[<>]/g, ' ').replace(/,/g, '.')
  const match = cleaned.match(/[-+]?\d+(?:\.\d+)?/)
  if (!match) return parseDecimal(source)
  const n = Number.parseFloat(match[0])
  return Number.isFinite(n) && n > 0 ? n : null
}

function dimKind(type: number): DimRecord['kind'] {
  if (type === 1) return 'aligned'
  if (type === 3) return 'diameter'
  if (type === 4) return 'radius'
  return 'linear'
}

function dimGeom(
  kind: DimRecord['kind'],
  d: { angle?: number; p10: { x: number; y: number }; p13: { x: number; y: number }; p14: { x: number; y: number }; p15: { x: number; y: number } },
): { geom: number; dir: DimRecord['dir'] } {
  if (kind === 'diameter') {
    return { geom: Math.hypot(d.p15.x - d.p10.x, d.p15.y - d.p10.y) * 2 || Math.hypot(d.p14.x - d.p13.x, d.p14.y - d.p13.y), dir: 'o' }
  }
  if (kind === 'radius') {
    return { geom: Math.hypot(d.p15.x - d.p10.x, d.p15.y - d.p10.y) || Math.hypot(d.p14.x - d.p13.x, d.p14.y - d.p13.y) / 2, dir: 'o' }
  }
  const dx = d.p14.x - d.p13.x
  const dy = d.p14.y - d.p13.y
  let geom = Math.hypot(dx, dy)
  let ang = Math.abs(Math.atan2(dy, dx))
  if (kind === 'linear') {
    // Rotated/horizontal/vertical dims measure the projection onto their direction.
    const a = ((d.angle ?? 0) * Math.PI) / 180
    geom = Math.abs(dx * Math.cos(a) + dy * Math.sin(a))
    ang = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)))
  }
  const dir: DimRecord['dir'] = ang < 0.2 || ang > Math.PI - 0.2 ? 'h' : Math.abs(ang - Math.PI / 2) < 0.2 ? 'v' : 'o'
  return { geom, dir }
}

/**
 * Detect paper → model scale by comparing DIMENSION measurements with their definition-point
 * distances. Never assume 1:1: sheet drawings (e.g. HIAB 1:20) store geometry in paper units.
 */
export function detectScale(
  dims: readonly DimRecord[],
  units: number,
  titleTexts: readonly string[] = [],
): ScaleInfo {
  const info = unitsInfo(units)
  const titleHint = findTitleScale(titleTexts)
  const ratios = dims
    .filter((d) => d.kind === 'linear' || d.kind === 'aligned')
    .map((d) => d.ratio)
    .filter((r) => Number.isFinite(r) && r > 0.05 && r < 5000)
    .sort((a, b) => a - b)

  if (ratios.length >= 2) {
    const med = median(ratios)
    // Cluster within ±8 % of the median — rejects outlier dims with wrong association.
    const cluster = ratios.filter((r) => Math.abs(r - med) / med < 0.08)
    if (cluster.length >= Math.max(2, Math.ceil(ratios.length * 0.4))) {
      const mmPerUnit = median(cluster)
      const ratio = mmPerUnit / info.toMm
      const rounded = snapScale(ratio)
      return {
        mmPerUnit,
        ratio: rounded,
        label: `1:${pretty(rounded)}`,
        source: 'dims',
        units,
        unitsName: info.name,
        unitToMm: info.toMm,
        dimsTotal: ratios.length,
        dimsAgreeing: cluster.length,
        titleHint,
        confident: cluster.length >= 3 || (cluster.length >= 2 && titleHintMatches(titleHint, rounded)),
        note: titleHint
          ? `Měřítko z kót (${cluster.length}/${ratios.length} souhlasí). V razítku: ${titleHint}.`
          : `Měřítko z kót (${cluster.length}/${ratios.length} souhlasí).`,
      }
    }
  }

  // Fall back: treat drawing units as the $INSUNITS size (1:1).
  return {
    mmPerUnit: info.toMm,
    ratio: 1,
    label: '1:1',
    source: 'units',
    units,
    unitsName: info.name,
    unitToMm: info.toMm,
    dimsTotal: ratios.length,
    dimsAgreeing: 0,
    titleHint,
    confident: ratios.length === 0,
    note:
      ratios.length === 0
        ? `Žádné použitelné kóty — předpokládám 1:1 (${info.name}).`
        : `Kóty se neshodují — předpokládám 1:1 (${info.name}). Razítko: ${titleHint ?? '—'}.`,
  }
}

function findTitleScale(texts: readonly string[]): string | null {
  for (const text of texts) {
    const m = text.match(/(?:měřítko|meritko|scale)\s*[:\s]*1\s*[:/]\s*(\d+(?:[.,]\d+)?)/i)
    if (m) return `1:${m[1].replace(',', '.')}`
    const bare = text.trim().match(/^1\s*[:/]\s*(\d+(?:[.,]\d+)?)$/)
    if (bare) return `1:${bare[1].replace(',', '.')}`
  }
  // Title-block cells often just say "1:20" next to the word Scale.
  for (const text of texts) {
    const m = text.match(/\b1\s*[:/]\s*(\d{1,4}(?:[.,]\d+)?)\b/)
    if (m) {
      const n = Number.parseFloat(m[1].replace(',', '.'))
      if (n >= 2 && n <= 500) return `1:${m[1].replace(',', '.')}`
    }
  }
  return null
}

function titleHintMatches(hint: string | null, ratio: number): boolean {
  if (!hint) return false
  const m = hint.match(/1:([\d.]+)/)
  if (!m) return false
  const n = Number.parseFloat(m[1])
  return Number.isFinite(n) && Math.abs(n - ratio) / Math.max(n, ratio) < 0.15
}

function snapScale(ratio: number): number {
  const standards = [1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]
  let best = ratio
  let bestErr = Infinity
  for (const s of standards) {
    const err = Math.abs(Math.log(ratio / s))
    if (err < bestErr) {
      bestErr = err
      best = s
    }
  }
  // Only snap when the median is within 6 % of a standard scale.
  return Math.abs(ratio - best) / best < 0.06 ? best : Math.round(ratio * 100) / 100
}

function pretty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Assign each dim to the island whose (slightly grown) bbox contains both definition points. */
export function attachDimsToIslands(dims: DimRecord[], boxes: readonly (Box2 & { id: number })[]): void {
  for (const dim of dims) {
    let best: number | null = null
    let bestArea = Infinity
    for (const box of boxes) {
      const g = Math.max(box.x1 - box.x0, box.y1 - box.y0) * 0.02
      const inside = (p: { x: number; y: number }) => p.x >= box.x0 - g && p.x <= box.x1 + g && p.y >= box.y0 - g && p.y <= box.y1 + g
      if (!inside(dim.a) || !inside(dim.b)) continue
      const area = (box.x1 - box.x0) * (box.y1 - box.y0)
      if (area < bestArea) {
        bestArea = area
        best = box.id
      }
    }
    dim.island = best
  }
}

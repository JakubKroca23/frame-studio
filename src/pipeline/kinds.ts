import type { Axle, CabModel } from '../model/types'

/** Visual class of a part that occupies space around the frame. */
export type EquipKind =
  | 'fuel'
  | 'adblue'
  | 'battery'
  | 'air'
  | 'exhaust'
  | 'stack'
  | 'toolbox'
  | 'shield'
  | 'skirt'
  | 'steps'
  | 'case'
  | 'bracket'
  | 'skip'

export const EQUIP_LABELS: Record<EquipKind, string> = {
  fuel: 'Nádrž',
  adblue: 'AdBlue',
  battery: 'Akumulátor',
  air: 'Vzduchojem',
  exhaust: 'Výfuk',
  stack: 'Komín',
  toolbox: 'Skříň nářadí',
  shield: 'Clona',
  skirt: 'Bočnice',
  steps: 'Schůdky',
  case: 'Skříň',
  bracket: 'Držák',
  skip: 'Vynechat',
}

export const BLOCK_PREFIX: Record<string, EquipKind> = {
  FT: 'fuel',
  AT: 'air',
  BB: 'battery',
  UT: 'toolbox',
  MH: 'toolbox',
  MP: 'toolbox',
  WC: 'toolbox',
  VE: 'stack',
  EP: 'exhaust',
  HS: 'shield',
  SA: 'skirt',
}

export interface KindInput {
  partNumber: string
  len: number
  height: number
  width: number
  x: number
  y: number
  z: number
  outer: number
  originX: number
  ground: number
  axles: Axle[]
  cab: CabModel | null
}

export interface KindDecision {
  kind: EquipKind
  confidence: number
  source: 'measured' | 'estimated'
  evidence: string
}

/**
 * Same rules the 3D builder used to classify a placed part.
 * Block names are measured; bare shape rules are estimates.
 */
export function classifyKind(input: KindInput): KindDecision {
  const outer = input.outer
  if (input.width > outer * 1.7 && input.len < 1600) {
    return { kind: 'skip', confidence: 0.7, source: 'measured', evidence: 'Příliš široké na příčku nebo nápravu.' }
  }
  if (input.width > outer * 0.85 && input.len < 420 && input.height < 480 && Math.abs(input.y) < outer * 0.35) {
    return { kind: 'skip', confidence: 0.66, source: 'measured', evidence: 'Sedí na příčce rámu.' }
  }
  if (cabOverlap(input) > 0.45 && Math.abs(input.y) < outer * 0.7) {
    return { kind: 'skip', confidence: 0.72, source: 'measured', evidence: 'Překryv s kabinou.' }
  }
  if (hitsTyre(input)) {
    return { kind: 'skip', confidence: 0.74, source: 'measured', evidence: 'Střed leží v kole.' }
  }
  const prefix = input.partNumber.split('_')[0]
  const known = BLOCK_PREFIX[prefix]
  if (known) {
    return {
      kind: known,
      confidence: 0.93,
      source: 'measured',
      evidence: `Název bloku ${input.partNumber}.`,
    }
  }
  const beside = Math.abs(input.y) > outer * 0.28
  const small = Math.min(input.len, input.height, input.width)
  const large = Math.max(input.len, input.height, input.width)
  const mid = input.len + input.height + input.width - small - large
  const shape = (kind: EquipKind, evidence: string): KindDecision => ({
    kind,
    confidence: 0.58,
    source: 'estimated',
    evidence,
  })
  if (input.height > 1100 && input.len < 480 && input.width < 900) return shape('stack', 'Vysoký úzký obrys, typický komín.')
  if (input.len > 1500 && input.height < 190 && input.width > 500) return shape('skirt', 'Dlouhý nízký pás podél rámu.')
  if (small < 60 && large > 280) return shape('shield', 'Tenký plech, typická clona nebo zástěrka.')
  if (small > 150 && small < 460 && large > small * 1.65 && mid < small * 1.6) return shape('air', 'Válcovité proporce, typický vzduchojem.')
  if (beside && input.len >= 1100 && input.height >= 420 && input.width >= 420 && input.len >= input.height * 2.1) {
    return shape('fuel', 'Dlouhá nádrž vedle rámu. Tvar je odhad, poloha je z výkresu.')
  }
  if (beside && input.len >= 320 && input.len <= 900 && input.height >= 200 && input.height <= 520 && input.width >= 220 && input.width <= 700) {
    return shape('adblue', 'Menší nádrž vedle rámu. Typ je odhad.')
  }
  if (beside && input.len >= 450 && input.len <= 1700 && input.height >= 320 && input.height <= 900 && input.width >= 280 && input.width <= 1000 && input.x < axleMid(input)) {
    return shape('battery', 'Skříň před středem rámu. Typ je odhad.')
  }
  if (beside && input.len >= 400 && input.len <= 1500 && input.height >= 260 && input.height <= 820 && input.width >= 260 && input.width <= 900) {
    return shape('toolbox', 'Skříň vedle rámu. Typ je odhad.')
  }
  if (input.len >= 500 && input.len <= 1500 && input.height >= 240 && input.height <= 750 && input.width >= 180 && input.width <= 620) {
    return shape('exhaust', 'Střední skříň, typický tlumič. Typ je odhad.')
  }
  if (large > 480 && small > 140) return shape('case', 'Uzavřený objem bez jistého typu.')
  if (large > 90) return shape('bracket', 'Drobný díl, kreslí se jako držák.')
  return { kind: 'skip', confidence: 0.4, source: 'estimated', evidence: 'Příliš malé na výbavu.' }
}

const TEXT_KINDS: [RegExp, EquipKind][] = [
  [/\bad[\s-]?blue\b|\bdef\b|močovin/i, 'adblue'],
  [/air\s*tank|vzduchojem|brake\s*reservoir/i, 'air'],
  [/\bfuel\b|naftov|diesel|\bnádrž\b|\bnadrz\b/i, 'fuel'],
  [/batter|akumul/i, 'battery'],
  [/exhaust|výfuk|vyfuk|\bscr\b|\bdpf\b/i, 'exhaust'],
  [/\bstack\b|komín|komin/i, 'stack'],
  [/toolbox|nářad|naradi|skříňka|skrinka/i, 'toolbox'],
  [/side\s*skirt|bočnic|bocnic/i, 'skirt'],
  [/mudguard|blatník|blatnik|zástěrk|zasterk/i, 'shield'],
  [/\bsteps?\b|stupát|stupat|schod/i, 'steps'],
]

export function kindFromText(raw: string): { kind: EquipKind; snippet: string } | null {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (text.length < 3 || text.length > 48) return null
  for (const [re, kind] of TEXT_KINDS) {
    if (re.test(text)) return { kind, snippet: text }
  }
  return null
}

function axleMid(input: KindInput) {
  if (!input.axles.length) return 0
  const a = input.axles[0].x - input.originX
  const b = input.axles[input.axles.length - 1].x - input.originX
  return a + (b - a) * 0.45
}

function cabOverlap(input: KindInput) {
  const cab = input.cab
  if (!cab) return 0
  const x0 = Math.max(cab.side.x0, cab.top.x0) - input.originX
  const x1 = Math.min(cab.side.x1, cab.top.x1) - input.originX
  return intervalOverlap(input.x, input.len, (x0 + x1) / 2, x1 - x0) / Math.max(1, input.len)
}

function hitsTyre(input: KindInput) {
  for (const axle of input.axles) {
    const ax = axle.x - input.originX
    const az = axle.z - input.ground
    const r = axle.tireDiameter / 2
    const dx = input.x - ax
    const dz = input.z - az
    const nearAxle = dx * dx + dz * dz < (r * 0.8) ** 2
    if (nearAxle && input.width > input.outer) return true
    if (!nearAxle) continue
    const track = axle.track ?? 2000
    const spec = axle.tireSpec?.match(/^(\d{3})/)
    const tyreW = spec ? Number(spec[1]) : 315
    for (const side of [-1, 1]) {
      const centers = axle.dual ? [side * (track / 2 - tyreW * 0.55), side * (track / 2 + tyreW * 0.55)] : [side * (track / 2)]
      for (const cz of centers) {
        if (Math.abs(input.y - cz) < tyreW * 0.7 + input.width * 0.25) return true
      }
    }
  }
  return false
}

function intervalOverlap(ca: number, sa: number, cb: number, sb: number) {
  const a0 = ca - sa / 2
  const a1 = ca + sa / 2
  const b0 = cb - sb / 2
  const b1 = cb + sb / 2
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
}

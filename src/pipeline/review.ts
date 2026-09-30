import type { BBox } from '../lib/geom'
import type { ChassisModel, ChassisParams, PartModel } from '../model/types'
import { EQUIP_LABELS, type EquipKind } from './kinds'

export type ReviewRole = 'frame' | 'hole' | 'liner' | 'crossmember' | 'axle' | 'mudguard' | 'cab' | 'equipment'

export interface ReviewField {
  key: string
  label: string
  value: number | string | boolean
  unit?: string
  estimated?: boolean
  step?: number
  options?: { value: string; label: string }[]
}

export interface ReviewElement {
  id: string
  role: ReviewRole
  title: string
  kind?: string
  confidence: number
  source: 'measured' | 'estimated' | 'user'
  evidence: string
  deleted?: boolean
  side: BBox | null
  top: BBox | null
  fields: ReviewField[]
}

const num = (el: ReviewElement, key: string, fallback = 0) => {
  const field = el.fields.find((item) => item.key === key)
  const value = field?.value
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

const str = (el: ReviewElement, key: string, fallback = '') => {
  const field = el.fields.find((item) => item.key === key)
  return typeof field?.value === 'string' ? field.value : fallback
}

const flag = (el: ReviewElement, key: string) => el.fields.find((item) => item.key === key)?.value === true

/** Detection review document. The 3D model is rebuilt from this, not from the raw parse. */
export function buildReview(model: ChassisModel): ReviewElement[] {
  const elements: ReviewElement[] = []
  const frame = model.frame
  if (frame) {
    const x0 = Math.min(frame.left[0]?.x ?? 0, frame.right[0]?.x ?? 0)
    const x1 = Math.max(frame.left[frame.left.length - 1]?.x ?? 0, frame.right[frame.right.length - 1]?.x ?? 0)
    const height = frame.topZ - frame.bottomZ
    const section = frame.section
    const src = frame.sources
    elements.push({
      id: 'frame',
      role: 'frame',
      title: 'Rám',
      confidence: src?.section === 'measured' ? 0.9 : 0.74,
      source: src?.height === 'estimated' ? 'estimated' : 'measured',
      evidence: section
        ? 'Profil C je z detailu ve výkresu. Obrys podélníků je z bokorysu a půdorysu.'
        : 'Obrys podélníků je z výkresu. Tloušťky a poloměry jsou typické hodnoty, ve výkresu chybí detail profilu.',
      side: { x0, y0: frame.bottomZ, x1, y1: frame.topZ },
      top: {
        x0,
        y0: frame.centerY - frame.outerWidthStraight / 2,
        x1,
        y1: frame.centerY + frame.outerWidthStraight / 2,
      },
      fields: [
        { key: 'x0', label: 'Začátek', value: Math.round(x0), unit: 'mm', step: 1 },
        { key: 'x1', label: 'Konec', value: Math.round(x1), unit: 'mm', step: 1 },
        { key: 'height', label: 'Výška profilu', value: Math.round(height), unit: 'mm', step: 1, estimated: src?.height === 'estimated' },
        { key: 'bottom', label: 'Spodní hrana', value: Math.round(frame.bottomZ), unit: 'mm', step: 1 },
        { key: 'flange', label: 'Šířka pásnice', value: Math.round(frame.flangeWidth), unit: 'mm', step: 1, estimated: src?.flange === 'estimated' },
        { key: 'outer', label: 'Šířka rámu', value: Math.round(frame.outerWidthStraight), unit: 'mm', step: 1, estimated: src?.width === 'estimated' },
        { key: 'front', label: 'Šířka vpředu', value: Math.round(frame.frontOuterWidth), unit: 'mm', step: 1 },
        { key: 'web', label: 'Tloušťka stojiny', value: section?.webThickness ?? 8, unit: 'mm', step: 0.5, estimated: !section },
        { key: 'flangeT', label: 'Tloušťka pásnice', value: section?.flangeThickness ?? 8, unit: 'mm', step: 0.5, estimated: !section },
        { key: 'corner', label: 'Poloměr ohybu', value: section?.outerRadius ?? 10, unit: 'mm', step: 1, estimated: !section },
      ],
    })
    if (frame.liner) {
      const linerMeasured = frame.sources?.liner !== 'estimated'
      elements.push({
        id: 'liner',
        role: 'liner',
        title: 'Vnitřní výztuha',
        confidence: linerMeasured ? 0.86 : 0.55,
        source: linerMeasured ? 'measured' : 'estimated',
        evidence: linerMeasured
          ? 'Úsek je z textu ve výkresu (inner liner).'
          : 'Úsek sleduje čáry těsně uvnitř podélníků v půdorysu. Text výztuhy ve výkresu není, tloušťku je třeba zadat.',
        side: { x0: frame.liner.x0, y0: frame.bottomZ, x1: frame.liner.x1, y1: frame.topZ },
        top: { x0: frame.liner.x0, y0: frame.centerY - 40, x1: frame.liner.x1, y1: frame.centerY + 40 },
        fields: [
          { key: 'x0', label: 'Od stanice', value: Math.round(frame.liner.x0), unit: 'mm', step: 1 },
          { key: 'x1', label: 'Do stanice', value: Math.round(frame.liner.x1), unit: 'mm', step: 1 },
        ],
      })
    }
  }

  model.holes.forEach((hole, index) => {
    const r = hole.d / 2
    elements.push({
      id: `hole-${index}`,
      role: 'hole',
      title: `Otvor ${index + 1}`,
      confidence: 0.9,
      source: 'measured',
      evidence: `Kružnice na vrstvě otvorů, strana ${hole.side === 'left' ? 'levá' : 'pravá'}.`,
      side: { x0: hole.x - r, y0: hole.z - r, x1: hole.x + r, y1: hole.z + r },
      top: null,
      fields: [
        { key: 'x', label: 'Stanice', value: Math.round(hole.x * 10) / 10, unit: 'mm', step: 0.1 },
        { key: 'z', label: 'Výška', value: Math.round(hole.z * 10) / 10, unit: 'mm', step: 0.1 },
        { key: 'd', label: 'Průměr', value: Math.round(hole.d * 10) / 10, unit: 'mm', step: 0.1 },
        {
          key: 'side',
          label: 'Strana',
          value: hole.side,
          options: [
            { value: 'left', label: 'Levá' },
            { value: 'right', label: 'Pravá' },
          ],
        },
      ],
    })
  })

  model.crossmembers.forEach((item, index) => {
    const y0 = frame ? frame.centerY - frame.outerWidthStraight / 2 : -400
    const y1 = frame ? frame.centerY + frame.outerWidthStraight / 2 : 400
    const z0 = frame?.bottomZ ?? 0
    const z1 = frame?.topZ ?? 270
    elements.push({
      id: `xm-${index}`,
      role: 'crossmember',
      title: `Příčka ${index + 1}`,
      confidence: 0.7,
      source: 'measured',
      evidence: 'Svislá hrana napříč rámem v půdorysu.',
      side: { x0: item.x - item.thickness / 2, y0: z0, x1: item.x + item.thickness / 2, y1: z1 },
      top: { x0: item.x - item.thickness / 2, y0, x1: item.x + item.thickness / 2, y1 },
      fields: [
        { key: 'x', label: 'Stanice', value: Math.round(item.x), unit: 'mm', step: 1 },
        { key: 'thickness', label: 'Tloušťka', value: Math.round(item.thickness), unit: 'mm', step: 1 },
      ],
    })
  })

  model.axles.forEach((axle) => {
    const r = axle.tireDiameter / 2
    const track = axle.track ?? 0
    elements.push({
      id: `axle-${axle.index}`,
      role: 'axle',
      title: `Náprava ${axle.index + 1}`,
      confidence: axle.tireConfidence ?? 0.6,
      source: axle.tireSource ?? 'estimated',
      evidence:
        axle.tireSource === 'measured'
          ? `Průměr ${axle.tireDiameter} mm je z kružnic nebo z textu pneumatiky${axle.tireSpec ? ` (${axle.tireSpec})` : ''}. Dvojmontáž: ${axle.dualSource === 'measured' ? 'z bloku kola' : 'odhad podle pořadí nápravy'}.`
          : 'Průměr pneumatiky ve výkresu chybí, použitý je typický rozměr.',
      side: { x0: axle.x - r, y0: axle.z - r, x1: axle.x + r, y1: axle.z + r },
      top: track
        ? { x0: axle.x - 40, y0: (frame?.centerY ?? 0) - track / 2, x1: axle.x + 40, y1: (frame?.centerY ?? 0) + track / 2 }
        : null,
      fields: [
        { key: 'x', label: 'Stanice', value: axle.x, unit: 'mm', step: 1 },
        { key: 'z', label: 'Výška osy', value: axle.z, unit: 'mm', step: 1 },
        { key: 'diameter', label: 'Průměr pneu', value: axle.tireDiameter, unit: 'mm', step: 1, estimated: axle.tireSource !== 'measured' },
        { key: 'track', label: 'Rozchod', value: axle.track ?? 0, unit: 'mm', step: 1, estimated: axle.track == null },
        { key: 'dual', label: 'Dvojmontáž', value: axle.dual, estimated: axle.dualSource !== 'measured' },
        { key: 'spec', label: 'Specifikace', value: axle.tireSpec ?? '' },
      ],
    })
    elements.push({
      id: `mud-${axle.index}`,
      role: 'mudguard',
      title: `Blatník nápravy ${axle.index + 1}`,
      confidence: 0.42,
      source: 'estimated',
      evidence: 'Blatník ve výkresu není samostatný díl. Oblouk sleduje průměr pneumatiky, šířka sleduje rozchod a dvojmontáž.',
      side: { x0: axle.x - r - 95, y0: axle.z, x1: axle.x + r + 95, y1: axle.z + r + 95 },
      top: null,
      fields: [
        { key: 'axle', label: 'Náprava', value: axle.index + 1, unit: '', step: 1 },
        { key: 'diameter', label: 'Průměr kola', value: axle.tireDiameter, unit: 'mm', step: 1, estimated: true },
      ],
    })
  })

  if (model.cab) {
    elements.push({
      id: 'cab',
      role: 'cab',
      title: 'Kabina',
      confidence: model.cab.confidence ?? 0.8,
      source: model.cab.source ?? 'measured',
      evidence: model.cab.evidence ?? 'Obrys kabiny je z vrstev kabiny v bokorysu a půdorysu. Detaily čela jsou typické pro výrobce.',
      side: { ...model.cab.side },
      top: { ...model.cab.top },
      fields: [
        { key: 'x0', label: 'Začátek', value: Math.round(model.cab.side.x0), unit: 'mm', step: 1 },
        { key: 'x1', label: 'Konec', value: Math.round(model.cab.side.x1), unit: 'mm', step: 1 },
        { key: 'z0', label: 'Spodní hrana', value: Math.round(model.cab.side.y0), unit: 'mm', step: 1 },
        { key: 'z1', label: 'Střecha', value: Math.round(model.cab.side.y1), unit: 'mm', step: 1 },
        { key: 'y0', label: 'Bok y0', value: Math.round(model.cab.top.y0), unit: 'mm', step: 1 },
        { key: 'y1', label: 'Bok y1', value: Math.round(model.cab.top.y1), unit: 'mm', step: 1 },
      ],
    })
  }

  for (const part of model.components) {
    if (!part.side || !part.top) continue
    const x0 = Math.max(part.side.x0, part.top.x0)
    const x1 = Math.min(part.side.x1, part.top.x1)
    const kind = part.kind ?? 'case'
    elements.push({
      id: `part-${part.id}`,
      role: 'equipment',
      title: partLabel(part),
      kind,
      confidence: part.confidence ?? 0.5,
      source: part.source ?? 'estimated',
      evidence: part.evidence ?? 'Díl z bloku ve výkresu.',
      side: { ...part.side },
      top: { ...part.top },
      fields: [
        {
          key: 'kind',
          label: 'Typ',
          value: kind,
          options: (Object.keys(EQUIP_LABELS) as EquipKind[]).map((value) => ({ value, label: EQUIP_LABELS[value] })),
        },
        { key: 'length', label: 'Délka', value: Math.round(x1 - x0), unit: 'mm', step: 1 },
        { key: 'height', label: 'Výška', value: Math.round(part.side.y1 - part.side.y0), unit: 'mm', step: 1 },
        { key: 'width', label: 'Šířka', value: Math.round(Math.abs(part.top.y1 - part.top.y0)), unit: 'mm', step: 1 },
        { key: 'station', label: 'Stanice', value: Math.round((x0 + x1) / 2), unit: 'mm', step: 1 },
        { key: 'z0', label: 'Spodní hrana', value: Math.round(part.side.y0), unit: 'mm', step: 1 },
        { key: 'yCenter', label: 'Osa Y', value: Math.round((part.top.y0 + part.top.y1) / 2), unit: 'mm', step: 1 },
      ],
    })
  }
  return elements
}

function partLabel(part: PartModel) {
  const kind = (part.kind ?? 'case') as EquipKind
  const name = EQUIP_LABELS[kind] ?? 'Díl'
  return `${name} ${part.partNumber}`
}

export function applyReview(model: ChassisModel, elements: ReviewElement[]): ChassisModel {
  const next = structuredClone(model)
  next.reviewApplied = true
  const live = elements.filter((item) => !item.deleted)
  const frameEl = live.find((item) => item.role === 'frame')
  if (next.frame && frameEl) applyFrame(next, frameEl)
  const linerEl = elements.find((item) => item.role === 'liner')
  if (next.frame) {
    if (!linerEl || linerEl.deleted) next.frame.liner = null
    else next.frame.liner = { x0: num(linerEl, 'x0'), x1: num(linerEl, 'x1') }
  }
  next.holes = live
    .filter((item) => item.role === 'hole')
    .map((item) => ({
      x: num(item, 'x'),
      z: num(item, 'z'),
      d: Math.max(1, num(item, 'd', 15)),
      side: str(item, 'side', 'left') === 'right' ? 'right' : 'left',
    }))
  next.crossmembers = live
    .filter((item) => item.role === 'crossmember')
    .map((item) => ({ x: num(item, 'x'), thickness: Math.max(8, num(item, 'thickness', 60)) }))
  next.axles = live
    .filter((item) => item.role === 'axle')
    .map((item, index) => ({
      index,
      x: num(item, 'x'),
      z: num(item, 'z'),
      tireDiameter: Math.max(200, num(item, 'diameter', 1076)),
      tireSpec: str(item, 'spec') || undefined,
      track: num(item, 'track') > 0 ? num(item, 'track') : null,
      dual: flag(item, 'dual'),
      tireSource: item.source === 'estimated' ? 'estimated' : 'measured',
      tireConfidence: item.confidence,
      dualSource: item.fields.find((field) => field.key === 'dual')?.estimated ? 'estimated' : 'measured',
    }))
  const cabEl = live.find((item) => item.role === 'cab')
  if (!cabEl) next.cab = null
  else if (next.cab) {
    const x0 = num(cabEl, 'x0', next.cab.side.x0)
    const x1 = num(cabEl, 'x1', next.cab.side.x1)
    const z0 = num(cabEl, 'z0', next.cab.side.y0)
    const z1 = num(cabEl, 'z1', next.cab.side.y1)
    const y0 = num(cabEl, 'y0', next.cab.top.y0)
    const y1 = num(cabEl, 'y1', next.cab.top.y1)
    next.cab.side = { x0: Math.min(x0, x1), y0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(z0, z1) }
    next.cab.top = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) }
  }
  next.skipMudguards = elements.filter((item) => item.role === 'mudguard' && item.deleted).map((item) => Math.max(0, num(item, 'axle', 1) - 1))
  next.components = live.filter((item) => item.role === 'equipment').map((item, index) => equipmentPart(item, index))
  next.stats = { ...next.stats, holeCount: next.holes.length }
  return next
}

function applyFrame(model: ChassisModel, el: ReviewElement) {
  const frame = model.frame
  if (!frame) return
  const height = Math.max(80, num(el, 'height', frame.topZ - frame.bottomZ))
  const bottom = num(el, 'bottom', frame.bottomZ)
  frame.bottomZ = bottom
  frame.topZ = bottom + height
  frame.flangeWidth = Math.max(20, num(el, 'flange', frame.flangeWidth))
  const outer = Math.max(200, num(el, 'outer', frame.outerWidthStraight))
  const front = Math.max(200, num(el, 'front', frame.frontOuterWidth))
  scaleRails(frame, outer, front)
  const web = num(el, 'web', frame.section?.webThickness ?? 8)
  const flangeT = num(el, 'flangeT', frame.section?.flangeThickness ?? 8)
  const corner = num(el, 'corner', frame.section?.outerRadius ?? 10)
  if (frame.section) {
    frame.section.webThickness = web
    frame.section.flangeThickness = flangeT
    frame.section.outerRadius = corner
    frame.section.height = height
    frame.section.flangeWidth = frame.flangeWidth
  } else if (el.fields.some((field) => field.key === 'web' && field.estimated === false)) {
    frame.section = {
      height,
      flangeWidth: frame.flangeWidth,
      webThickness: web,
      flangeThickness: flangeT,
      outerRadius: corner,
      innerRadius: Math.max(1, corner - flangeT),
    }
  }
  const x0 = num(el, 'x0')
  const x1 = num(el, 'x1')
  if (x1 > x0 + 100) scaleRailLength(frame, x0, x1)
}

function scaleRails(frame: NonNullable<ChassisModel['frame']>, outer: number, front: number) {
  const oldOuter = frame.outerWidthStraight || outer
  const oldFront = frame.frontOuterWidth || oldOuter
  const cy = frame.centerY
  const n = Math.max(frame.left.length, 1)
  const mapY = (y: number, index: number, length: number) => {
    const t = length <= 1 ? 0 : index / (length - 1)
    const localOld = t < 0.18 ? oldFront : oldOuter
    const localNew = t < 0.18 ? front : outer
    const ratio = localOld > 1 ? localNew / localOld : 1
    return cy + (y - cy) * ratio
  }
  frame.left = frame.left.map((point, index) => ({ ...point, y: mapY(point.y, index, n) }))
  frame.right = frame.right.map((point, index) => ({ ...point, y: mapY(point.y, index, frame.right.length) }))
  frame.outerWidthStraight = outer
  frame.frontOuterWidth = front
}

function scaleRailLength(frame: NonNullable<ChassisModel['frame']>, x0: number, x1: number) {
  const old0 = Math.min(frame.left[0]?.x ?? x0, frame.right[0]?.x ?? x0)
  const old1 = Math.max(frame.left[frame.left.length - 1]?.x ?? x1, frame.right[frame.right.length - 1]?.x ?? x1)
  const span = old1 - old0 || 1
  const mapX = (x: number) => x0 + ((x - old0) / span) * (x1 - x0)
  frame.left = frame.left.map((point) => ({ ...point, x: mapX(point.x) }))
  frame.right = frame.right.map((point) => ({ ...point, x: mapX(point.x) }))
}

function equipmentPart(el: ReviewElement, index: number): PartModel {
  syncEquipment(el)
  const kind = str(el, 'kind', el.kind ?? 'case')
  const side = el.side ?? { x0: 0, y0: 0, x1: 100, y1: 100 }
  const top = el.top ?? { x0: side.x0, y0: -200, x1: side.x1, y1: 200 }
  return {
    id: el.id || `user-${index}`,
    partNumber: el.title.replace(/^.*\s/, '') || kind,
    kind,
    confidence: el.confidence,
    source: el.source,
    evidence: el.evidence,
    side,
    top,
    samples: [
      { x: side.x0, z0: side.y0, z1: side.y1, y0: top.y0, y1: top.y1 },
      { x: side.x1, z0: side.y0, z1: side.y1, y0: top.y0, y1: top.y1 },
    ],
  }
}

export function syncEquipment(el: ReviewElement) {
  if (el.role !== 'equipment') return
  const length = Math.max(20, num(el, 'length', 400))
  const height = Math.max(20, num(el, 'height', 400))
  const width = Math.max(20, num(el, 'width', 400))
  const station = num(el, 'station')
  const z0 = num(el, 'z0')
  const yCenter = num(el, 'yCenter')
  el.side = { x0: station - length / 2, y0: z0, x1: station + length / 2, y1: z0 + height }
  el.top = { x0: station - length / 2, y0: yCenter - width / 2, x1: station + length / 2, y1: yCenter + width / 2 }
  el.kind = str(el, 'kind', el.kind ?? 'case')
  const label = EQUIP_LABELS[el.kind as EquipKind] ?? 'Díl'
  const prefixed = el.title.startsWith(`${label} `) ? el.title.slice(label.length).trim() : ''
  const pn = prefixed || (el.title.startsWith(label) ? '' : el.title.split(' ').slice(1).join(' '))
  el.title = pn ? `${label} ${pn}` : label
}

export function paramsFromReview(elements: ReviewElement[]): Partial<ChassisParams> {
  const frame = elements.find((item) => item.role === 'frame' && !item.deleted)
  const axles = elements.filter((item) => item.role === 'axle' && !item.deleted)
  const patch: Partial<ChassisParams> = {}
  if (frame) {
    patch.webThickness = num(frame, 'web', 8)
    patch.flangeThickness = num(frame, 'flangeT', 8)
    patch.cornerRadius = num(frame, 'corner', 10)
  }
  if (axles.length) patch.tracks = axles.map((item) => num(item, 'track'))
  return patch
}

export function newEquipment(box: BBox, view: 'side' | 'top', frame: ChassisModel['frame']): ReviewElement {
  const length = Math.max(80, box.x1 - box.x0)
  const station = (box.x0 + box.x1) / 2
  const outer = frame?.outerWidthStraight ?? 760
  const center = frame?.centerY ?? 0
  const bottom = frame?.bottomZ ?? 700
  let z0 = bottom
  let height = 500
  let yCenter = center - outer / 2 - 280
  let width = 450
  if (view === 'side') {
    z0 = Math.min(box.y0, box.y1)
    height = Math.max(40, Math.abs(box.y1 - box.y0))
  } else {
    yCenter = (box.y0 + box.y1) / 2
    width = Math.max(40, Math.abs(box.y1 - box.y0))
  }
  const el: ReviewElement = {
    id: `user-${Math.random().toString(36).slice(2, 8)}`,
    role: 'equipment',
    title: 'Nový díl',
    kind: 'case',
    confidence: 1,
    source: 'user',
    evidence: view === 'side' ? 'Oblast nakreslená v bokorysu. Šířka je odhad vedle rámu.' : 'Oblast nakreslená v půdorysu. Výška je odhad.',
    side: null,
    top: null,
    fields: [
      {
        key: 'kind',
        label: 'Typ',
        value: 'case',
        options: (Object.keys(EQUIP_LABELS) as EquipKind[]).map((value) => ({ value, label: EQUIP_LABELS[value] })),
      },
      { key: 'length', label: 'Délka', value: Math.round(length), unit: 'mm', step: 1 },
      { key: 'height', label: 'Výška', value: Math.round(height), unit: 'mm', step: 1, estimated: view !== 'side' },
      { key: 'width', label: 'Šířka', value: Math.round(width), unit: 'mm', step: 1, estimated: view !== 'top' },
      { key: 'station', label: 'Stanice', value: Math.round(station), unit: 'mm', step: 1 },
      { key: 'z0', label: 'Spodní hrana', value: Math.round(z0), unit: 'mm', step: 1, estimated: view !== 'side' },
      { key: 'yCenter', label: 'Osa Y', value: Math.round(yCenter), unit: 'mm', step: 1, estimated: view !== 'top' },
    ],
  }
  syncEquipment(el)
  return el
}

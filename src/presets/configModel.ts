import { tireDiameterMm, type BBox, type Pt } from '../lib/geom'
import type { Axle, ChassisModel, ChassisParams, Crossmember, Dimension, Hole, PartModel } from '../model/types'
import { defaultParams } from '../model/types'
import { cabShape } from './cabShapes'
import type { ChassisConfig, Side } from './types'
import { MAKES } from './index'

const box = (x0: number, y0: number, x1: number, y1: number): BBox => ({ x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) })

export function tyreDiameter(spec: string): number {
  return tireDiameterMm(spec) ?? 1050
}

/** Section width of a tyre size such as 385/65R22.5. */
function tyreWidth(spec: string): number {
  const match = spec.match(/^(\d{3})\//)
  return match ? Number(match[1]) : 315
}

const sideSign = (side: Side) => (side === 'left' ? -1 : 1)

/** Everything the equipment packer needs about the chassis. */
interface Layout {
  cfg: ChassisConfig
  xFront: number
  xRear: number
  rearAxles: number[]
  firstRear: number
  frontRadius: number
  rearRadius: number
  half: number
  top: number
  bottom: number
}

/**
 * Converts a configurator chassis into the same ChassisModel the drawing flow produces, so the
 * existing mesh builders draw it. Drawing axes: x rearward from the first axle, y lateral (left
 * negative), z up from the road.
 */
export function configToModel(cfg: ChassisConfig, id = 'config'): ChassisModel {
  const warnings: string[] = []
  const axles: Axle[] = cfg.axles.map((axle, index) => {
    const d = tyreDiameter(axle.tyre)
    return {
      index,
      x: axle.position,
      z: d / 2,
      tireDiameter: d,
      tireSpec: axle.tyre,
      track: axle.track,
      dual: axle.twin,
      driven: axle.driven,
      steered: axle.steered,
      lift: axle.lift,
      tireSource: 'measured',
      dualSource: 'measured',
    }
  })
  const f = cfg.frame
  const lastAxle = Math.max(...cfg.axles.map((axle) => axle.position))
  const xFront = -f.frontEnd
  const xRear = lastAxle + cfg.rearOverhang
  const wr = f.widthRear
  const wf = f.widthFront
  const taperEnd = Math.min(Math.max(f.taperEnd, xFront + 200), xRear - 200)
  const taperStart = Math.max(xFront + 100, taperEnd - 900)
  const railPath = (sign: number): Pt[] =>
    Math.abs(wf - wr) < 1
      ? [
          { x: xFront, y: (sign * wr) / 2 },
          { x: xRear, y: (sign * wr) / 2 },
        ]
      : [
          { x: xFront, y: (sign * wf) / 2 },
          { x: taperStart, y: (sign * wf) / 2 },
          { x: taperEnd, y: (sign * wr) / 2 },
          { x: xRear, y: (sign * wr) / 2 },
        ]
  const top = f.topHeight
  const bottom = top - f.sectionHeight

  const firstRearIdx = Math.max(1, cfg.axles.findIndex((axle, i) => i > 0 && !(axle.steered && axle.position < 2600)))
  const rearAxles = cfg.axles.slice(firstRearIdx).map((axle) => axle.position)
  const layout: Layout = {
    cfg,
    xFront,
    xRear,
    rearAxles,
    firstRear: rearAxles[0] ?? lastAxle,
    frontRadius: axles[0].tireDiameter / 2,
    rearRadius: (axles[firstRearIdx]?.tireDiameter ?? axles[0].tireDiameter) / 2,
    half: wr / 2,
    top,
    bottom,
  }

  const shape = cabShape({
    cab: cfg.cab,
    make: cfg.make,
    series: cfg.series,
    tractor: cfg.kind === 'tractor',
    frontOverhang: cfg.frontOverhang,
    frameTop: top,
    wheelRadius: layout.frontRadius,
    axleZ: axles[0].z,
    frontTrack: cfg.axles[0]?.track,
    tyreWidth: tyreWidth(cfg.axles[0]?.tyre ?? ''),
  })
  const cabSide = box(shape.box.x0, shape.box.z0, shape.box.x1, shape.box.z1)
  const cabTop = box(shape.box.x0, shape.box.y0, shape.box.x1, shape.box.y1)
  const frontBox = box(shape.box.y0, shape.box.z0, shape.box.y1, shape.box.z1)

  const holes = frameHoles(layout, cfg.cab.backFromAxle)
  const crossmembers = frameCrossmembers(layout, cfg.cab.backFromAxle)
  const components = equipment(layout, warnings)
  const underCab = cfg.axles.flatMap((axle, index) => (axle.position < cfg.cab.backFromAxle + 250 ? [index] : []))
  const skipMudguards = cfg.mudguards ? underCab : cfg.axles.map((_, index) => index)
  const extentsX0 = Math.min(xFront, -cfg.frontOverhang)
  const make = MAKES.find((item) => item.id === cfg.make)?.name ?? cfg.make
  const dims = dimensions(cfg, layout)

  return {
    version: 1,
    profileId: `config-${cfg.make}`,
    profileName: `Konfigurátor · ${make}`,
    manufacturer: make,
    score: 1,
    warnings,
    units: 'mm',
    dxfVersion: 'config',
    header: {
      chassisType: cfg.name,
      orderNo: id,
      title: 'Konfigurátor podvozku',
      cabType: `${cfg.series} ${cfg.cab.kind === 'sleeper' ? 'spací' : 'denní'}`,
      totalWeight: `${cfg.gvw} kg`,
    },
    extents: box(extentsX0, 0, xRear, cfg.cab.height),
    views: { side: box(extentsX0, 0, xRear, cfg.cab.height), top: box(extentsX0, -1300, xRear, 1300), front: frontBox },
    dimensions: dims,
    frame: {
      left: railPath(-1),
      right: railPath(1),
      topZ: top,
      bottomZ: bottom,
      centerY: 0,
      flangeWidth: f.flange,
      outerWidthStraight: wr,
      frontOuterWidth: wf,
      liner: null,
      section: {
        height: f.sectionHeight,
        flangeWidth: f.flange,
        webThickness: f.thickness,
        flangeThickness: f.thickness,
        outerRadius: Math.round(f.thickness * 1.5),
        innerRadius: f.thickness,
      },
      sources: { height: 'measured', width: 'measured', flange: 'measured', section: 'measured' },
    },
    holes,
    axles,
    crossmembers,
    cab: {
      side: cabSide,
      top: cabTop,
      samples: [],
      silhouettes: { side: shape.side, top: shape.top, front: shape.front, frame: { side: cabSide, top: cabTop, front: frontBox } },
      source: 'estimated',
      parametric: shape.spec,
      color: cfg.cab.color,
      stepX: shape.stepX,
      stepZ: shape.stepZ,
    },
    components,
    skipMudguards,
    reviewApplied: true,
    anchorX: 0,
    groundZ: 0,
    rearBar: cfg.rearUnderrun,
    sideBars: false,
    preview: { segments: {}, circles: {} },
    stats: { segmentCount: 0, circleCount: 0, blockCount: 0, holeCount: holes.length, parseMs: 0 },
  }
}

/** Builder parameters that match a configuration (section thickness, tyres, detail level). */
export function paramsForConfig(cfg: ChassisConfig, base: ChassisParams = defaultParams): ChassisParams {
  return {
    ...base,
    webThickness: cfg.frame.thickness,
    flangeThickness: cfg.frame.thickness,
    cornerRadius: Math.round(cfg.frame.thickness * 1.5),
    linerEnabled: false,
    loadState: 'laden',
    tireSpec: cfg.axles[0]?.tyre ?? base.tireSpec,
    useDrawingTires: true,
    dualDrive: true,
    tracks: cfg.axles.map(() => 0),
    lod: 2,
    holes: 'geometry',
    show: { ...base.show, suspension: true, drivetrain: true },
  }
}

function frameHoles(layout: Layout, cabBack: number): Hole[] {
  const holes: Hole[] = []
  const x0 = Math.max(cabBack + 150, layout.xFront + 200)
  const x1 = layout.xRear - 60
  const length = Math.max(0, x1 - x0)
  const rows = [layout.top - 45, layout.bottom + 45]
  let pitch = 100
  while ((length / pitch + 1) * rows.length * 2 > 700) pitch += 50
  for (const side of ['left', 'right'] as const) {
    for (const z of rows) {
      for (let x = x0; x <= x1; x += pitch) holes.push({ x: Math.round(x), z, d: 14.5, side })
    }
    // Spring and bracket bolt groups around every axle.
    for (const axle of layout.cfg.axles) {
      for (const dx of [-620, -570, 570, 620]) {
        const x = axle.position + dx
        if (x < layout.xFront + 40 || x > layout.xRear - 40) continue
        holes.push({ x, z: (layout.top + layout.bottom) / 2, d: 16.5, side })
      }
    }
  }
  return holes
}

function frameCrossmembers(layout: Layout, cabBack: number): Crossmember[] {
  const xs: number[] = [layout.xFront + 110, Math.max(layout.xFront + 600, cabBack + 350)]
  const rear = layout.rearAxles
  for (const x of rear) xs.push(x - 700, x + 700)
  if (rear.length > 1) xs.push((rear[0] + rear[rear.length - 1]) / 2)
  xs.push(layout.xRear - 60)
  const sorted = [...new Set(xs.map(Math.round))].filter((x) => x > layout.xFront + 50 && x < layout.xRear - 30).sort((a, b) => a - b)
  const filled: number[] = []
  for (const x of sorted) {
    const prev = filled[filled.length - 1]
    if (prev !== undefined && x - prev > 1500) {
      const n = Math.ceil((x - prev) / 1400)
      for (let i = 1; i < n; i++) filled.push(Math.round(prev + ((x - prev) * i) / n))
    }
    if (prev === undefined || x - prev > 250) filled.push(x)
  }
  return filled.map((x, i) => ({ x, thickness: i === filled.length - 1 ? 90 : 70 }))
}

function part(id: string, kind: string, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number): PartModel {
  return { id, partNumber: id, kind, side: box(x0, z0, x1, z1), top: box(x0, y0, x1, y1), samples: [], source: 'user', confidence: 1 }
}

interface Slot {
  id: string
  kind: string
  len: number
  height: number
  width: number
  /** Centre height; defaults to hanging just below the frame top. */
  z?: number
}

function equipment(layout: Layout, warnings: string[]): PartModel[] {
  const { cfg } = layout
  const parts: PartModel[] = []
  const lastFront = Math.max(0, ...cfg.axles.map((axle) => axle.position).filter((x) => x < layout.firstRear))
  const start = lastFront + layout.frontRadius + 220
  const limit = layout.firstRear - layout.rearRadius - 140
  const bySide: Record<Side, Slot[]> = { left: [], right: [] }
  if (cfg.exhaust.kind === 'horizontal') bySide[cfg.exhaust.side].push({ id: 'EP_silencer', kind: 'exhaust', len: 900, height: 560, width: 560, z: layout.bottom + 60 })
  if (cfg.battery.enabled) bySide[cfg.battery.side].push({ id: 'BB_battery', kind: 'battery', len: 760, height: 480, width: 560, z: layout.bottom + 90 })
  if (cfg.fuel.enabled && cfg.fuel.liters > 0) {
    const h = cfg.make === 'volvo' ? 710 : 620
    const w = Math.min(700, h)
    const len = Math.max(400, Math.round((cfg.fuel.liters * 1e6) / (0.86 * h * w)))
    bySide[cfg.fuel.side].push({ id: 'FT_fuel', kind: 'fuel', len, height: h, width: w, z: Math.max(h / 2 + 260, layout.top - h / 2 - 20) })
  }
  if (cfg.adblue.enabled && cfg.adblue.liters > 0) {
    const h = 480
    const w = 420
    const len = Math.max(300, Math.round((cfg.adblue.liters * 1e6) / (0.8 * h * w)))
    bySide[cfg.adblue.side].push({ id: 'BP_adblue', kind: 'adblue', len, height: h, width: w, z: Math.max(h / 2 + 300, layout.top - h / 2 - 40) })
  }
  if (cfg.airTanks.enabled && cfg.airTanks.count > 0) {
    const other: Side = cfg.battery.side
    const pairs = Math.ceil(cfg.airTanks.count / 2)
    for (let i = 0; i < pairs; i++) bySide[other].push({ id: `AT_air${i + 1}`, kind: 'air', len: 640, height: 250, width: 250, z: layout.bottom + 40 })
  }

  const free: Record<Side, [number, number][]> = { left: [], right: [] }
  const cursor: Record<Side, number> = { left: start, right: start }
  const behind = layout.rearAxles[layout.rearAxles.length - 1] + layout.rearRadius + 120
  let inside = start
  const place = (slot: Slot, side: Side, x0: number) => {
    const sign = sideSign(side)
    const z = slot.z ?? layout.top - slot.height / 2
    parts.push(part(slot.id, slot.kind, x0, x0 + slot.len, z - slot.height / 2, z + slot.height / 2, sign * (layout.half + 40), sign * (layout.half + 40 + slot.width)))
  }
  const priority = ['fuel', 'exhaust', 'battery', 'adblue', 'air']
  const queue = (['left', 'right'] as const)
    .flatMap((side) => bySide[side].map((slot) => ({ slot, side })))
    .sort((p, q) => priority.indexOf(p.slot.kind) - priority.indexOf(q.slot.kind))
  for (const { slot, side } of queue) {
    const other: Side = side === 'left' ? 'right' : 'left'
    if (cursor[side] + slot.len <= limit) {
      place(slot, side, cursor[side])
      cursor[side] += slot.len + 80
    } else if (slot.kind !== 'air' && slot.kind !== 'fuel' && cursor[other] + slot.len <= limit) {
      place(slot, other, cursor[other])
      cursor[other] += slot.len + 80
    } else if (slot.kind === 'air' && inside + slot.len <= limit) {
      // Between the rails, one tank on each side of the propeller shaft.
      const y = layout.half - layout.cfg.frame.flange - 150
      for (const sign of [-1, 1]) {
        parts.push(part(`${slot.id}${sign < 0 ? 'L' : 'R'}`, 'air', inside, inside + slot.len, layout.bottom - 60, layout.bottom + 190, sign * y - 125, sign * y + 125))
      }
      inside += slot.len + 80
    } else if (layout.xRear - behind > slot.len + 60) {
      // Does not fit between the axles: hang it behind the last axle (typical on short tractors).
      place(slot, side, behind)
    } else {
      warnings.push(`${label(slot.kind)} se na ${side === 'left' ? 'levé' : 'pravé'} straně nevejde mezi nápravy.`)
      place(slot, side, cursor[side])
      cursor[side] += slot.len + 80
    }
  }
  for (const side of ['left', 'right'] as const) {
    // Guards run from the fuel tank (which protects its own stretch) to the rear wheels.
    const sign = sideSign(side)
    const tankEnd = Math.max(
      start,
      ...parts.filter((p) => p.kind === 'fuel' && p.top && Math.sign(p.top.y0 + p.top.y1) === sign && p.side!.x1 < limit).map((p) => p.side!.x1 + 40),
    )
    if (limit - tankEnd > 400) free[side].push([tankEnd, limit])
  }

  if (cfg.exhaust.kind === 'vertical') {
    const sign = sideSign(cfg.exhaust.side)
    const x = cfg.cab.backFromAxle + 180
    const y = sign * (cfg.cab.width / 2 - 260)
    parts.push(part('VE_stack', 'stack', x - 90, x + 90, layout.top - 200, cfg.cab.height + 250, y - 90, y + 90))
  }

  if (cfg.kind === 'tractor' && cfg.fifthWheel.enabled) {
    const rear = layout.rearAxles
    const ref = (rear[0] + rear[rear.length - 1]) / 2
    const x = ref - cfg.fifthWheel.lead
    const plateTop = cfg.fifthWheel.height
    parts.push(part('FE_fifth', 'fifth', x - 450, x + 450, plateTop - 80, plateTop - 14, -430, 430))
    for (const sign of [-1, 1]) {
      const y = sign * (layout.half - 45)
      parts.push(part(`FE_mount${sign < 0 ? 'L' : 'R'}`, 'skirt', x - 560, x + 560, layout.top, Math.max(layout.top + 20, plateTop - 28), y - 60, y + 60))
    }
  }

  if (cfg.sideGuards) {
    const outer = Math.max(layout.half + 40 + 620, 1170)
    for (const side of ['left', 'right'] as const) {
      const sign = sideSign(side)
      free[side].forEach(([x0, x1], i) => {
        for (const [k, z] of [
          [0, 420],
          [1, 760],
        ] as const) {
          parts.push(part(`HS_guard${side[0]}${i}${k}`, 'shield', x0 + 40, x1 - 40, z - 50, z + 50, sign * (outer - 15), sign * (outer + 15)))
        }
      })
    }
  }
  return parts
}

function label(kind: string): string {
  return (
    { fuel: 'Palivová nádrž', adblue: 'Nádrž AdBlue', battery: 'Bateriová skříň', air: 'Vzduchojem', exhaust: 'Tlumič výfuku' } as Record<string, string>
  )[kind] ?? kind
}

function dimensions(cfg: ChassisConfig, layout: Layout): Dimension[] {
  const dim = (label: string, value: number): Dimension => ({ label, value: Math.round(value), x: 0, y: 0, confidence: 1, source: 'inline' })
  const out: Dimension[] = [
    dim('L011', layout.firstRear),
    dim('L016', cfg.frontOverhang),
    dim('L018', cfg.frame.frontEnd),
    dim('L019', cfg.rearOverhang),
    dim('W036', cfg.frame.widthRear),
    dim('W035', cfg.frame.widthFront),
    dim('W032.1', cfg.frame.flange),
    dim('H032.1', cfg.frame.sectionHeight),
    dim('H038', cfg.frame.topHeight),
  ]
  cfg.axles.forEach((axle, i) => {
    if (i > 0) out.push(dim(`L012.${i}`, axle.position - cfg.axles[i - 1].position))
    out.push(dim(`W013.${i + 1}`, axle.track))
    out.push(dim(`L022.${i + 1}`, tyreDiameter(axle.tyre)))
  })
  return out
}

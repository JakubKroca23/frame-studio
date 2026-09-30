import { flatten, type HoleFrameFix } from '../dxf/flatten'
import { parseDxf } from '../dxf/parse'
import type { Circ, DxfDb, InsertRec, Loop, Seg, Txt } from '../dxf/types'
import {
  bboxOf,
  boxHeight,
  boxWidth,
  layerMatches,
  overlap1d,
  robustPoints,
  segLen,
  tireDiameterMm,
  type BBox,
  type Pt,
} from '../lib/geom'
import type { Axle, CabModel, ChassisModel, Crossmember, Dimension, Hole, PartModel, Slice } from '../model/types'
import { annotateParts } from './annotate'
import { classifyBlock } from '../profile/classify'
import { detectProfile } from '../profile/registry'
import { scaniaIcdProfile } from '../profile/scania-icd'
import type { BlockViewName, Profile } from '../profile/types'
import { dimensionMap, pairDimensions } from './dimensions'
import { extractFrame } from './frame'
import { extractRaisedBodies } from './raised'
import { extractSection } from './section'
import { envelope } from '../mesh/silhouette'

const DEFAULT_PART = /^(?<pn>\d{7})(?:_\d+)?$/

/**
 * Pure DXF → chassis model pipeline.
 * The same function runs in a worker today and can move to a server function later;
 * the UI only consumes ChassisModel plus parameters.
 */
export function analyzeDxf(text: string, onProgress?: (stage: string) => void): ChassisModel {
  const t0 = performance.now()
  onProgress?.('Čtu DXF…')
  const db = parseDxf(text)
  const match = detectProfile(db)
  const profile = match?.profile ?? scaniaIcdProfile
  const warnings: string[] = []
  if (!match) {
    warnings.push('Profil výrobce nebyl rozpoznán. Detekce zkouší pravidla Scania ICD jako výchozí.')
  }
  if (db.units === 0) warnings.push('Výkres neuvádí jednotky. Počítá se s milimetry a kontroluje se proti kótám.')

  const named = (patterns: string[]) => [...db.layers].filter((l) => layerMatches(l, patterns))
  onProgress?.('Rozkládám bloky…')
  const flat = flatten(db, {
    ignoreBlocks: profile.ignore.blocks,
    ignoreBlockPatterns: profile.ignore.blockPatterns,
    ignoreLayers: profile.ignore.layers,
    geometryIgnoreLayers: named([...profile.views.dimensions, ...profile.views.info]),
    holeFix: holeFixFrom(db, profile),
    curveTolerance: profile.curveTolerance,
    minSegment: profile.minSegment,
  })

  const on = (patterns: string[]) => (layer: string) => layerMatches(layer, patterns)
  const classify = (name: string) => classifyBlock(name, profile.blockViews)
  const windows = profile.blockViews ? viewWindows(flat.segments, classify) : null
  const frameLayer = (layer: string) => on(profile.views.frameTop)(layer) || on(profile.views.frameSide)(layer)
  const frameTop = flat.segments.filter((s) => frameLayer(s.layer) && inRole(s, 'top', windows, classify, profile))
  const frameSide = flat.segments.filter((s) => frameLayer(s.layer) && inRole(s, 'side', windows, classify, profile))
  const crossSegs = flat.segments.filter(
    (s) => on(profile.views.crossmembers ?? profile.views.frameTop)(s.layer) && inRole(s, 'top', windows, classify, profile),
  )
  const dims = pairDimensions(flat.texts, profile, on(profile.views.dimensions))
  const dmap = dimensionMap(dims)
  const sem = profile.semantics

  onProgress?.('Skládám rám, nápravy a kabinu…')
  const frame = extractFrame(frameTop.length ? frameTop : flat.segments.filter((s) => on(profile.views.frameTop)(s.layer)), frameSide.length ? frameSide : flat.segments.filter((s) => on(profile.views.frameSide)(s.layer)), {
    outerWidth: sem.frameOuterWidth ? dmap.get(sem.frameOuterWidth) : undefined,
    flange: sem.flangeWidth ? dmap.get(sem.flangeWidth) : undefined,
    height: sem.frameHeight ? dmap.get(sem.frameHeight) : undefined,
    preferLongest: profile.preferLongRails,
  })
  if (frame) {
    frame.section = profile.sectionLayer ? extractSection(db, profile.sectionLayer) : null
    const flangeDim = sem.flangeWidth ? dmap.get(sem.flangeWidth) : undefined
    frame.sources = {
      height: 'measured',
      width: 'measured',
      flange: flangeDim != null || frame.flangeWidth !== 90 ? 'measured' : 'estimated',
      section: frame.section ? 'measured' : 'estimated',
      liner: frame.liner ? 'estimated' : undefined,
    }
  } else warnings.push('Podélníky se nepodařilo spolehlivě najít.')

  const splitY = frame ? (frame.topZ + frame.centerY) / 2 : estimateSplitY(flat.segments)
  let holes = dedupeHoles(extractHoles(flat.circles, profile, frame))
  if (profile.mirrorHoles && holes.length) {
    holes = collapseHoles(holes)
    holes = dedupeHoles(holes.flatMap((hole) => [hole, { ...hole, side: hole.side === 'left' ? 'right' : 'left' }]))
    warnings.push('Otvory jsou jen v bokorysu. Stejná poloha je zrcadlená na oba podélníky.')
    if (holes.length > 800) warnings.push('Otvory ve 3D jsou značky, ne výřezy. Je jich příliš mnoho na vyřezání stojiny.')
  }
  const axles = profile.axleInserts
    ? axlesFromInserts(flat.inserts, flat.texts, profile, dmap)
    : extractAxles(flat.circles, flat.arcs, profile, dmap, frame)
  if (axles.length === 0) warnings.push('Nápravy se nepodařilo najít.')
  if (profile.wheelCircleAsTire && axles.some((axle) => axle.tireDiameter < 800)) {
    warnings.push('Výkres nemá text rozměru pneumatiky. Průměr je největší kružnice kola a je menší než běžná pneumatika nákladního vozu.')
  }
  if (profile.wheelCircleAsTire && axles.length === 2) {
    warnings.push('Dvojmontáž zadní nápravy je odhad. Výkres má dvě nápravy a žádný text dvojmontáže.')
  }
  if (frame && profile.innerLiner && axles[profile.innerLiner.axle]) {
    const liner = linerFromText(flat.texts, profile, axles[profile.innerLiner.axle].x)
    if (liner) {
      frame.liner = liner
      if (frame.sources) frame.sources.liner = 'measured'
    }
  }
  if (profile.semantics.axleSpacings?.[0] && axles.length >= 2) {
    const label = profile.semantics.axleSpacings[0]
    const expected = dmap.get(label)
    const actual = axles[1].x - axles[0].x
    if (expected && Math.abs(expected - actual) > 30) {
      warnings.push(`Kóta ${label} (${expected}) nesedí na vzdálenost náprav (${Math.round(actual)}). Jednotky výkresu nemusí být milimetry.`)
    }
  }
  const crossmembers = frame ? extractCrossmembers(crossSegs.length ? crossSegs : frameTop, frame) : []
  const sideRole = flat.segments.filter((seg) => inRole(seg, 'side', windows, classify, profile))
  const topRole = flat.segments.filter((seg) => inRole(seg, 'top', windows, classify, profile))
  const raised = profile.raisedSplit && frame ? extractRaisedBodies(sideRole.length ? sideRole : frameSide, topRole.length ? topRole : frameTop, frame) : null
  const cab = raised ? raised.cab : extractCab(flat.segments, profile, splitY, classify, frame?.centerY ?? null)
  if (!cab) warnings.push('Kabina se nepodařela ohraničit.')
  if (raised?.crane) {
    warnings.push('Hydraulická ruka je odvozená z vysokého sloupu za kabinou. Ve výkrese není text HIAB, šířku a rameno lze upravit v kontrole.')
  }
  const components = [
    ...(raised?.crane ? [raised.crane] : []),
    ...extractComponents(flat.segments, profile, splitY, frame, axles, cab, classify, flat.loops),
  ]
  annotateParts(components, flat.texts, frame, axles, cab)

  verify(dims, frame, axles, profile)
  const header = readHeader(flat.texts, flat.blockInserts, profile)
  const extents = extentsOf(flat.segments, flat.texts)
  const rolePts = (role: BlockViewName) =>
    flat.segments
      .filter((s) => inRole(s, role, windows, classify, profile) && (on(profile.views.cab)(s.layer) || frameLayer(s.layer)))
      .flatMap((s) => [
        { x: s.x1, y: s.y1 },
        { x: s.x2, y: s.y2 },
      ])
  const views = windows
    ? {
        side: bboxOf(rolePts('side')) ?? windows.side,
        top: bboxOf(rolePts('top')) ?? windows.top,
        front: windows.front,
      }
    : {
        side: frame
          ? bboxOf(frameSide.flatMap((s) => [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]).filter((p) => p.y > splitY - 200))
          : null,
        top: frame
          ? bboxOf(frameTop.flatMap((s) => [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]).filter((p) => p.y < splitY))
          : null,
        front: null,
      }

  const preview = buildPreview(flat.segments, flat.circles, flat.texts, profile, frame, axles, splitY, windows, classify)

  return {
    version: 1,
    profileId: match?.profile.id ?? 'unmatched',
    profileName: profile.name,
    manufacturer: match ? profile.manufacturer : 'neznámý',
    score: match?.score ?? 0,
    warnings,
    units: 'mm',
    dxfVersion: db.version,
    header,
    extents: extents ?? { x0: 0, y0: 0, x1: 1, y1: 1 },
    views,
    dimensions: dims,
    frame,
    holes,
    axles,
    crossmembers,
    cab,
    components,
    preview,
    stats: {
      segmentCount: flat.segments.length,
      circleCount: flat.circles.length,
      blockCount: flat.blockInserts.length,
      holeCount: holes.length,
      parseMs: Math.round(performance.now() - t0),
    },
  }
}

interface ViewWindows {
  side: BBox | null
  top: BBox | null
  front: BBox | null
}

function holeFixFrom(db: DxfDb, profile: Profile): HoleFrameFix | undefined {
  const spec = profile.holeFrame
  if (!spec) return undefined
  const reference = db.entities.find(
    (entity) => entity.type === 'INSERT' && entity.name && new RegExp(spec.reference).test(entity.name),
  )
  return {
    layers: spec.layers,
    name: new RegExp(spec.name),
    scale: reference?.sx || spec.fallback.scale,
    ox: reference?.x ?? spec.fallback.x,
    oy: reference?.y ?? spec.fallback.y,
  }
}

function viewWindows(segs: Seg[], classify: (name: string) => BlockViewName | null): ViewWindows {
  const boxes: Record<BlockViewName, BBox> = {
    side: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
    top: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
    front: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
    rear: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
  }
  for (const s of segs) {
    const view = classify(s.block)
    if (!view || view === 'rear') continue
    const box = boxes[view]
    box.x0 = Math.min(box.x0, s.x1, s.x2)
    box.y0 = Math.min(box.y0, s.y1, s.y2)
    box.x1 = Math.max(box.x1, s.x1, s.x2)
    box.y1 = Math.max(box.y1, s.y1, s.y2)
  }
  const ok = (box: BBox) => box.x1 > box.x0 && box.y1 > box.y0
  return {
    side: ok(boxes.side) ? boxes.side : null,
    top: ok(boxes.top) ? boxes.top : null,
    front: ok(boxes.front) ? boxes.front : null,
  }
}

function inRole(
  seg: Seg,
  role: BlockViewName,
  windows: ViewWindows | null,
  classify: (name: string) => BlockViewName | null,
  profile: Profile,
): boolean {
  if (!windows) {
    if (role === 'front' || role === 'rear') return false
    return role === 'side' ? layerMatches(seg.layer, profile.views.frameSide) || layerMatches(seg.layer, profile.views.side) : layerMatches(seg.layer, profile.views.frameTop) || layerMatches(seg.layer, profile.views.top)
  }
  const fromBlock = classify(seg.block)
  if (fromBlock) return fromBlock === role
  const box = windows[role === 'rear' ? 'side' : role]
  if (!box || role === 'rear') return false
  const x = (seg.x1 + seg.x2) / 2
  const y = (seg.y1 + seg.y2) / 2
  const pad = 500
  if (x < box.x0 - pad || x > box.x1 + pad || y < box.y0 - pad || y > box.y1 + pad) return false
  let best: BlockViewName | null = null
  let bestD = Infinity
  for (const key of ['side', 'top', 'front'] as const) {
    const candidate = windows[key]
    if (!candidate) continue
    if (x < candidate.x0 - pad || x > candidate.x1 + pad || y < candidate.y0 - pad || y > candidate.y1 + pad) continue
    const cx = (candidate.x0 + candidate.x1) / 2
    const cy = (candidate.y0 + candidate.y1) / 2
    const d = (x - cx) ** 2 + (y - cy) ** 2
    if (d < bestD) {
      bestD = d
      best = key
    }
  }
  return best === role
}

function collapseHoles(holes: Hole[]): Hole[] {
  const groups = new Map<string, Hole[]>()
  for (const hole of holes) {
    const key = `${Math.round(hole.x / 4)}:${Math.round(hole.z / 4)}`
    const list = groups.get(key)
    if (list) list.push(hole)
    else groups.set(key, [hole])
  }
  const out: Hole[] = []
  for (const group of groups.values()) {
    const diameters = group.map((hole) => hole.d).sort((a, b) => a - b)
    const d = diameters[Math.floor(diameters.length / 2)]
    const x = group.reduce((sum, hole) => sum + hole.x, 0) / group.length
    const z = group.reduce((sum, hole) => sum + hole.z, 0) / group.length
    out.push({ x, z, d, side: group[0].side })
  }
  return out
}

function dedupeHoles(holes: Hole[]): Hole[] {
  const seen = new Set<string>()
  const out: Hole[] = []
  for (const hole of holes) {
    const key = `${hole.side}:${hole.x.toFixed(2)}:${hole.z.toFixed(2)}:${hole.d.toFixed(2)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(hole)
  }
  return out
}

function axlesFromInserts(inserts: InsertRec[], texts: Txt[], profile: Profile, dmap: Map<string, number>): Axle[] {
  const spec = profile.axleInserts
  if (!spec) return []
  const nameRe = new RegExp(spec.name)
  const hits = inserts.filter((insert) => nameRe.test(insert.name))
  const clusters: { x: number; y: number; n: number; rear: number }[] = []
  for (const hit of hits) {
    const found = clusters.find((cluster) => Math.abs(cluster.x - hit.x) < 120)
    const rear = layerMatches(hit.layer, spec.rearLayers) ? 1 : 0
    if (found) {
      found.x = (found.x * found.n + hit.x) / (found.n + 1)
      found.y = (found.y * found.n + hit.y) / (found.n + 1)
      found.rear += rear
      found.n++
    } else clusters.push({ x: hit.x, y: hit.y, n: 1, rear })
  }
  clusters.sort((a, b) => a.x - b.x)
  const tireRe = profile.tireText ? new RegExp(profile.tireText) : null
  const tireTexts = tireRe
    ? texts.filter((text) => tireRe.test(text.text.replace(/\s+/g, '')))
    : []
  return clusters.map((cluster, index) => {
    let tireSpec: string | undefined
    let best = Infinity
    for (const text of tireTexts) {
      const d = Math.hypot(text.x - cluster.x, text.y - cluster.y)
      if (d < best) {
        best = d
        tireSpec = text.text.replace(/\s+/g, '')
      }
    }
    const fromSpec = tireSpec ? tireDiameterMm(tireSpec) : null
    const label = profile.semantics.tireDiameters?.[index]
    const trackLabel = profile.semantics.tracks?.[index]
    const labelled = label ? dmap.get(label) : undefined
    const tireDiameter = Math.round(fromSpec ?? labelled ?? 1076)
    return {
      index,
      x: Math.round(cluster.x),
      z: Math.round(cluster.y),
      tireDiameter,
      tireSpec,
      track: trackLabel ? (dmap.get(trackLabel) ?? null) : null,
      dual: cluster.rear > 0,
      tireSource: fromSpec || labelled != null ? 'measured' : 'estimated',
      tireConfidence: fromSpec ? 0.9 : labelled != null ? 0.8 : 0.35,
      dualSource: 'measured',
    }
  })
}

function linerFromText(texts: Txt[], profile: Profile, originX: number): { x0: number; x1: number } | null {
  const spec = profile.innerLiner
  if (!spec) return null
  const read = (pattern: string) => {
    const re = new RegExp(pattern, 'i')
    for (const text of texts) {
      const match = text.text.match(re)
      if (match) return Number(match[1])
    }
    return null
  }
  const start = read(spec.start)
  const stop = read(spec.stop)
  if (start === null || stop === null) return null
  const x0 = originX + spec.startSign * start
  const x1 = originX + spec.stopSign * stop
  return { x0: Math.min(x0, x1), x1: Math.max(x0, x1) }
}

function extractHoles(circles: Circ[], profile: Profile, frame: ChassisModel['frame']): Hole[] {
  if (!frame) return []
  const holes: Hole[] = []
  const x0 = Math.min(frame.left[0].x, frame.right[0].x) - 40
  const x1 = Math.max(frame.left[frame.left.length - 1].x, frame.right[frame.right.length - 1].x) + 40
  const push = (c: Circ, side: 'left' | 'right') => {
    const d = c.r * 2
    if (d < 6 || d > 40) return
    if (c.x < x0 || c.x > x1) return
    if (c.y < frame.bottomZ - 8 || c.y > frame.topZ + 8) return
    holes.push({ x: c.x, z: c.y, d, side })
  }
  for (const c of circles) {
    if (layerMatches(c.layer, profile.views.holesLeft)) push(c, 'left')
    else if (layerMatches(c.layer, profile.views.holesRight)) push(c, 'right')
  }
  return holes
}

function extractAxles(
  circles: Circ[],
  arcs: { layer: string; cx: number; cy: number; r: number }[],
  profile: Profile,
  dmap: Map<string, number>,
  frame: ChassisModel['frame'],
): Axle[] {
  const sideOk = (layer: string) => layerMatches(layer, profile.views.frameSide)
  const rims: { x: number; y: number }[] = []
  for (const c of circles) {
    if (!sideOk(c.layer)) continue
    const d = c.r * 2
    if (d < 450 || d > 780) continue
    if (frame && (c.y > frame.bottomZ + 80 || c.y < frame.bottomZ - 1000)) continue
    rims.push({ x: c.x, y: c.y })
  }
  const clusters: { x: number; y: number; n: number }[] = []
  for (const r of rims) {
    const hit = clusters.find((c) => Math.abs(c.x - r.x) < 180)
    if (hit) {
      hit.x = (hit.x * hit.n + r.x) / (hit.n + 1)
      hit.y = (hit.y * hit.n + r.y) / (hit.n + 1)
      hit.n++
    } else clusters.push({ x: r.x, y: r.y, n: 1 })
  }
  clusters.sort((a, b) => a.x - b.x)
  const diameters = (profile.semantics.tireDiameters ?? []).map((k) => dmap.get(k) ?? null)
  const tracks = (profile.semantics.tracks ?? []).map((k) => dmap.get(k) ?? null)

  return clusters.map((c, index) => {
    const diams: number[] = []
    for (const src of [...circles, ...arcs]) {
      const d = src.r * 2
      if (d < 850 || d > 1400) continue
      if (!sideOk(src.layer)) continue
      const cx = 'cx' in src ? src.cx : src.x
      const cy = 'cy' in src ? src.cy : src.y
      if (Math.abs(cx - c.x) > 150 || Math.abs(cy - c.y) > 120) continue
      diams.push(Math.round(d))
    }
    const counted = mode(diams)
    const fromLabel = diameters[index] ?? null
    let drawnWheel: number | null = null
    if (profile.wheelCircleAsTire && counted == null && fromLabel == null) {
      let best = 0
      for (const src of [...circles, ...arcs]) {
        const d = src.r * 2
        if (d < 500 || d >= 850) continue
        if (!sideOk(src.layer)) continue
        const cx = 'cx' in src ? src.cx : src.x
        const cy = 'cy' in src ? src.cy : src.y
        if (Math.abs(cx - c.x) > 80 || Math.abs(cy - c.y) > 80) continue
        if (d > best) best = d
      }
      if (best) drawnWheel = Math.round(best)
    }
    const tireDiameter = counted ?? fromLabel ?? drawnWheel ?? 1076
    const dual = clusters.length >= 3 ? index === 1 : index === clusters.length - 1 && clusters.length > 1
    return {
      index,
      x: Math.round(c.x),
      z: Math.round(c.y),
      tireDiameter,
      track: tracks[index] ?? null,
      dual,
      tireSource: counted != null || fromLabel != null || drawnWheel != null ? 'measured' : 'estimated',
      tireConfidence: counted != null ? 0.88 : fromLabel != null ? 0.8 : drawnWheel != null ? 0.5 : 0.34,
      dualSource: 'estimated',
    }
  })
}

function extractCrossmembers(top: Seg[], frame: NonNullable<ChassisModel['frame']>): Crossmember[] {
  const inner = frame.outerWidthStraight - 2 * frame.flangeWidth
  if (inner < 200) return []
  const hits: number[] = []
  for (const s of top) {
    if (Math.abs(s.x1 - s.x2) > 14) continue
    const len = Math.abs(s.y2 - s.y1)
    if (len < inner * 0.72 || len > inner * 1.35) continue
    const my = (s.y1 + s.y2) / 2
    if (Math.abs(my - frame.centerY) > inner * 0.35) continue
    const mx = (s.x1 + s.x2) / 2
    if (mx < frame.left[0].x || mx > frame.left[frame.left.length - 1].x) continue
    hits.push(mx)
  }
  hits.sort((a, b) => a - b)
  const groups: number[][] = []
  for (const x of hits) {
    const g = groups[groups.length - 1]
    if (g && x - g[g.length - 1] < 100) g.push(x)
    else groups.push([x])
  }
  return groups.map((g) => {
    const span = g[g.length - 1] - g[0]
    return { x: (g[0] + g[g.length - 1]) / 2, thickness: span >= 8 ? span : 60 }
  })
}

function extractCab(
  segs: Seg[],
  profile: Profile,
  splitY: number,
  classify: (name: string) => BlockViewName | null,
  centerY: number | null,
): CabModel | null {
  const cabSegs = segs.filter((s) => layerMatches(s.layer, profile.views.cab))
  const sidePts = mainCluster(robustPoints(pointsOf(cabSegs, (y, layer, block) => pointRole(block, layer, y, profile, splitY, classify) === 'side')), 90)
  const side = bboxOf(sidePts)
  if (!side || boxWidth(side) < 400 || boxHeight(side) < 600) return null
  const topPts = robustPoints(
    pointsOf(cabSegs, (y, layer, block) => pointRole(block, layer, y, profile, splitY, classify) === 'top').filter(
      (p) => p.x > side.x0 - 400 && p.x < side.x1 + 800,
    ),
  )
  let top = bboxOf(topPts)
  if (!top || boxWidth(top) < 300) return null
  const frontPts = pointsOf(cabSegs, (y, layer, block) => pointRole(block, layer, y, profile, splitY, classify) === 'front')
  const front = bboxOf(robustPoints(frontPts))
  if (front && centerY !== null) {
    const width = boxWidth(front)
    const lateral = boxHeight(top)
    if (width > 1400 && width < 3200 && (lateral > width * 1.35 || lateral < width * 0.65)) {
      top = { ...top, y0: centerY - width / 2, y1: centerY + width / 2 }
    }
  }
  const samples = makeSlices(sidePts, topPts, side, top, 22)
  return {
    side,
    top,
    samples,
    silhouettes: {
      side: envelope(sidePts, 56) ?? undefined,
      top: envelope(topPts, 56) ?? undefined,
      front: envelope(frontPts, 40) ?? undefined,
    },
  }
}

function extractComponents(
  segs: Seg[],
  profile: Profile,
  splitY: number,
  frame: ChassisModel['frame'],
  axles: Axle[],
  cab: CabModel | null,
  classify: (name: string) => BlockViewName | null,
  loops: Loop[],
): PartModel[] {
  const partRe = new RegExp(profile.componentPattern ?? DEFAULT_PART.source)
  const skip = (profile.componentSkip ?? []).map((pattern) => new RegExp(pattern))
  const stemOf = (name: string) => {
    if (skip.some((re) => re.test(name))) return null
    const match = name.match(partRe)
    if (!match?.groups?.pn) return null
    return match.groups.cat ? `${match.groups.cat}_${match.groups.pn}` : match.groups.pn
  }
  const byBlock = new Map<string, Seg[]>()
  for (const s of segs) {
    if (!s.block || !stemOf(s.block)) continue
    let list = byBlock.get(s.block)
    if (!list) {
      list = []
      byBlock.set(s.block, list)
    }
    list.push(s)
  }
  const groups = new Map<string, string[]>()
  for (const name of byBlock.keys()) {
    const stem = stemOf(name)
    if (!stem) continue
    let g = groups.get(stem)
    if (!g) {
      g = []
      groups.set(stem, g)
    }
    g.push(name)
  }

  const parts: PartModel[] = []
  for (const [stem, names] of groups) {
    const sides: { name: string; bb: BBox; pts: Pt[] }[] = []
    const tops: { name: string; bb: BBox; pts: Pt[] }[] = []
    const both: { side: BBox; top: BBox; sidePts: Pt[]; topPts: Pt[]; contour?: boolean }[] = []
    for (const name of names) {
      const list = byBlock.get(name) ?? []
      const sidePts = robustPoints(pointsOf(list, (y, layer, block) => pointRole(block, layer, y, profile, splitY, classify) === 'side'))
      const topPts = robustPoints(pointsOf(list, (y, layer, block) => pointRole(block, layer, y, profile, splitY, classify) === 'top'))
      const sideTight = tightenBox(bboxOf(sidePts), name, loops)
      const topTight = tightenBox(bboxOf(topPts), name, loops)
      const sb = sideTight.box
      const tb = topTight.box
      if (sb && tb) both.push({ side: sb, top: tb, sidePts, topPts, contour: sideTight.closed || topTight.closed })
      else if (sb) sides.push({ name, bb: sb, pts: sidePts })
      else if (tb) tops.push({ name, bb: tb, pts: topPts })
    }
    const used = new Set<number>()
    for (const s of sides) {
      let best = -1
      let bestOv = 40
      for (let i = 0; i < tops.length; i++) {
        if (used.has(i)) continue
        const ov = overlap1d(s.bb.x0, s.bb.x1, tops[i].bb.x0, tops[i].bb.x1)
        if (ov > bestOv) {
          bestOv = ov
          best = i
        }
      }
      if (best >= 0) {
        used.add(best)
        both.push({ side: s.bb, top: tops[best].bb, sidePts: s.pts, topPts: tops[best].pts, contour: false })
      }
    }
    let n = 0
    for (const item of both) {
      if (!keepPart(item.side, item.top, frame, axles, cab)) continue
      const samples = makeSlices(item.sidePts, item.topPts, item.side, item.top, 14)
      parts.push({
        id: `${stem}-${n}`,
        partNumber: stem,
        side: item.side,
        top: item.top,
        samples,
        contour: item.contour,
      })
      n++
    }
  }
  parts.sort((a, b) => partVolume(b) - partVolume(a))
  return parts.slice(0, 64)
}

function tightenBox(box: BBox | null, block: string, loops: Loop[]): { box: BBox | null; closed: boolean } {
  if (!box) return { box: null, closed: false }
  const host = Math.max(0, box.x1 - box.x0) * Math.max(0, box.y1 - box.y0)
  if (host < 1) return { box, closed: false }
  let best: Loop | null = null
  let bestArea = 0
  let closed = false
  for (const loop of loops) {
    if (loop.block !== block) continue
    const lw = loop.x1 - loop.x0
    const lh = loop.y1 - loop.y0
    const ox = overlap1d(loop.x0, loop.x1, box.x0, box.x1)
    const oy = overlap1d(loop.y0, loop.y1, box.y0, box.y1)
    if (ox < lw * 0.8 || oy < lh * 0.8) continue
    const area = lw * lh
    const ratio = area / host
    if (ratio > 0.5 && ratio <= 1.05) closed = true
    if (ratio < 0.82 || ratio > 0.995) continue
    if (area > bestArea) {
      best = loop
      bestArea = area
    }
  }
  if (!best) return { box, closed }
  return { box: { x0: best.x0, y0: best.y0, x1: best.x1, y1: best.y1 }, closed: true }
}

function keepPart(side: BBox, top: BBox, _frame: ChassisModel['frame'], axles: Axle[], cab: CabModel | null): boolean {
  const sx = boxWidth(side)
  const sz = boxHeight(side)
  const tx = boxWidth(top)
  const ty = boxHeight(top)
  if (sx > 5000 || sz > 3600 || tx > 5000 || ty > 4500) return false
  if (sx < 70 || sz < 40 || ty < 30) return false
  const overlap = overlap1d(side.x0, side.x1, top.x0, top.x1)
  if (overlap < 40) return false
  if (sz > 200 && sz < 360 && sx > 700 && ty > 400 && ty < 1900) return false
  const cx = (Math.max(side.x0, top.x0) + Math.min(side.x1, top.x1)) / 2
  if (sz > 850 && axles.some((a) => Math.abs(a.x - cx) < 500)) return false
  if (cab && contained(side, cab.side, 0.75) && contained(top, cab.top, 0.55) && sz > 500) return false
  if (_frame && betweenRails(top, _frame) && (sz < 240 || (sx < 520 && sz < 360))) return false
  return true
}

/** Plan footprint sits between the rails: a liner, a crossmember, or a plate on the web. */
function betweenRails(top: BBox, frame: NonNullable<ChassisModel['frame']>): boolean {
  const half = frame.outerWidthStraight / 2
  const mid = (top.y0 + top.y1) / 2
  const width = boxHeight(top)
  return Math.abs(mid - frame.centerY) + width / 2 < half * 0.92
}

function contained(inner: BBox, outer: BBox, frac: number): boolean {
  const ox = overlap1d(inner.x0, inner.x1, outer.x0, outer.x1)
  const oy = overlap1d(inner.y0, inner.y1, outer.y0, outer.y1)
  return ox > boxWidth(inner) * frac && oy > boxHeight(inner) * frac
}

function partVolume(p: PartModel): number {
  if (!p.side || !p.top) return 0
  const x = overlap1d(p.side.x0, p.side.x1, p.top.x0, p.top.x1)
  return x * boxHeight(p.side) * boxHeight(p.top)
}

function pointRole(
  block: string,
  layer: string,
  y: number,
  profile: Profile,
  splitY: number,
  classify: (name: string) => BlockViewName | null,
): BlockViewName | null {
  const fromBlock = classify(block)
  if (fromBlock) return fromBlock
  if (layerMatches(layer, profile.views.holesLeft) || layerMatches(layer, profile.views.holesRight)) return null
  if (layerMatches(layer, profile.views.cab)) return y >= splitY ? 'side' : 'top'
  const side = layerMatches(layer, profile.views.side)
  const top = layerMatches(layer, profile.views.top)
  if (side && !top) return 'side'
  if (top && !side) return 'top'
  if (side && top) return y >= splitY ? 'side' : 'top'
  return null
}

function pointsOf(segs: Seg[], pred: (y: number, layer: string, block: string) => boolean): Pt[] {
  const pts: Pt[] = []
  for (const s of segs) {
    const len = segLen(s.x1, s.y1, s.x2, s.y2)
    if (len > 2400 || len < 0.4) continue
    const my = (s.y1 + s.y2) / 2
    if (!pred(my, s.layer, s.block)) continue
    pts.push({ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 })
  }
  return pts
}

function makeSlices(sidePts: Pt[], topPts: Pt[], side: BBox, top: BBox, bins: number): Slice[] {
  const x0 = Math.max(side.x0, top.x0)
  const x1 = Math.min(side.x1, top.x1)
  if (x1 - x0 < 15) {
    return [
      { x: side.x0, z0: side.y0, z1: side.y1, y0: top.y0, y1: top.y1 },
      { x: side.x1, z0: side.y0, z1: side.y1, y0: top.y0, y1: top.y1 },
    ]
  }
  const slices: Slice[] = []
  for (let i = 0; i < bins; i++) {
    const a = x0 + ((x1 - x0) * i) / bins
    const b = x0 + ((x1 - x0) * (i + 1)) / bins
    let z0 = Infinity
    let z1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    let zs = 0
    let ys = 0
    for (const p of sidePts) {
      if (p.x < a || p.x > b) continue
      if (p.y < z0) z0 = p.y
      if (p.y > z1) z1 = p.y
      zs++
    }
    for (const p of topPts) {
      if (p.x < a || p.x > b) continue
      if (p.y < y0) y0 = p.y
      if (p.y > y1) y1 = p.y
      ys++
    }
    if (zs < 2 || ys < 2) continue
    slices.push({ x: (a + b) / 2, z0, z1, y0, y1 })
  }
  if (slices.length < 2) {
    return [
      { x: x0, z0: side.y0, z1: side.y1, y0: top.y0, y1: top.y1 },
      { x: x1, z0: side.y0, z1: side.y1, y0: top.y0, y1: top.y1 },
    ]
  }
  return slices
}

function mainCluster(pts: Pt[], cell: number): Pt[] {
  if (pts.length < 30) return pts
  const bins = new Map<string, Pt[]>()
  for (const p of pts) {
    const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`
    let list = bins.get(k)
    if (!list) {
      list = []
      bins.set(k, list)
    }
    list.push(p)
  }
  const seen = new Set<string>()
  let best: string[] = []
  for (const start of bins.keys()) {
    if (seen.has(start)) continue
    const stack = [start]
    seen.add(start)
    const comp = [start]
    while (stack.length) {
      const cur = stack.pop() as string
      const [x, y] = cur.split(',').map(Number)
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const n = `${x + dx},${y + dy}`
          if (bins.has(n) && !seen.has(n)) {
            seen.add(n)
            stack.push(n)
            comp.push(n)
          }
        }
      }
    }
    if (comp.length > best.length) best = comp
  }
  const kept = new Set(best)
  const mainPts = best.flatMap((k) => bins.get(k) ?? [])
  const mb = bboxOf(mainPts)
  if (mb) {
    for (const [k, list] of bins) {
      if (kept.has(k)) continue
      const bb = bboxOf(list)
      if (!bb) continue
      const near =
        bb.x1 >= mb.x0 - cell * 2 &&
        bb.x0 <= mb.x1 + cell * 2 &&
        bb.y1 >= mb.y0 - cell * 2 &&
        bb.y0 <= mb.y1 + cell * 2
      if (near) kept.add(k)
    }
  }
  const out: Pt[] = []
  for (const k of kept) out.push(...(bins.get(k) ?? []))
  return out.length ? out : pts
}

function verify(dims: Dimension[], frame: ChassisModel['frame'], axles: Axle[], profile: Profile) {
  const by = new Map<string, Dimension>()
  for (const d of dims) if (!by.has(d.label)) by.set(d.label, d)
  const mark = (label: string | undefined, expected: number, method: string) => {
    if (!label) return
    const d = by.get(label)
    if (!d || d.value === null) return
    const delta = d.value - expected
    d.verified = { method, expected, delta, ok: Math.abs(delta) <= 5 }
    if (d.verified.ok) d.confidence = Math.max(d.confidence, 0.98)
  }
  const sem = profile.semantics
  const [from, to] = sem.wheelbaseAxles ?? [0, 1]
  if (axles[from] && axles[to]) mark(sem.wheelbase, axles[to].x - axles[from].x, 'rozvor mezi nápravami z výkresu')
  sem.axleSpacings?.forEach((label, index) => {
    if (axles[index] && axles[index + 1]) mark(label, axles[index + 1].x - axles[index].x, 'rozteč sousedních náprav')
  })
  if (sem.theoreticalWheelbase && axles.length >= 4) {
    const front = (axles[0].x + axles[1].x) / 2
    const rear = (axles[2].x + axles[3].x) / 2
    mark(sem.theoreticalWheelbase, rear - front, 'střed předního páru ke středu zadního páru')
  }
  if (frame) {
    mark(sem.frameOuterWidth, frame.outerWidthStraight, 'vnější šířka podélníků')
    mark(sem.frameOuterWidthFront, frame.frontOuterWidth, 'šířka rámu na předním konci')
    mark(sem.frameHeight, frame.topZ - frame.bottomZ, 'výška podélníku v bokorysu')
    mark(sem.flangeWidth, frame.flangeWidth, 'šířka pásnice')
    const rearX = Math.max(frame.left[frame.left.length - 1].x, frame.right[frame.right.length - 1].x)
    const frontX = Math.min(frame.left[0].x, frame.right[0].x)
    if (axles.length) {
      mark(sem.rearOverhang, rearX - axles[axles.length - 1].x, 'konec rámu mínus poslední náprava')
      mark(sem.frameFrontOverhang, axles[0].x - frontX, 'první náprava mínus začátek rámu')
    }
  }
}

function readHeader(texts: Txt[], inserts: string[], profile: Profile): ChassisModel['header'] {
  const header: ChassisModel['header'] = {}
  const weights: { y: number; text: string }[] = []
  for (const t of texts) {
    const raw = t.text.trim()
    if (!header.title && /SCANIA ICD/i.test(raw)) header.title = raw
    if (!header.title && /Volvo Order Information/i.test(raw)) header.title = 'Volvo Order Information'
    if (!header.title && /contsystem/i.test(raw)) header.title = 'Contsystem'
    if (!header.chassisType && /^G\s+\d/i.test(raw)) header.chassisType = raw
    if (!header.icdNo && /^\d{13}$/.test(raw)) header.icdNo = raw
    const order = raw.match(/FO Number \/ OM Number:\s*(\S+)/i)
    if (order) header.orderNo = order[1]
    if (/^\d+\s*kg$/i.test(raw)) weights.push({ y: t.y, text: raw })
  }
  const cab = inserts.map((name) => name.match(/^B_CAB[STF]C\d+_C\d+_(?:TYPE_)?([A-Z]{2})_/)).find(Boolean)
  if (cab) header.cabType = cab[1]
  if (profile.manufacturer === 'Volvo' && header.cabType && !header.chassisType) header.chassisType = `Volvo ${header.cabType}`
  if (profile.manufacturer === 'DAF' && !header.chassisType) header.chassisType = 'DAF'
  weights.sort((a, b) => b.y - a.y)
  if (weights[0]) header.totalWeight = weights[0].text
  if (weights[1]) header.frontWeight = weights[1].text
  if (weights[2]) header.rearWeight = weights[2].text
  return header
}

function extentsOf(segs: Seg[], texts: Txt[]): BBox | null {
  const pts: Pt[] = []
  for (const s of segs) {
    if (segLen(s.x1, s.y1, s.x2, s.y2) > 8000) continue
    pts.push({ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 })
  }
  for (const t of texts) pts.push({ x: t.x, y: t.y })
  return bboxOf(robustPoints(pts))
}

function estimateSplitY(segs: Seg[]): number {
  const hist = new Map<number, number>()
  for (const s of segs) {
    const y = Math.round((s.y1 + s.y2) / 2 / 100) * 100
    hist.set(y, (hist.get(y) ?? 0) + 1)
  }
  const keys = [...hist.keys()].sort((a, b) => a - b)
  let bestGap = 0
  let split = 3500
  for (let i = 1; i < keys.length; i++) {
    const gap = keys[i] - keys[i - 1]
    if (gap > bestGap && hist.get(keys[i - 1])! > 10 && hist.get(keys[i])! > 10) {
      bestGap = gap
      split = (keys[i] + keys[i - 1]) / 2
    }
  }
  return split
}

function buildPreview(
  segs: Seg[],
  circles: Circ[],
  texts: Txt[],
  profile: Profile,
  frame: ChassisModel['frame'],
  axles: Axle[],
  splitY: number,
  windows: ViewWindows | null,
  classify: (name: string) => BlockViewName | null,
): ChassisModel['preview'] {
  const segments: Record<string, number[]> = {
    sheet: [],
    chassis: [],
    cab: [],
    frame: [],
    axle: [],
    component: [],
    front: [],
  }
  const circs: Record<string, number[]> = { holes: [], detail: [] }
  const labels: { x: number; y: number; text: string }[] = []
  const push = (role: string, s: Seg) => {
    const arr = segments[role]
    arr.push(s.x1, s.y1, s.x2, s.y2)
  }
  const inSheet = (s: Seg) => {
    if (!windows) return true
    if (classify(s.block)) return true
    return inRole(s, 'side', windows, classify, profile) || inRole(s, 'top', windows, classify, profile) || inRole(s, 'front', windows, classify, profile)
  }
  for (const s of segs) {
    const role = pointRole(s.block, s.layer, (s.y1 + s.y2) / 2, profile, splitY, classify)
    if (!inSheet(s)) continue
    push('sheet', s)
    if (windows && role === 'front') {
      if (layerMatches(s.layer, profile.views.cab)) push('front', s)
      continue
    }
    if (layerMatches(s.layer, profile.views.cab)) push('cab', s)
    else if (layerMatches(s.layer, profile.views.frameTop) || layerMatches(s.layer, profile.views.frameSide)) push('chassis', s)
  }
  if (frame) {
    pushPoly(segments.frame, frame.left)
    pushPoly(segments.frame, frame.right)
  }
  for (const axle of axles) {
    if (frame) {
      segments.axle.push(axle.x, frame.bottomZ - 900, axle.x, frame.topZ + 250)
      segments.axle.push(axle.x, frame.centerY - 1500, axle.x, frame.centerY + 1500)
    } else segments.axle.push(axle.x, splitY - 1600, axle.x, splitY + 2200)
  }
  for (const c of circles) {
    const hole = layerMatches(c.layer, profile.views.holesLeft) || layerMatches(c.layer, profile.views.holesRight)
    if (hole && c.r * 2 >= 6 && c.r * 2 <= 40) circs.holes.push(c.x, c.y, c.r)
    else if (c.r >= 2 && c.r <= 900 && inSheet({ layer: c.layer, x1: c.x, y1: c.y, x2: c.x, y2: c.y, block: c.block })) {
      circs.detail.push(c.x, c.y, c.r)
    }
  }
  for (const text of texts) {
    const clean = text.text.replace(/\s+/g, ' ').trim()
    if (clean.length < 2 || clean.length > 28) continue
    if (!/[A-Za-zÁ-ž]/.test(clean)) continue
    if (!inSheet({ layer: text.layer, x1: text.x, y1: text.y, x2: text.x, y2: text.y, block: text.block })) continue
    labels.push({ x: text.x, y: text.y, text: clean })
    if (labels.length >= 500) break
  }
  return { segments, circles: circs, labels }
}

function pushPoly(arr: number[], pts: Pt[]) {
  for (let i = 1; i < pts.length; i++) arr.push(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y)
}

function mode(values: number[]): number | null {
  if (values.length === 0) return null
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best = values[0]
  let n = 0
  for (const [v, c] of counts) {
    if (c > n) {
      best = v
      n = c
    }
  }
  return best
}

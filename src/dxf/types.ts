export interface DxfVec {
  x: number
  y: number
  w?: number
}

export interface DxfEntity {
  type: string
  layer: string
  x?: number
  y?: number
  x2?: number
  y2?: number
  r?: number
  a0?: number
  a1?: number
  text?: string
  rotation?: number
  name?: string
  sx?: number
  sy?: number
  verts?: { x: number; y: number; bulge: number }[]
  closed?: boolean
  mx?: number
  my?: number
  ratio?: number
  degree?: number
  knots?: number[]
  controls?: DxfVec[]
  fits?: { x: number; y: number }[]
  /** DIMENSION geometry: definition points and the stored measurement (code 42). */
  dim?: DimDef
}

export interface DimDef {
  /** Code 70 & 7: 0 rotated/linear, 1 aligned, 2 angular, 3 diameter, 4 radius. */
  type: number
  measurement: number | null
  rawText: string
  /** Code 50: rotation of a linear dimension in degrees (0 = horizontal). */
  angle: number
  p10: { x: number; y: number }
  p13: { x: number; y: number }
  p14: { x: number; y: number }
  p15: { x: number; y: number }
}

export interface DxfBlock {
  name: string
  baseX: number
  baseY: number
  layer: string
  entities: DxfEntity[]
}

export interface DxfDb {
  version: string
  /** $INSUNITS, 4 = millimetres */
  units: number
  /** $DIMLFAC, linear dimension scale factor (1 when absent). */
  dimlfac?: number
  blocks: Map<string, DxfBlock>
  entities: DxfEntity[]
  layers: Set<string>
  /** Raw TEXT strings, used for profile detection before flattening. */
  textSamples: string[]
}

export interface Seg {
  layer: string
  x1: number
  y1: number
  x2: number
  y2: number
  /** Model-space INSERT name that owned this geometry, or "". */
  block: string
}

export interface Circ {
  layer: string
  x: number
  y: number
  r: number
  block: string
}

export interface ArcRec {
  layer: string
  cx: number
  cy: number
  r: number
  a0: number
  a1: number
  block: string
}

export interface Txt {
  layer: string
  x: number
  y: number
  text: string
  rotation: number
  block: string
}

export interface InsertRec {
  name: string
  layer: string
  x: number
  y: number
  sx: number
  sy: number
}

export interface FlatDrawing {
  version: string
  units: number
  segments: Seg[]
  circles: Circ[]
  arcs: ArcRec[]
  texts: Txt[]
  layers: Map<string, number>
  blockInserts: string[]
  /** Model-space inserts, before block contents are exploded. */
  inserts: InsertRec[]
  /** Closed polylines and hatch boundaries, in world coordinates. */
  loops: Loop[]
}

export interface Loop {
  layer: string
  block: string
  x0: number
  y0: number
  x1: number
  y1: number
}

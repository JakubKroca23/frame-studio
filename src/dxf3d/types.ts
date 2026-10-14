/** Plain data shared between the worker and the UI (structured-clone safe). */

export interface P2 {
  x: number
  y: number
}

export interface Box2 {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface Hole2 {
  x: number
  y: number
  r: number
}

/** Line segment in view-local millimetres: [x1, y1, x2, y2]. */
export type Seg4 = [number, number, number, number]

export type IslandKind = 'part' | 'table' | 'frame' | 'small'

export interface Island {
  id: number
  kind: IslandKind
  /** Bounding box in drawing units. */
  box: Box2
  segments: number
  /** Millimetres per drawing unit for this island (from its own dimensions, else the sheet scale). */
  mmPerUnit: number
  scaleSource: 'view-dims' | 'sheet-dims' | 'units'
  /** Size in mm. */
  width: number
  height: number
  /** Outer contour in view-local mm (origin at the bbox min corner), counter-clockwise. */
  contour: P2[]
  contourMethod: 'graph' | 'raster' | 'bbox'
  /** Circles in view-local mm. */
  circles: Hole2[]
  /** Segments in view-local mm, used to confirm holes from the other views. */
  lines: Seg4[]
}

export interface DimRecord {
  id: number
  kind: 'linear' | 'aligned' | 'diameter' | 'radius'
  /** Value the drawing states (mm, code 42 or numeric text). */
  value: number
  text: string
  /** Geometric length between the definition points in drawing units. */
  geom: number
  /** value / geom. */
  ratio: number
  /** Island the dimension measures, if any. */
  island: number | null
  /** Direction of a linear dimension: 'h' horizontal, 'v' vertical, 'o' other. */
  dir: 'h' | 'v' | 'o'
  /** Definition points in drawing units. */
  a: P2
  b: P2
}

export interface ScaleInfo {
  /** Millimetres per drawing unit. */
  mmPerUnit: number
  /** Drawing scale as 1:N (N = mmPerUnit / unitToMm). */
  ratio: number
  label: string
  source: 'dims' | 'units'
  units: number
  unitsName: string
  unitToMm: number
  dimsTotal: number
  dimsAgreeing: number
  /** Scale printed in the title block (only a cross-check, never used). */
  titleHint: string | null
  confident: boolean
  note: string
}

export type Projection = 'first' | 'third'

export interface ViewAssignment {
  front: number
  top: number | null
  side: number | null
  projection: Projection
  /** Side view placed on the right of the front view. */
  sideRight: boolean
  score: number
  reasons: string[]
}

export interface Dxf3dAnalysis {
  fileUnits: number
  scale: ScaleInfo
  islands: Island[]
  dims: DimRecord[]
  candidates: ViewAssignment[]
  assignment: ViewAssignment | null
  confident: boolean
  warnings: string[]
  stats: { entities: number; segments: number; circles: number; texts: number; ms: number }
}

export interface AxisCheck {
  axis: 'X' | 'Y' | 'Z'
  label: string
  /** Values in mm from each view that shows the axis; null if that view is missing. */
  a: { view: string; value: number | null }
  b: { view: string; value: number | null }
  /** Chosen value (mm) and how it was obtained. */
  value: number
  source: 'measured' | 'computed'
  delta: number | null
  ok: boolean
  /** Matching DIMENSION value, if any. */
  dim: number | null
}

export interface HoleSpec {
  axis: 'X' | 'Y' | 'Z'
  view: 'front' | 'top' | 'side'
  /** Centre in the two in-plane 3D coordinates (front: X,Z; top: X,Y; side: Y,Z), mm. */
  u: number
  v: number
  r: number
  /** Extent along the hole axis, mm. */
  from: number
  to: number
  through: boolean
  confirmed: boolean
  evidence: string
}

/** Three views in 3D model coordinates (mm). X width, Y depth (towards the back), Z height. */
export interface ViewSet {
  front: P2[] // (X, Z)
  top: P2[] // (X, Y)
  side: P2[] // (Y, Z)
  size: { x: number; y: number; z: number }
  computed: { front: boolean; top: boolean; side: boolean }
  checks: AxisCheck[]
  holes: HoleSpec[]
  skippedHoles: HoleSpec[]
  warnings: string[]
}

export interface ViewDeviation {
  view: 'front' | 'top' | 'side'
  max: number
  mean: number
  status: 'ok' | 'warn' | 'bad'
  holesExpected: number
  holesFound: number
  note: string
}

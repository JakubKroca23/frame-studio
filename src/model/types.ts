import type { BBox, Pt } from '../lib/geom'

export interface FrameSection {
  height: number
  flangeWidth: number
  webThickness: number
  flangeThickness: number
  outerRadius: number
  innerRadius: number
}

export interface Dimension {
  label: string
  value: number | null
  x: number
  y: number
  confidence: number
  source: 'inline' | 'paired' | 'missing'
  verified?: { method: string; expected: number; delta: number; ok: boolean }
}

export interface Hole {
  x: number
  z: number
  d: number
  side: 'left' | 'right'
}

export interface Axle {
  index: number
  /** Drawing x of the axle centre. */
  x: number
  /** Drawing y (side view) of the axle centre. */
  z: number
  tireDiameter: number
  tireSpec?: string
  track: number | null
  dual: boolean
  tireSource?: 'measured' | 'estimated'
  tireConfidence?: number
  dualSource?: 'measured' | 'estimated'
}

export interface Crossmember {
  x: number
  thickness: number
}

export interface Slice {
  x: number
  z0: number
  z1: number
  y0: number
  y1: number
}

export interface FrameModel {
  /** Outer edge of each rail in top-view drawing coordinates, front → rear. */
  left: Pt[]
  right: Pt[]
  topZ: number
  bottomZ: number
  centerY: number
  flangeWidth: number
  outerWidthStraight: number
  frontOuterWidth: number
  liner: { x0: number; x1: number } | null
  /** Rolled section read from a detail view, when the drawing contains one. */
  section: FrameSection | null
  sources?: {
    height: 'measured' | 'estimated'
    width: 'measured' | 'estimated'
    flange: 'measured' | 'estimated'
    section: 'measured' | 'estimated'
    liner?: 'measured' | 'estimated'
  }
}

export interface PartModel {
  id: string
  partNumber: string
  side: BBox | null
  top: BBox | null
  samples: Slice[]
  /** Closed side-view ring (drawing X, Z) used instead of the box. */
  profile?: Pt[]
  /** Closed plan ring (drawing X, Y) used instead of the box. */
  plan?: Pt[]
  warning?: string
  /** Visual class used by the review step and the 3D builder. */
  kind?: string
  confidence?: number
  source?: 'measured' | 'estimated' | 'user'
  evidence?: string
  /** A closed contour in this block tightened or confirmed the box. */
  contour?: boolean
}

export interface CabModel {
  side: BBox
  top: BBox
  samples: Slice[]
  /** Outer envelopes of the cab blocks: side and top in drawing coordinates, front in its own view. */
  silhouettes?: { side?: Pt[]; top?: Pt[]; front?: Pt[] }
  /** Closed side-view ring. The shell is extruded from this instead of a generic cab. */
  profile?: Pt[]
  confidence?: number
  source?: 'measured' | 'estimated'
  evidence?: string
}

export interface ChassisHeader {
  chassisType?: string
  icdNo?: string
  title?: string
  orderNo?: string
  cabType?: string
  totalWeight?: string
  frontWeight?: string
  rearWeight?: string
}

export interface ChassisModel {
  version: 1
  profileId: string
  profileName: string
  manufacturer: string
  score: number
  warnings: string[]
  units: 'mm'
  dxfVersion: string
  header: ChassisHeader
  extents: BBox
  views: { side: BBox | null; top: BBox | null; front: BBox | null }
  dimensions: Dimension[]
  frame: FrameModel | null
  holes: Hole[]
  axles: Axle[]
  crossmembers: Crossmember[]
  cab: CabModel | null
  components: PartModel[]
  /** Axle indexes whose mudguards were removed in the review. Absent means draw every axle. */
  skipMudguards?: number[]
  /** Set when the model was rebuilt from the detection review. Suppresses guessed extra parts. */
  reviewApplied?: boolean
  /** Keep the rails for placement, but do not draw them. */
  omitFrame?: boolean
  /** Drawing X of the scene origin. Stable while parts are added one by one. */
  anchorX?: number
  /** Road height in drawing Z. Stable while parts are added one by one. */
  groundZ?: number
  /** Side-view mudguard rings keyed by the axle index used in the review. */
  mudProfiles?: { axle: number; points: Pt[] }[]
  /** Flat x1,y1,x2,y2 arrays keyed by drawing role, for the 2D check view. */
  preview: {
    segments: Record<string, number[]>
    circles: Record<string, number[]>
    /** Short drawing texts, drawn only when the view is zoomed in. */
    labels?: { x: number; y: number; text: string }[]
  }
  stats: {
    segmentCount: number
    circleCount: number
    blockCount: number
    holeCount: number
    parseMs: number
  }
}

export interface ChassisParams {
  webThickness: number
  flangeThickness: number
  cornerRadius: number
  linerEnabled: boolean
  linerThickness: number
  loadState: 'laden' | 'unladen'
  tireSpec: string
  /** When true, each axle keeps the diameter read from the drawing. */
  useDrawingTires: boolean
  tireWidth: number
  /** Honor the dual-wheel flags read from the drawing. */
  dualDrive: boolean
  /** Front steered axles use leaves, driven axles use air, unless overridden. */
  suspension: 'mixed' | 'leaf' | 'air'
  /** 0 = use the dimension extracted for that axle. One entry per axle. */
  tracks: number[]
  lod: 0 | 1 | 2
  holes: 'off' | 'markers' | 'geometry'
  show: {
    frame: boolean
    liner: boolean
    crossmembers: boolean
    axles: boolean
    cab: boolean
    components: boolean
    holes: boolean
    drivetrain: boolean
    equipment: boolean
    suspension: boolean
  }
}

export const defaultParams: ChassisParams = {
  webThickness: 8,
  flangeThickness: 8,
  cornerRadius: 10,
  linerEnabled: true,
  linerThickness: 6,
  loadState: 'laden',
  tireSpec: '315/80 R22.5',
  useDrawingTires: true,
  tireWidth: 315,
  dualDrive: true,
  suspension: 'mixed',
  tracks: [0, 0, 0],
  lod: 2,
  holes: 'geometry',
  show: {
    frame: true,
    liner: true,
    crossmembers: true,
    axles: true,
    cab: true,
    components: true,
    holes: true,
    drivetrain: false,
    equipment: true,
    suspension: false,
  },
}

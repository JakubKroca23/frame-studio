/** Manufacturer profile. Knowledge about a drawing family lives here, not in the core. */

export type BlockViewName = 'side' | 'top' | 'front' | 'rear'

export interface TextRule {
  regex: string
  weight: number
}

export interface LayerRule {
  regex: string
  minMatches: number
  weight: number
}

export interface BlockRule {
  regex: string
  minMatches?: number
  weight: number
}

/** Block-name rules for drawings that do not separate views by layer. */
export interface BlockViewRules {
  special: { regex: string; view: BlockViewName }[]
  cab?: { regex: string; map: Record<string, BlockViewName> }
  part?: {
    regex: string
    /** Capture group index (1-based) holding the view suffix. Empty means defaultView. */
    viewGroup: number
    defaultView: BlockViewName
    map: Record<string, BlockViewName>
  }
}

export interface Profile {
  id: string
  version: number
  manufacturer: string
  name: string
  detect: {
    texts: TextRule[]
    layers: LayerRule[]
    blocks?: BlockRule[]
    minScore: number
  }
  ignore: { blocks: string[]; layers: string[]; blockPatterns?: string[] }
  views: {
    side: string[]
    top: string[]
    cab: string[]
    holesLeft: string[]
    holesRight: string[]
    dimensions: string[]
    info: string[]
    /** Chassis curves used to measure the rail, a subset of side/top. */
    frameSide: string[]
    frameTop: string[]
    /** Extra layers whose top-view geometry can be a crossmember. */
    crossmembers?: string[]
  }
  /**
   * When set, views come from the block name and from the bbox of those blocks.
   * Loose geometry (the frame lines) is assigned by which view window it falls in.
   */
  blockViews?: BlockViewRules
  /**
   * Hole-group inserts drawn in a 1:10 frame. The reference insert (usually the cab)
   * supplies scale and offset: world = insert * scale + referenceOrigin.
   */
  holeFrame?: {
    layers: string[]
    name: string
    reference: string
    /** Used when the reference insert is missing. */
    fallback: { scale: number; x: number; y: number }
  }
  /** Chord tolerance in world millimetres. Larger values keep big drawings responsive. */
  curveTolerance?: number
  /** Drop line segments shorter than this. Circles stay. Used for exploded facets. */
  minSegment?: number
  /** Side-view holes are mirrored onto both rails. */
  mirrorHoles?: boolean
  /** When no tyre-sized circle exists, the largest drawn wheel circle is the diameter. */
  wheelCircleAsTire?: boolean
  /** Cab and crane are split from the side-view mass above the frame, not from a cab layer. */
  raisedSplit?: boolean
  /** When several rail pairs are long enough, keep the longest rather than the widest. */
  preferLongRails?: boolean
  dimensionLabels: {
    pattern: string
    maxGap: number
  }
  /** Named group `pn`, optional `cat`. */
  componentPattern?: string
  componentSkip?: string[]
  /** Inserts whose position is an axle centre in the side view. */
  axleInserts?: {
    name: string
    frontLayers: string[]
    rearLayers: string[]
  }
  /** Tyre-size texts, matched to the nearest axle. */
  tireText?: string
  innerLiner?: {
    start: string
    stop: string
    /** Axle index the signed distances are measured from. */
    axle: number
    startSign: number
    stopSign: number
  }
  /** Closed frame-layer polyline, away from the main views, is the C-section. */
  sectionLayer?: string
  semantics: {
    wheelbase?: string
    /** Axle indexes the wheelbase label spans. Default is the first two axles. */
    wheelbaseAxles?: [number, number]
    axleSpacings?: string[]
    /** Mid-point of the front pair to mid-point of the rear pair. */
    theoreticalWheelbase?: string
    frontOverhang?: string
    frameFrontOverhang?: string
    rearOverhang?: string
    frameOuterWidth?: string
    frameOuterWidthFront?: string
    flangeWidth?: string
    frameHeight?: string
    frameTopFrontLaden?: string
    frameTopFrontUnladen?: string
    frameTopRearLaden?: string
    frameTopRearUnladen?: string
    tracks?: string[]
    tireDiameters?: string[]
  }
}

export interface ProfileMatch {
  profile: Profile
  score: number
}

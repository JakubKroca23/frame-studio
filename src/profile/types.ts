/** Manufacturer profile. Knowledge about a drawing family lives here, not in the core. */
export interface TextRule {
  regex: string
  weight: number
}

export interface LayerRule {
  regex: string
  minMatches: number
  weight: number
}

export interface Profile {
  id: string
  version: number
  manufacturer: string
  name: string
  detect: {
    texts: TextRule[]
    layers: LayerRule[]
    minScore: number
  }
  ignore: { blocks: string[]; layers: string[] }
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
  }
  dimensionLabels: {
    pattern: string
    maxGap: number
  }
  semantics: {
    wheelbase?: string
    axleSpacings?: string[]
    frontOverhang?: string
    rearOverhang?: string
    frameOuterWidth?: string
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

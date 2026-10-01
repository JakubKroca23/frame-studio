import type { Pt } from '../lib/geom'
import type { ParametricCabSpec } from '../model/types'
import { cabLayout, DEFAULT_VARIANT, planRing, type CabLayout } from './cabLayout'
import type { CabConfig } from './types'

/**
 * Parametric cab for the configurator. Overall length, height and width come from the preset
 * (manufacturer data); the shaping (rake, corner rounding, grille and lamp outlines) is a visual
 * estimate per brand and series, see cabLayout.ts and mesh/cabParametric.ts.
 */
export interface CabShapeInput {
  cab: CabConfig
  /** Chassis make and series; the series picks the cab variant when the cab style matches the make. */
  make?: string
  series?: string
  tractor?: boolean
  frontOverhang: number
  frameTop: number
  /** Front tyre radius and axle height. */
  wheelRadius: number
  axleZ: number
  frontTrack?: number
  tyreWidth?: number
}

export interface CabShape {
  side: Pt[]
  top: Pt[]
  front: Pt[]
  spec: ParametricCabSpec
  layout: CabLayout
  box: { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number }
  stepX: number
  stepZ: number
}

export function cabSpec(input: CabShapeInput): ParametricCabSpec {
  const { cab } = input
  const brand = cab.style
  const variant = input.make === brand && input.series ? input.series : DEFAULT_VARIANT[brand]
  const xFront = -input.frontOverhang
  const xRear = Math.max(cab.backFromAxle, xFront + 1400)
  return {
    brand,
    variant,
    kind: cab.kind,
    roof: cab.roof,
    tractor: input.tractor ?? false,
    xFront,
    xRear,
    height: Math.max(cab.height, input.frameTop + 1500),
    width: cab.width,
    frameTop: input.frameTop,
    axleZ: input.axleZ,
    wheelRadius: input.wheelRadius,
    frontTrack: input.frontTrack ?? 2050,
    tyreWidth: input.tyreWidth ?? 315,
  }
}

export function cabShape(input: CabShapeInput): CabShape {
  const spec = cabSpec(input)
  const layout = cabLayout(spec)
  const half = spec.width / 2

  // Plan at the widest, longest height (just above the arch step).
  const planZ = Math.min(layout.zScreenLow - 150, layout.zArch + 10)
  const top = planRing(layout.plan(Math.max(planZ, layout.zArch + 1)))

  // Front view: half widths by height.
  const front: Pt[] = []
  const rows = layout.rings.filter((_, i, all) => i % 2 === 0 || i === all.length - 1)
  for (const z of rows) front.push({ x: layout.plan(z).w, y: z })
  for (const z of rows.slice().reverse()) front.push({ x: -layout.plan(z).w, y: z })

  const ra = layout.archR
  const stepFront = spec.xFront + 330
  return {
    side: layout.side,
    top,
    front,
    spec,
    layout,
    box: { x0: spec.xFront, x1: spec.xRear, z0: layout.zLow, z1: spec.height, y0: -half, y1: half },
    stepX: (stepFront - ra) / 2,
    stepZ: layout.zLow + 60,
  }
}

/** Chassis configuration edited in the "Vytvořit nový" page. All lengths in mm, loads in kg. */

export type Make = 'volvo' | 'scania' | 'man' | 'daf'
/** Cab shape: one per make plus Mercedes-Benz, which has no chassis presets yet. */
export type CabStyle = Make | 'mercedes'
export type CabKind = 'day' | 'sleeper'
export type RoofKind = 'low' | 'normal' | 'high' | 'xhigh'
export type Side = 'left' | 'right'

export interface AxleConfig {
  /** Distance behind the first front axle. The first axle is always at 0. */
  position: number
  steered: boolean
  driven: boolean
  /** Liftable axle (tag or pusher). */
  lift: boolean
  /** Twin tyres on each side. */
  twin: boolean
  /** Maximum permitted axle load in kg. */
  maxLoad: number
  /** Track (centre of the tyre or of the twin pair) in mm. */
  track: number
  tyre: string
}

export interface FrameConfig {
  /** Outer width over the rails at the rear (straight part). */
  widthRear: number
  /** Outer width at the front end (flared or waisted frames). Equal to widthRear for a straight frame. */
  widthFront: number
  /** Distance behind the first axle where the frame reaches widthRear. */
  taperEnd: number
  /** Rail section: web height, flange width, material thickness. */
  sectionHeight: number
  flange: number
  thickness: number
  /** Height of the frame top above the road. */
  topHeight: number
  /** Distance from the first axle forward to the frame front end. */
  frontEnd: number
}

export interface CabConfig {
  style: CabStyle
  kind: CabKind
  roof: RoofKind
  /** Overall cab length from bumper face to rear wall. */
  length: number
  /** Overall height above the road. */
  height: number
  width: number
  /** First axle to the rear wall of the cab. */
  backFromAxle: number
  color: number
}

export interface TankConfig {
  enabled: boolean
  liters: number
  side: Side
}

export interface ChassisConfig {
  make: Make
  series: string
  name: string
  kind: 'tractor' | 'rigid'
  axles: AxleConfig[]
  /** Front overhang: first axle to the front face of the vehicle (bumper). */
  frontOverhang: number
  /** Rear overhang: last axle to the frame end. */
  rearOverhang: number
  frame: FrameConfig
  /** Maximum permitted gross vehicle weight and gross combination weight, kg. */
  gvw: number
  gcw: number
  cab: CabConfig
  fuel: TankConfig
  adblue: TankConfig
  battery: { enabled: boolean; side: Side }
  airTanks: { enabled: boolean; count: number }
  exhaust: { kind: 'horizontal' | 'vertical'; side: Side }
  fifthWheel: {
    enabled: boolean
    /** Kingpin ahead of the rear axle (or bogie centre); positive = in front. */
    lead: number
    /** Height of the fifth wheel plate top above the road. */
    height: number
  }
  sideGuards: boolean
  rearUnderrun: boolean
  mudguards: boolean
}

/** A value read from a source is a plain number; an estimated one is wrapped. */
export interface Approx<T = number> {
  value: T
  approx: true
}

/** Preset input: every number may be marked approximate. */
export type Raw<T> = T extends number | string | boolean
  ? T | Approx<T>
  : T extends readonly (infer U)[]
      ? Raw<U>[]
      : { [K in keyof T]: Raw<T[K]> }

export interface ChassisPresetInput {
  id: string
  make: Make
  series: string
  /** Short label of the configuration, e.g. "4x2 tahač, Globetrotter". */
  label: string
  /** Wheelbase options listed by the manufacturer for this configuration. */
  wheelbases: number[]
  /** How the manufacturer measures the wheelbase. */
  wheelbaseRef: 'firstRear' | 'rearCentre' | 'secondFrontToFirstRear'
  /** Primary source of the numbers (official spec sheet whenever possible). */
  source: string
  /** Further sources used for individual values. */
  sources?: string[]
  note?: string
  config: Raw<ChassisConfig>
}

export interface ChassisPreset extends Omit<ChassisPresetInput, 'config'> {
  config: ChassisConfig
  /** Dotted paths of every value that is estimated rather than read from a source. */
  approx: string[]
}

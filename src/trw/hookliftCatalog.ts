/**
 * Hooklift catalog from Hiab MULTILIFT datasheets (DIN versions): ULTIMA 18 (BD-ULTIMA18-EN-DIN_191010),
 * ULTIMA 21SL (BD-ULTIMA21SL-EN-DIN_191010), ULTIMA 21 = 21S + 21Z (Hiab ULTIMA 21 technical information, DIN). All lengths in mm, masses in kg.
 * Merged table cells in the PDF (one value spanning several G-lengths) are expanded to each model.
 */
export interface HookliftSpec {
  /** Canonical name, e.g. "ULTIMA 18Z.59" (= ULT18Z59). */
  name: string
  /** Series, e.g. "ULTIMA 18Z". */
  series: string
  /** Datasheet the values come from. */
  source: string
  /** G-length code (46…61) – nominal hook-to-rear-roller distance in dm. */
  gCode: number | string
  capacityT: number
  vehicleGvwT: number
  axles: number
  /** System weight (incl. hydraulic body locking, excl. oil tank and oil). */
  massKg: number
  tippingAngleDeg: number
  /** SL – subframe length (can be shortened at installation). */
  subframeLengthMm: number
  /** G – exact G-length (hook → rear roller pivot), tolerance +20/−40 mm. */
  gLengthMm: number
  /** B – centre of gravity distance as drawn (from the rear roller / tipping pivot line; see report). */
  cogBMm: number
  /** LR – internal container (body) length range. */
  bodyLengthMinMm: number
  bodyLengthMaxMm: number
  /** HM – horizontal movement of the arm (18S only; 18Z table has no values). */
  horizontalMovementMm: number | null
  /** h – installation height (subframe height above truck frame). */
  installHeightMm: number
  /** t – minimum free tunnel height under the body. */
  tunnelHeightMm: number
  /** HH – DIN hook height. */
  hookHeightMm: number
  /** BW – body (container runner) width. */
  bodyWidthMm: number
  /** LH – minimum working height (18Z only). */
  minWorkingHeightMm: number | null
  rearRollerOffsetMm: number | null
  maxPressureMPa: number
  oilFlowLpm: number
}

/**
 * One datasheet table = one series. To add a datasheet, append a `defineSeries({...})` call below:
 * per-model rows are arrays in G-code order; a single number means one merged cell for all models.
 */
type Col = number | readonly number[]
export interface SeriesTable {
  series: string
  /** Name prefix of each model, e.g. "ULTIMA 18Z" → "ULTIMA 18Z.59". */
  source: string
  capacityT: number
  vehicleGvwT: number
  axles: number
  gCodes: readonly (number | string)[]
  massKg: Col
  tippingAngleDeg: Col
  bodyLengthM: readonly (readonly [number, number])[]
  subframeLengthMm: Col
  cogBMm: Col
  gLengthMm: Col
  horizontalMovementMm?: Col | null
  installHeightMm: Col
  tunnelHeightMm: Col
  hookHeightMm: Col
  bodyWidthMm: Col
  minWorkingHeightMm?: Col | null
  /** Rear roller centre behind the subframe end, if dimensioned in the drawing. */
  rearRollerOffsetMm?: number | null
  maxPressureMPa: number
  oilFlowLpm: number
}

const at = (c: Col | null | undefined, i: number): number | null => (c == null ? null : typeof c === 'number' ? c : c[i])

export function defineSeries(t: SeriesTable): HookliftSpec[] {
  return t.gCodes.map((gCode, i) => ({
    name: `${t.series}.${gCode}`, series: t.series, source: t.source, gCode, capacityT: t.capacityT, vehicleGvwT: t.vehicleGvwT, axles: t.axles,
    massKg: at(t.massKg, i)!, tippingAngleDeg: at(t.tippingAngleDeg, i)!, subframeLengthMm: at(t.subframeLengthMm, i)!, gLengthMm: at(t.gLengthMm, i)!,
    cogBMm: at(t.cogBMm, i)!, bodyLengthMinMm: Math.round(t.bodyLengthM[i][0] * 1000), bodyLengthMaxMm: Math.round(t.bodyLengthM[i][1] * 1000),
    horizontalMovementMm: at(t.horizontalMovementMm, i), installHeightMm: at(t.installHeightMm, i)!, tunnelHeightMm: at(t.tunnelHeightMm, i)!,
    hookHeightMm: at(t.hookHeightMm, i)!, bodyWidthMm: at(t.bodyWidthMm, i)!, minWorkingHeightMm: at(t.minWorkingHeightMm, i),
    rearRollerOffsetMm: t.rearRollerOffsetMm ?? null, maxPressureMPa: t.maxPressureMPa, oilFlowLpm: t.oilFlowLpm,
  }))
}

const ULTIMA18 = 'Hiab BD-ULTIMA18-EN-DIN_191010'
export const HOOKLIFT_CATALOG: HookliftSpec[] = [
  ...defineSeries({
    series: 'ULTIMA 18S', source: ULTIMA18, capacityT: 18, vehicleGvwT: 26, axles: 3, gCodes: [46, 51, 53, 56, 59, 61],
    massKg: [1770, 1870, 1960, 2000, 2020, 2040], tippingAngleDeg: [50, 49, 52, 52, 52, 49],
    bodyLengthM: [[3.9, 5.6], [4.2, 6.1], [4.5, 6.4], [4.5, 6.6], [4.6, 6.9], [4.8, 7.1]],
    subframeLengthMm: [5308, 5758, 6508, 6508, 6508, 6758], cogBMm: [2450, 2700, 2850, 2950, 3000, 3150], gLengthMm: [4580, 5080, 5360, 5560, 5860, 6080],
    horizontalMovementMm: [900, 1100, 1100, 1300, 1450, 1450], installHeightMm: [230, 230, 230, 230, 250, 250], tunnelHeightMm: [125, 125, 125, 125, 105, 105],
    hookHeightMm: 1570, bodyWidthMm: 1070, maxPressureMPa: 30, oilFlowLpm: 80,
  }),
  ...defineSeries({
    series: 'ULTIMA 18Z', source: ULTIMA18, capacityT: 18, vehicleGvwT: 26, axles: 3, gCodes: [46, 51, 53, 56, 59, 61],
    massKg: [2280, 2360, 2410, 2460, 2520, 2600], tippingAngleDeg: [50, 52, 49, 49, 52, 49],
    bodyLengthM: [[2.8, 5.6], [3.0, 6.1], [3.3, 6.3], [3.6, 6.6], [3.8, 7.0], [4.1, 7.1]],
    subframeLengthMm: [5273, 5753, 5983, 6283, 6583, 6783], cogBMm: [2500, 2850, 2950, 3150, 3350, 3500], gLengthMm: [4600, 5080, 5310, 5610, 5880, 6110],
    horizontalMovementMm: null, installHeightMm: 250, tunnelHeightMm: 125, hookHeightMm: 1570, bodyWidthMm: 1070,
    minWorkingHeightMm: [2544, 2625, 2720, 2800, 3066, 3066], maxPressureMPa: 30, oilFlowLpm: 80,
  }),
  ...defineSeries({
    series: 'ULTIMA 21SL', source: 'Hiab BD-ULTIMA21SL-EN-DIN_191010', capacityT: 21, vehicleGvwT: 26, axles: 3, gCodes: [49, 51, 52, 53, 56],
    massKg: [2040, 2100, 2150, 2200, 2200], tippingAngleDeg: [56, 52, 52, 55, 52],
    bodyLengthM: [[4.0, 5.9], [4.2, 6.1], [4.3, 6.2], [4.5, 6.4], [4.7, 6.6]],
    subframeLengthMm: [5543, 5843, 5843, 6143, 6443], cogBMm: [2885, 3000, 3070, 3150, 3300], gLengthMm: [4870, 5100, 5240, 5380, 5600],
    horizontalMovementMm: 1100, installHeightMm: 195, tunnelHeightMm: 105, hookHeightMm: 1570, bodyWidthMm: 1070,
    rearRollerOffsetMm: 110, maxPressureMPa: 30, oilFlowLpm: 80,
  }),
  ...defineSeries({
    series: 'ULTIMA 21S', source: 'Hiab MULTILIFT ULTIMA 21 technical information (DIN)', capacityT: 21, vehicleGvwT: 26, axles: 3,
    gCodes: [46, 51, 53, 56, '56S', 59, 61, 63],
    massKg: [2290, 2380, 2470, 2500, 2500, 2530, 2550, 2590], tippingAngleDeg: [50, 49, 53, 53, 49, 53, 49, 46],
    bodyLengthM: [[3.9, 5.6], [4.2, 6.1], [4.5, 6.4], [4.5, 6.6], [4.7, 6.6], [4.6, 6.9], [4.8, 7.1], [5.1, 7.3]],
    subframeLengthMm: [5333, 5933, 6563, 6563, 6283, 6563, 6733, 6883], cogBMm: [2450, 2700, 2850, 2950, 2950, 3000, 3150, 3300],
    gLengthMm: [4580, 5080, 5360, 5560, 5580, 5860, 6080, 6310], horizontalMovementMm: [900, 1100, 1100, 1300, 1100, 1450, 1450, 1450],
    installHeightMm: 250, tunnelHeightMm: 125, hookHeightMm: 1570, bodyWidthMm: 1070, maxPressureMPa: 30, oilFlowLpm: 100,
  }),
  ...defineSeries({
    series: 'ULTIMA 21Z', source: 'Hiab MULTILIFT ULTIMA 21 technical information (DIN)', capacityT: 21, vehicleGvwT: 26, axles: 3,
    gCodes: [51, 53, 56, 59, 61],
    massKg: [2690, 2720, 2770, 2810, 2840], tippingAngleDeg: [53, 49, 49, 52, 49],
    bodyLengthM: [[3.0, 6.1], [3.3, 6.3], [3.6, 6.6], [3.8, 7.0], [4.1, 7.1]],
    subframeLengthMm: [5753, 5983, 6283, 6583, 6783], cogBMm: [2800, 2950, 3150, 3350, 3500], gLengthMm: [5080, 5310, 5610, 5880, 6110],
    horizontalMovementMm: null, installHeightMm: 250, tunnelHeightMm: 125, hookHeightMm: 1570, bodyWidthMm: 1070,
    minWorkingHeightMm: [2625, 2720, 2800, 3066, 3066], maxPressureMPa: 30, oilFlowLpm: 100,
  }),
  ...defineSeries({
    series: 'ULTIMA 14S', source: 'Hiab BD-ULTIMA14S-EN-WW_191010', capacityT: 14, vehicleGvwT: 19, axles: 2, gCodes: [41, 43, 46, 51, 53, 56],
    massKg: [1600, 1630, 1660, 1760, 1840, 1860], tippingAngleDeg: [50, 47, 50, 49, 52, 52],
    bodyLengthM: [[3.4, 5.1], [3.6, 5.3], [3.9, 5.6], [4.2, 6.1], [4.5, 6.4], [4.5, 6.6]],
    subframeLengthMm: [4808, 4958, 5308, 5758, 6508, 6508], cogBMm: [2180, 2290, 2450, 2700, 2850, 2950], gLengthMm: [4080, 4270, 4580, 5080, 5360, 5560],
    horizontalMovementMm: [900, 900, 900, 1100, 1100, 1300], installHeightMm: 230, tunnelHeightMm: 125, hookHeightMm: 1570, bodyWidthMm: 1070,
    maxPressureMPa: 30, oilFlowLpm: 60,
  }),
  ...defineSeries({
    series: 'ULTIMA 16S', source: 'Hiab BD-ULTIMA16S-EN-DIN_191010', capacityT: 16, vehicleGvwT: 26, axles: 3, gCodes: [46, 51, 53, 56, 59, 61],
    massKg: [1740, 1840, 1920, 1940, 1990, 2010], tippingAngleDeg: [50, 49, 52, 52, 52, 49],
    bodyLengthM: [[3.9, 5.6], [4.2, 6.1], [4.5, 6.4], [4.5, 6.6], [4.6, 6.9], [4.8, 7.1]],
    subframeLengthMm: [5308, 5758, 6508, 6508, 6508, 6758], cogBMm: [2450, 2700, 2850, 2950, 3000, 3150], gLengthMm: [4580, 5080, 5360, 5560, 5860, 6080],
    horizontalMovementMm: [900, 1100, 1100, 1300, 1450, 1450], installHeightMm: [230, 230, 230, 230, 250, 250], tunnelHeightMm: [125, 125, 125, 125, 105, 105],
    hookHeightMm: 1570, bodyWidthMm: 1070, maxPressureMPa: 30, oilFlowLpm: 80,
  }),
  ...defineSeries({
    series: 'ULTIMA 26S', source: 'Hiab BD-ULTIMA26-EN-DIN_191010', capacityT: 26, vehicleGvwT: 32, axles: 4, gCodes: [51, 53, 56, '56S', 59, 61, 63, 70, 78],
    massKg: [2550, 2650, 2680, 2680, 2730, 2750, 2790, 3080, 3230], tippingAngleDeg: [49, 52, 52, 49, 52, 49, 46, 50, 46],
    bodyLengthM: [[4.2, 6.1], [4.5, 6.4], [4.5, 6.6], [4.7, 6.6], [4.6, 6.9], [4.8, 7.1], [5.1, 7.3], [5.7, 8.0], [6.5, 8.8]],
    subframeLengthMm: [5933, 6563, 6563, 6583, 6563, 6733, 6883, 7783, 8419], cogBMm: [2700, 2850, 2950, 2950, 3000, 3150, 3300, 3900, 4350],
    gLengthMm: [5080, 5360, 5560, 5580, 5860, 6080, 6310, 6980, 7780], horizontalMovementMm: [1100, 1100, 1300, 1100, 1450, 1450, 1450, 1450, 1450],
    installHeightMm: 270, tunnelHeightMm: 125, hookHeightMm: 1570, bodyWidthMm: 1070, maxPressureMPa: 30, oilFlowLpm: 120,
  }),
  ...defineSeries({
    series: 'ULTIMA 26Z', source: 'Hiab BD-ULTIMA26-EN-DIN_191010', capacityT: 26, vehicleGvwT: 32, axles: 4, gCodes: [51, 53, 56, 59, 61, 65],
    massKg: [2720, 2750, 2800, 2840, 2870, 2950], tippingAngleDeg: [53, 49, 49, 52, 49, 48],
    bodyLengthM: [[3.0, 6.1], [3.3, 6.3], [3.6, 6.6], [3.8, 7.0], [4.1, 7.1], [4.4, 7.4]],
    subframeLengthMm: [5753, 5983, 6283, 6583, 6783, 7133], cogBMm: [2800, 2950, 3150, 3350, 3500, 3630], gLengthMm: [5080, 5310, 5610, 5880, 6110, 6430],
    horizontalMovementMm: null, installHeightMm: 250, tunnelHeightMm: 125, hookHeightMm: 1570, bodyWidthMm: 1070,
    minWorkingHeightMm: [2625, 2720, 2800, 3066, 3066, 3215], maxPressureMPa: 30, oilFlowLpm: 100,
  }),
]

const clean = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '')
/** "ULTIMA 18Z" → "ULT18Z"; "ULT18Z59" and "ULTIMA18Z59" both normalise to "ULT18Z59". */
const key = (s: string) => clean(s).replace(/^.*?ULT(?:IMA)?(?=\d)/, "ULT")

export interface HookliftMatch {
  spec: HookliftSpec
  /** true = trw names the exact model (series + G code); false = only the series, model auto-picked by length. */
  exact: boolean
}

/** Bare model codes without "ULTIMA": "14S51", "14S.51", "Multilift 14 S-51", "21SL.49" → "ULT14S51"… (series must exist). */
function bareKey(name: string): string | null {
  const u = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  const m = /(?:^|[^0-9.])(\d{2})\s*(SL|S|Z)\s*[.\-/ ]?\s*(\d{2}S?)(?![0-9])/.exec(u)
  if (m) return `ULT${m[1]}${m[2]}${m[3]}`
  const ser = /(?:^|[^0-9.])(\d{2})\s*(SL|S|Z)(?![A-Z0-9])/.exec(u)
  if (ser && /HOOK|HAK|MULTILIFT|ABROLL|NOSIC|HIAB/.test(clean(u))) return `ULT${ser[1]}${ser[2]}`
  return null
}

/**
 * Fuzzy lookup by name: "ULT18Z59 DIN", "Multilift Ultima 18Z.59", "ULTIMA 21 SL 53", "14S51"…
 * With series but no G code, picks the model whose subframe length is closest to `lengthHintMm` (exact = false).
 */
export function findHookliftMatch(name: string | null | undefined, lengthHintMm?: number | null): HookliftMatch | null {
  if (!name) return null
  const k = /ULT(IMA)?\d/.test(clean(name)) ? key(name) : bareKey(name)
  if (!k) return null
  // longest series key first so "ULT21SL" wins over "ULT21S"
  const series = [...new Set(HOOKLIFT_CATALOG.map((c) => c.series))].sort((a, b) => key(b).length - key(a).length)
  const sr = series.find((x) => k.startsWith(key(x)))
  if (!sr) return null
  const inSeries = HOOKLIFT_CATALOG.filter((c) => c.series === sr)
  const rest = k.slice(key(sr).length)
  const g = /^(\d{2})(S?)/.exec(rest)
  if (g) {
    const spec = inSeries.find((c) => String(c.gCode) === g[1] + g[2]) ?? inSeries.find((c) => String(c.gCode) === g[1])
    return spec ? { spec, exact: true } : null
  }
  if (lengthHintMm == null) return { spec: inSeries[0], exact: false }
  return { spec: inSeries.reduce((a, c) => (Math.abs(c.subframeLengthMm - lengthHintMm) < Math.abs(a.subframeLengthMm - lengthHintMm) ? c : a)), exact: false }
}

export function findHookliftSpec(name: string | null | undefined, lengthHintMm?: number | null): HookliftSpec | null {
  const m = findHookliftMatch(name, lengthHintMm)
  // keep the previous contract: series without a length hint is not a match
  return m && (m.exact || lengthHintMm != null) ? m.spec : null
}

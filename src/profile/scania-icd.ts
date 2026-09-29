import type { Profile } from './types'

/**
 * Scania Individual Chassis Drawing.
 * Semantic labels are filled where the sample geometry confirms them
 * (wheelbase, frame section, overhangs, tyre diameters, tracks).
 * Pairing gap is wider than the 300 mm in the design-doc sketch: on the
 * sample, H036's value sits ~465 mm from the label, along the dimension line.
 */
export const scaniaIcdProfile: Profile = {
  id: 'scania-icd',
  version: 1,
  manufacturer: 'Scania',
  name: 'Scania ICD (Individual Chassis Drawing)',
  detect: {
    texts: [{ regex: 'SCANIA ICD', weight: 5 }],
    layers: [{ regex: '^2(0[1-9]|1[0-8])_', minMatches: 8, weight: 3 }],
    minScore: 6,
  },
  ignore: { blocks: ['PREL'], layers: ['Defpoints'] },
  views: {
    side: ['203_*', '204_*', '218_*', '209_*', '211_*', '212_*', '213_*', '214_*', '216_*', '217_*'],
    top: ['205_*', '207_*', '210_*', '215_*'],
    cab: ['206_*'],
    holesLeft: ['211_*'],
    holesRight: ['212_*'],
    dimensions: ['201_*'],
    info: ['202_*'],
    frameSide: ['203_*', '204_*', '218_*'],
    frameTop: ['205_*'],
  },
  dimensionLabels: {
    pattern: '\\(?([LHW]\\d{3}(?:\\.\\d+)?(?:\\.[A-Z]+)*)\\s*=\\s*([\\d.,]+)?\\)?',
    maxGap: 900,
  },
  semantics: {
    wheelbase: 'L011',
    axleSpacings: ['L012.1', 'L012.2'],
    frontOverhang: 'L016',
    rearOverhang: 'L019',
    frameOuterWidth: 'W036',
    flangeWidth: 'W032.1',
    frameHeight: 'H032.1',
    frameTopFrontLaden: 'H036',
    frameTopFrontUnladen: 'H035',
    frameTopRearLaden: 'H038',
    frameTopRearUnladen: 'H037',
    tracks: ['W013.1', 'W013.2', 'W013.3'],
    tireDiameters: ['L022.1', 'L022.2', 'L022.3'],
  },
}

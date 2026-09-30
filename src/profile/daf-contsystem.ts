import type { Profile } from './types'

/**
 * Contsystem bodybuilder sheet of a DAF chassis with a loader crane.
 * Verified on 08-09-26-ozo-daf-hiab (AC1032, not stored in the repo):
 * blocks daf_side and daf_top, layer OBRYS, web 303 mm, outer width 790 mm,
 * flange inset 75 mm, axles at 18760 and 23153, wheel circles 596 mm.
 * There is no HIAB label and no tyre-size text.
 */
export const dafContsystemProfile: Profile = {
  id: 'daf-contsystem',
  version: 1,
  manufacturer: 'DAF',
  name: 'DAF podvozek (Contsystem)',
  detect: {
    texts: [
      { regex: 'CONTSYSTEM', weight: 4 },
      { regex: 'NÁSTAVBA|NASTAVBA', weight: 2 },
    ],
    layers: [],
    blocks: [
      { regex: '^daf_side$', weight: 5 },
      { regex: '^daf_top$', weight: 5 },
    ],
    minScore: 8,
  },
  ignore: {
    blocks: ['ramecek', 'CS_ramecek', 'RAZITKO', 'RAZITKO_PORTRAit', '_FILLED', '_Dot'],
    layers: ['Defpoints'],
    blockPatterns: ['^\\*D\\d+$', '^\\*U'],
  },
  views: {
    side: ['OBRYS'],
    top: ['OBRYS'],
    cab: [],
    holesLeft: ['OBRYS'],
    holesRight: ['OBRYS'],
    dimensions: ['KOTA'],
    info: [],
    frameSide: ['OBRYS'],
    frameTop: ['OBRYS'],
  },
  blockViews: {
    special: [
      { regex: '^daf_side$', view: 'side' },
      { regex: '^daf_top$', view: 'top' },
    ],
  },
  curveTolerance: 3,
  minSegment: 0.4,
  mirrorHoles: true,
  wheelCircleAsTire: true,
  raisedSplit: true,
  preferLongRails: true,
  dimensionLabels: {
    pattern: '([LHW]\\d{3}(?:\\.[A-Z0-9]+)*)\\s*=\\s*(-?[\\d.,]+)',
    maxGap: 400,
  },
  semantics: {},
}

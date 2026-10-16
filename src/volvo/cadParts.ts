/**
 * Volvo chassis CAD (Onshape export, optimised with gltf-transform; shipped in public/models/volvo with Jakub's approval,
 * served only to logged-in users – see deploy/nginx.conf). The binary is not in git: scripts/deploy.sh copies it into
 * the build. Parts plug in by datum: 'rear' = tandem rear end, 'front' (front axle, cab area – batteries, AdBlue,
 * tanks) will be added the same way once the front file is available.
 *
 * CAD space [m]: X along the vehicle (+ rearwards), Y DOWN, Z across. Datums measured from the CAD (tyre centres,
 * rail ends, lowest point = road).
 */
/** A movable component: one or more top-level CAD nodes (matched by part-number substring) moved together. */
export interface CadMovable { key: string; label: string; parts: string[] }
export interface CadPart {
  key: 'rear' | 'front'
  file: string
  /** Extra rotation [rad, about X] inside the common CAD frame: the front export is Z-up/Y-across (+π/2), the rear Y-down. */
  rotX?: number
  /** Cab back wall in CAD X [m] (front datum). */
  cabBackX?: number
  /** Axle centres in CAD X [m], in vehicle order. */
  axlesX: number[]
  /** Road level in CAD Y [m] (Y points down). */
  groundY: number
  /** Rear end of the CAD frame rails [m] (rear part only). */
  frameEndX?: number
  /** Nodes left out because the procedural (config-sized) part replaces them, by part-number substring. */
  hide: string[]
  /** Pieces behind the last axle: moved with the frame end. */
  behindX?: number
  movable: CadMovable[]
}

export const VOLVO_REAR: CadPart = {
  key: 'rear',
  file: 'volvo/rear.glb',
  axlesX: [8.64, 10.01], // tandem: dual tyres Ø1 091 at 8.64, single Ø1 079 at 10.01 (spacing 1 370)
  groundY: -0.222,
  frameEndX: 11.48,
  // CAD rails/liners have one fixed length → the procedural frame (wheelbase, overhang from the config) stays
  hide: ['assy_26083011', '26083011_35_fil', '26083011_ps_'],
  behindX: 10.6,
  // fenders are NOT movable: they stay on the CAD axles, which sit on the config axles
  movable: [
    { key: '22486789', label: 'Zadní zábrana', parts: ['22486789'] },
    { key: '23536910', label: 'Držák svítilny P', parts: ['23536910'] },
    { key: '23536912', label: 'Držák svítilny L', parts: ['23536912'] },
  ],
}
/**
 * Front part (behind the cab: tanks, batteries, AdBlue, air tanks). The export has no front axle/wheels, so it is
 * placed by the cab back wall (envelope slab 26083011_35_cab, front face X 3.69) on cfg.cab.backFromAxle. Same CAD
 * frame as the rear (rails X 1.76–11.48), but Z-up/Y-across. Rails, cab slab and crossmembers are stripped from the
 * shipped file (the configurator draws them). Component names are bare part numbers – the labels below are identified
 * from shape/position only (round tank with straps, cap-tank, box with tread grille, cylinders) and may be wrong.
 */
export const VOLVO_FRONT: CadPart = {
  key: 'front',
  file: 'volvo/front.glb',
  rotX: Math.PI / 2,
  cabBackX: 3.69,
  axlesX: [],
  groundY: -0.222,
  hide: ['assy_26083011', '26083011_35_fil', '26083011_ps_', '26083011_35_cab', '22808806', '22813628', '20833685', '23991682'],
  movable: [
    { key: 'fuel', label: 'Palivová nádrž P (válcová, s pásy) – odhad', parts: ['22059951', '20382489', '24315882'] },
    { key: 'battery', label: 'Bateriová skříň P (u kabiny) – odhad', parts: ['24349439', '24666240', '23893740', '23537552', '23985887', '24575909', '21476051', '21476044'] },
    { key: 'adblue', label: 'Nádrž AdBlue L (s víčkem) – pravděpodobně', parts: ['26119553'] },
    { key: 'box', label: 'Skříň s mřížkou / nášlap L – odhad', parts: ['22189361', '22958654', '21133312', '23070382'] },
    { key: 'air', label: 'Vzduchojemy L (2 válce)', parts: ['21192971', '21238559'] },
  ],
}

/** Scene x [mm] = CAD X·1000 + tx for the front part: cab back wall on cfg.cab.backFromAxle behind the 1st axle. */
export function fitFront(axles: AxleLike[], cabBackFromAxle: number, part: CadPart = VOLVO_FRONT): number {
  return (axles[0]?.position ?? 0) + cabBackFromAxle - (part.cabBackX ?? 0) * 1000
}

export interface AxleLike { position: number }
export interface RearFit {
  ok: boolean
  /** Scene x [mm] = CAD X·1000 + tx. */
  tx: number
  /** Extra shift [mm] of pieces behind the axles so the rear end follows the config frame end. */
  rearShift: number
  /** Indices of config axles the CAD replaces. */
  replaces: number[]
  notes: string[]
}
/**
 * Fit the rear CAD to the vehicle config: the CAD's first tandem axle sits on the config's second-to-last axle
 * (rigid – the CAD tandem spacing stays 1 370 mm), the rear pieces shift to the config frame end.
 */
export function fitRear(axles: AxleLike[], frameRear: number, part: CadPart = VOLVO_REAR): RearFit {
  const notes: string[] = []
  if (axles.length < 3) return { ok: false, tx: 0, rearShift: 0, replaces: [], notes: ['CAD zadku je tandem – vozidlo má jen jednu zadní nápravu, zůstává zjednodušený model.'] }
  const a = axles[axles.length - 2].position, b = axles[axles.length - 1].position
  const tx = a - part.axlesX[0] * 1000
  const cadSpacing = (part.axlesX[1] - part.axlesX[0]) * 1000
  if (Math.abs(b - a - cadSpacing) > 30) notes.push(`Rozvor tandemu ve vozidle ${Math.round(b - a)} mm, v CAD ${Math.round(cadSpacing)} mm – CAD nápravy ponechány (přibližně).`)
  const rearShift = part.frameEndX != null ? frameRear - (part.frameEndX * 1000 + tx) : 0
  if (Math.abs(rearShift) > 1) notes.push(`Zadní díly (zábrana, svítilny) posunuty o ${Math.round(rearShift)} mm na konec rámu z konfigurace.`)
  notes.push('Rám a příčníky zůstávají z konfigurace (CAD rám má pevnou délku).')
  return { ok: true, tx, rearShift, replaces: [axles.length - 2, axles.length - 1], notes }
}

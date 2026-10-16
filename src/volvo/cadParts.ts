/**
 * Volvo chassis CAD (Onshape export, optimised with gltf-transform; shipped in public/models/volvo with Jakub's approval,
 * served only to logged-in users – see deploy/nginx.conf). The binary is not in git: scripts/deploy.sh copies it into
 * the build. Parts plug in by datum: 'rear' = tandem rear end, 'front' (front axle, cab area – batteries, AdBlue,
 * tanks) will be added the same way once the front file is available.
 *
 * CAD space [m]: X along the vehicle (+ rearwards), Y DOWN, Z across. Datums measured from the CAD (tyre centres,
 * rail ends, lowest point = road).
 */
export interface CadMovable { partNo: string; label: string }
export interface CadPart {
  key: 'rear' | 'front'
  file: string
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
  movable: [
    { partNo: '24410284_2', label: 'Blatník L (1. zadní náprava)' },
    { partNo: '24410284_1', label: 'Blatník P (1. zadní náprava)' },
    { partNo: '24410140_2', label: 'Blatník L (2. zadní náprava)' },
    { partNo: '24410140_1', label: 'Blatník P (2. zadní náprava)' },
    { partNo: '22486789', label: 'Zadní zábrana' },
    { partNo: '23536910', label: 'Držák svítilny P' },
    { partNo: '23536912', label: 'Držák svítilny L' },
  ],
}
/** Front part: not available yet (144 MB source, coming zipped). Same shape: axlesX [0], movable batteries/AdBlue/tanks. */
export const VOLVO_FRONT: CadPart | null = null

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

/**
 * Refinement layers: after a vehicle is loaded (trw / preset) the user adds DXF/DWG drawings one by one. Each gets a
 * role, is turned into 3D by the 3-view DXF→3D pipeline and is placed in the scene by a datum of its role:
 *  - celková sestava / podvozek: front end on the vehicle front (−front overhang), underside on the ground; the
 *    measured chassis values are also merged into the config (refineConfigFromDxf),
 *  - nástavba: underside on the frame top, rear end on the frame end,
 *  - kontejner: underside on the hooklift rails (frame top + installation height), rear end on the rear roller.
 * A manual offset (left panel) is added on top. Scene: x along the vehicle from the 1st axle (+ towards the rear),
 * y up from the ground, z across.
 */
export type LayerRole = 'assembly' | 'container' | 'body' | 'chassis'
export const ROLE_LABEL: Record<LayerRole, string> = { assembly: 'celková sestava', container: 'kontejner', body: 'nástavba', chassis: 'podvozek' }
export const ROLES: LayerRole[] = ['assembly', 'container', 'body', 'chassis']

export function roleFromName(name: string): LayerRole {
  const n = name.toLowerCase()
  if (/abroll|kontejn|container|\bdsd\b|\bm3\b|m³/.test(n)) return 'container'
  if (/sestav|assembly|celk|tsr/.test(n)) return 'assembly'
  if (/podvoz|chassis|rám|ram\b|frame/.test(n)) return 'chassis'
  return 'body'
}

/** "6500x2340x2400" in a file name → length/width/height [mm] (first is the length). */
export function sizeFromName(name: string): { length: number; width?: number; height?: number } | null {
  const m = name.match(/(\d{3,5})\s*[x×]\s*(\d{3,5})(?:\s*[x×]\s*(\d{3,5}))?/i)
  if (!m) return null
  return { length: +m[1], width: +m[2], height: m[3] ? +m[3] : undefined }
}

export interface Size3 { x: number; y: number; z: number }
/** DXF→3D model axes (X width, Y depth, Z height): the longer horizontal axis is the vehicle direction. */
export type Axis = 'x' | 'y' | 'z'
/**
 * swap: the drawing's views were assigned with height and width exchanged (e.g. a side view taken as the plan);
 * 'auto' swaps when the 'width' would exceed a road vehicle's 2 600 mm while the height is smaller.
 */
export function orient(size: Size3, swap: boolean | 'auto' = false) {
  const lengthAxis: 'x' | 'y' = size.x >= size.y ? 'x' : 'y'
  let widthAxis: Axis = lengthAxis === 'x' ? 'y' : 'x', heightAxis: Axis = 'z'
  const doSwap = swap === 'auto' ? size[widthAxis] > 2600 && size[widthAxis] > size.z : swap
  if (doSwap) [widthAxis, heightAxis] = [heightAxis, widthAxis]
  return { lengthAxis, widthAxis, heightAxis, swapped: doSwap, length: size[lengthAxis], width: size[widthAxis], height: size[heightAxis] }
}

export interface Datums {
  frontX: number
  frameRear: number
  frameTop: number
  /** Hooklift rail top above the frame top and the rear roller x, when a hooklift is on the vehicle. */
  hook?: { install: number; xRear: number } | null
}
export interface Placement { x0: number; y0: number; note: string }
/** Front-end x and underside y of a layer of `length` (after scaling) for its role. */
export function autoPlace(role: LayerRole, length: number, d: Datums): Placement {
  switch (role) {
    case 'assembly':
    case 'chassis':
      return { x0: d.frontX, y0: 0, note: 'čelo na přední hraně vozidla, spodek na vozovce' }
    case 'body':
      return { x0: d.frameRear - length, y0: d.frameTop, note: 'spodek na horní hraně rámu, záď na konci rámu' }
    case 'container':
      return d.hook
        ? { x0: d.hook.xRear - length, y0: d.frameTop + d.hook.install, note: 'na kolejnicích nosiče, záď na zadní kladce' }
        : { x0: d.frameRear - length, y0: d.frameTop + 250, note: 'bez nosiče kontejnerů: 250 mm nad rámem, záď na konci rámu' }
  }
}

/**
 * Scale that brings the drawing to real size: the drawing's own size if it looks real, else the length from the
 * file name (sheet drawings exported 1:1 in paper millimetres), else 1.
 */
export function autoScale(length: number, name: string, width?: number, height?: number): { k: number; kw: number; kh: number; note: string } {
  const s = sizeFromName(name)
  let k = 1, note = 'měřítko z výkresu'
  if (s && Math.abs(length / s.length - 1) > 0.15) { k = s.length / length; note = `měřítko z názvu (délka ${s.length} mm)` }
  // the name states all three sizes and the drawing's proportions disagree (views mis-read): fit width / height too
  let kw = 1, kh = 1
  if (s?.width && s.height && width && height) {
    const fw = s.width / (width * k), fh = s.height / (height * k)
    if (Math.abs(fw - 1) > 0.15 || Math.abs(fh - 1) > 0.15) { kw = fw; kh = fh; note += `; šířka a výška dorovnány na ${s.width} × ${s.height} mm z názvu – pohledy výkresu nesedí` }
  }
  return { k, kw, kh, note }
}

export interface LayerOffset { x: number; y: number; z: number }
export interface DxfLayer {
  id: number
  file: string
  role: LayerRole
  visible: boolean
  /** Hides the trw part this layer stands for (body / container). */
  replace: boolean
  flip: boolean
  /** Height and width exchanged (see orient). */
  swap: boolean
  scale: number
  /** Extra width / height factors when the name's sizes override mis-read views. */
  kw: number
  kh: number
  offset: LayerOffset
  status: 'loading' | 'ok' | 'error'
  message: string
  size?: Size3
}

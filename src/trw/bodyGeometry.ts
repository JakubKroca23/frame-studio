/**
 * Parametric nástavby (valník, sklápěč) — rozměry z trw, bez plain boxu pro tyto typy.
 * Souřadnice: X vzadu od 1. nápravy, Y nahoru, Z do strany (jako ve scéně).
 */
import { BODY_TYPE_LABEL, type BodyType } from './trwExtended'

export type BodyBox = { pos: [number, number, number]; size: [number, number, number] }

export interface BodyDrawInput {
  type: BodyType
  xFrom: number
  xTo: number
  width: number
  height: number
  sideHeight: number | null
  frameTop: number
}

const subframeH = 120
const floorT = 80
const railH = 200
const railW = 120

/** Axis-aligned bounds of all boxes (for tests). */
export function boundsOf(boxes: BodyBox[]): { min: [number, number, number]; max: [number, number, number] } | null {
  if (!boxes.length) return null
  let min: [number, number, number] = [Infinity, Infinity, Infinity]
  let max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const b of boxes) {
    const [cx, cy, cz] = b.pos
    const [lx, ly, lz] = b.size
    const x0 = cx - lx / 2
    const x1 = cx + lx / 2
    const y0 = cy - ly / 2
    const y1 = cy + ly / 2
    const z0 = cz - lz / 2
    const z1 = cz + lz / 2
    min = [Math.min(min[0], x0), Math.min(min[1], y0), Math.min(min[2], z0)]
    max = [Math.max(max[0], x1), Math.max(max[1], y1), Math.max(max[2], z1)]
  }
  return { min, max }
}

export function parametricBodyBoxes(input: BodyDrawInput): BodyBox[] {
  const L = input.xTo - input.xFrom
  const cx = (input.xFrom + input.xTo) / 2
  const W = input.width
  const H = input.height
  const y0 = input.frameTop + subframeH
  const parts: BodyBox[] = []

  if (input.type === 'flatbed') {
    const sh = input.sideHeight ?? 400
    const boardT = 40
    parts.push({ pos: [cx, y0 + floorT / 2, 0], size: [L, floorT, W] })
    for (const s of [-1, 1]) {
      parts.push({ pos: [cx, y0 + floorT + sh / 2, (s * (W - boardT)) / 2], size: [L, sh, boardT] })
    }
    parts.push({ pos: [input.xFrom + boardT / 2, y0 + floorT + sh / 2, 0], size: [boardT, sh, W] })
    parts.push({ pos: [input.xTo - boardT / 2, y0 + floorT + sh / 2, 0], size: [boardT, sh, W] })
    const railY = y0 + floorT / 2 + railH / 2
    for (const s of [-1, 1]) parts.push({ pos: [cx, railY, (s * (W - railW)) / 2], size: [L, railH, railW] })
  } else if (input.type === 'tipper') {
    const floorTt = 60
    const wallT = 60
    parts.push({ pos: [cx, y0 + floorTt / 2, 0], size: [L, floorTt, W] })
    const taper = Math.min(L * 0.35, 1800)
    const rearSeg = Math.max(400, L - taper)
    const frontWallH = H * 1.12
    for (const s of [-1, 1]) {
      parts.push({ pos: [input.xFrom + taper / 2 + rearSeg / 2, y0 + floorTt + H / 2, (s * (W - wallT)) / 2], size: [rearSeg, H, wallT] })
      parts.push({ pos: [input.xFrom + taper * 0.35, y0 + floorTt + H * 0.55, (s * (W - wallT)) / 2], size: [taper * 0.45, H * 0.75, wallT] })
      parts.push({ pos: [input.xFrom + taper * 0.08, y0 + floorTt + H * 0.35, (s * (W - wallT)) / 2], size: [taper * 0.2, H * 0.45, wallT] })
    }
    parts.push({ pos: [input.xFrom + wallT / 2, y0 + floorTt + frontWallH / 2, 0], size: [wallT, frontWallH, W] })
    parts.push({ pos: [input.xTo - wallT / 2, y0 + floorTt + H / 2, 0], size: [wallT, H, W] })
    for (const s of [-1, 1]) parts.push({ pos: [cx, y0 + floorTt / 2 + railH / 2, (s * (W - railW)) / 2], size: [L, railH, railW] })
  } else if (input.type === 'hooklift') {
    const fw = Math.min(W, 1100)
    for (const s of [-1, 1]) parts.push({ pos: [cx, y0 + 100, (s * fw) / 2], size: [L, 200, railW] })
    const armH = Math.max(H, 1400)
    parts.push({ pos: [input.xFrom + 250, y0 + 200 + armH / 2, 0], size: [250, armH, 300] })
    parts.push({ pos: [input.xFrom - 250, y0 + 200 + armH, 0], size: [600, 200, 250] })
    parts.push({ pos: [input.xFrom - 50, y0 + 200 + armH - 200, 0], size: [80, 300, 80] })
  } else {
    parts.push({ pos: [cx, y0 + H / 2, 0], size: [L, H, W] })
  }
  return parts
}

export function bodyLabel(type: BodyType, typeRaw: string | null): string {
  const base = BODY_TYPE_LABEL[type]
  if (type === 'other' && typeRaw) return `${base} (${typeRaw})`
  return base
}

/**
 * Synthetic three-view DXF drawings (first and third angle, any paper scale) for tests and the
 * built-in sample. Parts are described in model mm: front (X,Z), top (X,Y; front face at the
 * bottom) and side as a right-hand view (Y,Z; front face on the left).
 */
import type { Projection } from './types'

type Ring = [number, number][]
interface ViewDef {
  outline: Ring
  /** Extra visible / hidden lines: [x1, y1, x2, y2]. */
  lines?: [number, number, number, number][]
  hidden?: [number, number, number, number][]
  circles?: [number, number, number][]
}
export interface PartDef {
  name: string
  size: { x: number; y: number; z: number }
  front: ViewDef
  top: ViewDef
  side: ViewDef
  /** Expected volume (mm³), for tests. */
  volume: number
}

const rect = (w: number, h: number): Ring => [
  [0, 0],
  [w, 0],
  [w, h],
  [0, h],
]

export const BOX_WITH_HOLES: PartDef = {
  name: 'kvádr s otvory',
  size: { x: 120, y: 80, z: 60 },
  front: {
    outline: rect(120, 60),
    circles: [[60, 30, 8]],
    hidden: [
      [20, 0, 20, 60],
      [40, 0, 40, 60],
      [80, 0, 80, 60],
      [100, 0, 100, 60],
    ],
  },
  top: {
    outline: rect(120, 80),
    circles: [
      [30, 40, 10],
      [90, 40, 10],
    ],
    hidden: [
      [52, 0, 52, 80],
      [68, 0, 68, 80],
    ],
  },
  side: {
    outline: rect(80, 60),
    hidden: [
      [30, 0, 30, 60],
      [50, 0, 50, 60],
      [0, 22, 80, 22],
      [0, 38, 80, 38],
    ],
  },
  volume: 120 * 80 * 60 - 2 * Math.PI * 100 * 60 - Math.PI * 64 * 80,
}

export const L_BRACKET: PartDef = {
  name: 'úhelník L',
  size: { x: 100, y: 50, z: 80 },
  front: {
    outline: [
      [0, 0],
      [100, 0],
      [100, 10],
      [10, 10],
      [10, 80],
      [0, 80],
    ],
    hidden: [
      [54, 0, 54, 10],
      [66, 0, 66, 10],
      [0, 45, 10, 45],
      [0, 55, 10, 55],
    ],
  },
  top: {
    outline: rect(100, 50),
    lines: [[10, 0, 10, 50]],
    circles: [[60, 25, 6]],
    hidden: [],
  },
  side: {
    outline: rect(50, 80),
    lines: [[0, 10, 50, 10]],
    circles: [[25, 50, 5]],
    hidden: [
      [19, 0, 19, 10],
      [31, 0, 31, 10],
    ],
  },
  volume: (100 * 10 + 10 * 70) * 50 - Math.PI * 36 * 10 - Math.PI * 25 * 10,
}

const plateHoles: [number, number, number][] = [
  [20, 20, 7],
  [180, 20, 7],
  [20, 130, 7],
  [180, 130, 7],
  [100, 75, 20],
]
export const PLATE_WITH_HOLES: PartDef = {
  name: 'deska s otvory',
  size: { x: 200, y: 8, z: 150 },
  front: { outline: rect(200, 150), circles: plateHoles },
  top: {
    outline: rect(200, 8),
    hidden: [13, 27, 173, 187, 80, 120].map((x) => [x, 0, x, 8] as [number, number, number, number]),
  },
  side: {
    outline: rect(8, 150),
    hidden: [13, 27, 123, 137, 55, 95].map((z) => [0, z, 8, z] as [number, number, number, number]),
  },
  volume: 200 * 150 * 8 - 4 * Math.PI * 49 * 8 - Math.PI * 400 * 8,
}

export const FIXTURES = [BOX_WITH_HOLES, L_BRACKET, PLATE_WITH_HOLES]

/**
 * Lay the three views out on a sheet and write an ASCII DXF.
 * paperScale N means geometry drawn at 1:N (coordinates divided by N, dims keep real values).
 * With `frame` a sheet border, title block and a text table are added as distractors.
 */
export function fixtureDxf(part: PartDef, projection: Projection, paperScale = 1, frame = false): string {
  const { x: W, y: D, z: H } = part.size
  const gap = Math.max(W, D, H) * 0.6
  const k = 1 / paperScale
  const out: string[] = []
  const pair = (code: number, value: string | number) => out.push(String(code), String(value))
  const line = (layer: string, x1: number, y1: number, x2: number, y2: number) => {
    pair(0, 'LINE')
    pair(8, layer)
    pair(10, x1 * k)
    pair(20, y1 * k)
    pair(11, x2 * k)
    pair(21, y2 * k)
  }
  const circle = (x: number, y: number, r: number) => {
    pair(0, 'CIRCLE')
    pair(8, 'OBRYS')
    pair(10, x * k)
    pair(20, y * k)
    pair(40, r * k)
  }
  const dim = (x1: number, y1: number, x2: number, y2: number, vertical: boolean, value: number, ox: number, oy: number) => {
    pair(0, 'DIMENSION')
    pair(8, 'KOTY')
    pair(2, '*D')
    pair(10, ox * k)
    pair(20, oy * k)
    pair(11, ox * k)
    pair(21, oy * k)
    pair(70, 32)
    pair(42, value)
    pair(1, '<>')
    pair(13, x1 * k)
    pair(23, y1 * k)
    pair(14, x2 * k)
    pair(24, y2 * k)
    if (vertical) pair(50, 90)
  }
  const place = (view: ViewDef, ox: number, oy: number, mirrorW: number | null) => {
    const mx = (x: number) => (mirrorW !== null ? mirrorW - x : x) + ox
    const my = (y: number) => y + oy
    const ring = view.outline
    for (let i = 0; i < ring.length; i++) {
      const [ax, ay] = ring[i]
      const [bx, by] = ring[(i + 1) % ring.length]
      line('OBRYS', mx(ax), my(ay), mx(bx), my(by))
    }
    for (const [a, b, c, d] of view.lines ?? []) line('OBRYS', mx(a), my(b), mx(c), my(d))
    for (const [a, b, c, d] of view.hidden ?? []) line('SKRYTE', mx(a), my(b), mx(c), my(d))
    for (const [cx, cy, r] of view.circles ?? []) circle(mx(cx), my(cy), r)
    let w = 0
    let h = 0
    for (const [x, y] of ring) {
      w = Math.max(w, x)
      h = Math.max(h, y)
    }
    dim(ox, oy, ox + w, oy, false, w, ox + w / 2, oy - gap * 0.2)
    dim(ox, oy, ox, oy + h, true, h, ox - gap * 0.2, oy + h / 2)
  }

  pair(0, 'SECTION')
  pair(2, 'HEADER')
  pair(9, '$ACADVER')
  pair(1, 'AC1015')
  pair(9, '$INSUNITS')
  pair(70, 4)
  pair(0, 'ENDSEC')
  pair(0, 'SECTION')
  pair(2, 'ENTITIES')
  place(part.front, 0, 0, null)
  if (projection === 'third') {
    place(part.top, 0, H + gap, null)
    place(part.side, W + gap, 0, null)
  } else {
    place(part.top, 0, -gap - D, null)
    // First angle: the left-hand view sits on the right, depth runs right-to-left.
    place(part.side, W + gap, 0, D)
  }
  if (frame) {
    const x0 = -gap * 1.5
    const y0 = -gap * 1.5 - D - gap
    const x1 = W + gap + D + gap * 3
    const y1 = H + gap + D + gap * 1.5
    const fr = (a: number, b: number, c: number, d: number) => line('RAMECEK', a, b, c, d)
    fr(x0, y0, x1, y0)
    fr(x1, y0, x1, y1)
    fr(x1, y1, x0, y1)
    fr(x0, y1, x0, y0)
    // Title block in the bottom-right corner, joined to the border.
    const tw = (x1 - x0) * 0.35
    const th = (y1 - y0) * 0.12
    line('TABULKA', x1 - tw, y0, x1 - tw, y0 + th)
    line('TABULKA', x1 - tw, y0 + th, x1, y0 + th)
    line('TABULKA', x1 - tw, y0 + th / 2, x1, y0 + th / 2)
    pair(0, 'TEXT')
    pair(8, 'TEXTY')
    pair(10, (x1 - tw * 0.9) * k)
    pair(20, (y0 + th * 0.2) * k)
    pair(40, 3)
    pair(1, `MĚŘÍTKO 1:${paperScale}`)
  }
  pair(0, 'ENDSEC')
  pair(0, 'EOF')
  return out.join('\n') + '\n'
}

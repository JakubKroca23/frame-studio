import type { Seg } from '../dxf/types'
import type { BBox } from '../lib/geom'
import type { CabModel, FrameModel, PartModel, Slice } from '../model/types'

export interface RaisedBodies {
  cab: CabModel | null
  crane: PartModel | null
}

/**
 * Drawings that put the cab, the crane and the frame on one layer.
 * The cab is the upper mass in front of the tallest column.
 * The column is the loader crane. Its station and height come from that line.
 */
export function extractRaisedBodies(side: Seg[], top: Seg[], frame: FrameModel): RaisedBodies {
  const anchor = tallestColumn(side, frame.topZ)
  const craneSide = anchor ? craneBox(side, frame, anchor) : null
  const cab = cabInFront(side, top, frame, craneSide ? craneSide.x0 : null)
  if (!craneSide) return { cab, crane: null }
  const plan = planBox(top, craneSide, frame, 'crane')
  const crane: PartModel = {
    id: 'hiab-0',
    partNumber: 'HIAB',
    side: craneSide,
    top: plan.box,
    samples: boxSlices(craneSide, plan.box),
    kind: 'crane',
    confidence: plan.measured ? 0.66 : 0.54,
    source: 'estimated',
    evidence: plan.measured
      ? 'Sloup za kabinou je z bokorysu, poloha a výška jsou naměřené. Šířka je z půdorysu v tom úseku. Nápis HIAB ve výkrese není, typ je odhad.'
      : 'Sloup za kabinou je z bokorysu, poloha a výška jsou naměřené. Půdorys ruku od rámu neodděluje, šířka sleduje rám. Když je sloup jen čára, délka základny je zjednodušená. Nápis HIAB ve výkrese není.',
  }
  return { cab, crane }
}

function tallestColumn(side: Seg[], topZ: number): { x: number; y0: number; y1: number } | null {
  let best: { x: number; y0: number; y1: number } | null = null
  for (const seg of side) {
    const dx = Math.abs(seg.x2 - seg.x1)
    const dy = Math.abs(seg.y2 - seg.y1)
    if (dx > 40 || dy < 1400) continue
    const y1 = Math.max(seg.y1, seg.y2)
    const y0 = Math.min(seg.y1, seg.y2)
    if (y1 < topZ + 1400) continue
    if (!best || y1 > best.y1) best = { x: (seg.x1 + seg.x2) / 2, y0, y1 }
  }
  return best
}

function craneBox(side: Seg[], frame: FrameModel, anchor: { x: number; y0: number; y1: number }): BBox {
  let roof = frame.topZ
  for (const seg of side) {
    if (segLen(seg) < 30) continue
    const mx = (seg.x1 + seg.x2) / 2
    if (mx > anchor.x - 400) continue
    const y1 = Math.max(seg.y1, seg.y2)
    if (y1 > roof && y1 > frame.topZ + 400) roof = y1
  }
  const high = roof + 200
  let x0 = anchor.x
  let x1 = anchor.x
  let y0 = anchor.y0
  let y1 = anchor.y1
  for (const seg of side) {
    if (segLen(seg) < 40) continue
    const mx = (seg.x1 + seg.x2) / 2
    const my = (seg.y1 + seg.y2) / 2
    const top = Math.max(seg.y1, seg.y2)
    const sx0 = Math.min(seg.x1, seg.x2)
    const sx1 = Math.max(seg.x1, seg.x2)
    const near = Math.abs(mx - anchor.x) < 380 && top > frame.topZ + 250
    const taller = top > high && Math.abs(mx - anchor.x) < 1600
    const boom = my > frame.topZ + 900 && top > high - 80 && sx0 < anchor.x + 400 && sx1 > anchor.x - 80 && mx < anchor.x + 4500
    if (!near && !taller && !boom) continue
    x0 = Math.min(x0, sx0)
    x1 = Math.max(x1, sx1)
    y0 = Math.min(y0, seg.y1, seg.y2)
    y1 = Math.max(y1, seg.y1, seg.y2)
  }
  if (x1 - x0 < 180) {
    x0 = anchor.x - 220
    x1 = anchor.x + 430
  }
  if (y1 - y0 < 800) y0 = Math.min(y0, frame.topZ)
  return { x0, y0, x1, y1 }
}

function cabInFront(side: Seg[], top: Seg[], frame: FrameModel, craneX0: number | null): CabModel | null {
  const rear = frameRear(frame)
  const front = frameFront(frame)
  const limit = craneX0 ?? front + (rear - front) * 0.32
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  let n = 0
  for (const seg of side) {
    if (segLen(seg) < 25) continue
    const mx = (seg.x1 + seg.x2) / 2
    if (mx > limit - 40) continue
    const topY = Math.max(seg.y1, seg.y2)
    if (topY < frame.topZ + 180) continue
    x0 = Math.min(x0, seg.x1, seg.x2)
    x1 = Math.max(x1, seg.x1, seg.x2)
    y0 = Math.min(y0, seg.y1, seg.y2)
    y1 = Math.max(y1, seg.y1, seg.y2)
    n++
  }
  if (n < 3 || !(x1 - x0 > 500) || !(y1 - y0 > 500)) return null
  if (y0 < frame.topZ) y0 = frame.topZ
  const sideBox: BBox = { x0, y0, x1, y1 }
  const plan = planBox(top, sideBox, frame, 'cab')
  return {
    side: sideBox,
    top: plan.box,
    samples: boxSlices(sideBox, plan.box),
    confidence: plan.measured ? 0.7 : 0.48,
    source: plan.measured ? 'measured' : 'estimated',
    evidence: plan.measured
      ? 'Kabina je přední horní obrys v bokorysu. Výkres nemá vrstvu kabiny. Šířka je z krajů půdorysu mimo podélníky. Spodek je usazený na rám.'
      : 'Kabina je přední horní obrys v bokorysu. Půdorys kabinu od rámu neodděluje, šířka 2500 mm je odhad. Spodek je usazený na rám.',
  }
}

function planBox(top: Seg[], side: BBox, frame: FrameModel, role: 'cab' | 'crane'): { box: BBox; measured: boolean } {
  const ys: number[] = []
  const half = frame.outerWidthStraight / 2
  for (const seg of top) {
    if (segLen(seg) < 20) continue
    const sx0 = Math.min(seg.x1, seg.x2)
    const sx1 = Math.max(seg.x1, seg.x2)
    if (sx1 < side.x0 - 60 || sx0 > side.x1 + 60) continue
    for (const y of [seg.y1, seg.y2]) {
      const out = Math.abs(y - frame.centerY)
      if (role === 'cab') {
        if (out > half + 100 && out < 1800) ys.push(y)
      } else if (out < half + 80) ys.push(y)
    }
  }
  ys.sort((a, b) => a - b)
  if (ys.length >= 4) {
    const y0 = ys[Math.floor(ys.length * 0.08)]
    const y1 = ys[Math.min(ys.length - 1, Math.ceil(ys.length * 0.92) - 1)]
    const width = y1 - y0
    const ok = role === 'cab' ? width > 1400 && width < 3200 : width > 280 && width < frame.outerWidthStraight * 1.35
    if (ok) return { box: { x0: side.x0, y0, x1: side.x1, y1 }, measured: true }
  }
  if (role === 'cab') {
    return { box: { x0: side.x0, y0: frame.centerY - 1250, x1: side.x1, y1: frame.centerY + 1250 }, measured: false }
  }
  return {
    box: { x0: side.x0, y0: frame.centerY - half, x1: side.x1, y1: frame.centerY + half },
    measured: false,
  }
}

function boxSlices(side: BBox, top: BBox): Slice[] {
  return [
    { x: side.x0, z0: side.y0, z1: side.y1, y0: top.y0, y1: top.y1 },
    { x: side.x1, z0: side.y0, z1: side.y1, y0: top.y0, y1: top.y1 },
  ]
}

function frameFront(frame: FrameModel) {
  return Math.min(frame.left[0].x, frame.right[0].x)
}

function frameRear(frame: FrameModel) {
  return Math.max(frame.left[frame.left.length - 1].x, frame.right[frame.right.length - 1].x)
}

function segLen(seg: Seg) {
  return Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1)
}

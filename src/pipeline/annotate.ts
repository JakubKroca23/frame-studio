import type { Txt } from '../dxf/types'
import { boxWidth, type BBox } from '../lib/geom'
import type { Axle, CabModel, FrameModel, PartModel } from '../model/types'
import { BLOCK_PREFIX, classifyKind, kindFromText, type KindInput } from './kinds'

/**
 * Writes kind, confidence and evidence onto parts.
 * Length, height and width stay the boxes measured from the two views.
 * The type is measured from a block name or a nearby label, otherwise estimated from the shape.
 */
export function annotateParts(
  parts: PartModel[],
  texts: Txt[],
  frame: FrameModel | null,
  axles: Axle[],
  cab: CabModel | null,
): void {
  if (!frame) return
  const originX = axles[0]?.x ?? frame.left[0]?.x ?? 0
  const ground = axles.length ? Math.min(...axles.map((axle) => axle.z - axle.tireDiameter / 2)) : frame.bottomZ - 700
  for (const part of parts) {
    const side = part.side
    const top = part.top
    if (!side || !top) continue
    const x0 = Math.max(side.x0, top.x0)
    const x1 = Math.min(side.x1, top.x1)
    const len = x1 - x0
    const height = side.y1 - side.y0
    const width = Math.abs(top.y1 - top.y0)
    const input: KindInput = {
      partNumber: part.partNumber,
      len,
      height,
      width,
      x: (x0 + x1) / 2 - originX,
      y: (top.y0 + top.y1) / 2 - frame.centerY,
      z: (side.y0 + side.y1) / 2 - ground,
      outer: frame.outerWidthStraight,
      originX,
      ground,
      axles,
      cab,
    }
    const decision = classifyKind(input)
    const prefix = BLOCK_PREFIX[part.partNumber.split('_')[0]]
    const nearby = prefix || decision.kind === 'skip' ? null : labelNear(texts, side, top)
    if (nearby) {
      part.kind = nearby.kind
      part.confidence = nearby.kind === decision.kind ? 0.9 : 0.84
      part.source = 'measured'
      part.evidence = `Text „${nearby.snippet}“. Rozměry jsou z obrysu ve výkresu.`
    } else {
      part.kind = decision.kind
      part.confidence = decision.confidence
      part.source = decision.source
      part.evidence = decision.evidence
    }
    const span = Math.max(boxWidth(side), boxWidth(top))
    if (span > 1 && Math.abs(boxWidth(side) - boxWidth(top)) / span > 0.18) {
      part.confidence = Math.min(part.confidence ?? 0.5, 0.62)
      part.evidence = `${part.evidence ?? ''} Bokorys a půdorys se v délce liší.`.trim()
    }
    if (part.contour) {
      part.confidence = Math.min(0.97, (part.confidence ?? 0.5) + 0.05)
      part.evidence = `${part.evidence ?? ''} Uzavřená kontura.`.trim()
    }
    if (!part.evidence?.includes('Rozměry') && part.kind !== 'skip') {
      part.evidence = `${part.evidence ?? ''} Délka, výška a šířka jsou z bokorysu a půdorysu.`.trim()
    }
  }
}

function labelNear(texts: Txt[], side: BBox, top: BBox): { kind: string; snippet: string } | null {
  for (const text of texts) {
    const hit = kindFromText(text.text)
    if (!hit) continue
    if (inside(text.x, text.y, side, 160) || inside(text.x, text.y, top, 160)) return hit
  }
  return null
}

function inside(x: number, y: number, box: BBox, pad: number) {
  return x >= box.x0 - pad && x <= box.x1 + pad && y >= box.y0 - pad && y <= box.y1 + pad
}

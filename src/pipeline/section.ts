import type { DxfDb } from '../dxf/types'
import type { FrameSection } from '../model/types'

export type { FrameSection }

/** Closed C-profile polyline on the frame layer, used by Volvo's rear PTO detail. */
export function extractSection(db: DxfDb, layer: string): FrameSection | null {
  let best: FrameSection | null = null
  for (const entity of db.entities) {
    if (entity.type !== 'POLYLINE' || entity.layer !== layer || !entity.closed) continue
    const verts = entity.verts ?? []
    if (verts.length < 8) continue
    const section = measure(verts)
    if (section && (!best || section.outerRadius > best.outerRadius)) best = section
  }
  return best
}

function measure(verts: { x: number; y: number; bulge: number }[]): FrameSection | null {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const v of verts) {
    if (v.x < minX) minX = v.x
    if (v.x > maxX) maxX = v.x
    if (v.y < minY) minY = v.y
    if (v.y > maxY) maxY = v.y
  }
  const spanX = maxX - minX
  const spanY = maxY - minY
  const height = Math.max(spanX, spanY)
  const flangeWidth = Math.min(spanX, spanY)
  if (height < 200 || height > 450 || flangeWidth < 50 || flangeWidth > 160) return null

  const radii: number[] = []
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i]
    const b = verts[(i + 1) % verts.length]
    if (Math.abs(a.bulge) < 0.2) continue
    radii.push(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)))
  }
  if (radii.length < 2) return null
  const outerRadius = Math.round(Math.max(...radii))
  const innerRadius = Math.round(Math.min(...radii))
  const gaps = [...axisGaps(verts.map((v) => v.x)), ...axisGaps(verts.map((v) => v.y))].filter((gap) => {
    if (gap < 4 || gap > 20) return false
    if (Math.abs(gap - outerRadius) < 1.2 || Math.abs(gap - innerRadius) < 1.2) return false
    return true
  })
  const thickness = gaps.length ? mode(gaps.map((gap) => Math.round(gap))) : 8
  return {
    height: Math.round(height),
    flangeWidth: Math.round(flangeWidth),
    webThickness: thickness,
    flangeThickness: thickness,
    outerRadius,
    innerRadius,
  }
}

function axisGaps(values: number[]): number[] {
  const unique = [...new Set(values.map((v) => Math.round(v * 10) / 10))].sort((a, b) => a - b)
  const gaps: number[] = []
  for (let i = 1; i < unique.length; i++) gaps.push(unique[i] - unique[i - 1])
  return gaps
}

function mode(values: number[]): number {
  const counts = new Map<number, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best = values[0]
  let n = 0
  for (const [value, count] of counts) {
    if (count > n) {
      best = value
      n = count
    }
  }
  return best
}

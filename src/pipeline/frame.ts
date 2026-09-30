import type { Seg } from '../dxf/types'
import { dedupePts, segLen, simplifyColinear, type Pt } from '../lib/geom'
import type { FrameModel } from '../model/types'

interface Cluster {
  y: number
  len: number
  x0: number
  x1: number
}

export function extractFrame(
  topSegs: Seg[],
  sideSegs: Seg[],
  hints: { outerWidth?: number; flange?: number; height?: number; preferLongest?: boolean },
): FrameModel | null {
  const sideClusters = horizontalClusters(sideSegs, 400, 3)
  const sidePair = pickPair(sideClusters, 180, 450, hints.height, hints.preferLongest)
  if (!sidePair) return null
  const topZ = Math.max(sidePair.a.y, sidePair.b.y)
  const bottomZ = Math.min(sidePair.a.y, sidePair.b.y)

  const topClusters = horizontalClusters(topSegs, 800, 3)
  const railPair = pickPair(topClusters, 550, 1300, hints.outerWidth, hints.preferLongest)
  if (!railPair) return null
  const leftY = Math.min(railPair.a.y, railPair.b.y)
  const rightY = Math.max(railPair.a.y, railPair.b.y)
  const leftCluster = railPair.a.y < railPair.b.y ? railPair.a : railPair.b
  const rightCluster = railPair.a.y < railPair.b.y ? railPair.b : railPair.a
  const centerY = (leftY + rightY) / 2
  const outerWidthStraight = rightY - leftY

  const flange = estimateFlange(topClusters, leftY, rightY, hints.flange) ?? hints.flange ?? 90

  const left = traceOuter(topSegs, leftCluster, centerY)
  const right = traceOuter(topSegs, rightCluster, centerY)
  if (left.length < 2 || right.length < 2) return null

  const frontOuterWidth = Math.abs(left[0].y - right[0].y)
  const liner = estimateLiner(topSegs, left, right, centerY)

  return {
    left,
    right,
    topZ,
    bottomZ,
    centerY,
    flangeWidth: flange,
    outerWidthStraight,
    frontOuterWidth,
    liner,
    section: null,
  }
}

function horizontalClusters(segs: Seg[], minLen: number, tol: number): Cluster[] {
  const raw: Cluster[] = []
  for (const s of segs) {
    const len = segLen(s.x1, s.y1, s.x2, s.y2)
    if (len < minLen) continue
    if (Math.abs(s.y2 - s.y1) > Math.max(4, len * 0.012)) continue
    raw.push({
      y: (s.y1 + s.y2) / 2,
      len,
      x0: Math.min(s.x1, s.x2),
      x1: Math.max(s.x1, s.x2),
    })
  }
  raw.sort((a, b) => a.y - b.y)
  const merged: Cluster[] = []
  for (const item of raw) {
    const last = merged[merged.length - 1]
    if (last && Math.abs(item.y - last.y) <= tol) {
      const w = last.len + item.len
      last.y = (last.y * last.len + item.y * item.len) / w
      last.len = w
      last.x0 = Math.min(last.x0, item.x0)
      last.x1 = Math.max(last.x1, item.x1)
    } else merged.push({ ...item })
  }
  return merged
}

function pickPair(
  clusters: Cluster[],
  minSep: number,
  maxSep: number,
  hint?: number,
  preferLongest?: boolean,
): { a: Cluster; b: Cluster; sep: number } | null {
  const pairs: { a: Cluster; b: Cluster; sep: number; len: number }[] = []
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const sep = Math.abs(clusters[j].y - clusters[i].y)
      if (sep < minSep || sep > maxSep) continue
      pairs.push({ a: clusters[i], b: clusters[j], sep, len: clusters[i].len + clusters[j].len })
    }
  }
  if (pairs.length === 0) return null
  const maxLen = Math.max(...pairs.map((p) => p.len))
  let strong = pairs.filter((p) => p.len >= maxLen * 0.6)
  if (hint && hint > 0) {
    const near = strong.filter((p) => Math.abs(p.sep - hint) <= Math.max(15, hint * 0.08))
    if (near.length) strong = near
    strong.sort((a, b) => Math.abs(a.sep - hint) - Math.abs(b.sep - hint) || b.len - a.len)
  } else if (preferLongest) {
    strong.sort((a, b) => b.len - a.len || b.sep - a.sep)
  } else {
    strong.sort((a, b) => b.sep - a.sep || b.len - a.len)
  }
  return strong[0]
}

function estimateFlange(clusters: Cluster[], leftY: number, rightY: number, hint?: number): number | null {
  const long = clusters.filter((c) => c.len > 1500)
  const inward: number[] = []
  for (const c of long) {
    const dl = c.y - leftY
    const dr = rightY - c.y
    if (dl > 40 && dl < 160) inward.push(dl)
    if (dr > 40 && dr < 160) inward.push(dr)
  }
  if (inward.length === 0) return hint ?? null
  if (hint && hint > 0) {
    inward.sort((a, b) => Math.abs(a - hint) - Math.abs(b - hint))
    return inward[0]
  }
  inward.sort((a, b) => a - b)
  return inward[Math.floor(inward.length / 2)]
}

function traceOuter(segs: Seg[], cluster: Cluster, centerY: number): Pt[] {
  const front: Pt[] = []
  let cx = cluster.x0
  let cy = cluster.y
  const used = new Set<Seg>()
  for (let step = 0; step < 12; step++) {
    let best: { seg: Seg; x: number; y: number; outer: number; d: number } | null = null
    for (const s of segs) {
      if (used.has(s)) continue
      const len = segLen(s.x1, s.y1, s.x2, s.y2)
      if (len < 70) continue
      const options: [number, number, number, number][] = [
        [s.x1, s.y1, s.x2, s.y2],
        [s.x2, s.y2, s.x1, s.y1],
      ]
      for (const [ax, ay, bx, by] of options) {
        const d = Math.hypot(ax - cx, ay - cy)
        if (d > 50) continue
        if (bx > cx - 15) continue
        const outer = Math.abs(by - centerY)
        if (
          !best ||
          outer > best.outer + 8 ||
          (Math.abs(outer - best.outer) <= 8 && d < best.d)
        ) {
          best = { seg: s, x: bx, y: by, outer, d }
        }
      }
    }
    if (!best) break
    used.add(best.seg)
    front.push({ x: best.x, y: best.y })
    cx = best.x
    cy = best.y
  }
  front.reverse()
  const path = dedupePts(
    simplifyColinear([...front, { x: cluster.x0, y: cluster.y }, { x: cluster.x1, y: cluster.y }], 2),
    3,
  )
  return path
}

function estimateLiner(segs: Seg[], left: Pt[], right: Pt[], centerY: number): { x0: number; x1: number } | null {
  let x0 = Infinity
  let x1 = -Infinity
  let total = 0
  for (const s of segs) {
    const len = segLen(s.x1, s.y1, s.x2, s.y2)
    if (len < 200) continue
    if (Math.abs(s.y2 - s.y1) > Math.max(6, len * 0.02)) continue
    const mx = (s.x1 + s.x2) / 2
    const my = (s.y1 + s.y2) / 2
    const onLeft = my < centerY
    const path = onLeft ? left : right
    const railY = yOnPath(path, mx)
    if (railY === null) continue
    const inward = onLeft ? my - railY : railY - my
    if (inward < 4 || inward > 28) continue
    total += len
    x0 = Math.min(x0, s.x1, s.x2)
    x1 = Math.max(x1, s.x1, s.x2)
  }
  if (total < 1500 || !(x1 - x0 > 800)) return null
  return { x0, x1 }
}

function yOnPath(path: Pt[], x: number): number | null {
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]
    const b = path[i + 1]
    const x0 = Math.min(a.x, b.x)
    const x1 = Math.max(a.x, b.x)
    if (x < x0 - 30 || x > x1 + 30) continue
    const dx = b.x - a.x
    const t = Math.abs(dx) < 1e-6 ? 0 : (x - a.x) / dx
    if (t < -0.05 || t > 1.05) continue
    const tc = Math.max(0, Math.min(1, t))
    return a.y + (b.y - a.y) * tc
  }
  return null
}

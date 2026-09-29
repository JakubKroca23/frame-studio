import type { BBox } from '../lib/geom'

/** Drawing millimetres on the review canvas. `scale` is CSS pixels per millimetre. */
export interface ReviewView {
  scale: number
  cx: number
  cy: number
}

export interface ZoomLimits {
  min: number
  max: number
}

export interface WheelSample {
  deltaX: number
  deltaY: number
  /** 0 pixel, 1 line, 2 page — same as WheelEvent.deltaMode. */
  deltaMode: number
  ctrlKey: boolean
}

/** Pixel-delta gain. A standard notch (about 100 px, or one line) is ~6.7%. */
const WHEEL_GAIN = 0.00065
const WHEEL_TAU_MS = 75

/** Fit scale can zoom out a little; zoom in until a 15 mm hole is about 210 px across. */
export function zoomLimits(fitScale: number): ZoomLimits {
  const fit = Math.max(fitScale, 1e-9)
  return { min: fit * 0.35, max: Math.max(fit, 14) }
}

export function fitView(bounds: BBox, width: number, height: number, pad = 28): ReviewView {
  const spanX = Math.max(1, bounds.x1 - bounds.x0)
  const spanY = Math.max(1, bounds.y1 - bounds.y0)
  const innerW = Math.max(1, width - pad * 2)
  const innerH = Math.max(1, height - pad * 2)
  return {
    scale: Math.min(innerW / spanX, innerH / spanY),
    cx: (bounds.x0 + bounds.x1) / 2,
    cy: (bounds.y0 + bounds.y1) / 2,
  }
}

export function worldToScreen(view: ReviewView, width: number, height: number, x: number, y: number): [number, number] {
  return [width / 2 + (x - view.cx) * view.scale, height / 2 - (y - view.cy) * view.scale]
}

export function screenToWorld(view: ReviewView, width: number, height: number, px: number, py: number): { x: number; y: number } {
  return {
    x: view.cx + (px - width / 2) / view.scale,
    y: view.cy - (py - height / 2) / view.scale,
  }
}

/** Zoom around a canvas pixel. The drawing point under that pixel stays put. */
export function zoomAt(
  view: ReviewView,
  width: number,
  height: number,
  px: number,
  py: number,
  factor: number,
  limits: ZoomLimits,
): ReviewView {
  if (!Number.isFinite(factor) || factor <= 0 || !Number.isFinite(view.scale) || view.scale <= 0) return view
  const clampedFactor = Math.min(4, Math.max(0.25, factor))
  const nextScale = Math.min(limits.max, Math.max(limits.min, view.scale * clampedFactor))
  if (nextScale === view.scale) return view
  const world = screenToWorld(view, width, height, px, py)
  return {
    scale: nextScale,
    cx: world.x - (px - width / 2) / nextScale,
    cy: world.y + (py - height / 2) / nextScale,
  }
}

/** Screen-pixel pan. Positive dx/dy moves the drawing with the pointer. */
export function panBy(view: ReviewView, dx: number, dy: number): ReviewView {
  if ((!dx && !dy) || !Number.isFinite(view.scale) || view.scale === 0) return view
  return { scale: view.scale, cx: view.cx - dx / view.scale, cy: view.cy + dy / view.scale }
}

/**
 * Zoom factor for one wheel event. High-resolution mice send small pixel deltas and stay proportional.
 * Line mode (Firefox) treats one line as a 100 px notch. A single event is clamped so a spike cannot jump.
 */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  const pixels = deltaMode === 1 ? deltaY * 100 : deltaMode === 2 ? deltaY * 400 : deltaY
  const factor = Math.exp(-pixels * WHEEL_GAIN)
  return Math.min(1.35, Math.max(1 / 1.35, factor))
}

/** Stack wheel events onto the scale the animation is heading toward, not the scale on screen. */
export function nextTargetScale(target: number, factor: number, limits: ZoomLimits): number {
  if (!Number.isFinite(factor) || factor <= 0 || !Number.isFinite(target) || target <= 0) return target
  return Math.min(limits.max, Math.max(limits.min, target * factor))
}

/** Log-space ease. One frame only covers part of the gap, then snaps when it is visually there. */
export function easeScale(current: number, target: number, dtMs: number, tauMs = WHEEL_TAU_MS): number {
  if (!(current > 0) || !(target > 0)) return target
  if (!(dtMs > 0) || current === target) return current
  const t = 1 - Math.exp(-Math.min(48, dtMs) / tauMs)
  const next = Math.exp(Math.log(current) + (Math.log(target) - Math.log(current)) * t)
  if (Math.abs(next - target) / target < 0.0015) return target
  return next
}

/** View whose `scale` keeps one world point on one canvas pixel. */
export function viewAbout(
  anchorX: number,
  anchorY: number,
  px: number,
  py: number,
  width: number,
  height: number,
  scale: number,
): ReviewView {
  return {
    scale,
    cx: anchorX - (px - width / 2) / scale,
    cy: anchorY + (py - height / 2) / scale,
  }
}

/**
 * Mouse wheel and Firefox line-mode wheels zoom.
 * Trackpad two-finger scroll is a pixel delta that is small or has a sideways component.
 * Pinch-zoom arrives as a wheel with ctrlKey held.
 */
export function wheelIntent(sample: WheelSample): 'zoom' | 'pan' {
  if (sample.ctrlKey || sample.deltaMode === 1 || sample.deltaMode === 2) return 'zoom'
  // A mouse wheel, including a high-resolution one, is vertical. A trackpad pan carries sideways travel.
  if (Math.abs(sample.deltaX) > 0.8 && Math.abs(sample.deltaX) > Math.abs(sample.deltaY) * 0.45) return 'pan'
  return 'zoom'
}

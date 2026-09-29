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

const WHEEL_GAIN = 0.002

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

/** One wheel notch (pixel delta about 100, or one line) is roughly 1.22×. */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  const pixels = deltaMode === 1 ? deltaY * 100 : deltaMode === 2 ? deltaY * 400 : deltaY
  const factor = Math.exp(-pixels * WHEEL_GAIN)
  return Math.min(4, Math.max(0.25, factor))
}

/**
 * Mouse wheel and Firefox line-mode wheels zoom.
 * Trackpad two-finger scroll is a pixel delta that is small or has a sideways component.
 * Pinch-zoom arrives as a wheel with ctrlKey held.
 */
export function wheelIntent(sample: WheelSample): 'zoom' | 'pan' {
  if (sample.ctrlKey || sample.deltaMode === 1 || sample.deltaMode === 2) return 'zoom'
  if (Math.abs(sample.deltaX) > 0.5 || Math.abs(sample.deltaY) < 40) return 'pan'
  return 'zoom'
}

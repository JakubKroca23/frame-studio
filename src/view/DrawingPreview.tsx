import { useEffect, useRef } from 'react'
import type { BBox } from '../lib/geom'
import type { ChassisModel } from '../model/types'

export function DrawingPreview({ model }: { model: ChassisModel | null }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const w = rect.width
      const h = rect.height
      ctx.fillStyle = '#f4f0e8'
      ctx.fillRect(0, 0, w, h)
      if (!model) {
        ctx.fillStyle = '#8a8175'
        ctx.font = '14px "Segoe UI", sans-serif'
        ctx.fillText('Po nahrání výkresu se tu objeví bokorys a půdorys.', 24, 36)
        return
      }
      const bounds = previewBounds(model)
      const spanX = Math.max(1, bounds.x1 - bounds.x0)
      const spanY = Math.max(1, bounds.y1 - bounds.y0)
      const pad = 28
      const s = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY)
      const ox = (w - spanX * s) / 2
      const oy = (h - spanY * s) / 2
      const map = (x: number, y: number) => [ox + (x - bounds.x0) * s, oy + (bounds.y1 - y) * s] as const

      const stroke = (role: string, color: string, width: number, alpha = 1) => {
        const arr = model.preview.segments[role]
        if (!arr) return
        ctx.beginPath()
        for (let i = 0; i < arr.length; i += 4) {
          const x1 = arr[i]
          const y1 = arr[i + 1]
          const x2 = arr[i + 2]
          const y2 = arr[i + 3]
          if (!inside(x1, y1, bounds) && !inside(x2, y2, bounds)) continue
          const [ax, ay] = map(x1, y1)
          const [bx, by] = map(x2, y2)
          ctx.moveTo(ax, ay)
          ctx.lineTo(bx, by)
        }
        ctx.globalAlpha = alpha
        ctx.strokeStyle = color
        ctx.lineWidth = width
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      stroke('chassis', '#8d97a1', 0.7, 0.55)
      stroke('front', '#6b5b95', 1, 0.85)
      stroke('cab', '#2f6f9f', 1, 0.8)
      stroke('component', '#8a5a2a', 1.1, 0.7)
      stroke('axle', '#b42318', 1.2, 0.9)
      stroke('frame', '#c24e28', 2.4, 1)

      const holes = model.preview.circles.holes ?? []
      ctx.fillStyle = '#0f6f86'
      for (let i = 0; i < holes.length; i += 3) {
        const [x, y] = map(holes[i], holes[i + 1])
        if (x < -10 || y < -10 || x > w + 10 || y > h + 10) continue
        ctx.beginPath()
        ctx.arc(x, y, Math.max(0.8, holes[i + 2] * s), 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.font = '12px "Segoe UI", sans-serif'
      ctx.fillStyle = '#5c564e'
      if (model.views.side) label(ctx, map, model.views.side.x0 + 40, model.views.side.y1 - 40, 'Bokorys')
      if (model.views.top) label(ctx, map, model.views.top.x0 + 40, model.views.top.y1 - 30, 'Půdorys')
      if (model.views.front) label(ctx, map, model.views.front.x0 + 40, model.views.front.y1 - 30, 'Čelní pohled')
      ctx.fillStyle = '#c24e28'
      ctx.fillText('Podélníky', 16, h - 16)
      ctx.fillStyle = '#0f6f86'
      ctx.fillText('Otvory', 110, h - 16)
      ctx.fillStyle = '#b42318'
      ctx.fillText('Nápravy', 170, h - 16)
      ctx.fillStyle = '#2f6f9f'
      ctx.fillText('Kabina', 250, h - 16)
      ctx.fillStyle = '#6b5b95'
      ctx.fillText('Čelo', 320, h - 16)
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [model])

  return (
    <section className="preview-pane">
      <header className="pane-title">
        <span>Kontrola detekce</span>
        <span className="muted">2D výkres, zvýrazněné podélníky, nápravy a kabina</span>
      </header>
      <canvas ref={ref} className="preview-canvas" />
    </section>
  )
}

function previewBounds(model: ChassisModel): BBox {
  if (model.frame) {
    const xs = [...model.frame.left, ...model.frame.right].map((p) => p.x)
    const x0 = Math.min(...xs, model.cab?.side.x0 ?? Infinity) - 600
    const front = model.views.front
    const x1 = Math.max(...xs, front?.x1 ?? 0) + 500
    const y0 = Math.min(model.frame.centerY - 1800, model.cab?.top.y0 ?? Infinity, front?.y0 ?? Infinity) - 200
    const y1 = Math.max(model.frame.topZ + 400, model.cab?.side.y1 ?? 0, front?.y1 ?? 0) + 250
    return { x0, y0, x1, y1 }
  }
  return model.extents
}

function inside(x: number, y: number, b: BBox): boolean {
  return x >= b.x0 - 200 && x <= b.x1 + 200 && y >= b.y0 - 200 && y <= b.y1 + 200
}

function label(
  ctx: CanvasRenderingContext2D,
  map: (x: number, y: number) => readonly [number, number],
  x: number,
  y: number,
  text: string,
) {
  const [px, py] = map(x, y)
  ctx.fillText(text, px, py)
}

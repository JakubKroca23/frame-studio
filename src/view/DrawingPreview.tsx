import { useEffect, useRef, useState } from 'react'
import type { BBox } from '../lib/geom'
import type { ChassisModel } from '../model/types'

type ViewKind = 'side' | 'front' | 'top'

export function DrawingPreview({ model }: { model: ChassisModel | null }) {
  const [open, setOpen] = useState(() => readOpen())
  const toggle = () =>
    setOpen((value) => {
      writeOpen(!value)
      return !value
    })
  return (
    <section className={open ? 'preview-pane' : 'preview-pane is-collapsed'}>
      <header className="pane-title">
        <span>Kontrola detekce</span>
        <button type="button" className="pane-toggle" onClick={toggle}>
          {open ? 'Skrýt' : 'Zobrazit výkres'}
        </button>
      </header>
      {open ? (
        <div className="preview-views">
          <PreviewView model={model} kind="side" title="Bokorys" />
          <PreviewView model={model} kind="front" title="Čelní pohled" />
          <PreviewView model={model} kind="top" title="Půdorys" />
        </div>
      ) : null}
    </section>
  )
}

function PreviewView({ model, kind, title }: { model: ChassisModel | null; kind: ViewKind; title: string }) {
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
      ctx.fillStyle = '#3c3832'
      ctx.font = '600 13px "Segoe UI", sans-serif'
      ctx.fillText(title, 10, 18)
      if (!model) {
        ctx.fillStyle = '#8a8175'
        ctx.font = '13px "Segoe UI", sans-serif'
        ctx.fillText('Po nahrání výkresu.', 10, 40)
        return
      }
      const bounds = model.views[kind]
      if (!bounds) {
        ctx.fillStyle = '#8a8175'
        ctx.font = '13px "Segoe UI", sans-serif'
        ctx.fillText('Tento pohled na výkresu není.', 10, 42)
        return
      }
      const pad = 22
      const spanX = Math.max(1, bounds.x1 - bounds.x0)
      const spanY = Math.max(1, bounds.y1 - bounds.y0)
      const s = Math.min((w - pad * 2) / spanX, (h - pad * 2 - 8) / spanY)
      const ox = (w - spanX * s) / 2
      const oy = (h - spanY * s) / 2 + 6
      const map = (x: number, y: number) => [ox + (x - bounds.x0) * s, oy + (bounds.y1 - y) * s] as const
      const stroke = (role: string, color: string, width: number) => {
        const arr = model.preview.segments[role]
        if (!arr) return
        ctx.beginPath()
        for (let i = 0; i < arr.length; i += 4) {
          const x1 = arr[i]
          const y1 = arr[i + 1]
          const x2 = arr[i + 2]
          const y2 = arr[i + 3]
          if (!near(x1, y1, bounds) && !near(x2, y2, bounds)) continue
          const [ax, ay] = map(x1, y1)
          const [bx, by] = map(x2, y2)
          ctx.moveTo(ax, ay)
          ctx.lineTo(bx, by)
        }
        ctx.strokeStyle = color
        ctx.lineWidth = width
        ctx.stroke()
      }
      stroke('chassis', '#8d97a1', 0.7)
      stroke('front', '#6b5b95', 1.1)
      stroke('cab', '#2f6f9f', 1.15)
      stroke('component', '#8a5a2a', 1)
      stroke('axle', '#b42318', 1.3)
      stroke('frame', '#c24e28', 2.2)
      const outline = model.cab?.silhouettes?.[kind]
      if (outline && outline.length > 2) {
        // The traced outer outline the 3D cab is built from.
        ctx.beginPath()
        outline.forEach((point, index) => {
          const [x, y] = map(point.x, point.y)
          if (index === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.closePath()
        ctx.setLineDash([5, 3])
        ctx.strokeStyle = '#d98a00'
        ctx.lineWidth = 1.6
        ctx.stroke()
        ctx.setLineDash([])
      }
      const holes = model.preview.circles.holes ?? []
      ctx.fillStyle = '#0f6f86'
      for (let i = 0; i < holes.length; i += 3) {
        if (!near(holes[i], holes[i + 1], bounds)) continue
        const [x, y] = map(holes[i], holes[i + 1])
        ctx.beginPath()
        ctx.arc(x, y, Math.max(1.1, holes[i + 2] * s), 0, Math.PI * 2)
        ctx.fill()
      }
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [model, kind, title])
  return (
    <figure className="preview-view">
      <canvas ref={ref} className="preview-canvas" />
    </figure>
  )
}

const OPEN_KEY = 'frame-studio.preview-open'

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) !== '0'
  } catch {
    return true
  }
}

function writeOpen(open: boolean) {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? '1' : '0')
  } catch {
    /* storage may be blocked */
  }
}

function near(x: number, y: number, bounds: BBox): boolean {
  const mx = Math.max(80, (bounds.x1 - bounds.x0) * 0.04)
  const my = Math.max(80, (bounds.y1 - bounds.y0) * 0.04)
  return x >= bounds.x0 - mx && x <= bounds.x1 + mx && y >= bounds.y0 - my && y <= bounds.y1 + my
}

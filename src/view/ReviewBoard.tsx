import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Button } from '../components/ui/button'
import type { BBox } from '../lib/geom'
import { EQUIP_LABELS, type EquipKind } from '../pipeline/kinds'
import type { ReviewElement } from '../pipeline/review'
import { useApp } from '../state'

const ROLE_CS: Record<ReviewElement['role'], string> = {
  frame: 'Rám',
  hole: 'Otvor',
  liner: 'Výztuha',
  crossmember: 'Příčka',
  axle: 'Náprava',
  mudguard: 'Blatník',
  cab: 'Kabina',
  equipment: 'Výbava',
}

export function ReviewBoard() {
  const model = useApp((s) => s.source)
  const review = useApp((s) => s.review)
  const confirmReview = useApp((s) => s.confirmReview)
  const setReviewField = useApp((s) => s.setReviewField)
  const deleteReview = useApp((s) => s.deleteReview)
  const addReviewBox = useApp((s) => s.addReviewBox)
  const resetReview = useApp((s) => s.resetReview)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [pick, setPick] = useState(false)
  const [hideSkip, setHideSkip] = useState(true)
  const [query, setQuery] = useState('')
  const drag = useRef<{ x: number; y: number; drawing: boolean } | null>(null)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return review.filter((item) => {
      if (item.deleted) return false
      if (item.role === 'hole') return false
      if (hideSkip && item.kind === 'skip') return false
      if (!q) return true
      return `${item.title} ${item.evidence} ${item.kind ?? ''}`.toLowerCase().includes(q)
    })
  }, [review, hideSkip, query])

  const current = review.find((item) => item.id === selected && !item.deleted) ?? null
  const doubtful = review.filter((item) => !item.deleted && item.confidence < 0.6 && item.role !== 'hole').length

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !model) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let frame = 0
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
      const bounds = previewBounds(model.extents, review)
      const spanX = Math.max(1, bounds.x1 - bounds.x0)
      const spanY = Math.max(1, bounds.y1 - bounds.y0)
      const pad = 28
      const s = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY)
      const ox = (w - spanX * s) / 2
      const oy = (h - spanY * s) / 2
      const map = (x: number, y: number) => [ox + (x - bounds.x0) * s, oy + (bounds.y1 - y) * s] as const
      canvas.dataset.ox = String(ox)
      canvas.dataset.oy = String(oy)
      canvas.dataset.s = String(s)
      canvas.dataset.x0 = String(bounds.x0)
      canvas.dataset.y1 = String(bounds.y1)

      const stroke = (role: string, color: string, width: number, alpha = 1) => {
        const arr = model.preview.segments[role]
        if (!arr) return
        ctx.beginPath()
        for (let i = 0; i < arr.length; i += 4) {
          const [ax, ay] = map(arr[i], arr[i + 1])
          const [bx, by] = map(arr[i + 2], arr[i + 3])
          ctx.moveTo(ax, ay)
          ctx.lineTo(bx, by)
        }
        ctx.globalAlpha = alpha
        ctx.strokeStyle = color
        ctx.lineWidth = width
        ctx.stroke()
        ctx.globalAlpha = 1
      }
      stroke('chassis', '#8d97a1', 0.6, 0.45)
      stroke('front', '#6b5b95', 1, 0.7)
      stroke('cab', '#2f6f9f', 1, 0.45)
      stroke('component', '#8a5a2a', 0.8, 0.35)
      stroke('frame', '#5c564e', 1.4, 0.55)

      if (model.frame) {
        ctx.beginPath()
        const rail = (pts: { x: number; y: number }[]) => {
          pts.forEach((point, index) => {
            const [x, y] = map(point.x, point.y)
            if (index === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          })
        }
        rail(model.frame.left)
        rail(model.frame.right)
        ctx.strokeStyle = '#1c1915'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      for (const item of review) {
        if (item.deleted || item.role === 'hole') continue
        if (hideSkip && item.kind === 'skip') continue
        drawBox(ctx, map, item.side, item, item.id === selected)
        drawBox(ctx, map, item.top, item, item.id === selected)
      }

      const holes = review.filter((item) => item.role === 'hole' && !item.deleted)
      ctx.fillStyle = '#0f6f86'
      for (const hole of holes) {
        if (!hole.side) continue
        const [x, y] = map((hole.side.x0 + hole.side.x1) / 2, (hole.side.y0 + hole.side.y1) / 2)
        ctx.beginPath()
        ctx.arc(x, y, Math.max(1.2, ((hole.side.x1 - hole.side.x0) / 2) * s), 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.font = '12px "Segoe UI", sans-serif'
      ctx.fillStyle = '#5c564e'
      if (model.views.side) label(ctx, map, model.views.side.x0 + 40, model.views.side.y1 - 40, 'Bokorys')
      if (model.views.top) label(ctx, map, model.views.top.x0 + 40, model.views.top.y1 - 30, 'Půdorys')
      if (model.views.front) label(ctx, map, model.views.front.x0 + 20, model.views.front.y1 - 20, 'Čelní pohled')
    }
    const onResize = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(draw)
    }
    onResize()
    const observer = new ResizeObserver(onResize)
    observer.observe(canvas)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [model, review, selected, hideSkip])

  function toDrawing(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const s = Number(canvas.dataset.s || 1)
    const ox = Number(canvas.dataset.ox || 0)
    const oy = Number(canvas.dataset.oy || 0)
    const x0 = Number(canvas.dataset.x0 || 0)
    const y1 = Number(canvas.dataset.y1 || 0)
    const px = event.clientX - rect.left
    const py = event.clientY - rect.top
    return { x: x0 + (px - ox) / s, y: y1 - (py - oy) / s, px, py }
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const point = toDrawing(event)
    if (!point || !model) return
    if (pick) {
      const box = clusterAt(model, point.x, point.y)
      if (box) {
        const view = viewOf(point.x, point.y, model)
        addReviewBox(box, view)
        setPick(false)
      }
      return
    }
    const hit = hitTest(point.x, point.y, review, hideSkip)
    if (hit) {
      setSelected(hit)
      drag.current = null
      return
    }
    drag.current = { x: point.x, y: point.y, drawing: false }
    ;(event.target as HTMLCanvasElement).setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const start = drag.current
    const point = toDrawing(event)
    if (!start || !point) return
    if (Math.hypot(point.x - start.x, point.y - start.y) > 12) start.drawing = true
  }

  function onPointerUp(event: PointerEvent<HTMLCanvasElement>) {
    const start = drag.current
    drag.current = null
    const point = toDrawing(event)
    if (!start || !point || !model || !start.drawing) return
    const box = {
      x0: Math.min(start.x, point.x),
      y0: Math.min(start.y, point.y),
      x1: Math.max(start.x, point.x),
      y1: Math.max(start.y, point.y),
    }
    if (box.x1 - box.x0 < 30 && box.y1 - box.y0 < 30) return
    const view = viewOf((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, model)
    addReviewBox(box, view)
    const added = useApp.getState().review.at(-1)
    if (added) setSelected(added.id)
  }

  if (!model) return null

  return (
    <section className="review-pane">
      <div className="review-stage">
        <div className="pane-title">
          <strong>Kontrola detekce</strong>
          <span>
            {doubtful ? `${doubtful} nejistých` : 'vše s vyšší jistotou'} · tažením přidáte oblast
            {pick ? ' · klikněte na entity' : ''}
          </span>
        </div>
        <canvas
          ref={canvasRef}
          className="preview-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
        <div className="review-actions">
          <Button variant="rust" onClick={confirmReview}>
            Vygenerovat 3D
          </Button>
          <Button variant={pick ? 'rust' : 'outline'} size="sm" onClick={() => setPick((value) => !value)}>
            Vybrat entity
          </Button>
          <Button variant="outline" size="sm" onClick={resetReview}>
            Obnovit detekci
          </Button>
        </div>
      </div>
      <aside className="review-side">
        <input className="text-input" placeholder="Hledat prvek" value={query} onChange={(event) => setQuery(event.target.value)} />
        <label className="toggle">
          <span>Skrýt vynechané</span>
          <input type="checkbox" checked={hideSkip} onChange={(event) => setHideSkip(event.target.checked)} />
        </label>
        <p className="status">
          Otvory rámu: {review.filter((item) => item.role === 'hole' && !item.deleted).length}. Kliknutím ve výkresu otevřete jeden otvor.
        </p>
        <ul className="review-list">
          {visible.map((item) => (
            <li key={item.id}>
              <button type="button" className={item.id === selected ? 'review-item on' : 'review-item'} onClick={() => setSelected(item.id)}>
                <span className={item.confidence < 0.6 ? 'conf low' : item.confidence < 0.8 ? 'conf mid' : 'conf high'}>
                  {Math.round(item.confidence * 100)} %
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {ROLE_CS[item.role]} · {item.source === 'measured' ? 'z výkresu' : item.source === 'user' ? 'upraveno' : 'odhad'}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {current ? (
          <ElementForm
            element={current}
            onField={(key, value) => setReviewField(current.id, key, value)}
            onDelete={() => {
              deleteReview(current.id)
              setSelected(null)
            }}
          />
        ) : (
          <p className="status">Vyberte prvek v seznamu nebo ve výkresu. Nejisté detekce jsou označené.</p>
        )}
      </aside>
    </section>
  )
}

function ElementForm({
  element,
  onField,
  onDelete,
}: {
  element: ReviewElement
  onField: (key: string, value: number | string | boolean) => void
  onDelete: () => void
}) {
  return (
    <div className="review-form">
      <h2>{element.title}</h2>
      <p className="status">{element.evidence}</p>
      <p className={element.confidence < 0.6 ? 'status warn' : 'status'}>
        Jistota {Math.round(element.confidence * 100)} % ·{' '}
        {element.source === 'measured' ? 'naměřeno ve výkresu' : element.source === 'user' ? 'upraveno ručně' : 'odhad, ve výkresu údaj chybí'}
      </p>
      {element.fields.map((field) => (
        <label key={field.key} className="field">
          <span>
            {field.label}
            {field.estimated ? ' (odhad)' : ''}
          </span>
          {field.options ? (
            <select className="text-input" value={String(field.value)} onChange={(event) => onField(field.key, event.target.value)}>
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : typeof field.value === 'boolean' ? (
            <input type="checkbox" checked={field.value} onChange={(event) => onField(field.key, event.target.checked)} />
          ) : (
            <input
              className="text-input"
              type={typeof field.value === 'number' ? 'number' : 'text'}
              step={field.step ?? 1}
              value={typeof field.value === 'number' ? field.value : String(field.value)}
              onChange={(event) =>
                onField(field.key, typeof field.value === 'number' ? Number(event.target.value) : event.target.value)
              }
            />
          )}
        </label>
      ))}
      {element.role !== 'frame' ? (
        <Button variant="outline" size="sm" onClick={onDelete}>
          Smazat prvek
        </Button>
      ) : null}
      {element.kind && element.kind in EQUIP_LABELS ? (
        <p className="status">3D použije tvar: {EQUIP_LABELS[element.kind as EquipKind]}.</p>
      ) : null}
    </div>
  )
}

function drawBox(
  ctx: CanvasRenderingContext2D,
  map: (x: number, y: number) => readonly [number, number],
  box: BBox | null,
  item: ReviewElement,
  on: boolean,
) {
  if (!box) return
  const [ax, ay] = map(box.x0, box.y1)
  const [bx, by] = map(box.x1, box.y0)
  const color = item.confidence < 0.55 ? '#c2410c' : item.confidence < 0.8 ? '#b45309' : '#1f7a4d'
  ctx.save()
  ctx.strokeStyle = on ? '#9b2c1a' : color
  ctx.fillStyle = on ? 'rgba(194, 78, 40, 0.16)' : item.source === 'estimated' ? 'rgba(180, 83, 9, 0.08)' : 'rgba(31, 122, 77, 0.08)'
  ctx.lineWidth = on ? 2.4 : 1.4
  if (item.source === 'estimated' || item.confidence < 0.6) ctx.setLineDash([5, 4])
  ctx.fillRect(ax, ay, bx - ax, by - ay)
  ctx.strokeRect(ax, ay, bx - ax, by - ay)
  ctx.setLineDash([])
  ctx.fillStyle = '#1c1915'
  ctx.font = '11px "Segoe UI", sans-serif'
  const text = item.role === 'equipment' || item.role === 'axle' || item.role === 'cab' || item.role === 'frame' ? item.title : ''
  if (text && Math.abs(bx - ax) > 36) ctx.fillText(text, ax + 3, ay + 12)
  ctx.restore()
}

function label(ctx: CanvasRenderingContext2D, map: (x: number, y: number) => readonly [number, number], x: number, y: number, text: string) {
  const [px, py] = map(x, y)
  ctx.fillText(text, px, py)
}

function previewBounds(extents: BBox, review: ReviewElement[]): BBox {
  const box = { ...extents }
  for (const item of review) {
    for (const part of [item.side, item.top]) {
      if (!part) continue
      box.x0 = Math.min(box.x0, part.x0)
      box.y0 = Math.min(box.y0, part.y0)
      box.x1 = Math.max(box.x1, part.x1)
      box.y1 = Math.max(box.y1, part.y1)
    }
  }
  return box
}

function hitTest(x: number, y: number, review: ReviewElement[], hideSkip: boolean) {
  let best: { id: string; area: number } | null = null
  for (const item of review) {
    if (item.deleted) continue
    if (hideSkip && item.kind === 'skip' && item.role === 'equipment') continue
    for (const box of [item.side, item.top]) {
      if (!box || x < box.x0 || x > box.x1 || y < box.y0 || y > box.y1) continue
      const area = (box.x1 - box.x0) * (box.y1 - box.y0)
      if (!best || area < best.area) best = { id: item.id, area }
    }
  }
  return best?.id ?? null
}

function viewOf(x: number, y: number, model: NonNullable<ReturnType<typeof useApp.getState>['source']>) {
  const side = model.views.side
  const top = model.views.top
  const inBox = (box: BBox | null) => !!box && x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1
  if (inBox(side) && !inBox(top)) return 'side' as const
  if (inBox(top) && !inBox(side)) return 'top' as const
  if (side && top) return Math.abs(y - (side.y0 + side.y1) / 2) < Math.abs(y - (top.y0 + top.y1) / 2) ? 'side' : 'top'
  return side ? 'side' : 'top'
}

function clusterAt(model: NonNullable<ReturnType<typeof useApp.getState>['source']>, x: number, y: number): BBox | null {
  const pool = [...(model.preview.segments.component ?? []), ...(model.preview.segments.chassis ?? []), ...(model.preview.segments.frame ?? [])]
  const near: number[] = []
  for (let i = 0; i < pool.length; i += 4) {
    const mx = (pool[i] + pool[i + 2]) / 2
    const my = (pool[i + 1] + pool[i + 3]) / 2
    if (Math.hypot(mx - x, my - y) < 80) near.push(i)
    if (near.length > 800) break
  }
  if (!near.length) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const i of near) {
    x0 = Math.min(x0, pool[i], pool[i + 2])
    y0 = Math.min(y0, pool[i + 1], pool[i + 3])
    x1 = Math.max(x1, pool[i], pool[i + 2])
    y1 = Math.max(y1, pool[i + 1], pool[i + 3])
  }
  if (x1 - x0 < 20 || y1 - y0 < 20) return null
  return { x0, y0, x1, y1 }
}

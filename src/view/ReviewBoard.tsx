import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Button } from '../components/ui/button'
import type { BBox } from '../lib/geom'
import type { ChassisModel } from '../model/types'
import { EQUIP_LABELS, type EquipKind } from '../pipeline/kinds'
import { reshapeElement, type ReviewElement } from '../pipeline/review'
import { useApp } from '../state'
import { easeScale, fitView, nextTargetScale, panBy, screenToWorld, viewAbout, wheelIntent, wheelZoomFactor, worldToScreen, zoomLimits, type ReviewView } from './reviewCamera'
import { handleAnchor, hitHandle, resizeBox, type BoxSide, type HandleId } from './reviewHandles'
import { isTextEditing, reviewCommand } from './reviewKeys'
import { applyWindowSelection, idsInWindow, toggleMember } from './reviewSelect'

interface ZoomAnim {
  running: boolean
  scale: number
  target: number
  anchorX: number
  anchorY: number
  px: number
  py: number
  w: number
  h: number
  last: number
}

interface LineCache {
  canvas: HTMLCanvasElement
  view: ReviewView
  w: number
  h: number
  key: string
}

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
  const deleteReviewIds = useApp((s) => s.deleteReviewIds)
  const restoreReview = useApp((s) => s.restoreReview)
  const commitElement = useApp((s) => s.commitElement)
  const includeInScene = useApp((s) => s.includeInScene)
  const excludeFromScene = useApp((s) => s.excludeFromScene)
  const addReviewBox = useApp((s) => s.addReviewBox)
  const resetReview = useApp((s) => s.resetReview)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [pick, setPick] = useState(false)
  const [windowMode, setWindowMode] = useState(false)
  const [hideSkip, setHideSkip] = useState(true)
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [live, setLive] = useState<ReviewElement | null>(null)
  const drag = useRef<{
    x: number
    y: number
    x2: number
    y2: number
    drawing: boolean
    mode: 'region' | 'window'
    additive: boolean
    hit: string | null
  } | null>(null)
  const handleDrag = useRef<{ id: string; which: BoxSide; handle: HandleId; start: BBox; pushed: boolean } | null>(null)
  const panRef = useRef<{ id: number; x: number; y: number } | null>(null)
  const lastMiddle = useRef(0)
  const viewRef = useRef<ReviewView | null>(null)
  const limitsRef = useRef(zoomLimits(1))
  const identityRef = useRef('')
  const drawRef = useRef<() => void>(() => {})
  const rafRef = useRef(0)
  const requestRef = useRef<() => void>(() => {})
  const fitRef = useRef<() => void>(() => {})
  const deleteRef = useRef<() => void>(() => {})
  const undoRef = useRef<() => void>(() => {})
  const stopZoomRef = useRef<() => void>(() => {})
  const undoStack = useRef<ReviewElement[][]>([])
  const toastTimer = useRef(0)
  const zoomRaf = useRef(0)
  const zoomRef = useRef<ZoomAnim | null>(null)
  const lineCache = useRef<LineCache | null>(null)
  const fileSeen = useRef('')
  const sceneRef = useRef({ model, review, selectedIds, hideSkip, live, windowMode })

  useEffect(() => {
    sceneRef.current = { model, review, selectedIds, hideSkip, live, windowMode }
    requestRef.current = () => {
      if (rafRef.current) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        drawRef.current()
      })
    }
    fitRef.current = () => {
      stopZoomRef.current()
      const canvas = canvasRef.current
      const current = sceneRef.current.model
      if (!canvas || !current) return
      const rect = canvas.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return
      const bounds = previewBounds(current.extents, sceneRef.current.review)
      const fitted = fitView(bounds, rect.width, rect.height)
      limitsRef.current = zoomLimits(fitted.scale)
      viewRef.current = fitted
      identityRef.current = fileKey(current)
      requestRef.current()
    }
    deleteRef.current = () => {
      const ids = sceneRef.current.selectedIds
      const items = useApp.getState().review.filter((entry) => ids.includes(entry.id) && !entry.deleted && entry.role !== 'frame')
      if (!items.length) return
      undoStack.current.push(items.map(snapshotElement))
      if (undoStack.current.length > 40) undoStack.current.shift()
      deleteReviewIds(items.map((item) => item.id))
      setSelectedIds((current) => current.filter((id) => !items.some((item) => item.id === id)))
      setLive(null)
      setToast(items.length > 1 ? 'Prvky smazány – Ctrl+Z vrátí' : 'Prvek smazán – Ctrl+Z vrátí')
      window.clearTimeout(toastTimer.current)
      toastTimer.current = window.setTimeout(() => setToast(null), 2800)
    }
    undoRef.current = () => {
      const batch = undoStack.current.pop()
      if (!batch?.length) return
      for (const item of batch) restoreReview(item)
      setSelectedIds(batch.map((item) => item.id))
      setLive(null)
      setToast(null)
      window.clearTimeout(toastTimer.current)
    }
    const nextKey = model ? fileKey(model) : ''
    if (fileSeen.current && fileSeen.current !== nextKey) undoStack.current = []
    fileSeen.current = nextKey
  })

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

  const current = selectedIds.length === 1 ? (review.find((item) => item.id === selectedIds[0] && !item.deleted) ?? null) : null
  const shown = live && current && live.id === current.id ? live : current
  const selectedMany = review.filter((item) => selectedIds.includes(item.id) && !item.deleted)
  const doubtful = review.filter((item) => !item.deleted && item.confidence < 0.6 && item.role !== 'hole').length

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTextEditing(event.target)) return
      const command = reviewCommand(event)
      if (!command) return
      event.preventDefault()
      if (command === 'delete') deleteRef.current()
      else if (command === 'undo') undoRef.current()
      else fitRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(toastTimer.current)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !model) return
    const stopZoom = () => {
      if (zoomRef.current) zoomRef.current.running = false
      if (zoomRaf.current) cancelAnimationFrame(zoomRaf.current)
      zoomRaf.current = 0
    }
    stopZoomRef.current = stopZoom
    const tickZoom = (now: number) => {
      zoomRaf.current = 0
      const anim = zoomRef.current
      if (!anim?.running) return
      const dt = now - anim.last
      anim.last = now
      anim.scale = easeScale(anim.scale, anim.target, dt)
      viewRef.current = viewAbout(anim.anchorX, anim.anchorY, anim.px, anim.py, anim.w, anim.h, anim.scale)
      if (anim.scale === anim.target) anim.running = false
      drawRef.current()
      if (anim.running) zoomRaf.current = requestAnimationFrame(tickZoom)
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const view = viewRef.current
      if (!view) return
      const rect = canvas.getBoundingClientRect()
      if (wheelIntent(event) === 'pan') {
        stopZoom()
        viewRef.current = panBy(view, -event.deltaX, -event.deltaY)
        requestRef.current()
        return
      }
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top
      const anchor = screenToWorld(view, rect.width, rect.height, px, py)
      const anim = zoomRef.current?.running ? zoomRef.current : null
      const next: ZoomAnim = anim ?? {
        running: true,
        scale: view.scale,
        target: view.scale,
        anchorX: anchor.x,
        anchorY: anchor.y,
        px,
        py,
        w: rect.width,
        h: rect.height,
        last: performance.now(),
      }
      next.anchorX = anchor.x
      next.anchorY = anchor.y
      next.px = px
      next.py = py
      next.w = rect.width
      next.h = rect.height
      next.target = nextTargetScale(next.target, wheelZoomFactor(event.deltaY, event.deltaMode), limitsRef.current)
      next.running = true
      zoomRef.current = next
      if (!zoomRaf.current) zoomRaf.current = requestAnimationFrame(tickZoom)
    }
    const blockMiddle = (event: MouseEvent) => {
      if (event.button === 1) event.preventDefault()
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('mousedown', blockMiddle)
    canvas.addEventListener('auxclick', blockMiddle)
    return () => {
      stopZoom()
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('mousedown', blockMiddle)
      canvas.removeEventListener('auxclick', blockMiddle)
    }
  }, [model])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !model) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const key = fileKey(model)
    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = rect.width
      const h = rect.height
      const bw = Math.max(1, Math.floor(w * dpr))
      const bh = Math.max(1, Math.floor(h * dpr))
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw
        canvas.height = bh
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#f4f0e8'
      ctx.fillRect(0, 0, w, h)
      if (w < 2 || h < 2) return
      const bounds = previewBounds(model.extents, review)
      const fitted = fitView(bounds, w, h)
      limitsRef.current = zoomLimits(fitted.scale)
      if (identityRef.current !== key || !viewRef.current) {
        stopZoomRef.current()
        viewRef.current = fitted
        identityRef.current = key
      } else if (!zoomRef.current?.running) {
        const { min, max } = limitsRef.current
        const scale = Math.min(max, Math.max(min, viewRef.current.scale))
        if (scale !== viewRef.current.scale) viewRef.current = { ...viewRef.current, scale }
      }
      const view = viewRef.current
      const map = (x: number, y: number) => worldToScreen(view, w, h, x, y)
      const margin = 40 / view.scale
      const halfW = w / 2 / view.scale + margin
      const halfH = h / 2 / view.scale + margin
      const vp = { x0: view.cx - halfW, x1: view.cx + halfW, y0: view.cy - halfH, y1: view.cy + halfH }
      const cached = lineCache.current
      const ratio = cached && cached.key === key && cached.w === w && cached.h === h && cached.canvas.width === bw ? view.scale / cached.view.scale : 0
      const panPx = cached && ratio ? Math.hypot((cached.view.cx - view.cx) * view.scale, (cached.view.cy - view.cy) * view.scale) : Infinity
      const useBlit = Boolean(zoomRef.current?.running && cached && ratio > 0.97 && ratio < 1.16 && panPx < 48)

      if (useBlit && cached) blitScaled(ctx, cached.canvas, cached.view, view, w, h, dpr)

      const stroke = (role: string, color: string, width: number, alpha = 1) => {
        if (useBlit) return
        const arr = model.preview.segments[role]
        if (!arr) return
        ctx.beginPath()
        let any = false
        for (let i = 0; i < arr.length; i += 4) {
          const x0 = arr[i]
          const y0 = arr[i + 1]
          const x1 = arr[i + 2]
          const y1 = arr[i + 3]
          if (Math.max(x0, x1) < vp.x0 || Math.min(x0, x1) > vp.x1 || Math.max(y0, y1) < vp.y0 || Math.min(y0, y1) > vp.y1) continue
          const [ax, ay] = map(x0, y0)
          const [bx, by] = map(x1, y1)
          ctx.moveTo(ax, ay)
          ctx.lineTo(bx, by)
          any = true
        }
        if (!any) return
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

      if (model.frame && !useBlit) {
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

      if (!useBlit) lineCache.current = takeLineCache(lineCache.current?.canvas ?? null, canvas, view, w, h, bw, bh, key)

      const scene = sceneRef.current
      const chosen = new Set(scene.selectedIds)
      for (const item of scene.review) {
        if (item.deleted || item.role === 'hole') continue
        if (scene.hideSkip && item.kind === 'skip') continue
        const drawn = scene.live?.id === item.id ? scene.live : item
        const on = chosen.has(item.id)
        drawBox(ctx, map, drawn.side, drawn, on, vp)
        drawBox(ctx, map, drawn.top, drawn, on, vp)
        if (on && chosen.size === 1) {
          drawHandles(ctx, map, drawn.side)
          drawHandles(ctx, map, drawn.top)
        }
      }

      ctx.fillStyle = '#0f6f86'
      for (const hole of scene.review) {
        if (hole.role !== 'hole' || hole.deleted || !hole.side) continue
        const hx = (hole.side.x0 + hole.side.x1) / 2
        const hy = (hole.side.y0 + hole.side.y1) / 2
        const worldR = (hole.side.x1 - hole.side.x0) / 2
        const radius = Math.max(1.2, worldR * view.scale)
        if (hx + worldR < vp.x0 || hx - worldR > vp.x1 || hy + worldR < vp.y0 || hy - worldR > vp.y1) continue
        const [x, y] = map(hx, hy)
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
      }

      const rubber = drag.current
      if (rubber?.drawing) {
        const [ax, ay] = map(rubber.x, rubber.y)
        const [bx, by] = map(rubber.x2, rubber.y2)
        ctx.save()
        ctx.strokeStyle = rubber.mode === 'window' ? '#0f6f86' : '#9b2c1a'
        ctx.lineWidth = 1.5
        ctx.setLineDash(rubber.mode === 'window' ? [] : [4, 3])
        ctx.strokeRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay))
        ctx.restore()
      }

      ctx.font = '12px "Segoe UI", sans-serif'
      ctx.fillStyle = '#5c564e'
      if (model.views.side) label(ctx, map, w, h, model.views.side.x0 + 40, model.views.side.y1 - 40, 'Bokorys')
      if (model.views.top) label(ctx, map, w, h, model.views.top.x0 + 40, model.views.top.y1 - 30, 'Půdorys')
      if (model.views.front) label(ctx, map, w, h, model.views.front.x0 + 20, model.views.front.y1 - 20, 'Čelní pohled')
    }
    drawRef.current = draw
    requestRef.current()
    const observer = new ResizeObserver(() => requestRef.current())
    observer.observe(canvas)
    return () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      observer.disconnect()
      if (drawRef.current === draw) drawRef.current = () => {}
    }
  }, [model, review, selectedIds, hideSkip])

  function toDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    const view = viewRef.current
    if (!canvas || !view) return null
    const rect = canvas.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return null
    const px = event.clientX - rect.left
    const py = event.clientY - rect.top
    return { ...screenToWorld(view, rect.width, rect.height, px, py), px, py }
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget
    if (event.button === 1) {
      event.preventDefault()
      const now = performance.now()
      if (now - lastMiddle.current < 400) {
        lastMiddle.current = 0
        panRef.current = null
        canvas.classList.remove('is-panning')
        fitRef.current()
        return
      }
      lastMiddle.current = now
      stopZoomRef.current()
      drag.current = null
      handleDrag.current = null
      panRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
      canvas.classList.add('is-panning')
      canvas.setPointerCapture(event.pointerId)
      return
    }
    if (event.button !== 0) return
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
    const grip = gripAt(point.px, point.py)
    if (grip) {
      const item = review.find((entry) => entry.id === grip.id)
      const box = grip.which === 'side' ? item?.side : item?.top
      if (item && box) {
        handleDrag.current = { id: item.id, which: grip.which, handle: grip.handle, start: { ...box }, pushed: false }
        drag.current = null
        canvas.setPointerCapture(event.pointerId)
      }
      return
    }
    const extend = event.ctrlKey || event.metaKey || event.shiftKey
    const hit = hitTest(point.x, point.y, review, hideSkip)
    if (hit && !windowMode) {
      setSelectedIds((current) => toggleMember(current, hit, extend))
      setLive(null)
      return
    }
    drag.current = {
      x: point.x,
      y: point.y,
      x2: point.x,
      y2: point.y,
      drawing: false,
      mode: windowMode || event.shiftKey ? 'window' : 'region',
      additive: event.ctrlKey || event.metaKey,
      hit,
    }
    canvas.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget
    const pan = panRef.current
    if (pan && pan.id === event.pointerId) {
      const dx = event.clientX - pan.x
      const dy = event.clientY - pan.y
      pan.x = event.clientX
      pan.y = event.clientY
      const view = viewRef.current
      if (view && (dx || dy)) {
        viewRef.current = panBy(view, dx, dy)
        requestRef.current()
      }
      return
    }
    const grip = handleDrag.current
    const point = toDrawing(event)
    if (grip && point) {
      const item = useApp.getState().review.find((entry) => entry.id === grip.id)
      if (!item) return
      if (!grip.pushed) {
        undoStack.current.push([snapshotElement(item)])
        if (undoStack.current.length > 40) undoStack.current.shift()
        grip.pushed = true
      }
      const nextBox = resizeBox(grip.start, grip.handle, point.x, point.y)
      const next = reshapeElement(item, grip.which, nextBox)
      sceneRef.current.live = next
      setLive(next)
      requestRef.current()
      return
    }
    if (point && !drag.current && selectedIds.length === 1) {
      const hover = gripAt(point.px, point.py)
      canvas.style.cursor = hover ? cursorFor(hover.handle) : ''
    }
    const start = drag.current
    if (!start || !point) return
    start.x2 = point.x
    start.y2 = point.y
    if (Math.hypot(point.x - start.x, point.y - start.y) > 12) {
      start.drawing = true
      requestRef.current()
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (panRef.current?.id === event.pointerId) {
      panRef.current = null
      event.currentTarget.classList.remove('is-panning')
      return
    }
    const grip = handleDrag.current
    if (grip) {
      handleDrag.current = null
      const done = sceneRef.current.live
      sceneRef.current.live = null
      setLive(null)
      if (grip.pushed && done) commitElement(done)
      else if (!grip.pushed) requestRef.current()
      return
    }
    const start = drag.current
    drag.current = null
    if (start?.drawing) requestRef.current()
    const point = toDrawing(event)
    if (!start || !model) return
    if (!start.drawing) {
      if (start.mode === 'window' && start.hit) setSelectedIds((current) => toggleMember(current, start.hit as string, start.additive))
      return
    }
    if (!point) return
    const box = {
      x0: Math.min(start.x, point.x),
      y0: Math.min(start.y, point.y),
      x1: Math.max(start.x, point.x),
      y1: Math.max(start.y, point.y),
    }
    if (start.mode === 'window') {
      const hits = idsInWindow(useApp.getState().review, box, hideSkip)
      setSelectedIds((current) => applyWindowSelection(current, hits, start.additive))
      return
    }
    if (box.x1 - box.x0 < 30 && box.y1 - box.y0 < 30) return
    const view = viewOf((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, model)
    addReviewBox(box, view)
    const added = useApp.getState().review.at(-1)
    if (added) setSelectedIds([added.id])
  }

  function gripAt(px: number, py: number): { id: string; which: BoxSide; handle: HandleId } | null {
    if (selectedIds.length !== 1) return null
    const item = review.find((entry) => entry.id === selectedIds[0] && !entry.deleted)
    const canvas = canvasRef.current
    const view = viewRef.current
    if (!item || !canvas || !view) return null
    const rect = canvas.getBoundingClientRect()
    const map = (wx: number, wy: number) => worldToScreen(view, rect.width, rect.height, wx, wy)
    const faces: BoxSide[] = ['side', 'top']
    let best: { id: string; which: BoxSide; handle: HandleId; d: number } | null = null
    for (const which of faces) {
      const box = item[which]
      if (!box) continue
      const handle = hitHandle(px, py, box, map)
      if (!handle) continue
      const anchor = handleAnchor(box, handle)
      const [sx, sy] = map(anchor.x, anchor.y)
      const d = Math.hypot(sx - px, sy - py)
      if (!best || d < best.d) best = { id: item.id, which, handle, d }
    }
    return best ? { id: best.id, which: best.which, handle: best.handle } : null
  }

  if (!model) return null

  return (
    <section className="review-pane">
      <div className="review-stage">
        <div className="pane-title">
          <strong>Kontrola detekce</strong>
          <span>
            {doubtful ? `${doubtful} nejistých` : 'vše s vyšší jistotou'} · tažením přidáte oblast · Shift+tažení vybírá okno · úchyty mění obrys
            {pick ? ' · klikněte na entity' : ''}
            {windowMode ? ' · tažení vybírá prvky' : ''}
          </span>
        </div>
        <canvas
          ref={canvasRef}
          className="preview-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {toast ? (
          <p className="review-toast" role="status">
            {toast}
          </p>
        ) : null}
        <div className="review-actions">
          <Button variant="rust" onClick={confirmReview}>
            Vygenerovat vše
          </Button>
          <Button variant="outline" size="sm" disabled={!selectedIds.length} onClick={() => includeInScene(selectedIds)}>
            Přidat do 3D
          </Button>
          <Button variant="outline" size="sm" disabled={!selectedMany.some((item) => item.in3d)} onClick={() => excludeFromScene(selectedIds)}>
            Odebrat z 3D
          </Button>
          <Button variant="outline" size="sm" title="Celý výkres (F)" onClick={() => fitRef.current()}>
            Přizpůsobit
          </Button>
          <Button
            variant={windowMode ? 'rust' : 'outline'}
            size="sm"
            onClick={() => {
              setWindowMode((value) => !value)
              setPick(false)
            }}
          >
            Výběr oknem
          </Button>
          <Button
            variant={pick ? 'rust' : 'outline'}
            size="sm"
            onClick={() => {
              setPick((value) => !value)
              setWindowMode(false)
            }}
          >
            Vybrat entity
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              undoStack.current = []
              setSelectedIds([])
              setLive(null)
              resetReview()
            }}
          >
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
              <button
                type="button"
                className={selectedIds.includes(item.id) ? 'review-item on' : 'review-item'}
                onClick={(event) => {
                  const extend = event.ctrlKey || event.metaKey || event.shiftKey
                  setSelectedIds((current) => toggleMember(current, item.id, extend))
                  setLive(null)
                }}
              >
                <span className={item.confidence < 0.6 ? 'conf low' : item.confidence < 0.8 ? 'conf mid' : 'conf high'}>
                  {Math.round(item.confidence * 100)} %
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {ROLE_CS[item.role]} · {item.source === 'measured' ? 'z výkresu' : item.source === 'user' ? 'upraveno' : 'odhad'}
                    {item.in3d ? <span className="in-scene"> · ve 3D</span> : null}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {shown ? (
          <ElementForm
            element={shown}
            onField={(key, value) => setReviewField(shown.id, key, value)}
            onDelete={() => deleteRef.current()}
          />
        ) : selectedMany.length > 1 ? (
          <MultiForm
            items={selectedMany}
            onKind={(value) => {
              for (const item of selectedMany) {
                if (item.fields.some((field) => field.key === 'kind')) setReviewField(item.id, 'kind', value)
              }
            }}
            onDelete={() => deleteRef.current()}
          />
        ) : (
          <p className="status">Vyberte prvek v seznamu nebo ve výkresu. Ctrl nebo Shift přidá do výběru. Nejisté detekce jsou označené.</p>
        )}
      </aside>
    </section>
  )
}

function MultiForm({
  items,
  onKind,
  onDelete,
}: {
  items: ReviewElement[]
  onKind: (value: string) => void
  onDelete: () => void
}) {
  const kinds = items.filter((item) => item.fields.some((field) => field.key === 'kind'))
  const shared = kinds.length ? String(kinds[0].kind ?? 'case') : 'case'
  const same = kinds.every((item) => (item.kind ?? 'case') === shared)
  return (
    <div className="review-form">
      <h2>Vybráno {items.length} prvků</h2>
      <p className="status">Smazání, typ a 3D platí pro celý výběr. Rám smazat nelze.</p>
      {kinds.length ? (
        <label className="field">
          <span>Typ u vybraných</span>
          <select className="text-input" value={same ? shared : ''} onChange={(event) => onKind(event.target.value)}>
            {same ? null : <option value="">různé</option>}
            {(Object.keys(EQUIP_LABELS) as EquipKind[]).map((value) => (
              <option key={value} value={value}>
                {EQUIP_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <Button variant="outline" size="sm" onClick={onDelete}>
        Smazat výběr
      </Button>
    </div>
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
      {element.side || element.top ? <p className="status">Úchyty v rozích a na hranách mění obrys. Úprava je ruční a vrátí ji Ctrl+Z.</p> : null}
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

function drawHandles(ctx: CanvasRenderingContext2D, map: (x: number, y: number) => readonly [number, number], box: BBox | null) {
  if (!box) return
  const size = 7
  ctx.save()
  for (const id of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as HandleId[]) {
    const anchor = handleAnchor(box, id)
    const [x, y] = map(anchor.x, anchor.y)
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = '#9b2c1a'
    ctx.lineWidth = 1.5
    ctx.fillRect(x - size / 2, y - size / 2, size, size)
    ctx.strokeRect(x - size / 2, y - size / 2, size, size)
  }
  ctx.restore()
}

function cursorFor(handle: HandleId) {
  if (handle === 'n' || handle === 's') return 'ns-resize'
  if (handle === 'e' || handle === 'w') return 'ew-resize'
  if (handle === 'ne' || handle === 'sw') return 'nesw-resize'
  return 'nwse-resize'
}

function drawBox(
  ctx: CanvasRenderingContext2D,
  map: (x: number, y: number) => readonly [number, number],
  box: BBox | null,
  item: ReviewElement,
  on: boolean,
  vp: BBox,
) {
  if (!box) return
  if (box.x1 < vp.x0 || box.x0 > vp.x1 || box.y1 < vp.y0 || box.y0 > vp.y1) return
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

function label(
  ctx: CanvasRenderingContext2D,
  map: (x: number, y: number) => readonly [number, number],
  width: number,
  height: number,
  x: number,
  y: number,
  text: string,
) {
  const [px, py] = map(x, y)
  if (px < -80 || py < -20 || px > width + 20 || py > height + 20) return
  ctx.fillText(text, px, py)
}

function blitScaled(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  from: ReviewView,
  view: ReviewView,
  w: number,
  h: number,
  dpr: number,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#f4f0e8'
  ctx.fillRect(0, 0, w, h)
  const k = view.scale / from.scale
  const destX = w / 2 + (from.cx - view.cx) * view.scale
  const destY = h / 2 - (from.cy - view.cy) * view.scale
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.translate(destX, destY)
  ctx.scale(k, k)
  ctx.translate(-w / 2, -h / 2)
  ctx.drawImage(source, 0, 0, w, h)
  ctx.restore()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function takeLineCache(
  existing: HTMLCanvasElement | null,
  source: HTMLCanvasElement,
  view: ReviewView,
  w: number,
  h: number,
  bw: number,
  bh: number,
  key: string,
): LineCache {
  const canvas = existing ?? document.createElement('canvas')
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw
    canvas.height = bh
  }
  const copy = canvas.getContext('2d')
  if (copy) {
    copy.setTransform(1, 0, 0, 1, 0, 0)
    copy.drawImage(source, 0, 0)
  }
  return { canvas, view: { scale: view.scale, cx: view.cx, cy: view.cy }, w, h, key }
}

function snapshotElement(item: ReviewElement): ReviewElement {
  return {
    ...item,
    side: item.side ? { ...item.side } : null,
    top: item.top ? { ...item.top } : null,
    fields: item.fields.map((field) => ({ ...field, options: field.options?.map((option) => ({ ...option })) })),
  }
}

function fileKey(model: ChassisModel) {
  return `${model.profileId}|${model.header.icdNo ?? ''}|${model.header.orderNo ?? ''}|${model.stats.parseMs}`
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

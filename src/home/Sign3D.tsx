import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

/** World-space sign: canvas texture (title or logo + subtitle) on a plane, semi-transparent dark / teal when hot.
 *  One draw call per side; the texture is redrawn only on hover change or logo load. */
export type SignProps = {
  w: number; h: number; title: string; sub: string; logo?: string; hot: boolean; bare?: boolean
  /** exhibit card: category title on top, logo (on a white plate) or the description below */
  card?: boolean
  name?: string; onOver?: () => void; onOut?: () => void; onOpen?: () => void
  position?: [number, number, number]; rotation?: [number, number, number]
}
const PX = 1024
function draw(cv: HTMLCanvasElement, p: SignProps, img: HTMLImageElement | null) {
  const c = cv.getContext('2d')!, W = cv.width, Hh = cv.height, r = Hh * 0.14
  c.clearRect(0, 0, W, Hh)
  if (!p.bare) {
    c.beginPath(); c.roundRect(4, 4, W - 8, Hh - 8, r)
    c.fillStyle = p.hot ? 'rgba(31,111,224,0.95)' : 'rgba(16,22,32,0.62)'; c.fill()
    c.lineWidth = 6; c.strokeStyle = p.hot ? 'rgba(255,255,255,0.9)' : 'rgba(142,197,255,0.75)'; c.stroke()
  }
  // bare: text straight on the scene (dark ink on the light yard), teal + glow on hover
  const ink = p.bare ? (p.hot ? '#1f6fe0' : '#1b2430') : '#f2f6fa'
  const sub = p.bare ? (p.hot ? '#1f6fe0' : '#3a4654') : p.hot ? 'rgba(255,255,255,0.92)' : 'rgba(225,233,240,0.85)'
  if (p.bare && p.hot) { c.shadowColor = 'rgba(31,111,224,0.9)'; c.shadowBlur = 28 } else { c.shadowColor = 'transparent'; c.shadowBlur = 0 }
  c.textAlign = 'center'; c.textBaseline = 'middle'
  if (p.card) { drawCard(c, W, Hh, p, img, ink, sub); return }
  const top = Hh * 0.4
  if (img && img.naturalWidth) {
    const lh = Hh * 0.38, lw = Math.min(W * 0.8, (img.naturalWidth / img.naturalHeight) * lh)
    const lhh = lw / (img.naturalWidth / img.naturalHeight)
    if (!p.hot && !p.bare) { c.fillStyle = 'rgba(255,255,255,0.92)'; c.beginPath(); c.roundRect(W / 2 - lw / 2 - 18, top - lhh / 2 - 12, lw + 36, lhh + 24, 14); c.fill() }
    c.drawImage(img, W / 2 - lw / 2, top - lhh / 2, lw, lhh)
  } else {
    let fs = Hh * 0.34
    c.font = `700 ${fs}px system-ui, sans-serif`
    while (c.measureText(p.title).width > W * 0.88) { fs *= 0.92; c.font = `700 ${fs}px system-ui, sans-serif` }
    c.fillStyle = ink; c.fillText(p.title, W / 2, top)
  }
  let fs = Hh * 0.2
  c.font = `500 ${fs}px system-ui, sans-serif`
  while (c.measureText(p.sub).width > W * 0.9) { fs *= 0.93; c.font = `500 ${fs}px system-ui, sans-serif` }
  c.fillStyle = sub; c.fillText(p.sub, W / 2, Hh * 0.75)
}

/** Card layout (all exhibit cards the same size / fonts): title band on top, logo or description centred below. */
function drawCard(c: CanvasRenderingContext2D, W: number, Hh: number, p: SignProps, img: HTMLImageElement | null, ink: string, sub: string) {
  let fs = Hh * 0.2
  c.font = `700 ${fs}px system-ui, sans-serif`
  while (c.measureText(p.title).width > W * 0.88) { fs *= 0.94; c.font = `700 ${fs}px system-ui, sans-serif` }
  c.fillStyle = ink; c.fillText(p.title, W / 2, Hh * 0.27)
  c.fillStyle = p.hot ? 'rgba(255,255,255,0.55)' : 'rgba(142,197,255,0.45)'; c.fillRect(W * 0.08, Hh * 0.45, W * 0.84, 4)
  const cy = Hh * 0.7
  if (img && img.naturalWidth) {
    const ar = img.naturalWidth / img.naturalHeight, boxH = Hh * 0.3, boxW = W * 0.72
    const lh = Math.min(boxH, boxW / ar), lw = lh * ar
    c.fillStyle = 'rgba(255,255,255,0.95)'; c.beginPath(); c.roundRect(W / 2 - lw / 2 - 22, cy - lh / 2 - 14, lw + 44, lh + 28, 16); c.fill()
    c.drawImage(img, W / 2 - lw / 2, cy - lh / 2, lw, lh)
  } else {
    let f2 = Hh * 0.13
    c.font = `500 ${f2}px system-ui, sans-serif`
    while (c.measureText(p.sub).width > W * 0.86) { f2 *= 0.94; c.font = `500 ${f2}px system-ui, sans-serif` }
    c.fillStyle = sub; c.fillText(p.sub, W / 2, cy)
  }
}

export function Sign3D(p: SignProps) {
  const { invalidate } = useThree()
  const { cv, tex, mat } = useMemo(() => {
    const cv = document.createElement('canvas'); cv.width = PX; cv.height = Math.round((PX * p.h) / p.w)
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })
    return { cv, tex, mat }
  }, [p.w, p.h])
  const img = useMemo(() => { if (!p.logo) return null; const i = new Image(); i.src = p.logo; return i }, [p.logo])
  useEffect(() => {
    const redraw = () => { draw(cv, p, img); tex.needsUpdate = true; invalidate() }
    redraw()
    if (img && !img.complete) { img.addEventListener('load', redraw); return () => img.removeEventListener('load', redraw) }
  }, [cv, tex, img, p.hot, p.bare, p.card, p.title, p.sub, invalidate]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { tex.dispose(); mat.dispose() }, [tex, mat])
  const ev = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); p.onOver?.(); document.body.style.cursor = 'pointer' },
    onPointerOut: () => { p.onOut?.(); document.body.style.cursor = '' },
    onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (e.delta <= 6) p.onOpen?.() },
  }
  return <mesh name={p.name} position={p.position} rotation={p.rotation} material={mat} renderOrder={2} {...ev}><planeGeometry args={[p.w, p.h]} /></mesh>
}

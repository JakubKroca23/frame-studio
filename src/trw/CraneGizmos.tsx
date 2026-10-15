import { useSceneFilters } from '../view/sceneFilters'
import { Billboard, Html, Text } from '@react-three/drei'
import type { ComponentProps } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'

const rad = Math.PI / 180

// Lines as thin boxes with shared geometry + cached materials: re-rendering them while dragging only
// updates a transform (drei <Line> recompiled its LineMaterial shader on every prop update → stutter).
const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
const barMats = new Map<string, THREE.MeshBasicMaterial>()
const barMat = (color: string, opacity: number) => {
  const k = `${color}|${opacity}`
  let m = barMats.get(k)
  if (!m) barMats.set(k, (m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 })))
  return m
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0)
export function Bar({ from, to, width, color, opacity = 1 }: { from: [number, number, number]; to: [number, number, number]; width: number; color: string; opacity?: number }) {
  _a.set(...from)
  _b.set(...to).sub(_a)
  const len = Math.max(_b.length(), 1e-6)
  const q = new THREE.Quaternion().setFromUnitVectors(_up, _b.normalize())
  return <mesh geometry={unitBox} material={barMat(color, opacity)} position={from} quaternion={q} scale={[width, len, width]} raycast={() => null} />
}
const fmt = (n: number, d = 0) => n.toLocaleString('cs-CZ', { maximumFractionDigits: d, minimumFractionDigits: d })

/**
 * Drag helper: intersects the pointer ray with the local XY plane of `obj` as it was at pointerdown and returns the
 * hit in that frozen frame. Freezing matters: the handle usually moves with the value it edits (telescope arrow rides
 * on the boom tip), so re-reading its live matrix each move fed the result back into the projection → flicker.
 * Updates are coalesced to one per animation frame.
 */
export function useLocalPlaneDrag(onLocal: (p: THREE.Vector3) => void) {
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null
  const st = useRef<{ inv: THREE.Matrix4; plane: THREE.Plane; target: Element | null; raf: number; last: THREE.Vector3 | null } | null>(null)
  const cb = useRef(onLocal)
  cb.current = onLocal
  const hit = (e: ThreeEvent<PointerEvent>) => {
    const s = st.current!, h = new THREE.Vector3()
    return e.ray.intersectPlane(s.plane, h) ? h.applyMatrix4(s.inv) : null
  }
  const flush = () => { const s = st.current; if (!s) return; s.raf = 0; if (s.last) { const p = s.last; s.last = null; cb.current(p) } }
  return {
    start(e: ThreeEvent<PointerEvent>, obj: THREE.Object3D) {
      e.stopPropagation()
      obj.updateWorldMatrix(true, false)
      const m = obj.matrixWorld.clone()
      const n = new THREE.Vector3(0, 0, 1).transformDirection(m), o = new THREE.Vector3().setFromMatrixPosition(m)
      const target = (e.target as unknown as Element | null) ?? null
      st.current = { inv: m.clone().invert(), plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, o), target, raf: 0, last: null }
      if (controls) controls.enabled = false
      target?.setPointerCapture?.(e.pointerId)
      const p = hit(e)
      if (p) cb.current(p)
    },
    move(e: ThreeEvent<PointerEvent>) {
      const s = st.current
      if (!s) return
      e.stopPropagation()
      const p = hit(e)
      if (!p) return
      s.last = p
      if (!s.raf) s.raf = requestAnimationFrame(flush)
    },
    end(e: ThreeEvent<PointerEvent>) {
      const s = st.current
      if (!s) return
      if (s.raf) cancelAnimationFrame(s.raf)
      if (s.last) cb.current(s.last)
      st.current = null
      if (controls) controls.enabled = true
      s.target?.releasePointerCapture?.(e.pointerId)
    },
  }
}

export interface ProtractorProps {
  /** Ring lies in local XY; angle φ = atan2(y, x). Displayed value = φ − offset. */
  offset: number
  value: number
  limits: [number, number]
  radius: number
  label: string
  onAngle: (displayDeg: number) => void
}

/** Circular protractor: ticks every 5°, labels every 10°, limits shaded, needle + live value; the angle changes only by dragging the arrow handle. */
function ProtractorInner({ offset, value, limits, radius: R }: Omit<ProtractorProps, 'label' | 'onAngle'> & Partial<ProtractorProps>) {
  const ref = useRef<THREE.Group>(null)
    const ticks = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let d = 0; d < 360; d += 5) {
      const a = (d + offset) * rad, l = d % 10 === 0 ? 0.12 : 0.06
      pts.push(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0), new THREE.Vector3(Math.cos(a) * (R - l * R), Math.sin(a) * (R - l * R), 0))
    }
    return pts
  }, [R, offset])
  const span = limits[1] - limits[0]
  const a = (value + offset) * rad
  const labels = []
  for (let d = -180; d < 180; d += 30) {
    const ang = (d + offset) * rad
    labels.push(
      <BText key={d} position={[Math.cos(ang) * R * 0.8, Math.sin(ang) * R * 0.8, 0]} fontSize={R * 0.06} color="#e6edf5" anchorX="center" anchorY="middle" outlineWidth={R * 0.006} outlineColor="#141a24">
        {`${d}°`}
      </BText>,
    )
  }
  return (
    <group ref={ref} name="crane-protractor">
      {/* allowed range (light), forbidden range (red) */}
      {span < 360 && (
        <mesh position={[0, 0, -0.002]}>
          <ringGeometry args={[R * 0.88, R, 64, 1, (limits[1] + offset) * rad, (360 - span) * rad]} />
          <meshBasicMaterial color="#5d6873" transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
      <mesh position={[0, 0, -0.003]}>
        <ringGeometry args={[R * 0.88, R, 64, 1, (limits[0] + offset) * rad, Math.min(360, span) * rad]} />
        <meshBasicMaterial color="#3ee6c4" transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <lineSegments>
        <bufferGeometry onUpdate={(g) => g.setFromPoints(ticks)} />
        <lineBasicMaterial color="#c9d6e3" />
      </lineSegments>
      <Bar from={[0, 0, 0]} to={[Math.cos(offset * rad) * R, Math.sin(offset * rad) * R, 0]} width={R * 0.008} color="#c9d6e3" opacity={0.6} />
      <Bar from={[0, 0, 0]} to={[Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86, 0]} width={R * 0.012} color="#E53935" opacity={0.7} />
      {labels}
      {span < 360 && ([0, 1] as const).map((i) => {
        const ang = (limits[i] + offset) * rad
        return (
          <group key={i}>
            <Bar from={[Math.cos(ang) * R * 0.84, Math.sin(ang) * R * 0.84, 0]} to={[Math.cos(ang) * R * 1.04, Math.sin(ang) * R * 1.04, 0]} width={R * 0.02} color="#3ee6c4" />
            <BText position={[Math.cos(ang) * R * 1.2, Math.sin(ang) * R * 1.2, 0]} fontSize={R * 0.09} color="#3ee6c4" anchorX="center" anchorY="middle" outlineWidth={R * 0.008} outlineColor="#141a24">{`${i ? 'max' : 'min'} ${fmt(limits[i], 0)}°`}</BText>
          </group>
        )
      })}
    </group>
  )
}

const arrowShape = (() => {
  const sh = new THREE.Shape()
  sh.moveTo(0, 0.5); sh.lineTo(0.42, 0); sh.lineTo(0.16, 0); sh.lineTo(0.16, -0.5); sh.lineTo(-0.16, -0.5); sh.lineTo(-0.16, 0); sh.lineTo(-0.42, 0); sh.closePath()
  return new THREE.ShapeGeometry(sh)
})()
const hitDisc = new THREE.CircleGeometry(0.75, 24)
/** Straight double-headed arrow along local X (length 2.4). */
const dblShape = (w: number, hw: number, hl: number, L: number) => {
  const sh = new THREE.Shape()
  sh.moveTo(-L, 0); sh.lineTo(-L + hl, hw); sh.lineTo(-L + hl, w); sh.lineTo(L - hl, w); sh.lineTo(L - hl, hw); sh.lineTo(L, 0)
  sh.lineTo(L - hl, -hw); sh.lineTo(L - hl, -w); sh.lineTo(-L + hl, -w); sh.lineTo(-L + hl, -hw); sh.closePath()
  return new THREE.ShapeGeometry(sh)
}
const dblArrow = dblShape(0.12, 0.38, 0.45, 1.2)
const dblHit = new THREE.PlaneGeometry(2.8, 1.1)
const dblOutline = dblShape(0.2, 0.5, 0.55, 1.32)
const setCursor = (c: string) => { document.body.style.cursor = c }

/** Big arrow (points along local +Y) with a large invisible touch hit area, hover highlight and grab cursor. */
export function ArrowHandle({ size, name, label, onDown, onMove, onUp, onTap, geom = arrowShape, hit = hitDisc, outline = 1.25 }: { geom?: THREE.BufferGeometry; hit?: THREE.BufferGeometry; outline?: number; size: number; name: string; label: string; onDown: (e: ThreeEvent<PointerEvent>) => void; onMove: (e: ThreeEvent<PointerEvent>) => void; onUp: (e: ThreeEvent<PointerEvent>) => void; onTap?: () => void }) {
  const [hover, setHover] = useState(false)
  const [active, setActive] = useState(false)
  const down0 = useRef<{ x: number; y: number } | null>(null)
  const color = active ? '#ff7a70' : hover ? '#ff4a4a' : '#FF1A1A'
  return (
    <group scale={size}>
      <mesh geometry={geom} raycast={() => null} renderOrder={999}>
        <meshBasicMaterial color={color} side={THREE.DoubleSide} depthTest={false} transparent opacity={hover || active ? 1 : 0.55} />
      </mesh>
      <mesh geometry={outline === 1.25 ? geom : outlineOf(geom)} scale={outline === 1.25 ? 1.25 : 1} position={[0, 0, -0.01]} raycast={() => null} renderOrder={998}>
        <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} depthTest={false} transparent opacity={hover || active ? 0.9 : 0.35} />
      </mesh>
      <mesh name={name} geometry={hit} userData={{ label }}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); setCursor('grab') }}
        onPointerOut={() => { if (active) return; setHover(false); setCursor('') }}
        onPointerDown={(e) => { down0.current = { x: e.clientX, y: e.clientY }; setActive(true); setCursor('grabbing'); onDown(e) }}
        onPointerMove={onMove}
        onPointerUp={(e) => { const d = down0.current; down0.current = null; setActive(false); setCursor(hover ? 'grab' : ''); onUp(e); if (d && onTap && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) onTap() }}
        onClick={(e) => e.stopPropagation()}>
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} depthTest={false} />
      </mesh>
    </group>
  )
}

/** One double-headed arrow along local +X at the boom tip: drag along the axis (either way) = continuous extension. */
function TelescopeArrowsInner({ value, max, size = 0.75, k, onValue }: { value: number; max: number; size?: number; k?: number; onValue: (m: number) => void }) {
  const showLabel = useSceneFilters((s) => s.controlLabels)
  const ref = useRef<THREE.Group>(null)
  const start = useRef<{ x: number; v: number } | null>(null)
  const clamp = (m: number) => Math.min(max, Math.max(0, m))
  const drag = useLocalPlaneDrag((p) => {
    if (!start.current) start.current = { x: p.x, v: value }
    else onValue(clamp(start.current.v + p.x - start.current.x))
  })
  const begin = (e: ThreeEvent<PointerEvent>) => { start.current = null; drag.start(e, ref.current!) }
  const finish = (e: ThreeEvent<PointerEvent>) => { start.current = null; drag.end(e) }
  return (
    <group ref={ref} name="crane-ext-arrows">
      <ScreenScale k={k ?? 0}>
      <ArrowHandle size={size} name="crane-ext-arrow" label="Výsuv: táhněte šipkou" geom={dblArrow} hit={dblHit} outline={1} onDown={begin} onMove={drag.move} onUp={finish} />
      {showLabel ? (
        <Html pointerEvents="none" style={{ pointerEvents: 'none' }} position={[0, size * 1.05, 0]} center zIndexRange={[20, 10]}>
          <div className="crane-gizmo-label">Výsuv: {fmt(value * 1000)} mm / {fmt(max * 1000)} mm</div>
        </Html>
      ) : null}
      </ScreenScale>
    </group>
  )
}

/** Linear mm scale along local +X from 0 to `max` [m] (read-only; the value is changed by the TelescopeArrows at the tip). */
function LinearScaleInner({ value, max }: { value: number; max: number }) {
  const ref = useRef<THREE.Group>(null)
  const ticks = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let mm = 0; mm <= max * 1000 + 1; mm += 100) {
      const l = mm % 1000 === 0 ? 0.22 : mm % 500 === 0 ? 0.14 : 0.08
      pts.push(new THREE.Vector3(mm / 1000, 0, 0), new THREE.Vector3(mm / 1000, l, 0))
    }
    return pts
  }, [max])
  const labels = []
  for (let m = 2; m < max - 0.5; m += 2) labels.push(<BText key={m} position={[m, 0.38, 0]} fontSize={0.14} color="#e6edf5" outlineWidth={0.012} outlineColor="#141a24">{`${m * 1000}`}</BText>)
  return (
    <group ref={ref} name="crane-ext-scale">
      <mesh position={[value / 2, 0.11, -0.002]}>
        <planeGeometry args={[Math.max(value, 0.001), 0.22]} />
        <meshBasicMaterial color="#ff1a1a" transparent opacity={0.25} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <Bar from={[0, 0, 0]} to={[max, 0, 0]} width={0.06} color="#3ee6c4" opacity={0.8} />
      <BText position={[0, -0.25, 0]} fontSize={0.16} color="#3ee6c4" outlineWidth={0.012} outlineColor="#141a24">min 0</BText>
      <BText position={[max, -0.25, 0]} fontSize={0.16} color="#3ee6c4" outlineWidth={0.012} outlineColor="#141a24">{`max ${fmt(max * 1000)} mm`}</BText>
      <lineSegments>
        <bufferGeometry onUpdate={(g) => g.setFromPoints(ticks)} />
        <lineBasicMaterial color="#c9d6e3" />
      </lineSegments>
      <Bar from={[value, -0.1, 0]} to={[value, 0.45, 0]} width={0.04} color="#E53935" />
      {labels}
    </group>
  )
}

/** Live dimension lines in world mm: ground → tip height, column axis → tip projection, label at tip. */
function CraneDimensionsInner({ column, tip, height, reach, loadText }: { column: [number, number]; tip: [number, number]; height: number; reach: number; loadText: string }) {
  const [cx, cz] = column, [tx, tz] = tip, y = height * 1000, g = 15
  return (
    <group name="crane-dimensions">
      <Bar from={[tx, g, tz]} to={[tx, y, tz]} width={30} color="#0a7c3a" />
      <Bar from={[tx - 150, g, tz]} to={[tx + 150, g, tz]} width={30} color="#0a7c3a" />
      <Bar from={[cx, g, cz]} to={[tx, g, tz]} width={30} color="#7a3db8" />
      <Bar from={[cx, g, cz]} to={[cx, y, cz]} width={14} color="#7a3db8" opacity={0.45} />
      <Bar from={[cx, y, cz]} to={[tx, y, tz]} width={14} color="#7a3db8" opacity={0.45} />
      <Html pointerEvents="none" style={{ pointerEvents: "none" }} position={[tx, y / 2, tz]} center zIndexRange={[19, 10]}>
        <div className="crane-dim-label crane-dim-h">↕ {fmt(height, 2)} m</div>
      </Html>
      <Html pointerEvents="none" style={{ pointerEvents: "none" }} position={[(cx + tx) / 2, g, (cz + tz) / 2]} center zIndexRange={[19, 10]}>
        <div className="crane-dim-label crane-dim-r">↔ {fmt(reach, 2)} m</div>
      </Html>
      <Html pointerEvents="none" style={{ pointerEvents: "none" }} position={[tx, y + 1300, tz]} center zIndexRange={[19, 10]}>
        <div className="crane-dim-label crane-dim-load">{loadText}</div>
      </Html>
    </group>
  )
}

/** Keeps children at a constant on-screen size: local scale = camera distance · k / parent world scale. */
export function ScreenScale({ k, children }: { k: number; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  const v = useMemo(() => new THREE.Vector3(), []), ws = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }) => {
    const g = ref.current
    if (!g || !g.parent || !k) return
    g.getWorldPosition(v)
    g.parent.getWorldScale(ws)
    const d = (camera as THREE.OrthographicCamera).isOrthographicCamera ? 1000 / (camera as THREE.OrthographicCamera).zoom : v.distanceTo(camera.position)
    g.scale.setScalar(Math.max(1e-6, (d * k) / ws.x))
  })
  return <group ref={ref}>{children}</group>
}

/** Curved double-headed arrow on the unit circle from −S to +S (heads at both ends). */
function arcDoubleGeom(S: number, w: number, head: number, hl = 0.32) {
  const sh = new THREE.Shape(), n = 24, e = S - hl
  sh.moveTo(Math.cos(-S), Math.sin(-S))
  sh.lineTo(Math.cos(-e) * (1 + head), Math.sin(-e) * (1 + head))
  for (let i = 0; i <= n; i++) { const t = -e + (2 * e * i) / n; sh.lineTo(Math.cos(t) * (1 + w), Math.sin(t) * (1 + w)) }
  sh.lineTo(Math.cos(e) * (1 + head), Math.sin(e) * (1 + head))
  sh.lineTo(Math.cos(S), Math.sin(S))
  sh.lineTo(Math.cos(e) * (1 - head), Math.sin(e) * (1 - head))
  for (let i = n; i >= 0; i--) { const t = -e + (2 * e * i) / n; sh.lineTo(Math.cos(t) * (1 - w), Math.sin(t) * (1 - w)) }
  sh.lineTo(Math.cos(-e) * (1 - head), Math.sin(-e) * (1 - head))
  sh.closePath()
  return new THREE.ShapeGeometry(sh)
}
const ARC_S = 0.9
const arcDbl = arcDoubleGeom(ARC_S, 0.12, 0.3), arcDblO = arcDoubleGeom(ARC_S + 0.06, 0.2, 0.4, 0.36)
const arcDblHit = new THREE.RingGeometry(0.6, 1.45, 16, 1, -ARC_S - 0.1, 2 * ARC_S + 0.2)
const outlines = new Map<THREE.BufferGeometry, THREE.BufferGeometry>([[arcDbl, arcDblO], [dblArrow, dblOutline]])
function outlineOf(g: THREE.BufferGeometry) { return outlines.get(g) ?? g }

/**
 * Always-visible joint handle: two curved arrows on a circle pointing away from each other (↺ ↻) around the
 * current angle; dragging either rotates the joint by the pointer's angular delta, clamped to the limits.
 * Lies in local XY like the Protractor (φ = atan2(y, x), value = φ − offset). Constant screen size.
 */
function JointArcHandlesInner({ id, offset, value, limits, label, k = 0.055, onAngle, onGrab }: { id: string; offset: number; value: number; limits: [number, number]; label: string; k?: number; onAngle: (deg: number) => void; onGrab?: () => void }) {
  const showLabel = useSceneFilters((s) => s.controlLabels)
  const ref = useRef<THREE.Group>(null)
  const start = useRef<{ phi: number; v: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const clamp = (d: number) => Math.min(limits[1], Math.max(limits[0], d))
  const drag = useLocalPlaneDrag((p) => {
    const phi = Math.atan2(p.y, p.x) / rad
    if (!start.current) { start.current = { phi, v: value }; return }
    let dd = phi - start.current.phi
    dd = ((dd + 540) % 360) - 180
    start.current.phi = phi
    start.current.v = clamp(start.current.v + dd)
    onAngle(start.current.v)
  })
  const begin = (e: ThreeEvent<PointerEvent>) => { start.current = null; setDragging(true); onGrab?.(); drag.start(e, ref.current!) }
  const finish = (e: ThreeEvent<PointerEvent>) => { start.current = null; setDragging(false); drag.end(e) }
  const a = (value + offset) * rad
  return (
    <group ref={ref} name={`crane-arc-${id}`}>
      <ScreenScale k={k}>
        <group rotation={[0, 0, a]}>
          <ArrowHandle size={1} name={`crane-arc-${id}-h`} label={`${label}: táhněte šipkou oběma směry`} geom={arcDbl} hit={arcDblHit} outline={1} onDown={begin} onMove={drag.move} onUp={finish} />
          {showLabel ? (
            <Html pointerEvents="none" style={{ pointerEvents: 'none' }} position={[-2.1, 0, 0]} center zIndexRange={[20, 10]}>
              <div className={dragging ? 'crane-gizmo-label is-active' : 'crane-gizmo-label'}>{label}: {fmt(value, 1)}°</div>
            </Html>
          ) : null}
        </group>
      </ScreenScale>
    </group>
  )
}

/** Text that always faces the camera (never mirrored when the scale is seen from the other side). */
function BText({ position, ...rest }: ComponentProps<typeof Text>) {
  return <Billboard position={position}><Text {...rest} /></Billboard>
}

/* Scene filters: "Ovládání" = arrows + protractors + extension scales (functional), "Popisky ovládání" = their value
   texts only (the controls keep working), "Kóty" = height / reach dimension lines. */
export function Protractor(props: ComponentProps<typeof ProtractorInner>) {
  const on = useSceneFilters((s) => s.controls)
  return on ? <ProtractorInner {...props} /> : null
}
export function LinearScale(props: ComponentProps<typeof LinearScaleInner>) {
  const on = useSceneFilters((s) => s.controls)
  return on ? <LinearScaleInner {...props} /> : null
}
export function CraneDimensions(props: ComponentProps<typeof CraneDimensionsInner>) {
  const on = useSceneFilters((s) => s.dims)
  return on ? <CraneDimensionsInner {...props} /> : null
}
export function JointArcHandles(props: ComponentProps<typeof JointArcHandlesInner>) {
  const on = useSceneFilters((s) => s.controls)
  return on ? <JointArcHandlesInner {...props} /> : null
}
export function TelescopeArrows(props: ComponentProps<typeof TelescopeArrowsInner>) {
  const on = useSceneFilters((s) => s.controls)
  return on ? <TelescopeArrowsInner {...props} /> : null
}

import { Html, Text } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
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

/** Drag helper: intersects the pointer ray with the local XY plane of `obj`, returns the hit in obj-local coords. */
export function useLocalPlaneDrag(onLocal: (p: THREE.Vector3) => void) {
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null
  const active = useRef<THREE.Object3D | null>(null)
  const toLocal = (e: ThreeEvent<PointerEvent>, obj: THREE.Object3D) => {
    obj.updateWorldMatrix(true, false)
    const n = new THREE.Vector3(0, 0, 1).transformDirection(obj.matrixWorld)
    const o = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld)
    const hit = new THREE.Vector3()
    if (!e.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(n, o), hit)) return null
    return obj.worldToLocal(hit)
  }
  return {
    start(e: ThreeEvent<PointerEvent>, obj: THREE.Object3D) {
      e.stopPropagation()
      active.current = obj
      if (controls) controls.enabled = false
      ;(e.target as unknown as Element | null)?.setPointerCapture?.(e.pointerId)
      const p = toLocal(e, obj)
      if (p) onLocal(p)
    },
    move(e: ThreeEvent<PointerEvent>) {
      if (!active.current) return
      e.stopPropagation()
      const p = toLocal(e, active.current)
      if (p) onLocal(p)
    },
    end(e: ThreeEvent<PointerEvent>) {
      if (!active.current) return
      active.current = null
      if (controls) controls.enabled = true
      ;(e.target as unknown as Element | null)?.releasePointerCapture?.(e.pointerId)
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

/** Circular protractor: ticks every 5°, labels every 10°, limits shaded, needle + live value; drag around it. */
export function Protractor({ offset, value, limits, radius: R, label, onAngle }: ProtractorProps) {
  const ref = useRef<THREE.Group>(null)
  const drag = useLocalPlaneDrag((p) => onAngle(Math.atan2(p.y, p.x) / rad - offset))
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
  for (let d = -180; d < 180; d += 10) {
    const ang = (d + offset) * rad
    labels.push(
      <Text key={d} position={[Math.cos(ang) * R * 0.8, Math.sin(ang) * R * 0.8, 0]} fontSize={R * 0.06} color="#10233f" anchorX="center" anchorY="middle" outlineWidth={R * 0.006} outlineColor="#fff">
        {`${d}°`}
      </Text>,
    )
  }
  return (
    <group ref={ref} name="crane-protractor">
      {/* allowed range (light), forbidden range (red) */}
      {span < 360 && (
        <mesh position={[0, 0, -0.002]}>
          <ringGeometry args={[R * 0.88, R, 64, 1, (limits[1] + offset) * rad, (360 - span) * rad]} />
          <meshBasicMaterial color="#d33" transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
      <mesh position={[0, 0, -0.003]}>
        <ringGeometry args={[R * 0.88, R, 64, 1, (limits[0] + offset) * rad, Math.min(360, span) * rad]} />
        <meshBasicMaterial color="#3a8de0" transparent opacity={0.22} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* drag hit area */}
      <mesh
        name="crane-protractor-hit"
        onPointerDown={(e) => drag.start(e, ref.current!)}
        onPointerMove={drag.move}
        onPointerUp={drag.end} onClick={(e) => e.stopPropagation()}
      >
        <ringGeometry args={[R * 0.3, R * 1.15, 64]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <lineSegments>
        <bufferGeometry onUpdate={(g) => g.setFromPoints(ticks)} />
        <lineBasicMaterial color="#10233f" />
      </lineSegments>
      <Bar from={[0, 0, 0]} to={[Math.cos(offset * rad) * R, Math.sin(offset * rad) * R, 0]} width={R * 0.008} color="#10233f" opacity={0.6} />
      <Bar from={[0, 0, 0]} to={[Math.cos(a) * R * 1.08, Math.sin(a) * R * 1.08, 0]} width={R * 0.025} color="#f2a900" />
      {labels}
      <Html pointerEvents="none" style={{ pointerEvents: "none" }} position={[Math.cos(a) * R * 1.2, Math.sin(a) * R * 1.2, 0]} center zIndexRange={[20, 10]}>
        <div className="crane-gizmo-label">{label}: {fmt(value, 1)}°</div>
      </Html>
    </group>
  )
}

/** Linear mm scale along local +X from 0 to `max` [m]; drag sets value. */
export function LinearScale({ value, max, onValue }: { value: number; max: number; onValue: (m: number) => void }) {
  const ref = useRef<THREE.Group>(null)
  const drag = useLocalPlaneDrag((p) => onValue(p.x))
  const ticks = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let mm = 0; mm <= max * 1000 + 1; mm += 100) {
      const l = mm % 1000 === 0 ? 0.22 : mm % 500 === 0 ? 0.14 : 0.08
      pts.push(new THREE.Vector3(mm / 1000, 0, 0), new THREE.Vector3(mm / 1000, l, 0))
    }
    return pts
  }, [max])
  const labels = []
  for (let m = 0; m <= max + 1e-6; m += 1) labels.push(<Text key={m} position={[m, 0.38, 0]} fontSize={0.14} color="#10233f" outlineWidth={0.012} outlineColor="#fff">{`${m * 1000}`}</Text>)
  return (
    <group ref={ref} name="crane-ext-scale">
      <mesh position={[max / 2, 0.15, 0]} onPointerDown={(e) => drag.start(e, ref.current!)} onPointerMove={drag.move} onPointerUp={drag.end} onClick={(e) => e.stopPropagation()}>
        <planeGeometry args={[max + 1, 1]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[value / 2, 0.11, -0.002]}>
        <planeGeometry args={[Math.max(value, 0.001), 0.22]} />
        <meshBasicMaterial color="#3a8de0" transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <Bar from={[0, 0, 0]} to={[max, 0, 0]} width={0.02} color="#10233f" />
      <lineSegments>
        <bufferGeometry onUpdate={(g) => g.setFromPoints(ticks)} />
        <lineBasicMaterial color="#10233f" />
      </lineSegments>
      <Bar from={[value, -0.1, 0]} to={[value, 0.45, 0]} width={0.04} color="#f2a900" />
      {labels}
      <Html pointerEvents="none" style={{ pointerEvents: "none" }} position={[value, -0.35, 0]} center zIndexRange={[20, 10]}>
        <div className="crane-gizmo-label">Výsuv: {fmt(value * 1000)} mm</div>
      </Html>
    </group>
  )
}

/** Live dimension lines in world mm: ground → tip height, column axis → tip projection, label at tip. */
export function CraneDimensions({ column, tip, height, reach, loadText }: { column: [number, number]; tip: [number, number]; height: number; reach: number; loadText: string }) {
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
      <Html pointerEvents="none" style={{ pointerEvents: "none" }} position={[tx, y + 450, tz]} center zIndexRange={[19, 10]}>
        <div className="crane-dim-label crane-dim-load">{loadText}</div>
      </Html>
    </group>
  )
}

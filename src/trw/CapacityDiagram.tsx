import { Html, Line } from '@react-three/drei'
import { useMemo } from 'react'
import { useSceneFilters } from '../view/sceneFilters'
import type { CapacityInfo } from './capacityDiagram'
import { STATUS_COLOR, type SectorStatus } from './stabilitySectors'

const Y = 12
const fmtKg = (kg: number) => `${Math.round(kg).toLocaleString('cs-CZ')} kg`
const fmtM = (mm: number) => `${(mm / 1000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} m`
/** trw slew: 0° forward (−X), clockwise from above, 90° = right (+Z). */
const at = (cx: number, r: number, deg: number): [number, number, number] => [cx - r * Math.cos((deg * Math.PI) / 180), Y, r * Math.sin((deg * Math.PI) / 180)]

/**
 * CraneWIN-style diagram on the ground around the crane column: one ring per load-chart point (radius = outreach,
 * label = capacity), every ring coloured per slew degree by the trw stability status; current boom reach + slew as a
 * radial marker; trw design case as a dashed ring. Hidden with the "Stabilita" scene filter.
 */
export function CapacityDiagram({ craneX, info, status, slewDeg, reachMm }: { craneX: number; info: CapacityInfo; status: SectorStatus[]; slewDeg: number; reachMm: number | null }) {
  const on = useSceneFilters((s) => s.stability)
  const rings = useMemo(() => info.rings.map((ring) => {
    const pts: [number, number, number][] = [], cols: [number, number, number][] = []
    for (let d = 0; d <= 360; d += 2) {
      pts.push(at(craneX, ring.rMm, d))
      const c = STATUS_COLOR[status[d % 360] ?? 'unknown']
      cols.push([parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255])
    }
    return { ring, pts, cols }
  }), [info.rings, status, craneX])
  if (!on) return null
  const dr = info.design?.radiusM != null ? info.design.radiusM * 1000 : null
  const designPts = dr ? Array.from({ length: 121 }, (_, i) => at(craneX, dr, i * 3)) : null
  return (
    <group name="cranewin-diagram">
      {rings.map(({ ring, pts, cols }) => (
        <group key={ring.rMm}>
          <Line points={pts} vertexColors={cols} lineWidth={ring.manual ? 1.5 : 2.5} dashed={ring.manual} dashSize={250} gapSize={150} />
          <Html position={at(craneX, ring.rMm, 135)} center style={{ pointerEvents: 'none' }}>
            <div className="cap-ring-label sf-cap">{fmtM(ring.rMm)} · {fmtKg(ring.kg)}{ring.manual ? ' (ruční)' : ''}</div>
          </Html>
        </group>
      ))}
      {designPts ? (
        <>
          <Line points={designPts} color="#ffffff" lineWidth={1.5} dashed dashSize={120} gapSize={120} />
          <Html position={at(craneX, dr!, 45)} center style={{ pointerEvents: 'none' }}>
            <div className="cap-ring-label is-design sf-cap">trw: {info.design!.hookKg != null ? fmtKg(info.design!.hookKg) : '? kg'} @ {fmtM(dr!)}</div>
          </Html>
        </>
      ) : null}
      {reachMm != null ? (
        <>
          <Line points={[at(craneX, 0, slewDeg), at(craneX, reachMm, slewDeg)]} color="#3ee6c4" lineWidth={3} />
          <mesh position={at(craneX, reachMm, slewDeg)}><cylinderGeometry args={[110, 110, 20, 20]} /><meshBasicMaterial color="#3ee6c4" /></mesh>
          <Html position={at(craneX, reachMm + 600, slewDeg)} center style={{ pointerEvents: 'none' }}>
            <div className="cap-ring-label is-now sf-cap">
              {fmtM(reachMm)} · {info.atReach ? fmtKg(info.atReach.kg) : 'nosnost n/a'}
              {info.atSlew?.factor != null ? ` · k=${info.atSlew.factor.toFixed(2)}` : ''}
            </div>
          </Html>
        </>
      ) : null}
    </group>
  )
}

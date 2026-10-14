import { Html } from '@react-three/drei'
import type { TrwMarkers as Markers } from './trwConfig'
import { CraneModel, craneModelFor, type CranePose } from './CraneModel'
import { CraneArticulated } from './CraneArticulated'
import { parseX142Variant, type CraneJoints } from './craneKinematics'

/** Simple markers for the crane column and outrigger legs (X rearward from axle 1, Y up, Z lateral). */
export function TrwMarkers({ markers, frameTop, slewDeg = 0, cranePose = 'folded', craneJoints, onCraneJoints }: { markers: Markers; frameTop: number; slewDeg?: number; cranePose?: CranePose; craneJoints?: CraneJoints; onCraneJoints?: (j: CraneJoints) => void }) {
  const craneModel = craneModelFor(markers.crane?.name)
  const craneBox = markers.crane ? (
    <mesh position={[markers.crane.x, frameTop + 900, 0]}>
      <boxGeometry args={[350, 1800, 350]} />
      <meshStandardMaterial color="#e0a019" transparent opacity={0.75} />
    </mesh>
  ) : null
  return (
    <group name="trw-markers">
      {markers.crane && craneModel ? (
        cranePose === 'unfolded' && craneJoints && onCraneJoints ? (
          <CraneArticulated x={markers.crane.x} frameTop={frameTop} joints={craneJoints} variant={parseX142Variant(markers.crane.name)} onJoints={onCraneJoints} fallback={craneBox} />
        ) : (
          <CraneModel file={craneModel.file} x={markers.crane.x} frameTop={frameTop} slewDeg={slewDeg} fallback={craneBox} />
        )
      ) : (
        craneBox
      )}
      {markers.outriggers.map((leg) => {
        const z = ((leg.side === 'left' ? -1 : 1) * (leg.spread || 2500)) / 2
        return (
          <group key={leg.side}>
            <mesh position={[leg.x, frameTop - 60, z / 2]}>
              <boxGeometry args={[140, 120, Math.abs(z)]} />
              <meshStandardMaterial color="#c24e28" transparent opacity={0.8} />
            </mesh>
            <mesh position={[leg.x, frameTop / 2, z]}>
              <cylinderGeometry args={[60, 60, frameTop, 16]} />
              <meshStandardMaterial color="#c24e28" />
            </mesh>
            <mesh position={[leg.x, 15, z]}>
              <cylinderGeometry args={[220, 220, 30, 24]} />
              <meshStandardMaterial color="#c24e28" />
            </mesh>
          </group>
        )
      })}
      {(markers.payloads ?? []).map((p, i) => {
        if (p.x == null) return null
        const len = p.xFrom != null && p.xTo != null && p.xTo > p.xFrom ? p.xTo - p.xFrom : 400
        const cx = p.xFrom != null && p.xTo != null ? (p.xFrom + p.xTo) / 2 : p.x
        return (
          <group key={`payload-${i}`} name={`trw-payload-${i}`}>
            <mesh position={[cx, frameTop + 200, 0]}>
              <boxGeometry args={[len, 400, 1800]} />
              <meshStandardMaterial color="#3a7bd5" transparent opacity={0.35} />
            </mesh>
            <mesh position={[p.x, frameTop + 450, 0]}>
              <sphereGeometry args={[90, 16, 12]} />
              <meshStandardMaterial color="#1d4e9e" />
            </mesh>
            <Label position={[p.x, frameTop + 800, 0]} text={`${p.name}${p.massKg != null ? ` · ${Math.round(p.massKg)} kg` : ' · ? kg'}`} />
          </group>
        )
      })}
    </group>
  )
}

function Label({ position, text }: { position: [number, number, number]; text: string }) {
  return (
    <Html position={position} center style={{ pointerEvents: 'none' }}>
      <div style={{ background: 'rgba(29,78,158,0.85)', color: '#fff', font: '11px sans-serif', padding: '2px 6px', borderRadius: 3, whiteSpace: 'nowrap' }}>{text}</div>
    </Html>
  )
}

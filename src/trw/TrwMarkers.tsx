import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { OUTRIGGER_RATE, outriggerStow, stepOutrigger } from './outriggerStow'
import { LeaderLabel } from '../view/LeaderLabel'
import type { TrwMarkers as Markers } from './trwConfig'
import { CraneModel, craneModelFor, type CranePose } from './CraneModel'
import { CraneArticulated } from './CraneArticulated'
import { craneVariantMatch, type CraneJoints } from './craneKinematics'

/** Simple markers for the crane column and outrigger legs (X rearward from axle 1, Y up, Z lateral). */
export function TrwMarkers({ markers, frameTop, slewDeg = 0, cranePose = 'folded', craneJoints, onCraneJoints }: { markers: Markers; frameTop: number; slewDeg?: number; cranePose?: CranePose; craneJoints?: CraneJoints; onCraneJoints?: (j: CraneJoints) => void }) {
  const craneModel = craneModelFor(markers.crane?.name)
  const stabSpread = markers.outriggers.length ? Math.max(...markers.outriggers.map((o) => o.spread || 0)) || null : null
  const meshStabs = !!craneModel?.def.stab
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
          <CraneArticulated x={markers.crane.x} frameTop={frameTop} joints={craneJoints} variant={craneVariantMatch(markers.crane.name)!.variant} onJoints={onCraneJoints} fallback={craneBox} stabSpread={stabSpread} stabHalfSpan={markers.craneStab?.halfSpanMm ?? null} stabStrokeMm={markers.craneStab?.strokeMm ?? null} />
        ) : !craneModel.def.foldedFile && craneModel.def.folded && onCraneJoints ? (
          // no separate folded mesh (408): articulated mesh in its measured transport pose
          <CraneArticulated x={markers.crane.x} frameTop={frameTop} joints={craneModel.def.folded} variant={craneVariantMatch(markers.crane.name)!.variant} onJoints={onCraneJoints} fallback={craneBox} stabSpread={stabSpread} stabHalfSpan={markers.craneStab?.halfSpanMm ?? null} stabStrokeMm={markers.craneStab?.strokeMm ?? null} />
        ) : (
          <CraneModel file={craneModel.file} x={markers.crane.x} frameTop={frameTop} slewDeg={slewDeg} fallback={craneBox} />
        )
      ) : (
        craneBox
      )}
      {(meshStabs ? [] : markers.outriggers).map((leg) => (
        <MarkerLeg key={leg.side} x={leg.x} side={leg.side} reach={leg.halfSpan ?? (leg.spread || 2500) / 2} frameTop={frameTop} />
      ))}
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
            <LeaderLabel position={[p.x, frameTop + 450, 0]} text={`${p.name}${p.massKg != null ? ` · ${Math.round(p.massKg)} kg` : ' · ? kg'}`} />
          </group>
        )
      })}
    </group>
  )
}

const legMat = new THREE.MeshStandardMaterial({ color: '#c24e28' })
const beamMat = new THREE.MeshStandardMaterial({ color: '#c24e28', transparent: true, opacity: 0.8 })
const unitBox = new THREE.BoxGeometry(1, 1, 1), unitCyl = new THREE.CylinderGeometry(1, 1, 1, 16), padGeo = new THREE.CylinderGeometry(220, 220, 30, 24)
/** Simple outrigger marker (beam + leg + pad) that moves like the hydraulics: sideways out, then down (outriggerStow). */
function MarkerLeg({ x, side, reach, frameTop }: { x: number; side: 'left' | 'right'; reach: number; frameTop: number }) {
  const dir = side === 'left' ? -1 : 1, top = frameTop - 120, stroke = Math.max(0, top - 30)
  const beam = useRef<THREE.Mesh>(null), legM = useRef<THREE.Mesh>(null), pad = useRef<THREE.Mesh>(null)
  const cur = useRef(outriggerStow.current ? { e: 0, d: 0 } : { e: reach, d: stroke })
  useFrame((_, dt) => {
    const c = cur.current
    stepOutrigger(c, { e: reach, d: stroke }, 1 - Math.exp(-dt * OUTRIGGER_RATE), 4)
    const e = Math.max(200, c.e), z = dir * e
    beam.current?.position.set(x, frameTop - 60, z / 2); beam.current?.scale.set(140, 120, e)
    const h = 120 + c.d
    legM.current?.position.set(x, top - c.d + h / 2, z); legM.current?.scale.set(60, h, 60)
    pad.current?.position.set(x, top - c.d - 15, z)
  })
  return (
    <group>
      <mesh ref={beam} geometry={unitBox} material={beamMat} />
      <mesh ref={legM} geometry={unitCyl} material={legMat} />
      <mesh ref={pad} geometry={padGeo} material={legMat} />
    </group>
  )
}

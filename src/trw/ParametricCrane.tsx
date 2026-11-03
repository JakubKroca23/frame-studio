import { LeaderLabel } from '../view/LeaderLabel'

/** Placeholder when the crane catalogue has no original GLB (footprint from trw spread / defaults). */
export function ParametricCranePlaceholder({ x, frameTop, spreadMm, name }: { x: number; frameTop: number; spreadMm?: number | null; name: string }) {
  const spread = spreadMm && spreadMm > 1200 ? spreadMm : 5200
  const half = spread / 2
  const colW = 900
  const colH = 2200
  const colD = 1100
  const beamW = 180
  const beamH = 140
  return (
    <group name="trw-crane-parametric" position={[x, frameTop, 0]}>
      <mesh position={[0, colH / 2, 0]}>
        <boxGeometry args={[colW, colH, colD]} />
        <meshStandardMaterial color="#e0a019" transparent opacity={0.55} />
      </mesh>
      {([-1, 1] as const).map((s) => (
        <mesh key={s} position={[0, frameTop * 0.02 + beamH / 2, s * (half / 2)]}>
          <boxGeometry args={[beamW, beamH, half]} />
          <meshStandardMaterial color="#c48812" transparent opacity={0.65} />
        </mesh>
      ))}
      <LeaderLabel position={[0, colH + 200, 0]} text={`${name} · parametrický obrys (bez 3D modelu)`} bg="rgba(200,120,0,0.92)" />
    </group>
  )
}

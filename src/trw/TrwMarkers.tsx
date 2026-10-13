import type { TrwMarkers as Markers } from './trwConfig'

/** Simple markers for the crane column and outrigger legs (X rearward from axle 1, Y up, Z lateral). */
export function TrwMarkers({ markers, frameTop }: { markers: Markers; frameTop: number }) {
  return (
    <group name="trw-markers">
      {markers.crane ? (
        <mesh position={[markers.crane.x, frameTop + 900, 0]}>
          <boxGeometry args={[350, 1800, 350]} />
          <meshStandardMaterial color="#e0a019" transparent opacity={0.75} />
        </mesh>
      ) : null}
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
    </group>
  )
}

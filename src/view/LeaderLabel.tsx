import { Html, Line } from '@react-three/drei'
import { useEffect, useId, useMemo } from 'react'
import { create } from 'zustand'
import { layoutLeaders, type LeaderItem } from './leaderLayout'
import { useSceneFilters } from './sceneFilters'

type Anchor = LeaderItem & { z: number }
const useLeaders = create<{ items: Record<string, Anchor>; put: (a: Anchor) => void; drop: (id: string) => void }>((set) => ({
  items: {},
  put: (a) => set((s) => ({ items: { ...s.items, [a.id]: a } })),
  drop: (id) => set((s) => { const n = { ...s.items }; delete n[id]; return { items: n } }),
}))

/**
 * Label lifted off the model into a common band above it, with a leader line down to the element (dot at the anchor).
 * Overlapping labels are stacked in tiers (leaderLayout). Hidden by the "Popisky" scene filter.
 */
export function LeaderLabel({ position, text, bg = 'rgba(29,78,158,0.92)' }: { position: [number, number, number]; text: string; bg?: string }) {
  const id = useId()
  const [x, y, z] = position
  const put = useLeaders((s) => s.put), drop = useLeaders((s) => s.drop)
  useEffect(() => { put({ id, x, y, z, text }) }, [id, x, y, z, text, put])
  useEffect(() => () => drop(id), [id, drop])
  const items = useLeaders((s) => s.items)
  const slot = useMemo(() => layoutLeaders(Object.values(items)).get(id), [items, id])
  const on = useSceneFilters((s) => s.labels)
  if (!on || !slot) return null
  return (
    <group name="leader-label">
      <Line points={[[x, y, z], [slot.x, slot.y, z]]} color={bg.startsWith('rgba') ? '#3a4a5c' : bg} lineWidth={1.2} transparent opacity={0.85} />
      <mesh position={[x, y, z]} raycast={() => null}><sphereGeometry args={[45, 10, 8]} /><meshBasicMaterial color="#1b2430" /></mesh>
      <Html position={[slot.x, slot.y, z]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
        <div className="leader-label sf-label" style={{ background: bg }}>{text}</div>
      </Html>
    </group>
  )
}

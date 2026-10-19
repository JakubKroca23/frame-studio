import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { LinearScale } from './CraneGizmos'
import CATALOG from './outriggerCatalog.json'
import { OUTRIGGER_RATE, outriggerStow, stepOutrigger } from './outriggerStow'

/**
 * HIAB auxiliary stabilizer (přídavné podpěry) with moving groups.
 * GLB in metres: X = across the truck, Y up, Z = along the truck. Nodes: housing (fixed), armL/armR (slide along ∓X),
 * legL/legR (slide down). Model +X = vehicle left (scene −Z). 5m = HIAB model (556-2066), 6m derived per 556-2067.
 * Strokes from the drawings (outriggerCatalog.json): arm = (spread − retracted foot spacing)/2, leg = B − A.
 */
type Entry = (typeof CATALOG.entries)[number]
const byKey = (k: string): Entry => CATALOG.entries.find((e) => e.key === k)!
const mk = (e: Entry) => ({ file: e.file, retracted: e.retractedMm, extended: e.extendedMm, footRetracted: e.footSpacingRetractedMm, armStroke: e.armStrokeMm, legStroke: e.legStrokeMm })
export const AUX_STAB = { '5m': mk(byKey('hiab-aux-5m')), '6m': mk(byKey('hiab-aux-6m')) } as const
export type AuxStabKind = keyof typeof AUX_STAB

/** Pick 5m / 6m by the total extended spread (mm), nearest catalogue value. */
export function pickAuxStab(spread: number | null | undefined): AuxStabKind {
  if (spread == null || !Number.isFinite(spread)) return '5m'
  return Math.abs(spread - AUX_STAB['6m'].extended) < Math.abs(spread - AUX_STAB['5m'].extended) ? '6m' : '5m'
}

/** Arm extension [mm] for a trw reach (foot axis from the vehicle centre line, mm). */
export function armExtFromReach(kind: AuxStabKind, reach: number | null | undefined): number {
  const s = AUX_STAB[kind]
  if (reach == null || !Number.isFinite(reach)) return 0
  return Math.min(s.armStroke, Math.max(0, reach - s.footRetracted / 2))
}

/** Leg extension [mm] to touch the ground (gap = foot bottom above ground, mm); `reaches` false when the stroke is short. */
export function legToGround(kind: AuxStabKind, gap: number): { down: number; reaches: boolean } {
  const st = AUX_STAB[kind].legStroke
  return { down: Math.min(st, Math.max(0, gap)), reaches: gap <= st }
}

class Boundary extends Component<{ children: ReactNode; fallback: ReactNode }, { err: boolean }> {
  state = { err: false }
  static getDerivedStateFromError() { return { err: true } }
  render() { return this.state.err ? this.props.fallback : this.props.children }
}

type Side = 'left' | 'right'
const NODE: Record<Side, { arm: string; leg: string; dir: number }> = { left: { arm: 'armR', leg: 'legR', dir: 1 }, right: { arm: 'armL', leg: 'legL', dir: -1 } }

function Loaded({ kind, x, top, reachLeft, reachRight }: { kind: AuxStabKind; x: number; top: number; reachLeft?: number | null; reachRight?: number | null }) {
  const s = AUX_STAB[kind]
  const gltf = useGLTF(`${import.meta.env.BASE_URL}models/outrigger/${s.file}`)
  const { obj, off, nodes, footY, footX } = useMemo(() => {
    const o = gltf.scene.clone(true)
    o.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true })
    const b = new THREE.Box3().setFromObject(o)
    const nodes = Object.fromEntries(['armL', 'armR', 'legL', 'legR'].map((n) => [n, o.getObjectByName(n) ?? null]))
    const lb = nodes.legR ? new THREE.Box3().setFromObject(nodes.legR) : b
    const ll = nodes.legL ? new THREE.Box3().setFromObject(nodes.legL) : b
    return { obj: o, off: new THREE.Vector3(-(b.min.x + b.max.x) / 2, -b.max.y, -(b.min.z + b.max.z) / 2), nodes, footY: lb.min.y - b.max.y, footX: { left: (lb.min.x + lb.max.x) / 2 - (b.min.x + b.max.x) / 2, right: (ll.min.x + ll.max.x) / 2 - (b.min.x + b.max.x) / 2 } }
  }, [gltf])
  const gap = top + footY * 1000 // foot bottom above ground (scene y = 0), mm
  const ground = legToGround(kind, gap)
  const init = (r: number | null | undefined) => { const e = armExtFromReach(kind, r); return { ext: e, down: e > 0 ? ground.down : 0 } }
  const [st, setSt] = useState<Record<Side, { ext: number; down: number }>>({ left: init(reachLeft), right: init(reachRight) })
  useEffect(() => setSt({ left: init(reachLeft), right: init(reachRight) }), [reachLeft, reachRight, kind, gap]) // eslint-disable-line react-hooks/exhaustive-deps
  const cur = useRef(outriggerStow.current ? { left: { e: 0, d: 0 }, right: { e: 0, d: 0 } } : { left: { e: st.left.ext, d: st.left.down }, right: { e: st.right.ext, d: st.right.down } })
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * OUTRIGGER_RATE)
    for (const side of ['left', 'right'] as Side[]) {
      const c = cur.current[side], t = st[side], n = NODE[side]
      stepOutrigger(c, { e: t.ext, d: t.down }, k, 4)
      const arm = nodes[n.arm], leg = nodes[n.leg]
      if (arm) arm.position.set((n.dir * c.e) / 1000, 0, 0)
      if (leg) leg.position.set((n.dir * c.e) / 1000, -c.d / 1000, 0)
    }
  })
  const set = (side: Side, p: Partial<{ ext: number; down: number }>) => setSt((o) => ({ ...o, [side]: { ...o[side], ...p } }))
  return (
    <group position={[x, top, 0]} rotation={[0, Math.PI / 2, 0]} scale={1000} name={`aux-stab-${kind}`}>
      <primitive object={obj} position={off} />
      {(['left', 'right'] as Side[]).map((side) => {
        const n = NODE[side], fx = footX[side] + n.dir * (st[side].ext / 1000)
        return (
          <group key={side}>
            {/* scales start at the retracted / raised position; the drag arrows ride inside them */}
            <group position={[footX[side] + n.dir * 0.25, 0.1, 0]} rotation={[0, n.dir > 0 ? 0 : Math.PI, 0]}>
              <LinearScale value={st[side].ext / 1000} max={s.armStroke / 1000} size={0.4} onValue={(m) => set(side, { ext: m * 1000, down: m > 0 ? st[side].down : 0 })} />
            </group>
            <group position={[fx + n.dir * 0.15, footY, 0]} rotation={[0, 0, -Math.PI / 2]}>
              <LinearScale value={st[side].down / 1000} max={s.legStroke / 1000} size={0.3} onValue={(m) => set(side, { down: m * 1000 })} />
            </group>
          </group>
        )
      })}
    </group>
  )
}

export function AuxOutriggerModel({ kind, x, top, reachLeft, reachRight, fallback = null }: { kind: AuxStabKind; x: number; top: number; reachLeft?: number | null; reachRight?: number | null; fallback?: ReactNode }) {
  return (
    <Boundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <Loaded kind={kind} x={x} top={top} reachLeft={reachLeft} reachRight={reachRight} />
      </Suspense>
    </Boundary>
  )
}

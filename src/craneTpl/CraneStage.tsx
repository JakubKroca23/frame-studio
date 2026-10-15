import { useState } from 'react'
import { ConcreteFloor } from '../view/ConcreteFloor'
import { Canvas, useThree } from '@react-three/fiber'
import { Environment, OrbitControls } from '@react-three/drei'
import { CraneArticulated } from '../trw/CraneArticulated'
import { forwardKinematics, meshAngles, unfoldedPose, variantBoom, type CraneDef, type CraneJoints, type CraneVariant } from '../trw/craneKinematics'

export const fmtMm = (v: number | null | undefined) => (v == null ? '—' : Math.round(v).toLocaleString('cs-CZ'))
export type Row = { name: string; drawing: number | null; template: number | null; deviation: number | null; used: string; note: string }

/** Pose buttons + reach readout for a crane def / variant. */
export function usePose(def: CraneDef, variant: CraneVariant) {
  const [joints, setJoints] = useState<CraneJoints>(() => unfoldedPose(def, 90))
  ;(window as unknown as { __setCraneJoints?: (j: Partial<CraneJoints>) => void }).__setCraneJoints = (j) => setJoints((o) => ({ ...o, ...j })) // capture/test hook
  const stroke = variantBoom(variant).stroke
  const straight = -meshAngles(def).delta // extension axis horizontal
  const tip = forwardKinematics({ ...joints, a1: 0, rel: straight, ext: stroke }, variant).tip
  const controls = (
    <>
      <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <button type="button" className="dxf3d-cand" onClick={() => setJoints(unfoldedPose(def, 90))}>Rozložit</button>
        <button type="button" className="dxf3d-cand" data-testid="tpl-extend" onClick={() => setJoints({ ...joints, a1: 0, rel: straight, ext: stroke })}>Rovně, vysunuto</button>
        <button type="button" className="dxf3d-cand" onClick={() => setJoints({ ...joints, ext: 0 })}>Zasunout</button>
        {def.folded ? <button type="button" className="dxf3d-cand" data-testid="tpl-fold" onClick={() => setJoints({ ...def.folded! })}>Složit</button> : null}
      </div>
      <p className="muted" style={{ margin: '6px 0 0' }}>
        Rovně vysunuto: dosah {fmtMm(tip.r * 1000)} mm (výkres 1-3 MAX {fmtMm(variant.hydMaxMm)} mm, zasunuto {fmtMm(variant.minOutreachMm)} mm, ruční výsuv {fmtMm(variant.manMaxMm)} mm).
      </p>
    </>
  )
  return { joints, setJoints, controls }
}

export function ReportTable({ rows }: { rows: Row[] }) {
  return (
    <table className="dxf3d-table" data-testid="tpl-report">
      <thead><tr><th>Rozměr</th><th>Výkres</th><th>Šablona</th><th>Δ</th><th>Použito</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} title={r.note}>
            <td>{r.name}</td><td>{fmtMm(r.drawing)}</td><td>{fmtMm(r.template)}</td><td>{r.deviation == null ? '—' : `${r.deviation > 0 ? '+' : ''}${fmtMm(r.deviation)}`}</td><td>{r.used}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function CraneStage({ def, variant, joints, onJoints }: { def: CraneDef; variant: CraneVariant; joints: CraneJoints; onJoints: (j: CraneJoints) => void }) {
  return (
    <Canvas shadows camera={{ position: [19000, 7000, 7500], fov: 40, near: 10, far: 200000 }} gl={{ preserveDrawingBuffer: true }}>
      <color attach="background" args={['#1a2230']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[8000, 15000, 6000]} intensity={1.4} castShadow />
      <Environment preset="city" />
      <ConcreteFloor size={60000} />
      <CraneArticulated key={`${def.key}-${variant.id}`} x={0} frameTop={0} joints={joints} variant={variant} onJoints={onJoints} fallback={null} />
      <OrbitControls makeDefault target={[0, 1800, 5500]} />
      <CamHook />
    </Canvas>
  )
}

/** capture/test hook: window.__craneCam([x,y,z] camera, [x,y,z] target) in scene mm */
function CamHook() {
  const { camera, controls } = useThree()
  ;(window as unknown as { __craneCam?: (p: number[], t: number[]) => void }).__craneCam = (p, t) => {
    camera.position.set(p[0], p[1], p[2])
    const c = controls as unknown as { target?: { set: (x: number, y: number, z: number) => void }; update?: () => void } | null
    c?.target?.set(t[0], t[1], t[2]); c?.update?.()
  }
  return null
}

import { useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, OrbitControls } from '@react-three/drei'
import { CraneArticulated } from '../trw/CraneArticulated'
import { forwardKinematics, meshAngles, unfoldedPose, variantBoom, type CraneJoints } from '../trw/craneKinematics'
import type { CraneSheet } from './sheet'
import { adaptFromSheet } from './template'

const fmtMm = (v: number | null | undefined) => (v == null ? '—' : Math.round(v).toLocaleString('cs-CZ'))

/** Result of a HIAB crane sheet: template crane adapted to the drawing (instead of the silhouette envelope). */
export function CraneTplView({ sheet, fileName }: { sheet: CraneSheet; fileName: string | null }) {
  const adapted = useMemo(() => adaptFromSheet(sheet), [sheet])
  const [vid, setVid] = useState(adapted.def.defaultVariantId)
  const variant = adapted.variants.find((v) => v.id === vid) ?? adapted.variants[0]
  const [joints, setJoints] = useState<CraneJoints>(() => unfoldedPose(adapted.def, 90))
  const stroke = variantBoom(variant).stroke
  const straight = -meshAngles(adapted.def).delta // outer boom so that the extension axis is horizontal
  const tip = forwardKinematics({ ...joints, a1: 0, rel: straight, ext: stroke }, variant).tip
  useEffect(() => { (window as unknown as { __tpl?: unknown }).__tpl = { template: adapted.template, variant: variant.id, report: adapted.report, scales: adapted.scales } }, [adapted, variant])
  return (
    <div className="app dxf3d">
      <header className="app-header">
        <div className="brand">
          <h1>DXF → 3D · jeřáb ze šablony</h1>
          <span>{sheet.title || fileName}</span>
        </div>
        <div className="row" style={{ alignItems: 'center' }}>
          <a className="head-link" href="#dxf3d" onClick={() => window.location.reload()}>Jiný výkres</a>
          <a className="head-link" href="#">Úvod</a>
        </div>
      </header>
      <aside className="app-side">
        <section className="block">
          <h2>Šablona</h2>
          <p style={{ margin: 0 }}>
            <strong>HIAB {adapted.template}</strong> — {adapted.templateReason}. {sheet.reason}.
          </p>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Měřítko {sheet.scale.label}: {sheet.scaleNote} Model není průnik siluet: díly vzorového modelu jsou jen upraveny na rozměry z výkresu
            (sloup {adapted.scales.dh ? `+${Math.round(adapted.scales.dh * 1000)} mm` : 'beze změny'}, základ ×{adapted.scales.baseX.toFixed(3)}, výsuvy dle varianty).
          </p>
          <label className="muted" style={{ display: 'block', marginTop: 8 }}>
            Varianta:{' '}
            <select value={variant.id} onChange={(e) => setVid(e.target.value)} data-testid="tpl-variant">
              {adapted.variants.map((v) => <option key={v.id} value={v.id}>{v.id} · {v.extensions} výsuv(y)</option>)}
            </select>
          </label>
          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            <button type="button" className="dxf3d-cand" onClick={() => setJoints(unfoldedPose(adapted.def, 90))}>Rozložit</button>
            <button type="button" className="dxf3d-cand" data-testid="tpl-extend" onClick={() => setJoints({ ...joints, a1: 0, rel: straight, ext: stroke })}>Rovně, vysunuto</button>
            <button type="button" className="dxf3d-cand" onClick={() => setJoints({ ...joints, ext: 0 })}>Zasunout</button>
          </div>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Rovně vysunuto: dosah {fmtMm(tip.r * 1000)} mm (výkres 1-3 MAX {fmtMm(variant.hydMaxMm)} mm).
          </p>
        </section>
        <section className="block">
          <h2>Rozměry: výkres × šablona [mm]</h2>
          <table className="dxf3d-table" data-testid="tpl-report">
            <thead><tr><th>Rozměr</th><th>Výkres</th><th>Šablona</th><th>Δ</th><th>Použito</th></tr></thead>
            <tbody>
              {adapted.report.map((r, i) => (
                <tr key={i} title={r.note}>
                  <td>{r.name}</td><td>{fmtMm(r.drawing)}</td><td>{fmtMm(r.template)}</td><td>{r.deviation == null ? '—' : `${r.deviation > 0 ? '+' : ''}${fmtMm(r.deviation)}`}</td><td>{r.used}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ margin: '6px 0 0' }}>Najetím na řádek se zobrazí poznámka. „šablona“ = rozměr ve výkresu chybí nebo se liší ≤ 2 %.</p>
        </section>
        <section className="block">
          <h2>Přečteno z výkresu</h2>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {sheet.dims.map((d) => (
              <li key={d.key}>
                {d.name}: <strong>{d.mm != null ? fmtMm(d.mm) : d.perVariant ? Object.entries(d.perVariant).map(([k, v]) => `${k} ${fmtMm(v)}`).join(', ') : '—'}</strong> <span className="muted">({d.source}; {d.ref})</span>
              </li>
            ))}
          </ul>
        </section>
      </aside>
      <main className="app-main" style={{ position: 'relative', minHeight: 420 }}>
        <Canvas shadows camera={{ position: [19000, 7000, 7500], fov: 40, near: 10, far: 200000 }} gl={{ preserveDrawingBuffer: true }}>
          <color attach="background" args={['#eef1f4']} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[8000, 15000, 6000]} intensity={1.4} castShadow />
          <Environment preset="city" />
          <gridHelper args={[30000, 30, '#9aa4ae', '#d0d6dc']} />
          <CraneArticulated key={`${adapted.def.key}-${variant.id}`} x={0} frameTop={0} joints={joints} variant={variant} onJoints={setJoints} fallback={null} />
          <OrbitControls makeDefault target={[0, 1800, 5500]} />
        </Canvas>
      </main>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import type { CraneSheet } from './sheet'
import { adaptFromSheet } from './template'
import { CraneStage, ReportTable, fmtMm, usePose } from './CraneStage'

/** Result of a HIAB crane sheet: template crane adapted to the drawing (instead of the silhouette envelope). */
export function CraneTplView({ sheet, fileName }: { sheet: CraneSheet; fileName: string | null }) {
  const adapted = useMemo(() => adaptFromSheet(sheet), [sheet])
  const [vid, setVid] = useState(adapted.def.defaultVariantId)
  const variant = adapted.variants.find((v) => v.id === vid) ?? adapted.variants[0]
  const pose = usePose(adapted.def, variant)
  useEffect(() => { (window as unknown as { __tpl?: unknown }).__tpl = { template: adapted.template, variant: variant.id, report: adapted.report, scales: adapted.scales } }, [adapted, variant])
  return (
    <div className="app dxf3d">
      <header className="app-header">
        <div className="brand">
          <h1>DXF → 3D · jeřáb ze šablony</h1>
          <span>{sheet.title || fileName}</span>
        </div>
        <div className="row" style={{ alignItems: 'center' }}>
          <a className="head-link" href="#jeraby">Katalog jeřábů</a>
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
            (sloup {adapted.scales.dh ? `${adapted.scales.dh > 0 ? '+' : ''}${Math.round(adapted.scales.dh * 1000)} mm` : 'beze změny'}, základ ×{adapted.scales.baseX.toFixed(3)}, výsuvy dle varianty).
          </p>
          <label className="muted" style={{ display: 'block', marginTop: 8 }}>
            Varianta:{' '}
            <select value={variant.id} onChange={(e) => setVid(e.target.value)} data-testid="tpl-variant">
              {adapted.variants.map((v) => <option key={v.id} value={v.id}>{v.id} · {v.extensions} výsuv(y)</option>)}
            </select>
          </label>
          {pose.controls}
        </section>
        <section className="block">
          <h2>Rozměry: výkres × šablona [mm]</h2>
          <ReportTable rows={adapted.report} />
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
        <CraneStage def={adapted.def} variant={variant} joints={pose.joints} onJoints={pose.setJoints} />
      </main>
    </div>
  )
}

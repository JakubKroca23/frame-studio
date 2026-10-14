import { TopBar } from '../components/TopBar'
import { useEffect, useState } from 'react'
import { CRANE_CATALOG, CRANE_DEFS } from '../trw/craneKinematics'
import { CraneStage, ReportTable, fmtMm, usePose } from './CraneStage'

/** #jeraby — every crane of the drawing catalog (template + drawing) plus the two sample models, articulated. */
export function CraneCatalogPage() {
  const initial = decodeURIComponent(window.location.hash.split('/')[1] ?? '')
  const [key, setKey] = useState(CRANE_DEFS.some((d) => d.key === initial) ? initial : CRANE_CATALOG[0]?.key ?? '142')
  const def = CRANE_DEFS.find((d) => d.key === key)!
  const entry = CRANE_CATALOG.find((e) => e.key === key)
  return <Inner key={key} defKey={key} setKey={setKey} def={def} entry={entry} />
}

function Inner({ defKey, setKey, def, entry }: { defKey: string; setKey: (k: string) => void; def: (typeof CRANE_DEFS)[number]; entry: (typeof CRANE_CATALOG)[number] | undefined }) {
  const [vid, setVid] = useState(def.defaultVariantId)
  const variant = def.variants.find((v) => v.id === vid) ?? def.variants[0]
  const pose = usePose(def, variant)
  useEffect(() => { window.history.replaceState(null, '', `#jeraby/${defKey}`) }, [defKey])
  const ev = entry?.variants.find((v) => v.id === variant.id)
  return (
    <div className="app dxf3d">
      <TopBar page="jeraby" />
      <aside className="app-side">
        <section className="block">
          <h2>Model</h2>
          <select value={defKey} onChange={(e) => setKey(e.target.value)} data-testid="crane-model" style={{ width: '100%' }}>
            {CRANE_DEFS.map((d) => <option key={d.key} value={d.key}>{d.name}{d.adapt ? ` · šablona ${d.adapt.template}` : ' · vzorový model'}</option>)}
          </select>
          <label className="muted" style={{ display: 'block', marginTop: 8 }}>
            Varianta:{' '}
            <select value={variant.id} onChange={(e) => setVid(e.target.value)} data-testid="tpl-variant">
              {def.variants.map((v) => <option key={v.id} value={v.id}>{v.id} · {v.extensions} výsuv(y) · {fmtMm(v.hydMaxMm)} mm</option>)}
            </select>
          </label>
          {pose.controls}
          {entry ? (
            <p className="muted" style={{ margin: '6px 0 0' }}>
              Šablona HIAB {entry.template}; sloup {entry.dh ? `${entry.dh > 0 ? '+' : ''}${Math.round(entry.dh * 1000)} mm` : 'beze změny'}, základ ×{entry.baseX.toFixed(3)}. Výkres varianty: {ev?.sheet ?? '—'}.
            </p>
          ) : <p className="muted" style={{ margin: '6px 0 0' }}>Vzorový model (měřený CAD uživatele).</p>}
        </section>
        {entry ? (
          <>
            <section className="block">
              <h2>Dosahy z výkresu (1-3 OUTREACH) [mm]</h2>
              <table className="dxf3d-table">
                <thead><tr><th>Var.</th><th>Výs.</th><th>Zasunuto</th><th>Hydr. max</th><th>+ ruční</th>{entry.variants.some((v) => v.jib) ? <th>s jibem</th> : null}</tr></thead>
                <tbody>{entry.variants.map((v) => <tr key={v.id}><td>{v.id}</td><td>{v.extensions}</td><td>{fmtMm(v.minOutreachMm)}</td><td>{fmtMm(v.hydMaxMm)}</td><td>{fmtMm(v.manMaxMm)}</td>{entry.variants.some((x) => x.jib) ? <td title="jib nemodelován (LESSONS L7)">{fmtMm(v.jib?.maxMm)} / {fmtMm(v.jib?.manMm)}</td> : null}</tr>)}</tbody>
              </table>
            </section>
            <section className="block">
              <h2>Rozměry: výkres × šablona [mm]</h2>
              <ReportTable rows={entry.report} />
              {entry.notes.length ? <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>{entry.notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
              <p className="muted" style={{ margin: '6px 0 0' }}>Výkresy: {entry.sheets.join(', ')}</p>
            </section>
          </>
        ) : null}
      </aside>
      <main className="app-main" style={{ position: 'relative', minHeight: 420 }}>
        <CraneStage def={def} variant={variant} joints={pose.joints} onJoints={pose.setJoints} />
      </main>
    </div>
  )
}

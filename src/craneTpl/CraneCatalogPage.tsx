import { SceneFilterBar } from '../view/SceneFilterBar'
import { TopBar } from '../components/TopBar'
import { useEffect, useState } from 'react'
import { CRANE_CATALOG, CRANE_DEFS, meshAngles, variantBoom } from '../trw/craneKinematics'
import { CraneStage, ReportTable, fmtMm, usePose } from './CraneStage'
import { Tree, TreeContent, TreeNode } from '../components/Tree'

/** Jakub: the catalogue lists only cranes with their ORIGINAL model (own CAD/GLB); template-adapted drawing cranes
 *  (def.adapt – another crane's mesh rescaled) stay registered for trw matching but are not offered here. */
export const SHOW_TEMPLATE_CRANES = false
const listed = () => CRANE_DEFS.filter((d) => SHOW_TEMPLATE_CRANES || !d.adapt)
/** Manufacturer = first word of the def name (HIAB, Jonsered …), in catalogue order. */
const makerOf = (d: { name: string }) => d.name.split(/\s+/)[0]
const makers = () => { const m = new Map<string, ReturnType<typeof listed>>(); for (const d of listed()) m.set(makerOf(d), [...(m.get(makerOf(d)) ?? []), d]); return [...m] }
const modelName = (d: { name: string }) => d.name.slice(makerOf(d).length).trim() || d.name

/** #jeraby — cranes with an original model (optionally also the drawing-catalog template cranes), articulated. */
export function CraneCatalogPage() {
  const initial = decodeURIComponent(window.location.hash.split('/')[1] ?? '')
  const [key, setKey] = useState(listed().some((d) => d.key === initial) ? initial : listed()[0]?.key ?? '142')
  const def = CRANE_DEFS.find((d) => d.key === key)!
  const entry = CRANE_CATALOG.find((e) => e.key === key)
  return <Inner key={key} defKey={key} setKey={setKey} def={def} entry={entry} />
}

function Inner({ defKey, setKey, def, entry }: { defKey: string; setKey: (k: string) => void; def: (typeof CRANE_DEFS)[number]; entry: (typeof CRANE_CATALOG)[number] | undefined }) {
  const [vid, setVid] = useState(def.defaultVariantId)
  const variant = def.variants.find((v) => v.id === vid) ?? def.variants[0]
  const pose = usePose(def, variant)
  // headless capture of the start-page card loop (scripts/capture-cards): t∈[0,1] → real joint motion within the def's limits
  useEffect(() => {
    const w = window as unknown as { __craneAnim?: (t: number) => void }
    const straight = -meshAngles(def).delta, stroke = variantBoom(variant).stroke
    w.__craneAnim = (t) => { const k = 0.5 - 0.5 * Math.cos(2 * Math.PI * t); pose.setJoints({ slew: -20 + 40 * k, a1: 4 + 14 * k, rel: straight - 6 * (1 - k), ext: 0.7 * stroke * k }) }
    return () => { delete w.__craneAnim }
  }, [def, variant, pose])
  useEffect(() => { window.history.replaceState(null, '', `#jeraby/${defKey}`) }, [defKey])
  const ev = entry?.variants.find((v) => v.id === variant.id)
  return (
    <div className="app dxf3d">
      <TopBar page="jeraby" />
      <aside className="app-side">
        <Tree label="Katalog jeřábů">
          <TreeNode label="Hydraulické jeřáby" count={listed().length} open>
            {makers().map(([maker, defs]) => (
              <TreeNode key={maker} label={maker} count={defs.length} open={defs.some((d) => d.key === defKey)}>
                {defs.map((d) => d.key !== defKey ? (
                  <TreeNode key={d.key} label={modelName(d)} hint={d.adapt ? `šablona ${d.adapt.template}` : undefined} onSelect={() => setKey(d.key)} testid={`crane-node-${d.key}`} />
                ) : (
                  <TreeNode key={d.key} label={modelName(d)} hint={d.adapt ? `šablona ${d.adapt.template}` : undefined} selected open onSelect={() => {}} testid={`crane-node-${d.key}`}>
                    <TreeNode label="Varianty" count={def.variants.length} open>
                      {def.variants.map((v) => (
                        <TreeNode key={v.id} label={v.id} hint={`${v.extensions} výs. · ${fmtMm(v.hydMaxMm)} mm`} selected={v.id === variant.id} onSelect={() => setVid(v.id)} testid={`tpl-variant-${v.id}`} />
                      ))}
                    </TreeNode>
                    <TreeNode label="Ovládání" open>
                      <TreeContent>{pose.controls}</TreeContent>
                    </TreeNode>
                    {entry ? (
                      <>
                        <TreeNode label="Dosahy z výkresu (1-3 OUTREACH)" count={entry.variants.length}>
                          <TreeContent>
                            <table className="dxf3d-table">
                              <thead><tr><th>Var.</th><th>Výs.</th><th>Zasunuto</th><th>Hydr. max</th><th>+ ruční</th>{entry.variants.some((v) => v.jib) ? <th>s jibem</th> : null}</tr></thead>
                              <tbody>{entry.variants.map((v) => <tr key={v.id}><td>{v.id}</td><td>{v.extensions}</td><td>{fmtMm(v.minOutreachMm)}</td><td>{fmtMm(v.hydMaxMm)}</td><td>{fmtMm(v.manMaxMm)}</td>{entry.variants.some((x) => x.jib) ? <td title="jib nemodelován (LESSONS L7)">{fmtMm(v.jib?.maxMm)} / {fmtMm(v.jib?.manMm)}</td> : null}</tr>)}</tbody>
                            </table>
                            <p className="muted" style={{ margin: '4px 0 0' }}>[mm]</p>
                          </TreeContent>
                        </TreeNode>
                        <TreeNode label="Rozměry: výkres × šablona" count={entry.report.length}>
                          <TreeContent>
                            <ReportTable rows={entry.report} />
                            {entry.notes.length ? <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>{entry.notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
                          </TreeContent>
                        </TreeNode>
                      </>
                    ) : null}
                    <TreeNode label="Zdroj">
                      <TreeContent>
                        {entry ? (
                          <p className="muted" style={{ margin: 0 }}>
                            Šablona HIAB {entry.template}; sloup {entry.dh ? `${entry.dh > 0 ? '+' : ''}${Math.round(entry.dh * 1000)} mm` : 'beze změny'}, základ ×{entry.baseX.toFixed(3)}. Výkres varianty: {ev?.sheet ?? '—'}. Výkresy: {entry.sheets.join(', ')}
                          </p>
                        ) : <p className="muted" style={{ margin: 0 }}>Vzorový model (měřený CAD uživatele).</p>}
                      </TreeContent>
                    </TreeNode>
                  </TreeNode>
                ))}
              </TreeNode>
            ))}
          </TreeNode>
        </Tree>
      </aside>
      <main className="app-main" style={{ position: 'relative', minHeight: 420 }}>
        <CraneStage def={def} variant={variant} joints={pose.joints} onJoints={pose.setJoints} />
        <SceneFilterBar />
      </main>
    </div>
  )
}

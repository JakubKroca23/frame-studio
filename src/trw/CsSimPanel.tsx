import { useRef, useState } from 'react'
import { Button } from '../components/ui/button'
import { parseCsSimResult, type CsSimResult } from './csSimResult'

const f = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? '–' : v.toLocaleString('cs-CZ', { maximumFractionDigits: d }))
const xs = (x: number | null) => (x === null ? '' : ` v x = ${f(x, 0)} mm za 1. nápravou`)

export function CsSimLoadButton({ onLoad }: { onLoad: (result: CsSimResult | null, error: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => ref.current?.click()}>
        Načíst výsledek z CS Sim
      </Button>
      <input
        ref={ref}
        type="file"
        accept=".json,application/json,text/plain"
        style={{ display: 'none' }}
        onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          try {
            onLoad(parseCsSimResult(JSON.parse(await file.text())), null)
          } catch (err) {
            onLoad(null, err instanceof SyntaxError ? 'Soubor není platný JSON.' : err instanceof Error ? err.message : String(err))
          }
        }}
      />
    </>
  )
}

export function CsSimSummary({ result, onClose }: { result: CsSimResult; onClose: () => void }) {
  const [open, setOpen] = useState(true)
  const r = result
  const g = r.governing
  return (
    <section className="block">
      <h2>Výsledek CS Sim</h2>
      <p className="source-note">
        {r.chassisName ?? 'podvozek'}
        {r.craneName ? ` · ${r.craneName}` : ''}
        {r.load.Mk !== null ? ` · Mk ${f(r.load.Mk)} kNm` : ''}
        {r.load.Fv !== null ? `, Fv ${f(r.load.Fv, 2)} kN` : ''}
        {r.load.slew !== null ? `, natočení ${f(r.load.slew, 0)}°` : ''}
        {r.generated ? ` · ${new Date(r.generated).toLocaleString('cs-CZ')}` : ''}
      </p>
      {g ? (
        <p className={g.ok === false || (g.pct ?? 0) >= 100 ? 'status error' : 'status ok'}>
          Rozhoduje: {g.check} – {f(g.pct)} % {g.ok === null ? '' : g.ok ? '(vyhovuje)' : '(NEVYHOVUJE)'}
        </p>
      ) : null}
      <ul className="hints">
        {r.maxMoment ? (
          <li>
            Max. ohybový moment {f(r.maxMoment.value)} kNm{xs(r.maxMoment.x)} (rám {f(r.maxMoment.chassis)}, mezirám {f(r.maxMoment.subframe)}, N·e {f(r.maxMoment.composite)} kNm)
          </li>
        ) : null}
        <li>
          Max. normálové napětí: mezirám {f(r.stress.subframe)} MPa, rám {f(r.stress.chassis)} MPa
        </li>
        {r.deflection ? (
          <li>
            Max. průhyb {f(r.deflection.value)} mm{xs(r.deflection.x)}, svisle {f(r.deflection.vertical)} mm
          </li>
        ) : null}
        <li>
          Podélník rámu {r.chassisRail.profile ?? '?'}
          {r.chassisRail.dims ? ` (${r.chassisRail.dims.H}/${r.chassisRail.dims.B}/${r.chassisRail.dims.t})` : ''}
          {r.chassisRail.steel ? `, ${r.chassisRail.steel}` : ''}
        </li>
        <li>
          Mezirám {r.subframe.profile ?? '?'}
          {` (${r.subframe.dims.H}/${r.subframe.dims.B}/${r.subframe.dims.t})`}
          {r.subframe.steel ? `, ${r.subframe.steel}` : ''}, x {f(r.subframe.from, 0)}–{f(r.subframe.to, 0)} mm{r.subframe.estimated ? ' (≈ odhad)' : ''}
        </li>
        {r.outriggersX?.length ? <li>Podpěry v x = {r.outriggersX.map((x) => f(x, 0)).join(', ')} mm</li> : null}
      </ul>
      <button type="button" className="flag" onClick={() => setOpen(!open)}>
        {open ? 'Skrýt využití' : `Využití prvků (${r.utilization.length})`}
      </button>
      {open && r.utilization.length ? (
        <table className="cfg-axles">
          <thead>
            <tr>
              <th>Prvek</th>
              <th>Profil / ocel</th>
              <th>%</th>
              <th>x</th>
            </tr>
          </thead>
          <tbody>
            {[...r.utilization]
              .sort((a, b) => b.pct - a.pct)
              .map((u, i) => (
                <tr key={i}>
                  <td>{u.check}</td>
                  <td>
                    {u.profile ?? ''} {u.steel ?? ''}
                  </td>
                  <td style={{ color: u.pct >= 90 ? '#d6261e' : u.pct >= 60 ? '#e08a12' : '#2f9a46' }}>{f(u.pct)}</td>
                  <td>{f(u.x, 0)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      ) : null}
      <p className="source-note">
        Barvy: zelená &lt; 60 %, oranžová &lt; 90 %, červená ≥ 90 %. Červený kužel = rozhodující místo, modrý = max. moment. Překryv se do GLB neexportuje.
      </p>
      {r.warnings.length ? (
        <ul className="hints">
          {r.warnings.map((w) => (
            <li key={w} className="warn">
              {w}
            </li>
          ))}
        </ul>
      ) : null}
      <Button size="sm" variant="ghost" onClick={onClose}>
        Skrýt výsledek
      </Button>
    </section>
  )
}

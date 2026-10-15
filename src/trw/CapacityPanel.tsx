import type { CapacityInfo } from './capacityDiagram'
import { STATUS_COLOR, STATUS_LABEL } from './stabilitySectors'

/** Side-panel block: load chart (current row highlighted), capacity at reach, stability at slew, trw design case, missing data. */
export function CapacityPanel({ info, variantLabel }: { info: CapacityInfo; variantLabel: string }) {
  const rows = info.rings
  const cur = info.atReach ? rows.findIndex((r, i) => info.atReach!.reachMm <= r.rMm && (i === 0 || info.atReach!.reachMm > rows[i - 1].rMm)) : -1
  return (
    <div className="cap-panel" data-testid="capacity-panel">
      <strong>Nosnost a stabilita (CraneWIN)</strong>
      {info.atReach ? (
        <p>Dosah {(info.atReach.reachMm / 1000).toFixed(2)} m → <b>{info.atReach.kg.toLocaleString('cs-CZ')} kg</b>{info.atReach.manual ? ' (ruční výsuv)' : ''} <span className="muted">· {variantLabel}, HiSelect</span></p>
      ) : null}
      {info.atSlew ? (
        <p>Natočení {info.atSlew.deg}° → k = {info.atSlew.factor != null ? info.atSlew.factor.toFixed(2) : '?'} <span style={{ color: STATUS_COLOR[info.atSlew.status] }}>{STATUS_LABEL[info.atSlew.status]}</span> <span className="muted">· trw</span></p>
      ) : null}
      {info.design ? (
        <p>Návrhový případ trw: {info.design.hookKg ?? '?'} kg @ {info.design.radiusM ?? '?'} m{info.design.momentKNm != null ? ` (${info.design.momentKNm.toFixed(0)} kNm)` : ''}
          {info.design.chartKg != null ? <> · tabulka {info.design.chartKg} kg <span style={{ color: info.design.withinChart ? STATUS_COLOR.ok : STATUS_COLOR.fail }}>{info.design.withinChart ? 'v tabulce' : 'nad tabulkou'}</span></> : null}</p>
      ) : null}
      {rows.length ? (
        <table className="cap-table">
          <thead><tr><th>Dosah</th><th>Nosnost</th></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={r.rMm} className={i === cur ? 'is-cur' : ''}><td>{(r.rMm / 1000).toFixed(1)} m{r.manual ? ' ruč.' : ''}</td><td>{r.kg.toLocaleString('cs-CZ')} kg</td></tr>)}</tbody>
        </table>
      ) : null}
      <details open={!rows.length}>
        <summary>Chybějící data ({info.missing.length})</summary>
        <ul>{info.missing.map((m) => <li key={m}>{m}</li>)}</ul>
      </details>
    </div>
  )
}

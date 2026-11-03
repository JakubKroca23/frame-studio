import type { LiveDoc } from './stabilityLive'
import { useLiveStatus } from './useLiveStatus'
import { STATUS_COLOR, WARN_UTILISATION } from './stabilitySectors'
import { hookliftPlacement, isHookliftAccessory } from './hooklift'
import { BODY_TYPE_LABEL, dedupeAccessories, extendedBodies, nearestAngle, stabilitySummary, type TrwExtended } from './trwExtended'
import { bodyLabel } from './bodyGeometry'

/** Panel summary of body / accessories / stability with the slew angle slider. */
export function TrwExtendedPanel({ ext, slewDeg, onSlew, showSectors, onShowSectors, liveDoc }: { liveDoc?: LiveDoc | null; ext: TrwExtended; slewDeg: number; onSlew: (deg: number) => void; showSectors?: boolean; onShowSectors?: (v: boolean) => void }) {
  const st = ext.stability
  const e = nearestAngle(st, slewDeg)
  const live = useLiveStatus(liveDoc)
  const bodies = extendedBodies(ext)
  const hooklifts = [
    ...bodies.filter((b) => b.type === 'hooklift').map((b) => ({ name: b.typeRaw ?? BODY_TYPE_LABEL.hooklift, src: { ...b, name: b.typeRaw ?? '', xFrom: b.xFrom, xTo: b.xTo, length: b.length, height: b.height } })),
    ...(ext.accessories ?? []).filter((a) => isHookliftAccessory(a)).map((a) => ({ name: a.name, src: a })),
  ]
  const acc = dedupeAccessories(ext.accessories ?? []).filter((a) => !isHookliftAccessory(a))
  const overall = st?.pass === false ? '#d62828' : st?.pass === true ? '#2a9d3a' : '#888'
  return (
    <div className="source-note">
      {bodies.length ? (
        <div>
          <strong>Nástavba{bodies.length > 1 ? ` (${bodies.length})` : ''}:</strong>{' '}
          {bodies.map((b) => `${bodyLabel(b.type, b.typeRaw)}${b.length != null ? ` ${Math.round(b.length)} mm` : ''}${b.massKg ? ` ${Math.round(b.massKg)} kg` : ''}`).join(' · ')}
        </div>
      ) : null}
      {hooklifts.length ? (
        <div>
          <strong>Hákový nosič{hooklifts.length > 1 ? ` (${hooklifts.length})` : ''}:</strong>{' '}
          {hooklifts
            .map(({ name, src }) => {
              const hl = hookliftPlacement(src, Math.max(ext.body?.xTo ?? 0, 8000))
              return `${name}${hl.spec ? ` · ${hl.params.lengthMm} mm · háku ${hl.params.hookHeightMm} mm` : ''}`
            })
            .join(' · ')}
        </div>
      ) : null}
      {acc.length ? (
        <div>
          <strong>Příslušenství:</strong> {acc.map((a) => `${a.name}${a.massKg != null ? ` ${Math.round(a.massKg)} kg` : ''}`).join(', ')}
        </div>
      ) : null}
      <div className={`live-status ${live.level}`} role="status">{live.text}</div>
      {st ? (
        <div>
          <strong>Stabilita</strong>{' '}
          <span style={{ background: overall, color: '#fff', padding: '0 5px', borderRadius: 3 }}>{st.pass === true ? 'vyhovuje' : st.pass === false ? 'nevyhovuje' : 'neznámo'}</span>
          {stabilitySummary(st) ? ` · ${stabilitySummary(st)}` : ''}{' '}
          {!st.verified ? <span style={{ background: '#f4c430', color: '#222', padding: '0 5px', borderRadius: 3 }}>neověřeno proti CraneWIN</span> : null}
          {st.angles.length && onShowSectors ? (
            <div>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                <input type="checkbox" checked={!!showSectors} onChange={(e) => onShowSectors(e.target.checked)} /> Výseče stability
              </label>
              {showSectors ? (
                <div className="stab-legend" aria-label="Legenda výsečí stability">
                  <span><i style={{ background: STATUS_COLOR.ok }} />bezpečné (k ≥ n / {WARN_UTILISATION}{st.requiredN ? ` = ${(st.requiredN / WARN_UTILISATION).toFixed(2)}` : ''})</span>
                  <span><i style={{ background: STATUS_COLOR.warn }} />blízko limitu (využití n/k 85–100 %)</span>
                  <span><i style={{ background: STATUS_COLOR.fail }} />nevyhovuje (k &lt; n{st.requiredN ? ` = ${st.requiredN}` : ''})</span>
                </div>
              ) : null}
            </div>
          ) : null}
          {st.angles.length ? (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
              Natočení jeřábu
              <input type="range" min={0} max={359} step={1} value={slewDeg} onChange={(event) => onSlew(Number(event.target.value))} style={{ flex: 1 }} />
              <span>
                {slewDeg}° → {e?.angleDeg}° · k={e?.factor != null ? e.factor.toFixed(2) : '?'}
              </span>
            </label>
          ) : null}
        </div>
      ) : ext.stabilityNote ? (
        <div>
          <strong>Stabilita:</strong> nespočtena – {ext.stabilityNote}
        </div>
      ) : ext.noCrane ? (
        <div>
          <strong>Stabilita:</strong> bez jeřábu
        </div>
      ) : null}
    </div>
  )
}

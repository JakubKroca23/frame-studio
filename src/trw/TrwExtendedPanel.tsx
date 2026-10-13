import { BODY_TYPE_LABEL, nearestAngle, type TrwExtended } from './trwExtended'

/** Panel summary of body / accessories / stability with the slew angle slider. */
export function TrwExtendedPanel({ ext, slewDeg, onSlew }: { ext: TrwExtended; slewDeg: number; onSlew: (deg: number) => void }) {
  const st = ext.stability
  const e = nearestAngle(st, slewDeg)
  const overall = st?.pass === false ? '#d62828' : st?.pass === true ? '#2a9d3a' : '#888'
  return (
    <div className="source-note">
      {ext.body ? (
        <div>
          <strong>Nástavba:</strong> {BODY_TYPE_LABEL[ext.body.type]}
          {ext.body.typeRaw ? ` (${ext.body.typeRaw})` : ''}
          {ext.body.length != null ? ` · ${Math.round(ext.body.length)} mm` : ''}
          {ext.body.massKg ? ` · ${Math.round(ext.body.massKg)} kg` : ''}
        </div>
      ) : null}
      {ext.accessories?.length ? (
        <div>
          <strong>Příslušenství:</strong> {ext.accessories.map((a) => `${a.name}${a.massKg != null ? ` ${Math.round(a.massKg)} kg` : ''}`).join(', ')}
        </div>
      ) : null}
      {st ? (
        <div>
          <strong>Stabilita</strong>{' '}
          <span style={{ background: overall, color: '#fff', padding: '0 5px', borderRadius: 3 }}>{st.pass === true ? 'vyhovuje' : st.pass === false ? 'nevyhovuje' : 'neznámo'}</span>
          {st.minFactor != null ? ` · min. k=${st.minFactor.toFixed(2)}` : ''}{' '}
          {!st.verified ? <span style={{ background: '#f4c430', color: '#222', padding: '0 5px', borderRadius: 3 }}>neověřeno proti CraneWIN</span> : null}
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
      ) : null}
    </div>
  )
}

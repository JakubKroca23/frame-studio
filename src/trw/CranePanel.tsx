import { craneReadout } from './CraneArticulated'
import { defOf, jointLimits, loadAt, variantBoom, type CraneJoints, type CraneVariant } from './craneKinematics'

const G = 9.81

/** Joint sliders (fallback to tip dragging) + live readout of the tip (Czech). */
export function CranePanel({ joints, variant, exact = true, craneX, frameTop, onJoints }: { joints: CraneJoints; variant: CraneVariant; exact?: boolean; craneX: number; frameTop: number; onJoints: (j: CraneJoints) => void }) {
  const r = craneReadout(joints, variant, craneX, frameTop)
  const def = defOf(variant)
  const load = loadAt(variant, r.reach)
  const L = (k: 'slew' | 'a1' | 'rel') => jointLimits(k, variant)
  const stroke = variantBoom(variant).stroke
  const slider = (label: string, key: keyof CraneJoints, min: number, max: number, step: number, unit: string, scale = 1) => (
    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
      <span style={{ width: 120 }}>{label}</span>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={joints[key]} onChange={(e) => onJoints({ ...joints, [key]: Number(e.target.value) })} style={{ flex: 1 }} />
      <span style={{ width: 64, textAlign: 'right' }}>{(joints[key] * scale).toFixed(unit === '°' ? 0 : 2)} {unit}</span>
    </label>
  )
  return (
    <div className="crane-panel" style={{ margin: '6px 0' }}>
      <div style={{ fontSize: 12, marginBottom: 4 }}>
        {def.name} {variant.id}{!exact ? <em> (trw neuvádí variantu{def.variants.length === 1 ? ', model je jen' : ', automaticky zvolena'} {variant.id})</em> : null} · táhněte modrou kouli na špičce výložníku, nebo použijte posuvníky
      </div>
      {slider('Natočení', 'slew', L('slew')[0], L('slew')[1], 1, '°')}
      {slider('Hlavní výložník', 'a1', L('a1')[0], L('a1')[1], 0.5, '°')}
      {slider('Vnější výložník', 'rel', L('rel')[0], L('rel')[1], 0.5, '°')}
      {slider('Výsuvy', 'ext', 0, stroke, 0.05, 'm')}
      <table className="crane-readout" style={{ fontSize: 12, marginTop: 4 }}>
        <tbody>
          <tr><td>Výška špičky nad zemí</td><td>{r.height.toFixed(2)} m</td></tr>
          <tr><td>Vodorovný dosah od osy sloupu</td><td>{r.reach.toFixed(2)} m</td></tr>
          <tr><td>x (podél vozidla od 1. nápravy)</td><td>{r.x.toFixed(2)} m</td></tr>
          <tr><td>y (příčně, + vpravo)</td><td>{r.y.toFixed(2)} m</td></tr>
          <tr><td>z (výška nad zemí)</td><td>{r.height.toFixed(2)} m</td></tr>
          <tr>
            <td>Aktuální nosnost</td>
            <td>
              {load ? `${Math.round(load.kg)} kg${load.manual ? ' (ruční výsuv)' : ''}` : def.loads ? 'není k dispozici (ES)' : 'nosnost n/a (zatěžovací tabulka zatím chybí)'}
            </td>
          </tr>
          {load ? (
            <tr><td>Moment</td><td>{((load.kg * G * r.reach) / 1000).toFixed(1)} kNm</td></tr>
          ) : null}
        </tbody>
      </table>
      <div style={{ fontSize: 11, opacity: 0.75 }}>
        {def.loads ? 'Nosnost podle HiSelect tabulky, orientační. ' : `${def.name}: kinematika změřena z 3D modelu, rozsahy kloubů odhadnuty (bez výkresu). `}Výška = horní hrana rámu ({Math.round(frameTop)} mm) + výška špičky nad patkou jeřábu; vozovka v y = 0.
      </div>
    </div>
  )
}

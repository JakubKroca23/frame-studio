import { VOLVO_REAR, fitRear, type AxleLike } from './cadParts'
import { useVolvoCad } from './VolvoCadModel'

/** Left panel: what the Volvo CAD replaced, approximations, and sliders for the movable components. */
export function VolvoCadPanel({ axles, frameRear }: { axles: AxleLike[]; frameRear: number }) {
  const { offsets, set, state } = useVolvoCad()
  const fit = fitRear(axles, frameRear)
  return (
    <details className="status" data-testid="volvo-cad" open>
      <summary>Volvo CAD – zadní část {state === 'ok' ? '(načteno)' : state === 'missing' ? '(nedostupné)' : ''}</summary>
      {state === 'missing' ? <p className="warn">Model se nepodařilo načíst (nejste přihlášeni, nebo soubor na serveru chybí) – zobrazuje se zjednodušený zadek.</p> : null}
      <ul className="hints">{fit.notes.map((n) => <li key={n} className="warn">{n}</li>)}</ul>
      {fit.ok ? (
        <>
          <p className="muted">Posun komponent podél vozidla (mm, + dozadu):</p>
          {VOLVO_REAR.movable.map((m) => (
            <label key={m.partNo} style={{ display: 'block', fontSize: 12 }}>
              {m.label}: <strong>{offsets[m.partNo] ?? 0}</strong>
              <input type="range" min={-1500} max={1500} step={10} value={offsets[m.partNo] ?? 0} style={{ width: '100%' }} data-testid={`volvo-mv-${m.partNo}`} onChange={(e) => set(m.partNo, +e.target.value)} />
            </label>
          ))}
          <p className="muted">Přední část (baterie, AdBlue, nádrže) se doplní, až bude k dispozici přední model.</p>
        </>
      ) : null}
    </details>
  )
}

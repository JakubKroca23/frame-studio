import { VOLVO_FRONT, VOLVO_REAR, fitRear, type AxleLike, type CadPart } from './cadParts'
import { mvKey, useVolvoCad } from './VolvoCadModel'

function Sliders({ part, offsets, set, sign }: { part: CadPart; offsets: Record<string, number>; set: (k: string, v: number) => void; sign: string }) {
  return (
    <>
      <p className="muted">{sign}</p>
      {part.movable.map((m) => {
        const k = mvKey(part, m.key)
        return (
          <label key={k} style={{ display: 'block', fontSize: 12 }}>
            {m.label}: <strong>{offsets[k] ?? 0}</strong>
            <input type="range" min={-1500} max={1500} step={10} value={offsets[k] ?? 0} style={{ width: '100%' }} data-testid={`volvo-mv-${part.key}-${m.key}`} onChange={(e) => set(k, +e.target.value)} />
          </label>
        )
      })}
    </>
  )
}
const st = (s: string) => (s === 'ok' ? '(načteno)' : s === 'missing' ? '(nedostupné)' : '')

/** Left panel: what the Volvo CAD replaced, approximations, and sliders for the movable components. */
export function VolvoCadPanel({ axles, frameRear }: { axles: AxleLike[]; frameRear: number }) {
  const { offsets, set, state, front } = useVolvoCad()
  const fit = fitRear(axles, frameRear)
  return (
    <details className="status" data-testid="volvo-cad" open>
      <summary>Volvo CAD – zadní část {st(state)}, přední část {st(front)}</summary>
      {state === 'missing' || front === 'missing' ? <p className="warn">Model se nepodařilo načíst (nejste přihlášeni, nebo soubor na serveru chybí) – zobrazuje se zjednodušený model.</p> : null}
      <ul className="hints">{fit.notes.map((n) => <li key={n} className="warn">{n}</li>)}</ul>
      {fit.ok ? <Sliders part={VOLVO_REAR} offsets={offsets} set={set} sign="Zadní část – posun podél vozidla (mm, + dozadu). Blatníky a kola sedí na nápravách z konfigurace." /> : null}
      <Sliders part={VOLVO_FRONT} offsets={offsets} set={set} sign="Přední část (za kabinou) – posun podél vozidla (mm, + dozadu). Umístěno podle zadní stěny kabiny; názvy komponent jsou odhad podle tvaru." />
    </details>
  )
}

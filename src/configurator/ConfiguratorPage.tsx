import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { Button } from '../components/ui/button'
import { downloadBlob, exportGlb } from '../export/download'
import { configToModel, paramsForConfig, tyreDiameter } from '../presets/configModel'
import { MAKES, PRESETS, cloneConfig, presetById, presetsOf, seriesOf, wheelbase, withWheelbase } from '../presets'
import type { AxleConfig, CabKind, CabStyle, ChassisConfig, ChassisPreset, Make, RoofKind, Side } from '../presets/types'
import { CAB_DEFAULT_COLOR } from '../presets/cabLayout'
import { validateConfig } from '../presets/validate'
import { useApp } from '../state'
import { Viewport } from '../view/Viewport'

/** Cab shapes offered in the form: every make plus Mercedes-Benz (shape only, no chassis presets yet). */
const CAB_STYLES: { id: CabStyle; name: string }[] = [...MAKES, { id: 'mercedes', name: 'Mercedes-Benz (jen tvar kabiny)' }]

/**
 * Height change between roof variants and the day→sleeper length change. Volvo values are read
 * from the model-range sheets the presets cite: FH fh42t3a (cab height −285 mm low sleeper,
 * +305 mm Globetrotter, +450 mm Globetrotter XL vs. the sleeper) and FM fm42r3a / FMX fmx84rt3a
 * (−262 mm low day, +328 mm Globetrotter vs. the day cab; sleeper +431 mm front axle to back of
 * cab). The others are estimates (≈ odhad).
 */
const ROOF_DELTA: Record<string, Record<RoofKind, number>> = {
  'volvo:FH': { low: -285, normal: 0, high: 305, xhigh: 450 },
  'volvo:FM': { low: -262, normal: 0, high: 328, xhigh: 328 },
  'volvo:FMX': { low: -262, normal: 0, high: 328, xhigh: 328 },
  default: { low: -260, normal: 0, high: 300, xhigh: 450 },
}
const SLEEPER_DELTA: Record<string, number> = { 'volvo:FM': 431, 'volvo:FMX': 431, default: 490 }
const cabKey = (cfg: ChassisConfig) => `${cfg.cab.style}:${cfg.make === cfg.cab.style ? cfg.series : ''}`
const ROOF_NAMES: Record<RoofKind, string> = { low: 'nízká', normal: 'normální', high: 'vysoká', xhigh: 'extra vysoká' }
const WB_REF: Record<ChassisPreset['wheelbaseRef'], string> = {
  firstRear: 'od 1. nápravy k 1. zadní',
  rearCentre: 'od 1. nápravy ke středu zadní skupiny',
  secondFrontToFirstRear: 'od 2. přední k 1. zadní nápravě',
}

type Path = (string | number)[]

function getAt(obj: unknown, path: Path): unknown {
  return path.reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key as string], obj)
}

function setAt<T>(obj: T, path: Path, value: unknown): T {
  const copy = cloneConfig(obj as ChassisConfig) as unknown as Record<string, unknown>
  let node = copy
  for (const key of path.slice(0, -1)) node = node[key as string] as Record<string, unknown>
  node[path[path.length - 1] as string] = value
  return copy as T
}

const fmtT = (kg: number) => `${(kg / 1000).toLocaleString('cs-CZ', { maximumFractionDigits: 2 })} t`

export function ConfiguratorPage({ initialPreset }: { initialPreset?: string }) {
  const start = presetById(initialPreset ?? '') ?? PRESETS[0]
  const [preset, setPreset] = useState<ChassisPreset>(start)
  const [cfg, setCfg] = useState<ChassisConfig>(() => cloneConfig(start.config))
  const [built, setBuilt] = useState<ChassisConfig>(cfg)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const groupRef = useRef<THREE.Group | null>(null)
  const openModel = useApp((s) => s.openModel)

  // Rebuild the 3D model shortly after the last edit.
  useEffect(() => {
    const timer = window.setTimeout(() => setBuilt(cfg), 180)
    return () => window.clearTimeout(timer)
  }, [cfg])

  const model = useMemo(() => configToModel(built, preset.id), [built, preset.id])
  const params = useMemo(() => paramsForConfig(built), [built])
  const hints = useMemo(() => validateConfig(cfg), [cfg])

  function choosePreset(next: ChassisPreset) {
    setPreset(next)
    const fresh = cloneConfig(next.config)
    setCfg(fresh)
    setBuilt(fresh)
    window.history.replaceState(null, '', `#novy/${next.id}`)
  }

  const set = (path: Path, value: unknown) => setCfg((prev) => setAt(prev, path, value))
  const isApprox = (path: Path) => {
    const key = path.join('.')
    return preset.approx.includes(key) && getAt(cfg, path) === getAt(preset.config, path)
  }

  const num = (label: string, path: Path, opts: { step?: number; min?: number; max?: number; unit?: string; wide?: boolean } = {}) => (
    <Field label={label} unit={opts.unit ?? 'mm'} approx={isApprox(path)} wide={opts.wide}>
      <NumberInput value={Number(getAt(cfg, path))} step={opts.step ?? 10} min={opts.min} max={opts.max} onChange={(value) => set(path, value)} />
    </Field>
  )

  const series = seriesOf(preset.make)
  const configs = presetsOf(preset.make, preset.series)
  const wb = Math.round(wheelbase(cfg, preset.wheelbaseRef))
  const loadSum = cfg.axles.reduce((total, axle) => total + axle.maxLoad, 0)

  function setAxle(index: number, patch: Partial<AxleConfig>) {
    setCfg((prev) => {
      const next = cloneConfig(prev)
      next.axles[index] = { ...next.axles[index], ...patch }
      if (patch.position !== undefined) next.axles.sort((a, b) => a.position - b.position)
      return next
    })
  }

  function addAxle() {
    setCfg((prev) => {
      const next = cloneConfig(prev)
      const last = next.axles[next.axles.length - 1]
      next.axles.push({ ...last, position: last.position + 1370, driven: false, steered: true, lift: true, twin: false, maxLoad: 7500 })
      next.gvw += 7500
      return next
    })
  }

  function removeAxle(index: number) {
    setCfg((prev) => {
      if (prev.axles.length <= 2 || index === 0) return prev
      const next = cloneConfig(prev)
      next.gvw = Math.max(0, next.gvw - next.axles[index].maxLoad)
      next.axles.splice(index, 1)
      return next
    })
  }

  function setCabKind(kind: CabKind) {
    setCfg((prev) => {
      if (prev.cab.kind === kind) return prev
      const next = cloneConfig(prev)
      const extra = SLEEPER_DELTA[cabKey(prev)] ?? SLEEPER_DELTA.default
      const delta = kind === 'sleeper' ? extra : -extra
      next.cab.kind = kind
      next.cab.backFromAxle += delta
      next.cab.length += delta
      return next
    })
  }

  function setCabStyle(style: CabStyle) {
    setCfg((prev) => {
      const next = cloneConfig(prev)
      // Follow the brand colour unless the user picked their own.
      if (prev.cab.color === CAB_DEFAULT_COLOR[prev.cab.style]) next.cab.color = CAB_DEFAULT_COLOR[style]
      next.cab.style = style
      return next
    })
  }

  function setRoof(roof: RoofKind) {
    setCfg((prev) => {
      const next = cloneConfig(prev)
      const delta = ROOF_DELTA[cabKey(prev)] ?? ROOF_DELTA.default
      next.cab.height = Math.round(prev.cab.height - delta[prev.cab.roof] + delta[roof])
      next.cab.roof = roof
      return next
    })
  }

  async function saveGlb() {
    const group = groupRef.current
    if (!group) return
    setExporting(true)
    setExportError(null)
    try {
      downloadBlob(await exportGlb(group), `${cfg.name.replace(/[^\w.+-]+/g, '_') || 'podvozek'}.glb`)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

  function openInEditor() {
    openModel(model, params, cfg.name)
    window.location.hash = '#vykres'
  }

  return (
    <div className="app config-page">
      <header className="app-header">
        <div className="brand">
          <h1>Nový podvozek</h1>
          <span>konfigurátor podle katalogových listů výrobců</span>
        </div>
        <div className="row" style={{ alignItems: 'center' }}>
          <span className="muted">{cfg.name}</span>
          <a className="head-link" href="#">
            Úvod
          </a>
          <a className="head-link" href="#vykres">
            Nahrát výkres
          </a>
        </div>
      </header>

      <aside className="app-side">
        <section className="block" style={{ marginTop: 0 }}>
          <h2>Předloha</h2>
          <div className="cfg-grid">
            <Field label="Výrobce">
              <select
                value={preset.make}
                onChange={(event) => {
                  const make = event.target.value as Make
                  const first = PRESETS.find((item) => item.make === make)
                  if (first) choosePreset(first)
                }}
              >
                {MAKES.map((make) => (
                  <option key={make.id} value={make.id}>
                    {make.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Řada">
              <select
                value={preset.series}
                onChange={(event) => {
                  const first = presetsOf(preset.make, event.target.value)[0]
                  if (first) choosePreset(first)
                }}
              >
                {series.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Konfigurace" wide>
              <select
                value={preset.id}
                onChange={(event) => {
                  const next = presetById(event.target.value)
                  if (next) choosePreset(next)
                }}
              >
                {configs.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Rozvor (${WB_REF[preset.wheelbaseRef]})`} unit="mm" wide>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <select value={preset.wheelbases.includes(wb) ? wb : ''} onChange={(event) => setCfg((prev) => withWheelbase(prev, Number(event.target.value), preset.wheelbaseRef))}>
                  {preset.wheelbases.includes(wb) ? null : <option value="">vlastní</option>}
                  {preset.wheelbases.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <NumberInput value={wb} step={50} min={1500} max={9000} onChange={(value) => setCfg((prev) => withWheelbase(prev, value, preset.wheelbaseRef))} />
              </div>
            </Field>
          </div>
          <p className="source-note">
            Zdroj:{' '}
            {preset.source.startsWith('http') ? (
              <a href={preset.source} target="_blank" rel="noreferrer">
                {preset.source}
              </a>
            ) : (
              preset.source
            )}
            {preset.note ? <> · {preset.note}</> : null}
            <br />
            Hodnoty označené <span className="approx">≈</span> jsou odhad ({preset.approx.length}×), ostatní z podkladu výrobce.
          </p>
        </section>

        <section className="block">
          <h2>Základ</h2>
          <div className="cfg-grid">
            <Field label="Název" wide>
              <input type="text" value={cfg.name} onChange={(event) => set(['name'], event.target.value)} />
            </Field>
            <Field label="Druh">
              <select value={cfg.kind} onChange={(event) => set(['kind'], event.target.value)}>
                <option value="tractor">tahač návěsů</option>
                <option value="rigid">podvozek pro nástavbu</option>
              </select>
            </Field>
            {num('Přední převis', ['frontOverhang'])}
            {num('Zadní převis (od posl. nápravy)', ['rearOverhang'])}
            {num('Celková hmotnost', ['gvw'], { unit: 'kg', step: 500 })}
            {num('Hmotnost soupravy', ['gcw'], { unit: 'kg', step: 1000 })}
          </div>
        </section>

        <section className="block">
          <h2>Nápravy</h2>
          <table className="cfg-axles">
            <thead>
              <tr>
                <th>#</th>
                <th>Poloha</th>
                <th>Zatížení kg</th>
                <th>Pneu</th>
                <th>Rozchod</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cfg.axles.map((axle, index) => (
                <AxleRow
                  key={index}
                  index={index}
                  axle={axle}
                  approx={(key) => isApprox(['axles', index, key])}
                  onChange={(patch) => setAxle(index, patch)}
                  onRemove={cfg.axles.length > 2 && index > 0 ? () => removeAxle(index) : undefined}
                />
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 6 }}>
            <Button size="sm" variant="outline" onClick={addAxle} disabled={cfg.axles.length >= 5}>
              Přidat nápravu
            </Button>
          </div>
          <p className={loadSum >= cfg.gvw ? 'sum-check ok' : 'sum-check warn'}>
            Součet náprav {fmtT(loadSum)} {loadSum >= cfg.gvw ? '≥' : '<'} celková hmotnost {fmtT(cfg.gvw)}
          </p>
          <p className="source-note">
            Ř = řízená, H = hnací, Z = zvedací, 2× = dvojmontáž. Poloha se měří od 1. nápravy. Průměr kola se počítá z rozměru pneu (
            {cfg.axles.map((axle) => Math.round(tyreDiameter(axle.tyre))).join(' / ')} mm).
          </p>
        </section>

        <section className="block">
          <h2>Rám</h2>
          <div className="cfg-grid">
            {num('Šířka vzadu (vnější)', ['frame', 'widthRear'])}
            {num('Šířka vpředu (vnější)', ['frame', 'widthFront'])}
            {num('Zúžení končí za 1. nápravou', ['frame', 'taperEnd'], { step: 50 })}
            {num('Rám před 1. nápravou', ['frame', 'frontEnd'])}
            {num('Výška profilu', ['frame', 'sectionHeight'], { step: 1 })}
            {num('Šířka pásnice', ['frame', 'flange'], { step: 1 })}
            {num('Tloušťka', ['frame', 'thickness'], { step: 0.5, min: 3, max: 16 })}
            {num('Horní hrana rámu nad vozovkou', ['frame', 'topHeight'])}
          </div>
        </section>

        <section className="block">
          <h2>Kabina</h2>
          <div className="cfg-grid">
            <Field label="Tvar (značka)">
              <select value={cfg.cab.style} onChange={(event) => setCabStyle(event.target.value as CabStyle)}>
                {CAB_STYLES.map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Typ">
              <select value={cfg.cab.kind} onChange={(event) => setCabKind(event.target.value as CabKind)}>
                <option value="day">denní</option>
                <option value="sleeper">spací</option>
              </select>
            </Field>
            <Field label="Střecha">
              <select value={cfg.cab.roof} onChange={(event) => setRoof(event.target.value as RoofKind)}>
                {(Object.keys(ROOF_NAMES) as RoofKind[]).map((roof) => (
                  <option key={roof} value={roof}>
                    {ROOF_NAMES[roof]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Barva">
              <input
                type="color"
                value={`#${cfg.cab.color.toString(16).padStart(6, '0')}`}
                onChange={(event) => set(['cab', 'color'], parseInt(event.target.value.slice(1), 16))}
              />
            </Field>
            {num('Výška nad vozovkou', ['cab', 'height'])}
            {num('Šířka', ['cab', 'width'])}
            {num('Zadní stěna za 1. nápravou', ['cab', 'backFromAxle'])}
            <Field label="Délka (převis + zadní stěna)" unit="mm">
              <NumberInput value={cfg.frontOverhang + cfg.cab.backFromAxle} step={10} onChange={(value) => set(['cab', 'backFromAxle'], value - cfg.frontOverhang)} />
            </Field>
          </div>
        </section>

        <section className="block">
          <h2>Výbava</h2>
          <div className="cfg-grid">
            <TankFields label="Palivová nádrž" cfg={cfg} which="fuel" set={set} approx={isApprox} />
            <TankFields label="AdBlue" cfg={cfg} which="adblue" set={set} approx={isApprox} />
            <Field label="Bateriová skříň">
              <SideSelect enabled={cfg.battery.enabled} side={cfg.battery.side} onChange={(enabled, side) => set(['battery'], { enabled, side })} />
            </Field>
            <Field label="Vzduchojemy (ks)" approx={isApprox(['airTanks', 'count'])}>
              <NumberInput value={cfg.airTanks.enabled ? cfg.airTanks.count : 0} step={1} min={0} max={8} onChange={(value) => set(['airTanks'], { enabled: value > 0, count: value })} />
            </Field>
            <Field label="Výfuk">
              <select value={cfg.exhaust.kind} onChange={(event) => set(['exhaust', 'kind'], event.target.value)}>
                <option value="horizontal">vodorovný tlumič</option>
                <option value="vertical">svislý komín</option>
              </select>
            </Field>
            <Field label="Strana výfuku">
              <select value={cfg.exhaust.side} onChange={(event) => set(['exhaust', 'side'], event.target.value)}>
                <option value="left">vlevo</option>
                <option value="right">vpravo</option>
              </select>
            </Field>
            {cfg.kind === 'tractor' ? (
              <>
                <Check label="Točnice" checked={cfg.fifthWheel.enabled} onChange={(value) => set(['fifthWheel', 'enabled'], value)} />
                <span />
                {num('Předsunutí točnice před zadní nápravu', ['fifthWheel', 'lead'])}
                {num('Výška točnice nad vozovkou', ['fifthWheel', 'height'])}
              </>
            ) : null}
            <Check label="Boční ochranné rámy" checked={cfg.sideGuards} onChange={(value) => set(['sideGuards'], value)} />
            <Check label="Zadní zábrana" checked={cfg.rearUnderrun} onChange={(value) => set(['rearUnderrun'], value)} />
            <Check label="Blatníky" checked={cfg.mudguards} onChange={(value) => set(['mudguards'], value)} />
          </div>
        </section>

        <section className="block">
          <h2>Kontrola</h2>
          {hints.length || model.warnings.length ? (
            <ul className="hints">
              {hints.map((hint) => (
                <li key={hint.text} className={hint.level}>
                  {hint.text}
                </li>
              ))}
              {model.warnings.map((warning) => (
                <li key={warning} className="warn">
                  {warning}
                </li>
              ))}
            </ul>
          ) : (
            <p className="status ok">Bez upozornění.</p>
          )}
        </section>

        <section className="block">
          <h2>Export</h2>
          <div className="row">
            <Button variant="rust" disabled={exporting} onClick={() => void saveGlb()}>
              {exporting ? 'Exportuji…' : 'Export GLB'}
            </Button>
            <Button variant="outline" onClick={openInEditor}>
              Otevřít v editoru parametrů
            </Button>
            <Button variant="ghost" onClick={() => choosePreset(preset)}>
              Obnovit předlohu
            </Button>
          </div>
          {exportError ? <p className="status error">{exportError}</p> : null}
          <p className="status">GLB je v milimetrech, Y nahoru, počátek na přední nápravě.</p>
        </section>
      </aside>

      <Viewport model={model} params={params} groupRef={groupRef} fit={1.75} />
    </div>
  )
}

function Field({ label, unit, approx, wide, children }: { label: string; unit?: string; approx?: boolean; wide?: boolean; children: ReactNode }) {
  return (
    <label className={wide ? 'cfg-field wide' : 'cfg-field'}>
      <span>
        <span>
          {label}
          {unit ? ` (${unit})` : ''}
        </span>
        {approx ? (
          <span className="approx" title="Odhad – hodnota není v podkladu výrobce uvedena">
            ≈ odhad
          </span>
        ) : null}
      </span>
      {children}
    </label>
  )
}

/** Number input that keeps the typed text while editing and commits valid numbers. */
function NumberInput({ value, step, min, max, onChange }: { value: number; step?: number; min?: number; max?: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value))
  const [focused, setFocused] = useState(false)
  return (
    <input
      type="number"
      value={focused ? text : String(value)}
      step={step}
      min={min}
      max={max}
      onFocus={() => {
        setText(String(value))
        setFocused(true)
      }}
      onBlur={() => setFocused(false)}
      onChange={(event) => {
        setText(event.target.value)
        const next = Number(event.target.value)
        if (event.target.value !== '' && Number.isFinite(next)) onChange(next)
      }}
    />
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="cfg-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  )
}

function SideSelect({ enabled, side, onChange }: { enabled: boolean; side: Side; onChange: (enabled: boolean, side: Side) => void }) {
  return (
    <select
      value={enabled ? side : 'off'}
      onChange={(event) => (event.target.value === 'off' ? onChange(false, side) : onChange(true, event.target.value as Side))}
    >
      <option value="off">bez</option>
      <option value="left">vlevo</option>
      <option value="right">vpravo</option>
    </select>
  )
}

function TankFields({
  label,
  cfg,
  which,
  set,
  approx,
}: {
  label: string
  cfg: ChassisConfig
  which: 'fuel' | 'adblue'
  set: (path: Path, value: unknown) => void
  approx: (path: Path) => boolean
}) {
  const tank = cfg[which]
  return (
    <>
      <Field label={`${label} (l)`} approx={approx([which, 'liters'])}>
        <NumberInput value={tank.liters} step={10} min={0} onChange={(liters) => set([which], { ...tank, liters, enabled: liters > 0 && tank.enabled })} />
      </Field>
      <Field label="Umístění">
        <SideSelect enabled={tank.enabled} side={tank.side} onChange={(enabled, side) => set([which], { ...tank, enabled, side })} />
      </Field>
    </>
  )
}

function AxleRow({
  index,
  axle,
  approx,
  onChange,
  onRemove,
}: {
  index: number
  axle: AxleConfig
  approx: (key: keyof AxleConfig) => boolean
  onChange: (patch: Partial<AxleConfig>) => void
  onRemove?: () => void
}) {
  const flag = (key: 'steered' | 'driven' | 'lift' | 'twin', text: string, title: string) => (
    <button type="button" className={axle[key] ? 'flag on' : 'flag'} title={title} onClick={() => onChange({ [key]: !axle[key] })}>
      {text}
    </button>
  )
  const mark = (key: keyof AxleConfig) => (approx(key) ? <span className="approx" title="Odhad">≈</span> : null)
  return (
    <>
      <tr>
        <td>{index + 1}</td>
        <td>{index === 0 ? <span className="muted">0</span> : <NumberInput value={axle.position} step={10} onChange={(position) => onChange({ position })} />}</td>
        <td>
          <div className="cell">
            <NumberInput value={axle.maxLoad} step={100} min={0} onChange={(maxLoad) => onChange({ maxLoad })} />
            {mark('maxLoad')}
          </div>
        </td>
        <td>
          <div className="cell">
            <input type="text" value={axle.tyre} onChange={(event) => onChange({ tyre: event.target.value })} />
            {mark('tyre')}
          </div>
        </td>
        <td>
          <div className="cell">
            <NumberInput value={axle.track} step={5} onChange={(track) => onChange({ track })} />
            {mark('track')}
          </div>
        </td>
        <td>
          {onRemove ? (
            <button type="button" className="flag" title="Odebrat nápravu" onClick={onRemove}>
              ✕
            </button>
          ) : null}
        </td>
      </tr>
      <tr>
        <td />
        <td colSpan={5}>
          <div className="flags">
            {flag('steered', 'Ř', 'řízená')}
            {flag('driven', 'H', 'hnací')}
            {flag('lift', 'Z', 'zvedací')}
            {flag('twin', '2×', 'dvojmontáž')}
          </div>
        </td>
      </tr>
    </>
  )
}

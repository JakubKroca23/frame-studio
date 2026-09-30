import { useRef, useState, type DragEvent } from 'react'
import { Button } from './components/ui/button'
import { MAKES, PRESETS } from './presets'
import { useApp } from './state'

const FEATURED = ['volvo-fh-4x2-tractor', 'scania-r-6x2-rigid', 'man-tgs-8x4-tipper', 'daf-xf-4x2-tractor']

export function StartScreen() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const { loadFile, loadSample, status } = useApp()

  function openDrawing(file: File) {
    window.location.hash = '#vykres'
    void loadFile(file)
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setOver(false)
    const file = event.dataTransfer.files[0]
    if (file) openDrawing(file)
  }

  return (
    <div className="start">
      <header className="app-header">
        <div className="brand">
          <h1>Podvozek</h1>
          <span>z 2D výkresu nebo z parametrů do 3D rámu</span>
        </div>
      </header>
      <main className="start-main">
        <p className="empty-kicker">Jak chcete začít?</p>
        <div className="start-choices">
          <section
            className={over ? 'start-card over' : 'start-card'}
            onDragOver={(event) => {
              event.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            <span className="start-num">1</span>
            <h2>Nahrát výkres</h2>
            <p>
              DXF nebo DWG podvozku (Scania ICD, Volvo BEP, DAF…), případně archiv .dxf.gz, .tgz či .zip. Z bokorysu a půdorysu vznikne rám,
              nápravy, kabina a výbava; detekci před generováním zkontrolujete.
            </p>
            <div className="row">
              <Button onClick={() => fileRef.current?.click()}>Nahrát výkres</Button>
              <Button
                variant="outline"
                disabled={status === 'loading'}
                onClick={() => {
                  window.location.hash = '#vykres'
                  void loadSample('scania')
                }}
              >
                Vzor Scania
              </Button>
              <Button
                variant="outline"
                disabled={status === 'loading'}
                onClick={() => {
                  window.location.hash = '#vykres'
                  void loadSample('volvo')
                }}
              >
                Vzor Volvo
              </Button>
            </div>
            <p className="muted">Soubor můžete také přetáhnout na tuto kartu.</p>
            <input
              ref={fileRef}
              hidden
              type="file"
              accept=".dxf,.dwg,.gz,.tgz,.zip,application/dxf,application/acad,application/gzip,application/zip"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) openDrawing(file)
                event.target.value = ''
              }}
            />
          </section>

          <section className="start-card is-new">
            <span className="start-num">2</span>
            <h2>Vytvořit nový</h2>
            <p>
              Podvozek z parametrů: výrobce, řada, uspořádání náprav, rozvor, převisy, rám, zatížení náprav, pneumatiky, kabina a výbava.
              Předlohy {MAKES.map((make) => make.name).join(', ')} podle katalogových listů výrobců, vše dál upravitelné, živě ve 3D.
            </p>
            <div className="row">
              <Button variant="rust" onClick={() => (window.location.hash = '#novy')}>
                Vytvořit nový
              </Button>
            </div>
            <div className="start-presets">
              {FEATURED.map((id) => {
                const preset = PRESETS.find((item) => item.id === id)
                if (!preset) return null
                return (
                  <a key={id} href={`#novy/${id}`} className="start-preset">
                    <strong>{MAKES.find((make) => make.id === preset.make)?.name}</strong>
                    <span>{preset.label}</span>
                  </a>
                )
              })}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

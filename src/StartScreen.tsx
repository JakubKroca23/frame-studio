import { TopBar, useOpenAny } from './components/TopBar'

export function StartScreen() {
  const { input, open } = useOpenAny()
  return (
    <div className="start">
      <TopBar page="start" />
      <main className="start-main start-hero-wrap">
        <img className="start-mark" src="/fs-mark.svg" alt="" width="120" height="120" />
        <h1 className="start-title">FRAME <span>STUDIO</span></h1>
        <ul className="start-about">
          <li>3D konfigurátor nástaveb a rámů nákladních podvozků – Volvo, Scania, MAN, DAF podle katalogových listů výrobců.</li>
          <li>Hákové nosiče a jeřáby HIAB s kloubovým pohybem ramen a výsuvů, katalog jeřábů odvozený z výkresů.</li>
          <li>Živá stabilita a zatížení náprav z trw / TrailerWIN – otevřete .trw projekt a konfigurace se propojí.</li>
          <li>Import výkresů: DXF/DWG podvozku → 3D rám, DXF se třemi pohledy → 3D díl.</li>
        </ul>
        <div className="start-cta">
          <a className="cta-primary" href="#novy">Vytvořit nový projekt</a>
          <button type="button" className="cta-secondary" onClick={open}>Otevřít existující</button>
        </div>
        <p className="muted start-hint">Otevřít lze .trw projekt, export trw (.json) nebo výkres DXF / DWG.</p>
        {input}
      </main>
    </div>
  )
}

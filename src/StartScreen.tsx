import { HeroArt, MiniArt } from './components/Hero'
import { TopBar, useOpenAny } from './components/TopBar'

const FEATURES = [
  { kind: 'config', title: '3D konfigurátor podvozků a rámů', text: 'Podvozky Volvo, Scania, MAN a DAF podle katalogových listů výrobců: nápravy, rozvor, převisy, rám, kabina a výbava, vše upravitelné živě ve 3D a export GLB.', href: '#novy' },
  { kind: 'hooklift', title: 'Hákové nosiče Multilift', text: 'Katalog 57 modelů Hiab MULTILIFT ULTIMA z katalogových listů; parametrický 3D model se přizpůsobí délce rámu a výšce háku.', href: '#multilift' },
  { kind: 'crane', title: 'Jeřáby HIAB s kloubovým pohybem', text: 'Jeřáby odvozené z výkresů Hiab (šablony 142 / 408): ramena, výsuvy a dosahy podle tabulek, ovládání kloubů přímo ve scéně.', href: '#jeraby' },
  { kind: 'stability', title: 'Živá stabilita z trw / TrailerWIN', text: 'Otevřete .trw projekt nebo export trw a konfigurace se propojí: zatížení náprav, sektory stability jeřábu a výsledky přímo z výpočtu trw.', href: '#novy' },
  { kind: 'dxf', title: 'Import DXF / DWG do 3D', text: 'Výkres podvozku (bokorys a půdorys) se převede na 3D rám s nápravami; DXF se třemi pohledy na 3D díl, výkres jeřábu HIAB na jeřáb ze šablony.', href: '#dxf3d' },
] as const

export function StartScreen() {
  const { input, open } = useOpenAny()
  return (
    <div className="start">
      <TopBar page="start" />
      <main className="start-main start-page">
        <HeroArt />
        <h1 className="start-title">FRAME <span>STUDIO</span></h1>
        <p className="start-lead">
          Frame Studio je pracovní prostor pro návrh nástaveb nákladních vozidel: z parametrů nebo z výkresu postaví 3D podvozek s rámem, osadí
          hákový nosič nebo jeřáb a propojí ho s výpočtem stability a zatížení náprav v trw.
        </p>
        <div className="start-cta">
          <a className="cta-primary" href="#novy">Vytvořit nový projekt</a>
          <button type="button" className="cta-secondary" onClick={open}>Importovat</button>
          <p className="muted start-hint">Import: .trw projekt, export trw (.json) nebo výkres DXF / DWG.</p>
        </div>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <a key={f.title} className="feature-card" href={f.href}>
              <MiniArt kind={f.kind} />
              <h2>{f.title}</h2>
              <p>{f.text}</p>
            </a>
          ))}
        </div>
        {input}
      </main>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { TopBar, useOpenAny } from './components/TopBar'
import { StartHero } from './StartHero'

const FEATURES = [
  { kind: 'config', title: '3D konfigurátor podvozků a rámů', text: 'Podvozky Volvo, Scania, MAN a DAF podle katalogových listů výrobců: nápravy, rozvor, převisy, rám, kabina a výbava, živě ve 3D a export GLB.', href: '#novy' },
  { kind: 'hooklift', title: 'Hákové nosiče Multilift', text: 'Katalog 57 modelů Hiab MULTILIFT ULTIMA z katalogových listů; parametrický 3D model se přizpůsobí délce rámu a výšce háku.', href: '#multilift' },
  { kind: 'crane', title: 'Jeřáby HIAB s kloubovým pohybem', text: 'Jeřáby odvozené z výkresů Hiab (šablony 142 / 408): otoč, ramena a výsuvy podle tabulek dosahů, ovládání kloubů přímo ve scéně.', href: '#jeraby' },
  { kind: 'stability', title: 'Živá stabilita z trw / TrailerWIN', text: 'Otevřete .trw projekt nebo export trw: sektory stability jeřábu, zatížení náprav a výsledky přímo z výpočtu trw.', href: '#novy' },
  { kind: 'dxf', title: 'Import DXF / DWG do 3D', text: 'Výkres podvozku (bokorys a půdorys) se převede na 3D rám s nápravami a kabinou; DXF se třemi pohledy na 3D díl.', href: '#dxf3d' },
] as const

/** Card loop captured from the app's own 3D scenes (scripts/capture-cards.cjs); first frame as still for reduced motion. */
function CardLoop({ kind, title }: { kind: string; title: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [still] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  useEffect(() => {
    const v = ref.current
    if (!v || still) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) void v.play().catch(() => {}); else v.pause() })
    io.observe(v)
    return () => io.disconnect()
  }, [still])
  if (still) return <img className="card-media" src={`/cards/${kind}.webp`} alt={title} width="480" height="300" loading="lazy" />
  return <video ref={ref} className="card-media" src={`/cards/${kind}.webm`} poster={`/cards/${kind}.webp`} muted loop playsInline preload="none" aria-label={title} width="480" height="300" />
}

export function StartScreen() {
  const { input, open } = useOpenAny()
  return (
    <div className="start">
      <TopBar page="start" />
      <main className="start-main start-page">
        <StartHero />
        <h1 className="start-title">CS <span>STUDIO</span></h1>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <a key={f.title} className="feature-card" href={f.href}>
              <CardLoop kind={f.kind} title={f.title} />
              <h2>{f.title}</h2>
              <p>{f.text}</p>
            </a>
          ))}
        </div>
        <p className="start-lead">
          CS Studio je pracovní prostor pro návrh nástaveb nákladních vozidel: z parametrů nebo z výkresu postaví 3D podvozek s rámem,
          osadí hákový nosič nebo jeřáb a propojí ho s výpočtem stability a zatížení náprav v trw.
        </p>
        <div className="start-cta">
          <a className="cta-primary" href="#novy">Vytvořit nový projekt</a>
          <button type="button" className="cta-secondary" onClick={open}>Importovat</button>
          <p className="muted start-hint">Import: .trw projekt, export trw (.json) nebo výkres DXF / DWG.</p>
        </div>
        {input}
      </main>
    </div>
  )
}

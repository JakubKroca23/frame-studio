import { useEffect, useRef, useState } from 'react'
import { TopBar } from './components/TopBar'
import { StartHero } from './StartHero'

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

const SIDE = [
  { kind: 'hooklift', title: 'Nosiče Multilift', text: 'Katalog 57 modelů Hiab MULTILIFT ULTIMA s 3D modelem a kótami.', href: '#multilift' },
  { kind: 'crane', title: 'Jeřáby HIAB', text: 'Kloubové jeřáby se stupnicemi, výsuvy a dosahy.', href: '#jeraby' },
] as const

export function StartScreen() {
  return (
    <div className="start start-v3">
      <TopBar page="start" />
      <main className="start-v3-main">
        <StartHero />
        <aside className="start-v3-side" aria-label="Katalogy">
          {SIDE.map((f) => (
            <a key={f.title} className="feature-card" href={f.href} data-testid={`start-card-${f.kind}`}>
              <CardLoop kind={f.kind} title={f.title} />
              <h2>{f.title}</h2>
              <p>{f.text}</p>
            </a>
          ))}
        </aside>
      </main>
    </div>
  )
}

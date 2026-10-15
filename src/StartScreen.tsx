import { TopBar } from './components/TopBar'
import { StartHero } from './StartHero'

/** Start page: one WebGL scene (hall + exhibits) is the whole page – no card videos, no second canvas. */
export function StartScreen() {
  return (
    <div className="start start-v3">
      <TopBar page="start" />
      <main className="start-v3-main">
        <StartHero />
      </main>
    </div>
  )
}

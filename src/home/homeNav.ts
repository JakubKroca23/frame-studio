import { useSceneFilters } from '../view/sceneFilters'
import { queueProjectFile } from '../openProject'
import { setPendingDrive } from './pose'

/** Home screen in the model-database view (exhibits along the left hall wall). */
export const DB_HASH = '#databaze'

/** Top bar 'Databáze': home screen + glide to the database view, from any page. */
export function goDatabase() {
  // ?trw= / ?from= links pin the configurator in Root – drop the query (full load) to reach the home screen
  if (window.location.search) { window.location.replace(window.location.origin + window.location.pathname + DB_HASH); return }
  if (window.location.hash === DB_HASH) window.dispatchEvent(new HashChangeEvent('hashchange'))
  else window.location.hash = DB_HASH
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Same flow as the 'Import TRW' door: TRW/JSON → configurator with the drive-out; already in the configurator →
 *  the open page just loads the project. */
export function openTrwFile(f: File) {
  useSceneFilters.getState().importDefaults()
  const inCfg = window.location.hash.startsWith('#novy')
  if (!inCfg && !reducedMotion()) setPendingDrive({ door: 1 })
  queueProjectFile(f)
  if (!inCfg) window.location.hash = '#novy'
}

import { useSceneFilters } from '../view/sceneFilters'
import { queueProjectFile } from '../openProject'
import { setPendingDrive } from './pose'

/** Unified model browser (all model databases). */
export const DB_HASH = '#databaze'

/** Top bar 'Databáze': open the model browser from any page (?trw= / ?from= links pin the configurator in Root, so
 *  those drop the query with a full load). */
export function goDatabase() {
  if (window.location.search) { window.location.replace(window.location.origin + window.location.pathname + DB_HASH); return }
  if (!/^#(databaze|jeraby|multilift|podpery)(\/|$)/.test(window.location.hash)) window.location.hash = DB_HASH
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

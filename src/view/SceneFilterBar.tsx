import { SCENE_FILTERS, useSceneFilterClasses, useSceneFilters } from './sceneFilters'

/** Toolbar in the 3D scene: show / hide labels, dimensions, controls, forces and the stability diagram (state persisted). */
export function SceneFilterBar() {
  const s = useSceneFilters()
  useSceneFilterClasses()
  return (
    <div className="scene-filters" role="toolbar" aria-label="Zobrazení ve scéně">
      {SCENE_FILTERS.map((f) => (
        <button key={f.key} type="button" className={s[f.key] ? 'sf-btn is-on' : 'sf-btn'} aria-pressed={s[f.key]} title={f.title} data-testid={`sf-${f.key}`} onClick={() => s.toggle(f.key)}>
          {f.label}
        </button>
      ))}
    </div>
  )
}

import { StagePortal } from '../db/StagePortal'
import { Canvas } from '@react-three/fiber'
import { Environment, OrbitControls } from '@react-three/drei'
import { AuxOutriggerModel, type AuxStabKind } from '../trw/AuxOutriggerModel'
import CATALOG from '../trw/outriggerCatalog.json'
import { TreeContent, TreeNode } from '../components/Tree'

type Entry = (typeof CATALOG.entries)[number]
const KIND: Record<string, AuxStabKind> = { 'hiab-aux-5m': '5m', 'hiab-aux-6m': '6m' }
const fmt = (v: number | null | undefined, u = 'mm') => (v == null ? '—' : `${v.toLocaleString('cs-CZ')} ${u}`)
/** Housing top above ground in the preview: chosen so the full leg stroke (450 mm) just reaches the ground (illustrative). */
const TOP = 1300

const auxName = (x: { name: string }) => x.name.replace(/^HIAB přídavné podpěry\s*/, '')
const auxMaker = (x: { name: string }) => (/^HIAB\b/.test(x.name) ? 'HIAB' : x.name.split(/\s+/)[0])

/** Model-database category 'Přídavné podpěry': maker → model → (dimensions, loads); values only
 *  from outriggerCatalog.json. The viewer of the selected model is portalled into the browser's main area. */
export function AuxCategory({ selKey, pick, stage }: { selKey: string | null; pick: (key: string) => void; stage: HTMLElement | null }) {
  const cur = selKey && CATALOG.entries.some((e) => e.key === selKey) ? selKey : null
  const makers = [...new Set(CATALOG.entries.map(auxMaker))]
  return (
    <TreeNode label="Přídavné podpěry" count={CATALOG.entries.length} open={!!cur} testid="db-cat-podpery">
      {makers.map((m) => {
        const items = CATALOG.entries.filter((x) => auxMaker(x) === m)
        return (
          <TreeNode key={m} label={m} count={items.length} open={items.some((x) => x.key === cur)}>
            {items.map((x) => x.key !== cur
              ? <TreeNode key={x.key} label={auxName(x)} hint={`vysunuto ${fmt(x.extendedMm)}`} onSelect={() => pick(x.key)} testid={`aux-row-${x.key}`} />
              : <AuxSelected key={x.key} entryKey={x.key} stage={stage} />)}
          </TreeNode>
        )
      })}
    </TreeNode>
  )
}

function AuxSelected({ entryKey: key, stage }: { entryKey: string; stage: HTMLElement | null }) {
  const e = CATALOG.entries.find((x) => x.key === key)! as Entry & { modelDeviations?: Record<string, string> }
  const reach = e.extendedMm / 2 // shown extended (controls removed from the tree)
  return (
    <>
      <TreeNode label={auxName(e)} hint={`vysunuto ${fmt(e.extendedMm)}`} selected open onSelect={() => {}} testid={`aux-row-${e.key}`}>
                  <TreeNode label="Rozměry" count={7}>
                    <TreeContent>
                      <div className="ml-detail" data-testid="aux-detail">
                        <dl>
                          <dt>Šířka zasunuto</dt><dd>{fmt(e.retractedMm)}</dd>
                          <dt>Šířka vysunuto</dt><dd>{fmt(e.extendedMm)}</dd>
                          <dt>Rozteč sloupů</dt><dd>{fmt(e.columnSpacingMm)}</dd>
                          <dt>Šířka nosníku</dt><dd>{fmt(e.widthMm)}</dd>
                          <dt>Výška nosníku</dt><dd>{fmt(e.beamHeightMm)}</dd>
                          <dt>Výsuv ramene / strana</dt><dd>{fmt(e.armStrokeMm)}</dd>
                          <dt>Zdvih nohy</dt><dd>{fmt(e.legStrokeMm)}</dd>
                        </dl>
                      </div>
                    </TreeContent>
                  </TreeNode>
                  <TreeNode label="Zatížení" count={1}>
                    <TreeContent>
                      <div className="ml-detail"><dl><dt>Fmax vnitřní / vnější</dt><dd>{fmt(e.fmaxInnerKg, 'kg')} / {fmt(e.fmaxOuterKg, 'kg')}</dd></dl></div>
                    </TreeContent>
                  </TreeNode>
      </TreeNode>
      <StagePortal stage={stage}>
        <Canvas camera={{ position: [4200, 3400, 6200], fov: 40, near: 10, far: 100000 }} gl={{ preserveDrawingBuffer: true }}>
          <color attach="background" args={['#1a2230']} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[6000, 9000, 5000]} intensity={1.3} />
          <Environment preset="city" />
          <AuxOutriggerModel key={key} kind={KIND[key] ?? '5m'} x={0} top={TOP} reachLeft={reach} reachRight={reach} />
          <OrbitControls makeDefault target={[0, 600, 0]} />
        </Canvas>
      </StagePortal>
    </>
  )
}

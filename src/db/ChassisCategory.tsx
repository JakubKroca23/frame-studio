import { useEffect, useMemo } from 'react'
import { StagePortal } from './StagePortal'
import { Canvas, useThree } from '@react-three/fiber'
import { Environment, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { MAKES, PRESETS, type ChassisPreset } from '../presets'
import { configToModel, paramsForConfig } from '../presets/configModel'
import { buildChassisGroup, disposeGroup } from '../mesh/build'
import { ConcreteFloor } from '../view/ConcreteFloor'
import { TreeContent, TreeNode } from '../components/Tree'

const fmt = (v: number | null | undefined, u = 'mm') => (v == null ? '—' : `${Math.round(v).toLocaleString('cs-CZ')} ${u}`)
const KIND: Record<string, string> = { tractor: 'tahač', rigid: 'podvozek (rigid)' }

/** Model-database category 'Podvozky': make → series → preset (parametric chassis from the configurator presets;
 *  only data already in chassisPresets.ts). The parametric 3D chassis is portalled into the browser's main area. */
export function ChassisCategory({ selKey, pick, stage }: { selKey: string | null; pick: (id: string) => void; stage: HTMLElement | null }) {
  const cur = selKey && PRESETS.some((p) => p.id === selKey) ? selKey : null
  const curP = PRESETS.find((p) => p.id === cur)
  return (
    <TreeNode label="Podvozky" count={PRESETS.length} open={!!cur} testid="db-cat-podvozky">
      {MAKES.filter((m) => PRESETS.some((p) => p.make === m.id)).map((m) => {
        const ofMake = PRESETS.filter((p) => p.make === m.id)
        const series = [...new Set(ofMake.map((p) => p.series))]
        return (
          <TreeNode key={m.id} label={m.name} count={ofMake.length} open={curP?.make === m.id}>
            {series.map((se) => {
              const items = ofMake.filter((p) => p.series === se)
              return (
                <TreeNode key={se} label={se} count={items.length} open={curP?.make === m.id && curP.series === se}>
                  {items.map((p) => p.id !== cur
                    ? <TreeNode key={p.id} label={p.label} onSelect={() => pick(p.id)} testid={`chassis-node-${p.id}`} />
                    : <ChassisSelected key={p.id} preset={p} stage={stage} />)}
                </TreeNode>
              )
            })}
          </TreeNode>
        )
      })}
    </TreeNode>
  )
}

function ChassisSelected({ preset: p, stage }: { preset: ChassisPreset; stage: HTMLElement | null }) {
  const c = p.config
  return (
    <>
      <TreeNode label={p.label} selected open onSelect={() => {}} testid={`chassis-node-${p.id}`}>
        <TreeNode label="Parametry" count={9} open>
          <TreeContent>
            <div className="ml-detail" data-testid="chassis-detail">
              <dl>
                <dt>Model</dt><dd>{c.name}</dd>
                <dt>Druh</dt><dd>{KIND[c.kind] ?? c.kind}</dd>
                <dt>Nápravy</dt><dd>{c.axles.length} ({c.axles.filter((a) => a.driven).length} hnané)</dd>
                <dt>Rozvory</dt><dd>{p.wheelbases.map((w) => w.toLocaleString('cs-CZ')).join(', ')} mm</dd>
                <dt>Přední převis</dt><dd>{fmt(c.frontOverhang)}</dd>
                <dt>Zadní převis</dt><dd>{fmt(c.rearOverhang)}</dd>
                <dt>Výška rámu</dt><dd>{fmt(c.frame.topHeight)}</dd>
                <dt>Šířka rámu</dt><dd>{fmt(c.frame.widthRear)}</dd>
                <dt>GVW / GCW</dt><dd>{fmt(c.gvw, 'kg')} / {fmt(c.gcw, 'kg')}</dd>
              </dl>
              <a className="cta-primary ml-open" href={`#novy/${encodeURIComponent(p.id)}`} data-testid="chassis-open">Otevřít v konfigurátoru</a>
            </div>
            {p.approx.length ? <p className="muted" style={{ margin: '6px 0 0' }}>Odhadnuté hodnoty: {p.approx.length}</p> : null}
          </TreeContent>
        </TreeNode>
        <TreeNode label="Zdroj">
          <TreeContent><p className="muted" style={{ margin: 0, wordBreak: 'break-word' }}>{p.source}{p.note ? ` · ${p.note}` : ''}</p></TreeContent>
        </TreeNode>
      </TreeNode>
      <StagePortal stage={stage}><ChassisStage preset={p} /></StagePortal>
    </>
  )
}

function ChassisMesh({ preset }: { preset: ChassisPreset }) {
  const group = useMemo(() => {
    const model = configToModel(preset.config, preset.id), params = paramsForConfig(preset.config)
    return buildChassisGroup(model, { ...params, holes: 'off' })
  }, [preset])
  useEffect(() => () => disposeGroup(group), [group])
  const { camera, controls } = useThree()
  useEffect(() => {
    group.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true } })
    group.updateMatrixWorld(true)
    const b = new THREE.Box3().setFromObject(group), ctr = b.getCenter(new THREE.Vector3()), len = b.getSize(new THREE.Vector3()).length()
    camera.position.set(ctr.x - len * 0.55, ctr.y + len * 0.3, ctr.z + len * 0.75)
    const ctl = controls as unknown as { target: THREE.Vector3; update: () => void } | null
    if (ctl) { ctl.target.copy(ctr); ctl.update() } else camera.lookAt(ctr)
  }, [group, camera, controls])
  return <primitive object={group} />
}

function ChassisStage({ preset }: { preset: ChassisPreset }) {
  return (
    <Canvas shadows camera={{ position: [-6000, 4000, 9000], fov: 40, near: 10, far: 100000 }} gl={{ preserveDrawingBuffer: true }}>
      <color attach="background" args={['#1a2230']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[6000, 9000, 5000]} intensity={1.3} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-14000} shadow-camera-right={14000} shadow-camera-top={14000} shadow-camera-bottom={-14000} shadow-camera-near={100} shadow-camera-far={60000} shadow-bias={-0.0004} />
      <Environment preset="city" />
      <ConcreteFloor size={60000} dark />
      <ChassisMesh preset={preset} />
      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.04} />
    </Canvas>
  )
}

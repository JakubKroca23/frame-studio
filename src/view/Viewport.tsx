import { OrbitControls, GizmoHelper, GizmoViewport, Grid } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import type { ChassisModel, ChassisParams } from '../model/types'
import { buildChassisGroup, disposeGroup } from '../mesh/build'
import { Button } from '../components/ui/button'

export function Viewport({
  model,
  params,
  groupRef,
}: {
  model: ChassisModel | null
  params: ChassisParams
  groupRef: RefObject<THREE.Group | null>
}) {
  const setView = useRef<(view: string) => void>(() => {})

  return (
    <section className="viewport">
      <Canvas
        camera={{ position: [4200, 2600, 6800], fov: 38, near: 15, far: 250000 }}
        gl={{ antialias: true, logarithmicDepthBuffer: true, toneMappingExposure: 1.3 }}
      >
        <color attach="background" args={['#d5dbe1']} />
        <hemisphereLight args={['#f7f4ee', '#3a4450', 1.15]} />
        <ambientLight intensity={0.45} />
        <directionalLight position={[5000, 9000, 6000]} intensity={2.2} />
        <directionalLight position={[-7000, 4000, -3000]} intensity={0.7} />
        {model ? <Chassis model={model} params={params} groupRef={groupRef} /> : null}
        <Grid
          args={[40000, 40000]}
          position={[3000, 0, 0]}
          cellSize={500}
          cellThickness={0.5}
          cellColor="#c3ccd4"
          sectionSize={2000}
          sectionThickness={1}
          sectionColor="#9eacb8"
          fadeDistance={28000}
          infiniteGrid
        />
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI * 0.49} />
        <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
          <GizmoViewport axisColors={['#c24e28', '#7d9a78', '#d7d2c8']} labelColor="#111" />
        </GizmoHelper>
        <CameraBridge setView={setView} />
      </Canvas>
      {model ? (
        <div className="view-buttons">
          <Button variant="view" size="sm" onClick={() => setView.current('persp')}>
            Perspektiva
          </Button>
          <Button variant="view" size="sm" onClick={() => setView.current('side')}>
            Bok
          </Button>
          <Button variant="view" size="sm" onClick={() => setView.current('top')}>
            Půdorys
          </Button>
          <Button variant="view" size="sm" onClick={() => setView.current('front')}>
            Zepředu
          </Button>
        </div>
      ) : (
        <EmptyHint />
      )}
      <p className="axis-note">Počátek na vozovce ve středu přední nápravy. X dozadu, Z nahoru, jednotky mm.</p>
    </section>
  )
}

function Chassis({
  model,
  params,
  groupRef,
}: {
  model: ChassisModel
  params: ChassisParams
  groupRef: RefObject<THREE.Group | null>
}) {
  const group = useMemo(() => {
    const holes = params.show.holes ? params.holes : 'off'
    return buildChassisGroup(model, { ...params, holes })
  }, [model, params])

  useEffect(() => {
    groupRef.current = group
    return () => {
      if (groupRef.current === group) groupRef.current = null
      disposeGroup(group)
    }
  }, [group, groupRef])

  useEffect(() => {
    const show = params.show
    group.children.forEach((child) => {
      const role = child.userData.role as keyof ChassisParams['show'] | undefined
      if (role && role in show) child.visible = show[role]
    })
  }, [group, params.show])

  return (
    <>
      <primitive object={group} />
      <FrameCamera model={model} />
    </>
  )
}

function FrameCamera({ model }: { model: ChassisModel }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null
  const token = model.header.icdNo ?? model.profileId
  useEffect(() => {
    if (!controls || !model.frame) return
    const length = model.frame.left[model.frame.left.length - 1].x - model.frame.left[0].x
    const origin = model.axles[0]?.x ?? model.frame.left[0].x
    const centerX = length / 2 - (origin - model.frame.left[0].x)
    const dist = Math.max(length, 8000) * 0.92
    camera.position.set(centerX + dist * 0.42, 1600 + dist * 0.32, dist * 0.72)
    controls.target.set(centerX, 900, 0)
    controls.update()
  }, [token, camera, controls, model])
  return null
}

function EmptyHint() {
  return (
    <div className="empty-hint">
      <p className="empty-kicker">Scania ICD a příbuzné výkresy</p>
      <h2>Z bokorysu a půdorysu vznikne rám, nápravy a kabina.</h2>
      <p>Nahrajte DXF, nebo otevřete vzorový výkres podvozku G 360E B6x2*4NB.</p>
    </div>
  )
}

function CameraBridge({ setView }: { setView: RefObject<(view: string) => void> }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null
  useEffect(() => {
    setView.current = (view) => {
      if (!controls) return
      const target = controls.target.clone()
      const dist = 8600
      if (view === 'side') camera.position.set(target.x, target.y + 1400, target.z + dist)
      else if (view === 'top') camera.position.set(target.x, dist, target.z + 120)
      else if (view === 'front') camera.position.set(target.x - dist, target.y + 2600, target.z + 600)
      else camera.position.set(target.x + dist * 0.45, target.y + dist * 0.34, target.z + dist * 0.78)
      camera.lookAt(target)
      controls.update()
    }
  }, [camera, controls, setView])
  return null
}

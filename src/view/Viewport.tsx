import { OrbitControls, GizmoHelper, GizmoViewport, Grid } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { ChassisModel, ChassisParams } from '../model/types'
import { buildChassisGroup, disposeGroup } from '../mesh/build'
import { recallPose, rememberPose } from './cameraMemory'
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
  const wheelFocus = useRef({ x: 4800, z: 1100 })

  return (
    <section className="viewport">
      <Canvas
        shadows
        camera={{ position: [4200, 2600, 6800], fov: 38, near: 15, far: 250000 }}
        gl={{ antialias: true, logarithmicDepthBuffer: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.02 }}
        onCreated={({ gl }) => {
          gl.shadowMap.type = THREE.PCFSoftShadowMap
        }}
      >
        <color attach="background" args={['#8e989f']} />
        <StudioLights />
        <hemisphereLight args={['#d5dbe0', '#2a3036', 0.38]} />
        <ambientLight intensity={0.16} />
        <directionalLight
          castShadow
          position={[2500, 9000, 5200]}
          intensity={3.4}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={200}
          shadow-camera-far={28000}
          shadow-camera-left={-9000}
          shadow-camera-right={9000}
          shadow-camera-top={9000}
          shadow-camera-bottom={-9000}
          shadow-bias={-0.0004}
          shadow-normalBias={2}
        />
        <directionalLight position={[-6000, 4000, -2500]} intensity={0.85} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[4000, -6, 0]} receiveShadow>
          <planeGeometry args={[36000, 14000]} />
          <meshStandardMaterial color="#5c656c" roughness={0.92} metalness={0.04} />
        </mesh>
        {model ? <Chassis model={model} params={params} groupRef={groupRef} wheelFocus={wheelFocus} /> : null}
        <Grid
          args={[40000, 40000]}
          position={[3000, 0, 0]}
          cellSize={500}
          cellThickness={0.5}
          cellColor="#7d878e"
          sectionSize={2000}
          sectionThickness={1}
          sectionColor="#667078"
          fadeDistance={28000}
          infiniteGrid
        />
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI * 0.49} />
        <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
          <GizmoViewport axisColors={['#c24e28', '#7d9a78', '#d7d2c8']} labelColor="#111" />
        </GizmoHelper>
        <CameraBridge setView={setView} wheelFocus={wheelFocus} />
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
          <Button variant="view" size="sm" onClick={() => setView.current('under')}>
            Spodek
          </Button>
          <Button variant="view" size="sm" onClick={() => setView.current('wheel')}>
            Kolo
          </Button>
          <Button variant="view" size="sm" onClick={() => setView.current('cab')}>
            Kabina
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
  wheelFocus,
}: {
  model: ChassisModel
  params: ChassisParams
  groupRef: RefObject<THREE.Group | null>
  wheelFocus: RefObject<{ x: number; z: number }>
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
      <FrameCamera model={model} wheelFocus={wheelFocus} />
    </>
  )
}

function FrameCamera({ model, wheelFocus }: { model: ChassisModel; wheelFocus: RefObject<{ x: number; z: number }> }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as OrbitLike | null
  const token = `${model.profileId}|${model.header.orderNo ?? ''}|${model.header.icdNo ?? ''}|${model.stats.parseMs}`
  useEffect(() => {
    if (!controls || !model.frame) return
    const saved = recallPose(token)
    if (saved) {
      camera.position.set(saved.position[0], saved.position[1], saved.position[2])
      controls.target.set(saved.target[0], saved.target[1], saved.target[2])
    } else {
      const length = model.frame.left[model.frame.left.length - 1].x - model.frame.left[0].x
      const origin = model.anchorX ?? model.axles[0]?.x ?? model.frame.left[0].x
      const centerX = length / 2 - (origin - model.frame.left[0].x)
      const dist = Math.max(length, 8000) * 0.92
      camera.position.set(centerX + dist * 0.42, 1600 + dist * 0.32, dist * 0.72)
      controls.target.set(centerX, 900, 0)
    }
    const axle = model.axles[Math.min(1, Math.max(0, model.axles.length - 1))]
    if (axle) {
      const spec = axle.tireSpec?.match(/^(\d{3})/)
      const tyreW = spec ? Number(spec[1]) : 315
      const outward = axle.dual ? tyreW / 2 + 30 : 0
      const origin = model.anchorX ?? model.axles[0]?.x ?? model.frame.left[0].x
      wheelFocus.current = { x: axle.x - origin, z: Math.abs(axle.track || 2000) / 2 + outward }
    }
    controls.update()
    const save = () => rememberPose(token, camera.position, controls.target)
    controls.addEventListener('change', save)
    return () => {
      save()
      controls.removeEventListener('change', save)
    }
  }, [token, camera, controls, model, wheelFocus])
  return null
}

interface OrbitLike {
  target: THREE.Vector3
  update: () => void
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

function StudioLights() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    return () => {
      scene.environment = null
      env.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])
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

function CameraBridge({
  setView,
  wheelFocus,
}: {
  setView: RefObject<(view: string) => void>
  wheelFocus: RefObject<{ x: number; z: number }>
}) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    if (!import.meta.env.DEV || !controls) return
    // Dev-only hook so headless screenshots can frame the model precisely.
    const hook = {
      scene,
      look(position: [number, number, number], target: [number, number, number]) {
        controls.target.set(target[0], target[1], target[2])
        camera.position.set(position[0], position[1], position[2])
        camera.lookAt(controls.target)
        controls.update()
      },
    }
    ;(window as unknown as { __frameStudio?: typeof hook }).__frameStudio = hook
  }, [camera, controls, scene])
  useEffect(() => {
    setView.current = (view) => {
      if (!controls) return
      const target = controls.target.clone()
      const dist = 8600
      if (view === 'cab') {
        const cab = scene.getObjectByName('cab-shell') ?? scene.getObjectByName('cab')
        if (!cab) return
        const box = new THREE.Box3().setFromObject(cab)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        const reach = Math.max(size.x, size.y, size.z) * 2.2
        controls.target.copy(center)
        camera.position.set(center.x - reach * 0.62, center.y + reach * 0.32, center.z + reach * 0.62)
        camera.lookAt(controls.target)
        controls.update()
        return
      }
      if (view === 'side') camera.position.set(target.x, target.y + 1400, target.z + dist)
      else if (view === 'top') camera.position.set(target.x, dist, target.z + 120)
      else if (view === 'front') camera.position.set(target.x - dist, target.y + 2600, target.z + 600)
      else if (view === 'under') {
        controls.target.set(target.x + 1700, 620, 180)
        camera.position.set(target.x + 2100, 420, 2100)
      } else if (view === 'wheel') {
        const focus = wheelFocus.current
        controls.target.set(focus.x, 540, focus.z)
        camera.position.set(focus.x + 80, 640, focus.z + 1280)
      } else camera.position.set(target.x + dist * 0.45, target.y + dist * 0.34, target.z + dist * 0.78)
      camera.lookAt(controls.target)
      controls.update()
    }
  }, [camera, controls, scene, setView, wheelFocus])
  return null
}

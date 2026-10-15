import { OrbitControls, GizmoHelper, GizmoViewport, Grid } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { ChassisModel, ChassisParams } from '../model/types'
import { buildChassisGroup, disposeGroup } from '../mesh/build'
import { recallPose, rememberPose } from './cameraMemory'
import { Button } from '../components/ui/button'
import { Surroundings } from './Environment'

export function Viewport({
  model,
  params,
  groupRef,
  fit = 1,
  children,
  overlay,
}: {
  model: ChassisModel | null
  params: ChassisParams
  groupRef: RefObject<THREE.Group | null>
  /** Initial camera distance factor (1 = default framing). */
  fit?: number
  /** Extra scene content (e.g. markers) in viewport coordinates: X rearward from the first axle, Y up, Z lateral. */
  children?: ReactNode
  /** HTML on top of the canvas (e.g. the scene filter toolbar). */
  overlay?: ReactNode
}) {
  const setView = useRef<(view: string) => void>(() => {})
  const wheelFocus = useRef({ x: 4800, z: 1100 })

  return (
    <section className="viewport">
      <Canvas
        shadows
        frameloop="demand"
        dpr={[1, 1.5]}
        // near/far ratio kept moderate (no log depth buffer needed): mm units, scene ≲ 100 m
        camera={{ position: [4200, 2600, 6800], fov: 38, near: 60, far: 160000 }}
        gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.02 }}
        onCreated={({ gl }) => {
          gl.shadowMap.type = THREE.PCFShadowMap
        }}
      >
        <color attach="background" args={['#b4c3cf']} />
        <StudioLights />
        <hemisphereLight args={['#d5dbe0', '#2a3036', 0.38]} />
        <ambientLight intensity={0.16} />
        <directionalLight
          castShadow
          position={[2500, 9000, 5200]}
          intensity={3.4}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
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
        <Surroundings />
        {model ? <Chassis model={model} params={params} groupRef={groupRef} wheelFocus={wheelFocus} fit={fit} /> : null}
        {children}
        <Grid
          args={[40000, 40000]}
          position={[3000, 3, 0]}
          cellSize={500}
          cellThickness={0.5}
          cellColor="#868b8e"
          sectionSize={2000}
          sectionThickness={1}
          sectionColor="#767c80"
          fadeDistance={22000}
          infiniteGrid
        />
        <OrbitControls makeDefault enableDamping={false} maxPolarAngle={Math.PI * 0.485} minDistance={400} maxDistance={70000} />
        <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
          <GizmoViewport axisColors={['#c24e28', '#7d9a78', '#d7d2c8']} labelColor="#111" />
        </GizmoHelper>
        <CameraBridge setView={setView} wheelFocus={wheelFocus} />
      </Canvas>
      {overlay}
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
  fit,
}: {
  model: ChassisModel
  params: ChassisParams
  groupRef: RefObject<THREE.Group | null>
  wheelFocus: RefObject<{ x: number; z: number }>
  fit: number
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
      <FrameCamera model={model} wheelFocus={wheelFocus} fit={fit} />
    </>
  )
}

function FrameCamera({ model, wheelFocus, fit }: { model: ChassisModel; wheelFocus: RefObject<{ x: number; z: number }>; fit: number }) {
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
      const dist = Math.max(length, 8000) * 0.92 * fit
      if (fit > 1) {
        // Configurator: frame the whole vehicle (cab included) from the front three-quarter.
        const midX = (model.extents.x0 + model.extents.x1) / 2 - origin
        camera.position.set(midX - dist * 0.42, 1300 + dist * 0.2, dist * 0.86)
        controls.target.set(midX - 600, 1300, 0)
      } else {
        camera.position.set(centerX + dist * 0.42, 1600 + dist * 0.32, dist * 0.72)
        controls.target.set(centerX, 900, 0)
      }
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
  }, [token, camera, controls, model, wheelFocus, fit])
  return null
}

interface OrbitLike {
  target: THREE.Vector3
  update: () => void
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

export function StudioLights() {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    // materials compiled before the env map / shadow setup existed keep a stale program (seen as an
    // over-bright, shadowless ground) – recompile once and request a frame (frameloop="demand")
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true))
    })
    invalidate()
    return () => {
      scene.environment = null
      env.dispose()
      pmrem.dispose()
    }
  }, [gl, scene, invalidate])
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
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (!controls || !(import.meta.env.DEV || location.search.includes('bench'))) return
    // Dev-only hook so headless screenshots can frame the model precisely.
    const hook = {
      scene,
      gl,
      camera,
      pose: () => ({ position: camera.position.toArray(), target: controls.target.toArray() }),
      look(position: [number, number, number], target: [number, number, number]) {
        controls.target.set(target[0], target[1], target[2])
        camera.position.set(position[0], position[1], position[2])
        camera.lookAt(controls.target)
        controls.update()
      },
    }
    ;(window as unknown as { __frameStudio?: typeof hook }).__frameStudio = hook
  }, [camera, controls, scene, gl])
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

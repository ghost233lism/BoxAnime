import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Edges, Grid, OrbitControls, RoundedBox, useTexture } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { JDL_LOGO_DATA_URI } from '../assets/jdlLogo'
import type { ContainerSpec, Placement, Vec3 } from '../types'

const STOP_COLORS = ['#4ca7ff', '#42d6a4', '#ffb547', '#ad8cff', '#f36b5f']

type SceneProps = {
  container: ContainerSpec
  placements: Placement[]
  ghost?: Placement
  xray: number
  cameraView: 'perspective' | 'side' | 'top'
  centerOfGravity?: Vec3
  selectedId?: string
  onSelect: (placement?: Placement) => void
}

function toWorld(position: Vec3, size: Vec3, container: ContainerSpec): Vec3 {
  return [
    (position[0] + size[0] / 2) / 1000 - container.lengthMm / 2000,
    (position[2] + size[2] / 2) / 1000,
    (position[1] + size[1] / 2) / 1000 - container.widthMm / 2000,
  ]
}

function CargoBox({
  placement,
  container,
  selected,
  onSelect,
}: {
  placement: Placement
  container: ContainerSpec
  selected: boolean
  onSelect: () => void
}) {
  const mesh = useRef<THREE.Mesh>(null)
  const target = useMemo(() => toWorld(placement.positionMm, placement.sizeMm, container), [placement, container])
  const size = placement.sizeMm.map((value) => Math.max(0.04, value / 1000 - 0.025)) as Vec3
  const [hovered, setHovered] = useState(false)
  const initial = useMemo<Vec3>(() => [container.lengthMm / 2000 + 2.4, target[1] + 1.5, target[2]], [container.lengthMm, target])

  useEffect(() => {
    if (!mesh.current) return
    mesh.current.position.set(...initial)
    mesh.current.scale.setScalar(0.7)
  }, [initial])

  useFrame((_, delta) => {
    if (!mesh.current) return
    const factor = 1 - Math.exp(-delta * 7)
    mesh.current.position.lerp(new THREE.Vector3(...target), factor)
    mesh.current.scale.lerp(new THREE.Vector3(1, 1, 1), factor)
  })

  const color = STOP_COLORS[(placement.stopOrder - 1) % STOP_COLORS.length]
  return (
    <mesh
      ref={mesh}
      castShadow
      receiveShadow
      onClick={(event) => { event.stopPropagation(); onSelect() }}
      onPointerEnter={(event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer' }}
      onPointerLeave={() => { setHovered(false); document.body.style.cursor = '' }}
    >
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.58} metalness={0.08} emissive={color} emissiveIntensity={hovered || selected ? 0.28 : 0.035} />
      <Edges color={selected ? '#ffffff' : hovered ? '#dff2ff' : '#172230'} lineWidth={selected ? 2 : 0.6} />
    </mesh>
  )
}

function GhostBox({ placement, container }: { placement: Placement; container: ContainerSpec }) {
  const ref = useRef<THREE.Mesh>(null)
  const position = toWorld(placement.positionMm, placement.sizeMm, container)
  const size = placement.sizeMm.map((value) => value / 1000) as Vec3
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 7) * 0.025)
  })
  return (
    <mesh ref={ref} position={position}>
      <boxGeometry args={size} />
      <meshBasicMaterial color="#e1251b" transparent opacity={0.08} depthWrite={false} />
      <Edges color="#ff685f" lineWidth={1.8} />
    </mesh>
  )
}

function LogoBadge({ position, rotation = [0, 0, 0] }: { position: Vec3; rotation?: Vec3 }) {
  const texture = useTexture(JDL_LOGO_DATA_URI)
  texture.colorSpace = THREE.SRGBColorSpace
  return (
    <group position={position} rotation={rotation.map(THREE.MathUtils.degToRad) as Vec3}>
      <RoundedBox args={[2.5, 0.62, 0.035]} radius={0.07} smoothness={3}>
        <meshBasicMaterial color="#f7f8fa" />
      </RoundedBox>
      <mesh position={[0, 0, 0.024]}>
        <planeGeometry args={[2.18, 0.365]} />
        <meshBasicMaterial map={texture} transparent toneMapped={false} />
      </mesh>
    </group>
  )
}

function ContainerShell({ container, xray }: { container: ContainerSpec; xray: number }) {
  const l = container.lengthMm / 1000
  const w = container.widthMm / 1000
  const h = container.heightMm / 1000
  const opacity = Math.max(0.045, 1 - xray)
  const ribs = Array.from({ length: 32 }, (_, index) => -l / 2 + 0.2 + index * ((l - 0.4) / 31))
  const redMaterial = <meshStandardMaterial color="#d91f18" roughness={0.72} metalness={0.28} transparent opacity={opacity} depthWrite={opacity > 0.4} />

  return (
    <group>
      <mesh position={[0, -0.035, 0]} receiveShadow>
        <boxGeometry args={[l + 0.14, 0.07, w + 0.14]} />
        <meshStandardMaterial color="#272b2f" roughness={0.88} />
      </mesh>
      <mesh position={[0, h / 2, -w / 2 - 0.035]}>
        <boxGeometry args={[l + 0.12, h, 0.07]} />
        {redMaterial}
        <Edges color="#f0443b" lineWidth={0.45} />
      </mesh>
      <mesh position={[0, h / 2, w / 2 + 0.035]}>
        <boxGeometry args={[l + 0.12, h, 0.07]} />
        {redMaterial}
        <Edges color="#f0443b" lineWidth={0.45} />
      </mesh>
      <mesh position={[0, h + 0.035, 0]}>
        <boxGeometry args={[l + 0.12, 0.07, w + 0.12]} />
        {redMaterial}
        <Edges color="#f0443b" lineWidth={0.45} />
      </mesh>
      <mesh position={[-l / 2 - 0.035, h / 2, 0]}>
        <boxGeometry args={[0.07, h, w]} />
        {redMaterial}
        <Edges color="#f0443b" />
      </mesh>
      {ribs.map((x) => (
        <group key={x}>
          <mesh position={[x, h / 2, -w / 2 - 0.076]}>
            <boxGeometry args={[0.035, h - 0.12, 0.025]} />
            <meshBasicMaterial color="#ff4d44" transparent opacity={opacity * 0.72} />
          </mesh>
          <mesh position={[x, h / 2, w / 2 + 0.076]}>
            <boxGeometry args={[0.035, h - 0.12, 0.025]} />
            <meshBasicMaterial color="#ff4d44" transparent opacity={opacity * 0.72} />
          </mesh>
        </group>
      ))}
      <LogoBadge position={[0.45, h * 0.57, w / 2 + 0.085]} />
      <LogoBadge position={[0.45, h * 0.57, -w / 2 - 0.085]} rotation={[0, 180, 0]} />
      <group position={[l / 2 + 0.7, h / 2, 0]}>
        <mesh position={[0, 0, -w * 0.28]} rotation={[0, THREE.MathUtils.degToRad(-36), 0]}>
          <boxGeometry args={[0.055, h, w * 0.48]} />
          <meshStandardMaterial color="#c71914" roughness={0.7} transparent opacity={Math.max(0.14, opacity)} />
          <Edges color="#ff6158" />
        </mesh>
        <mesh position={[0, 0, w * 0.28]} rotation={[0, THREE.MathUtils.degToRad(36), 0]}>
          <boxGeometry args={[0.055, h, w * 0.48]} />
          <meshStandardMaterial color="#c71914" roughness={0.7} transparent opacity={Math.max(0.14, opacity)} />
          <Edges color="#ff6158" />
        </mesh>
      </group>
    </group>
  )
}

function CenterOfGravity({ value, container }: { value: Vec3; container: ContainerSpec }) {
  const point = toWorld(value, [0, 0, 0], container)
  return (
    <group position={point}>
      <mesh>
        <sphereGeometry args={[0.1, 24, 24]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, -point[1] / 2, 0]}>
        <cylinderGeometry args={[0.009, 0.009, Math.max(point[1], 0.02), 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
      </mesh>
      <mesh position={[0, -point[1], 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.13, 0.17, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function CameraRig({ view, container }: { view: SceneProps['cameraView']; container: ContainerSpec }) {
  const { camera } = useThree()
  const l = container.lengthMm / 1000
  const targets = {
    perspective: new THREE.Vector3(l * 0.62, 5.5, 7.5),
    side: new THREE.Vector3(0, 3.6, 10.5),
    top: new THREE.Vector3(0, 12, 0.01),
  }
  useFrame((_, delta) => {
    camera.position.lerp(targets[view], 1 - Math.exp(-delta * 3.5))
    camera.lookAt(0, 1.1, 0)
  })
  return null
}

function SceneContent(props: SceneProps) {
  const l = props.container.lengthMm / 1000
  return (
    <>
      <color attach="background" args={['#090b0e']} />
      <fog attach="fog" args={['#090b0e', 12, 25]} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[4, 9, 6]} intensity={2.2} color="#eef6ff" castShadow shadow-mapSize={[2048, 2048]} />
      <pointLight position={[-4, 2, 3]} intensity={8} distance={10} color="#e1251b" />
      <pointLight position={[5, 3, -3]} intensity={5} distance={9} color="#4ca7ff" />
      <group onPointerMissed={() => props.onSelect(undefined)}>
        <ContainerShell container={props.container} xray={props.xray} />
        {props.placements.map((placement) => (
          <CargoBox
            key={placement.cargoInstanceId}
            placement={placement}
            container={props.container}
            selected={props.selectedId === placement.cargoInstanceId}
            onSelect={() => props.onSelect(placement)}
          />
        ))}
        {props.ghost && <GhostBox placement={props.ghost} container={props.container} />}
        {props.centerOfGravity && props.placements.length > 0 && <CenterOfGravity value={props.centerOfGravity} container={props.container} />}
      </group>
      <Grid
        position={[0, -0.08, 0]}
        args={[Math.max(22, l + 6), 12]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#28313b"
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#52606e"
        fadeDistance={18}
        fadeStrength={1.2}
        infiniteGrid
      />
      <CameraRig view={props.cameraView} container={props.container} />
      <OrbitControls target={[0, 1.1, 0]} enableDamping dampingFactor={0.08} minDistance={4} maxDistance={20} maxPolarAngle={Math.PI * 0.49} />
    </>
  )
}

export function ContainerScene(props: SceneProps) {
  return (
    <Canvas
      shadows="basic"
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      camera={{ position: [9, 5.5, 7.5], fov: 38, near: 0.1, far: 100 }}
      fallback={<div className="webgl-fallback">当前浏览器无法启动 WebGL 3D 场景</div>}
    >
      <Suspense fallback={null}>
        <SceneContent {...props} />
      </Suspense>
    </Canvas>
  )
}

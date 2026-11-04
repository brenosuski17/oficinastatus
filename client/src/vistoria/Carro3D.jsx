// Estúdio 3D da vistoria: um hatch modelado do zero (sem modelo de marca), clicável por peça.
import { memo, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Html, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { corGravidade, detectarZona } from './zonas'

// ---------------------------------------------------------------- geometria
function perfilCarroceria() {
  const s = new THREE.Shape()
  s.moveTo(-2.06, 0.3)
  s.lineTo(-1.76, 0.3)
  s.absarc(-1.32, 0.34, 0.44, Math.PI, 0, true) // caixa de roda traseira
  s.lineTo(0.88, 0.3)
  s.absarc(1.32, 0.34, 0.44, Math.PI, 0, true) // caixa de roda dianteira
  s.lineTo(2.03, 0.3)
  s.quadraticCurveTo(2.16, 0.32, 2.17, 0.5)
  s.lineTo(2.15, 0.64)
  s.quadraticCurveTo(2.12, 0.77, 1.96, 0.8)
  s.quadraticCurveTo(1.45, 0.9, 0.98, 0.94)
  s.lineTo(-1.72, 0.99)
  s.quadraticCurveTo(-1.98, 0.99, -2.06, 0.9)
  s.lineTo(-2.13, 0.62)
  s.quadraticCurveTo(-2.16, 0.36, -2.06, 0.3)
  return s
}
const PB = [1.06, 0.92] // base do para-brisa
const PT = [0.1, 1.39] // topo do para-brisa
const TR = [-1.18, 1.41] // fim do teto
const TB = [-1.94, 0.99] // base do vidro traseiro
function perfilCabine() {
  const c = new THREE.Shape()
  c.moveTo(...PB)
  c.lineTo(...PT)
  c.quadraticCurveTo(-0.05, 1.44, -0.3, 1.44)
  c.lineTo(TR[0] + 0.06, 1.43)
  c.lineTo(...TR)
  c.lineTo(...TB)
  c.lineTo(...PB)
  return c
}
function perfilJanela() {
  const w = new THREE.Shape()
  w.moveTo(0.9, 1.0)
  w.lineTo(0.16, 1.34)
  w.quadraticCurveTo(0.0, 1.38, -0.3, 1.38)
  w.lineTo(-1.1, 1.36)
  w.lineTo(-1.78, 1.02)
  w.lineTo(0.9, 1.0)
  return w
}

function extrudar(shape, profundidade, bevel, size) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: profundidade, bevelEnabled: true, bevelThickness: bevel, bevelSize: size, bevelSegments: 5, curveSegments: 28 })
  g.translate(0, 0, -profundidade / 2)
  g.computeVertexNormals()
  return g
}

/** Vidro inclinado (para-brisa / traseiro) ao longo do segmento A→B do perfil. */
function vidroInclinado(a, b, largura, afastamento) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const L = Math.hypot(dx, dy)
  const n = [dy / L, -dx / L]
  return {
    args: [L * 0.94, 0.014, largura],
    position: [(a[0] + b[0]) / 2 + n[0] * afastamento, (a[1] + b[1]) / 2 + n[1] * afastamento, 0],
    rotation: [0, 0, Math.atan2(dy, dx)],
  }
}

// ---------------------------------------------------------------- materiais
function useMateriais() {
  return useMemo(() => ({
    pintura: new THREE.MeshPhysicalMaterial({ color: '#cbc3ae', metalness: 0.45, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 }),
    vidro: new THREE.MeshPhysicalMaterial({ color: '#0c1426', metalness: 0.7, roughness: 0.06, clearcoat: 1 }),
    preto: new THREE.MeshStandardMaterial({ color: '#0f131c', metalness: 0.3, roughness: 0.45 }),
    friso: new THREE.MeshStandardMaterial({ color: '#2a3142', metalness: 0.4, roughness: 0.5 }),
    pneu: new THREE.MeshStandardMaterial({ color: '#15171c', roughness: 0.85 }),
    aro: new THREE.MeshStandardMaterial({ color: '#c9ced8', metalness: 0.95, roughness: 0.22 }),
    farol: new THREE.MeshStandardMaterial({ color: '#dff1ff', emissive: '#bfe3ff', emissiveIntensity: 1.6, toneMapped: false }),
    lanterna: new THREE.MeshStandardMaterial({ color: '#7a0c18', emissive: '#ff2442', emissiveIntensity: 1.2, toneMapped: false }),
    placa: new THREE.MeshStandardMaterial({ color: '#f4f6fb', roughness: 0.5 }),
    placaFaixa: new THREE.MeshStandardMaterial({ color: '#0b3d91', roughness: 0.5 }),
  }), [])
}

function Roda({ x, lado, m, zona }) {
  const z = lado * 0.83
  const fora = lado * 0.125
  return (
    <group position={[x, 0.34, z]} userData={{ zona }}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={m.pneu} userData={{ zona }}>
        <cylinderGeometry args={[0.34, 0.34, 0.25, 48]} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, fora]} material={m.aro} userData={{ zona }}>
        <cylinderGeometry args={[0.235, 0.235, 0.02, 40]} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[0, 0, fora + lado * 0.014]} rotation={[0, 0, (i * 2 * Math.PI) / 5]} material={m.friso} userData={{ zona }}>
          <boxGeometry args={[0.04, 0.4, 0.012]} />
        </mesh>
      ))}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, fora + lado * 0.022]} material={m.preto} userData={{ zona }}>
        <cylinderGeometry args={[0.055, 0.055, 0.02, 24]} />
      </mesh>
    </group>
  )
}

const Carro = memo(function Carro({ m, refCarro }) {
  const geo = useMemo(() => ({
    corpo: extrudar(perfilCarroceria(), 1.78, 0.07, 0.06),
    cabine: extrudar(perfilCabine(), 1.46, 0.08, 0.05),
    janela: new THREE.ExtrudeGeometry(perfilJanela(), { depth: 0.012, bevelEnabled: false, curveSegments: 16 }),
  }), [])
  const parabrisa = vidroInclinado(PB, PT, 1.32, 0.062)
  const traseiro = vidroInclinado(TR, TB, 1.26, 0.062)
  const ZL = 0.962 // face lateral da carroceria

  return (
    <group ref={refCarro}>
      <mesh geometry={geo.corpo} material={m.pintura} userData={{ zona: 'corpo' }} />
      <mesh geometry={geo.cabine} material={m.pintura} userData={{ zona: 'corpo' }} />
      {[1, -1].map((l) => (
        <group key={l}>
          {/* janelas laterais + coluna central */}
          <mesh geometry={geo.janela} material={m.vidro} position={[0, 0, l > 0 ? 0.81 : -0.822]} userData={{ zona: 'vidro_lateral' }} />
          <mesh position={[-0.42, 1.19, l * 0.824]} material={m.preto} userData={{ zona: 'vidro_lateral' }}><boxGeometry args={[0.09, 0.42, 0.012]} /></mesh>
          <mesh position={[0, 0.33, l * 0.955]} material={m.preto} userData={{ zona: 'corpo' }}><boxGeometry args={[1.62, 0.07, 0.03]} /></mesh>
          {/* vincos das portas */}
          {[0.9, -0.02, -0.96].map((x) => (
            <mesh key={x} position={[x, 0.655, l * ZL]} material={m.friso} userData={{ zona: 'corpo' }}><boxGeometry args={[0.008, 0.6, 0.004]} /></mesh>
          ))}
          {/* maçanetas */}
          {[0.28, -0.7].map((x) => (
            <mesh key={x} position={[x, 0.86, l * (ZL + 0.006)]} material={m.friso} userData={{ zona: 'corpo' }}><boxGeometry args={[0.16, 0.035, 0.012]} /></mesh>
          ))}
          {/* retrovisor */}
          <group position={[0.8, 1.02, l * 0.99]}>
            <mesh material={m.pintura} userData={{ zona: 'retrovisor' }}><boxGeometry args={[0.2, 0.12, 0.16]} /></mesh>
            <mesh position={[0.02, -0.07, -l * 0.06]} material={m.preto} userData={{ zona: 'retrovisor' }}><boxGeometry args={[0.1, 0.04, 0.1]} /></mesh>
          </group>
          {/* faróis e lanternas */}
          <mesh position={[2.15, 0.71, l * 0.6]} rotation={[0, 0, -0.62]} material={m.farol} userData={{ zona: 'farol' }}><boxGeometry args={[0.2, 0.075, 0.44]} /></mesh>
          <mesh position={[-2.15, 0.8, l * 0.62]} rotation={[0, 0, 0.3]} material={m.lanterna} userData={{ zona: 'lanterna' }}><boxGeometry args={[0.09, 0.15, 0.4]} /></mesh>
          <Roda x={1.32} lado={l} m={m} zona="roda_dianteira" />
          <Roda x={-1.32} lado={l} m={m} zona="roda_traseira" />
        </group>
      ))}
      {[1.32, -1.32].map((x) => (
        <mesh key={x} position={[x, 0.34, 0]} rotation={[Math.PI / 2, 0, 0]} userData={{ zona: 'corpo' }}>
          <cylinderGeometry args={[0.43, 0.43, 1.84, 40, 1, true, Math.PI / 2, Math.PI]} />
          <meshStandardMaterial color="#05070c" side={THREE.BackSide} roughness={1} />
        </mesh>
      ))}
      <mesh position={parabrisa.position} rotation={parabrisa.rotation} material={m.vidro} userData={{ zona: 'para_brisa' }}><boxGeometry args={parabrisa.args} /></mesh>
      <mesh position={traseiro.position} rotation={traseiro.rotation} material={m.vidro} userData={{ zona: 'vidro_traseiro' }}><boxGeometry args={traseiro.args} /></mesh>
      {/* grade, entrada de ar e placas */}
      <mesh position={[2.205, 0.56, 0]} material={m.preto} userData={{ zona: 'para_choque_dianteiro' }}><boxGeometry args={[0.06, 0.1, 0.9]} /></mesh>
      <mesh position={[2.19, 0.33, 0]} material={m.preto} userData={{ zona: 'para_choque_dianteiro' }}><boxGeometry args={[0.08, 0.08, 1.3]} /></mesh>
      <mesh position={[-2.18, 0.33, 0]} material={m.preto} userData={{ zona: 'para_choque_traseiro' }}><boxGeometry args={[0.08, 0.09, 1.36]} /></mesh>
      {[[2.245, 0.45, 0.6, 'para_choque_dianteiro'], [-2.215, 0.56, -0.6, 'para_choque_traseiro']].map(([x, y, rot, zona]) => (
        <group key={zona} position={[x, y, 0]} userData={{ zona }}>
          <mesh material={m.placa} userData={{ zona }}><boxGeometry args={[0.02, 0.12, 0.4]} /></mesh>
          <mesh position={[Math.sign(x) * 0.011, 0.045, 0]} material={m.placaFaixa} userData={{ zona }}><boxGeometry args={[0.002, 0.03, 0.4]} /></mesh>
        </group>
      ))}
    </group>
  )
})

// ---------------------------------------------------------------- cena
function Ambiente() {
  const { gl, scene } = useThree()
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.55
    return () => { env.dispose(); pmrem.dispose() }
  }, [gl, scene])
  return null
}

function Plataforma() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
        <circleGeometry args={[3.4, 96]} />
        <meshStandardMaterial color="#0e1736" metalness={0.4} roughness={0.55} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[3.28, 3.36, 160]} />
        <meshBasicMaterial color="#5b7cff" toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[3.0, 3.02, 160]} />
        <meshBasicMaterial color="#3d5bff" transparent opacity={0.5} toneMapped={false} />
      </mesh>
      <ContactShadows position={[0, 0.003, 0]} opacity={0.75} scale={9} blur={2.2} far={2.2} resolution={512} color="#000615" />
    </group>
  )
}

export const VISTAS = {
  perspectiva: { pos: [5.2, 2.5, 5.6], alvo: [0, 0.6, 0] },
  frente: { pos: [6.8, 1.1, 0], alvo: [0, 0.6, 0] },
  traseira: { pos: [-6.8, 1.1, 0], alvo: [0, 0.6, 0] },
  direita: { pos: [0, 1.2, 8.2], alvo: [0, 0.6, 0] },
  esquerda: { pos: [0, 1.2, -8.2], alvo: [0, 0.6, 0] },
  topo: { pos: [0.01, 7.6, 0.01], alvo: [0, 0.5, 0] },
}

/** Move a câmera suavemente até a vista escolhida (ou até uma avaria). */
function Camera({ vista }) {
  const { camera, controls } = useThree()
  const anim = useRef(null)
  const { size } = useThree()
  const fator = Math.min(1.7, Math.max(1, 1.35 / (size.width / size.height)))
  const enquadrar = (v) => {
    const alvo = new THREE.Vector3(...v.alvo)
    const pos = new THREE.Vector3(...v.pos)
    if (!v.foco) pos.sub(alvo).multiplyScalar(fator).add(alvo) // telas estreitas: afasta a câmera
    return { pos, alvo }
  }
  useEffect(() => {
    anim.current = enquadrar(vista || VISTAS.perspectiva)
  }, [vista, fator]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!controls) return
    const parar = () => { anim.current = null }
    controls.addEventListener('start', parar)
    return () => controls.removeEventListener('start', parar)
  }, [controls])
  useFrame((_, delta) => {
    const a = anim.current
    if (!a || !controls) return
    const k = 1 - Math.pow(0.0015, delta)
    camera.position.lerp(a.pos, k)
    controls.target.lerp(a.alvo, k)
    controls.update()
    if (camera.position.distanceTo(a.pos) < 0.01 && controls.target.distanceTo(a.alvo) < 0.01) anim.current = null
  })
  return null
}

/** Pino numerado sobre a avaria (some quando a peça fica de costas para a câmera). */
function Pino({ a, ativo, rascunho, aoClicar, refCarro }) {
  const pos = [a.pos_x + a.nor_x * 0.05, a.pos_y + a.nor_y * 0.05, a.pos_z + a.nor_z * 0.05]
  const cor = rascunho ? '#3d5bff' : corGravidade(a.gravidade)
  const anel = useMemo(() => {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(a.nor_x, a.nor_y, a.nor_z).normalize())
    return { q, pos: [a.pos_x + a.nor_x * 0.006, a.pos_y + a.nor_y * 0.006, a.pos_z + a.nor_z * 0.006] }
  }, [a.pos_x, a.pos_y, a.pos_z, a.nor_x, a.nor_y, a.nor_z])
  return (
    <group>
      <mesh position={anel.pos} quaternion={anel.q}>
        <ringGeometry args={[0.07, 0.1, 40]} />
        <meshBasicMaterial color={cor} transparent opacity={0.9} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <Html position={pos} center zIndexRange={[30, 0]} occlude={[refCarro]} style={{ transition: 'opacity .2s' }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); aoClicar?.() }}
          className={`relative grid place-items-center rounded-full font-extrabold text-white shadow-[0_4px_14px_rgba(0,0,0,.45)] ring-2 transition-transform ${ativo ? 'size-9 text-[15px] ring-white scale-110' : 'size-7 text-[13px] ring-white/70 hover:scale-110'}`}
          style={{ background: cor }}
          aria-label={rascunho ? 'Nova avaria' : `Avaria ${a.numero}`}
        >
          {(ativo || rascunho) && <span className="absolute inset-0 rounded-full animate-ping opacity-40" style={{ background: cor }} />}
          <span className="relative">{rascunho ? '+' : a.numero}</span>
        </button>
      </Html>
    </group>
  )
}

/** Anel que segue o ponteiro sobre o carro (atualizado sem re-renderizar a cena). */
function MiraHover({ refMira }) {
  return (
    <mesh ref={refMira} visible={false}>
      <ringGeometry args={[0.05, 0.075, 36]} />
      <meshBasicMaterial color="#9db2ff" transparent opacity={0.85} toneMapped={false} side={THREE.DoubleSide} depthTest={false} />
    </mesh>
  )
}

export default function Carro3D({ avarias = [], rascunho, selecionada, aoMarcar, aoSelecionar, aoApontar, vista, girar }) {
  const refCarro = useRef()
  const refMira = useRef()
  const ultimaZona = useRef(null)
  const editavel = Boolean(aoMarcar)
  const materiais = useMateriais()

  function infoDoEvento(e) {
    const n = e.face.normal.clone().transformDirection(e.object.matrixWorld).normalize()
    const p = e.point
    let base = e.object.userData.zona
    for (let o = e.object; !base && o; o = o.parent) base = o.userData?.zona
    return { zona: detectarZona(base, p, n), posicao: { x: +p.x.toFixed(4), y: +p.y.toFixed(4), z: +p.z.toFixed(4) }, normal: { x: +n.x.toFixed(4), y: +n.y.toFixed(4), z: +n.z.toFixed(4) }, n, p }
  }

  return (
    <Canvas camera={{ position: VISTAS.perspectiva.pos, fov: 34, near: 0.1, far: 60 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      style={{ touchAction: 'none' }} aria-label="Modelo 3D do veículo">
      <Ambiente />
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 8, 4]} intensity={1.15} />
      <directionalLight position={[-6, 3, -5]} intensity={0.6} color="#8aa2ff" />
      <pointLight position={[0, 3.5, 0]} intensity={6} distance={9} color="#c7d2ff" />

      <group
        onClick={(e) => {
          if (!editavel || e.delta > 5) return
          e.stopPropagation()
          const { zona, posicao, normal } = infoDoEvento(e)
          aoMarcar({ zona, posicao, normal })
        }}
        onPointerMove={(e) => {
          e.stopPropagation()
          const { zona, n, p } = infoDoEvento(e)
          const mira = refMira.current
          if (mira && editavel) {
            mira.visible = true
            mira.position.copy(p).addScaledVector(n, 0.008)
            mira.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
          }
          if (zona !== ultimaZona.current) { ultimaZona.current = zona; aoApontar?.(zona) }
          document.body.style.cursor = editavel ? 'crosshair' : 'grab'
        }}
        onPointerOut={() => {
          if (refMira.current) refMira.current.visible = false
          ultimaZona.current = null
          aoApontar?.(null)
          document.body.style.cursor = ''
        }}
      >
        <Carro m={materiais} refCarro={refCarro} />
      </group>
      <MiraHover refMira={refMira} />

      {avarias.map((a) => (
        <Pino key={a.id ?? `n${a.numero}`} a={a} ativo={selecionada === a.id} refCarro={refCarro} aoClicar={() => aoSelecionar?.(a)} />
      ))}
      {rascunho && (
        <Pino a={{ pos_x: rascunho.posicao.x, pos_y: rascunho.posicao.y, pos_z: rascunho.posicao.z, nor_x: rascunho.normal.x, nor_y: rascunho.normal.y, nor_z: rascunho.normal.z }} rascunho ativo refCarro={refCarro} />
      )}

      <Plataforma />
      <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.08} minDistance={3.2} maxDistance={13} maxPolarAngle={1.5}
        target={VISTAS.perspectiva.alvo} autoRotate={girar} autoRotateSpeed={1.2} />
      <Camera vista={vista} />
    </Canvas>
  )
}

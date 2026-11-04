// Estúdio 3D da inspeção: carros modelados do zero (hatch, sedã, SUV e picape), sem modelos de marca.
// A lataria é um só bloco; um shader descobre a peça de cada pixel, o que permite acender a peça inteira
// ao passar o mouse e pintar as peças com avaria pela gravidade.
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { corGravidade, nomeZona } from './zonas'
import { carroceria, corDaPintura, detectarZona, ZONAS_LATARIA } from './carrocerias'

const SEV = { leve: 1, moderada: 2, grave: 3 }

// ---------------------------------------------------------------- perfis (vista lateral)
function perfilCarroceria(c) {
  const s = new THREE.Shape()
  s.moveTo(c.tras, c.base)
  s.lineTo(c.eixoT - c.arco, c.base)
  s.absarc(c.eixoT, c.rodaR, c.arco, Math.PI, 0, true)
  s.lineTo(c.eixoD - c.arco, c.base)
  s.absarc(c.eixoD, c.rodaR, c.arco, Math.PI, 0, true)
  s.lineTo(c.frente - 0.14, c.base)
  s.quadraticCurveTo(c.frente - 0.01, c.base + 0.02, c.frente, c.base + 0.2)
  s.lineTo(c.frente - 0.02, c.capoY - 0.16)
  s.quadraticCurveTo(c.frente - 0.05, c.capoY - 0.03, c.frente - 0.21, c.capoY)
  s.quadraticCurveTo(c.PB[0] + 0.39, c.cintura - 0.04, c.PB[0] - 0.08, c.cintura)
  s.lineTo(c.tras + 0.34, c.cinturaTras)
  s.quadraticCurveTo(c.tras + 0.08, c.cinturaTras, c.tras, c.cinturaTras - 0.09)
  s.lineTo(c.tras - 0.07, c.base + 0.32)
  s.quadraticCurveTo(c.tras - 0.1, c.base + 0.06, c.tras, c.base)
  return s
}
function perfilCabine(c) {
  const s = new THREE.Shape()
  s.moveTo(...c.PB)
  s.lineTo(...c.PT)
  s.quadraticCurveTo(c.PT[0] - 0.15, c.teto, c.PT[0] - 0.4, c.teto)
  s.lineTo(c.TR[0] + 0.06, c.TR[1] + 0.02)
  s.lineTo(...c.TR)
  s.lineTo(...c.TB)
  s.lineTo(c.PB[0], c.TB[1] - 0.02)
  s.lineTo(...c.PB)
  return s
}
function perfilJanela(c) {
  const w = new THREE.Shape()
  const y0 = c.cintura + 0.07
  w.moveTo(c.PB[0] - 0.2, y0)
  w.lineTo(c.PT[0] + 0.06, c.PT[1] - 0.05)
  w.quadraticCurveTo(c.PT[0] - 0.1, c.teto - 0.06, c.PT[0] - 0.4, c.teto - 0.06)
  w.lineTo(c.TR[0] + 0.08, c.TR[1] - 0.05)
  w.lineTo(c.TB[0] + 0.14, Math.max(y0, c.TB[1] + 0.03))
  w.lineTo(c.PB[0] - 0.2, y0)
  return w
}
function extrudar(shape, profundidade, bevel, size) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: profundidade, bevelEnabled: true, bevelThickness: bevel, bevelSize: size, bevelSegments: 5, curveSegments: 28 })
  g.translate(0, 0, -profundidade / 2)
  g.computeVertexNormals()
  return g
}
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

// ---------------------------------------------------------------- pintura com realce por peça (shader)
const GLSL_ZONA = /* glsl */ `
uniform float uSev[15];
uniform float uRealce;
uniform float uRealce2;
uniform float uCabine;
uniform vec4 uA; uniform vec4 uB; uniform vec4 uC; uniform vec4 uD;
varying vec3 vPosObj;
varying vec3 vNorObj;
float zonaIdx(vec3 p, vec3 n) {
  float dir = p.z >= 0.0 ? 1.0 : 0.0;
  if (abs(n.z) > 0.55) {
    if (uCabine < 0.5) {
      if (p.x > uA.y - 0.32 && p.y < uA.x + 0.36) return 3.0;
      if (p.x < uA.z + 0.16 && p.y < uA.x + 0.38) return 4.0;
      if (p.y < uA.x + 0.08 && p.x > uB.w + uC.x - 0.05 && p.x < uB.z - uC.x + 0.05) return 13.0 + dir;
    }
    float b;
    if (p.y > uB.x + 0.03) b = p.x > uC.w ? 7.0 : (p.x > uD.x ? 9.0 : 11.0);
    else b = p.x > uD.y ? 5.0 : (p.x > uD.z ? 7.0 : (p.x > uD.w ? 9.0 : 11.0));
    return b + dir;
  }
  if (uCabine > 0.5) return 1.0;
  if (n.x > 0.5) return p.y < uA.w - 0.14 ? 3.0 : 0.0;
  if (n.x < -0.5) return p.y < uA.x + 0.38 ? 4.0 : 2.0;
  if (n.y < -0.4) return 13.0 + dir;
  if (p.x > uC.y - 0.1) return 0.0;
  if (p.x < uC.z + 0.05 && p.y < uB.y + 0.1) return 2.0;
  return 1.0;
}
vec3 corSev(float s) {
  return s < 1.5 ? vec3(0.98, 0.8, 0.08) : (s < 2.5 ? vec3(0.98, 0.52, 0.18) : vec3(0.96, 0.25, 0.37));
}
`

function criarPintura(cabine) {
  const m = new THREE.MeshPhysicalMaterial({ color: '#d8d3c6', metalness: 0.45, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 })
  const u = {
    uSev: { value: new Array(15).fill(0) }, uRealce: { value: -1 }, uRealce2: { value: -1 }, uCabine: { value: cabine ? 1 : 0 },
    uA: { value: new THREE.Vector4() }, uB: { value: new THREE.Vector4() }, uC: { value: new THREE.Vector4() }, uD: { value: new THREE.Vector4() },
  }
  m.userData.u = u
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPosObj;\nvarying vec3 vNorObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPosObj = position;\nvNorObj = objectNormal;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_ZONA}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float zi = zonaIdx(vPosObj, normalize(vNorObj));
        float sev = uSev[int(zi + 0.5)];
        float realce = (abs(zi - uRealce) < 0.5 || abs(zi - uRealce2) < 0.5) ? 1.0 : 0.0;
        if (sev > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, corSev(sev), 0.62);
        if (realce > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.45, 0.6, 1.0), 0.42);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += realce * vec3(0.05, 0.09, 0.28) + (sev > 0.5 ? corSev(sev) * 0.07 : vec3(0.0));`)
  }
  m.customProgramCacheKey = () => `pintura-realce-${cabine ? 1 : 0}`
  return m
}

function configurarPintura(m, c, cor, sevPorZona, realce, realce2) {
  const u = m.userData.u
  m.color.set(cor)
  u.uA.value.set(c.base, c.frente, c.tras, c.capoY)
  u.uB.value.set(c.cintura, c.cinturaTras, c.eixoD, c.eixoT)
  u.uC.value.set(c.arco, c.PB[0], c.TB[0], c.colunaB)
  u.uD.value.set(c.colunaC, ...c.portas)
  u.uSev.value = ZONAS_LATARIA.map((z) => sevPorZona[z] || 0)
  u.uRealce.value = ZONAS_LATARIA.indexOf(realce)
  u.uRealce2.value = ZONAS_LATARIA.indexOf(realce2)
}

// ---------------------------------------------------------------- materiais das peças separadas
function useMateriais() {
  return useMemo(() => ({
    corpo: criarPintura(false),
    cabine: criarPintura(true),
    retrovisor: new THREE.MeshPhysicalMaterial({ color: '#d8d3c6', metalness: 0.45, roughness: 0.3, clearcoat: 1 }),
    vidro: new THREE.MeshPhysicalMaterial({ color: '#0b1222', metalness: 0.75, roughness: 0.05, clearcoat: 1 }),
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

const cacheVariantes = new Map()
/** Versão do material com brilho na cor do realce (peça apontada) ou da gravidade. */
function variante(mat, cor) {
  const k = `${mat.uuid}-${cor}`
  if (!cacheVariantes.has(k)) {
    const v = mat.clone()
    v.emissive = new THREE.Color(cor)
    v.emissiveIntensity = mat.emissiveIntensity ? mat.emissiveIntensity : 0.55
    if (v.color) v.color.lerp(new THREE.Color(cor), 0.35)
    cacheVariantes.set(k, v)
  }
  return cacheVariantes.get(k)
}

function Roda({ c, x, lado, m, zona }) {
  const r = c.rodaR
  const z = lado * (c.largura / 2 - 0.06)
  const fora = lado * 0.125
  return (
    <group position={[x, r, z]} userData={{ zona }}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={m.pneu} userData={{ zona }}><cylinderGeometry args={[r, r, 0.25, 48]} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, fora]} material={m.aroAtual} userData={{ zona }}><cylinderGeometry args={[r * 0.69, r * 0.69, 0.02, 40]} /></mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[0, 0, fora + lado * 0.014]} rotation={[0, 0, (i * 2 * Math.PI) / 5]} material={m.friso} userData={{ zona }}>
          <boxGeometry args={[0.04, r * 1.18, 0.012]} />
        </mesh>
      ))}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, fora + lado * 0.022]} material={m.preto} userData={{ zona }}><cylinderGeometry args={[0.055, 0.055, 0.02, 24]} /></mesh>
    </group>
  )
}

const Carro = memo(function Carro({ c, cor, m, refCarro, sevPorZona, realce, realce2, destacar }) {
  const geo = useMemo(() => ({
    corpo: extrudar(perfilCarroceria(c), c.largura, 0.07, 0.06),
    cabine: extrudar(perfilCabine(c), c.cabineLarg, 0.08, 0.05),
    janela: new THREE.ExtrudeGeometry(perfilJanela(c), { depth: 0.012, bevelEnabled: false, curveSegments: 16 }),
  }), [c])
  const sev = destacar ? sevPorZona : {}
  configurarPintura(m.corpo, c, cor, sev, realce, realce2)
  configurarPintura(m.cabine, c, cor, sev, realce, realce2)
  m.retrovisor.color.set(cor)

  /** Material de uma peça separada, aceso se apontada/selecionada ou colorido pela avaria. */
  const mat = (base, zona) => {
    if (zona === realce || zona === realce2) return variante(base, '#6d8bff')
    if (sev[zona]) return variante(base, corGravidade(['', 'leve', 'moderada', 'grave'][sev[zona]]))
    return base
  }
  const lado = (l) => (l > 0 ? 'direita' : 'esquerda')
  const parabrisa = vidroInclinado(c.PB, c.PT, c.cabineLarg - 0.14, 0.062)
  const traseiro = vidroInclinado(c.TR, c.TB, c.cabineLarg - 0.2, 0.062)
  const ZL = c.largura / 2 + 0.072
  const ZC = c.cabineLarg / 2 + 0.08

  return (
    <group ref={refCarro}>
      <mesh geometry={geo.corpo} material={m.corpo} userData={{ zona: 'corpo' }} />
      <mesh geometry={geo.cabine} material={m.cabine} userData={{ zona: 'cabine' }} />
      {[c.eixoD, c.eixoT].map((x) => (
        <mesh key={x} position={[x, c.rodaR, 0]} rotation={[Math.PI / 2, 0, 0]} userData={{ zona: 'corpo' }}>
          <cylinderGeometry args={[c.arco - 0.01, c.arco - 0.01, c.largura + 0.06, 40, 1, true, Math.PI / 2, Math.PI]} />
          <meshStandardMaterial color="#05070c" side={THREE.BackSide} roughness={1} />
        </mesh>
      ))}
      {[1, -1].map((l) => (
        <group key={l}>
          <mesh geometry={geo.janela} material={mat(m.vidro, `vidro_lateral_${lado(l)}`)} position={[0, 0, l > 0 ? ZC - 0.002 : -ZC - 0.01]} userData={{ zona: 'vidro_lateral' }} />
          <mesh position={[c.colunaB, (c.cintura + c.teto) / 2, l * (ZC + 0.002)]} material={m.preto} userData={{ zona: 'vidro_lateral' }}><boxGeometry args={[0.09, c.teto - c.cintura - 0.12, 0.012]} /></mesh>
          <mesh position={[0, c.base + 0.03, l * (ZL - 0.008)]} material={m.preto} userData={{ zona: 'corpo' }}><boxGeometry args={[(c.eixoD - c.eixoT) - c.arco * 2 + 0.06, 0.07, 0.03]} /></mesh>
          {c.portas.map((x) => (
            <mesh key={x} position={[x, (c.base + c.cintura) / 2 + 0.04, l * ZL]} material={m.friso} userData={{ zona: 'corpo' }}><boxGeometry args={[0.008, c.cintura - c.base - 0.06, 0.004]} /></mesh>
          ))}
          {[(c.portas[0] + c.portas[1]) / 2 - 0.15, (c.portas[1] + c.portas[2]) / 2 - 0.15].map((x) => (
            <mesh key={x} position={[x, c.cintura - 0.08, l * (ZL + 0.006)]} material={m.friso} userData={{ zona: 'corpo' }}><boxGeometry args={[0.16, 0.035, 0.012]} /></mesh>
          ))}
          <group position={[c.PB[0] - 0.26, c.cintura + 0.08, l * (c.largura / 2 + 0.11)]}>
            <mesh material={mat(m.retrovisor, `retrovisor_${lado(l)}`)} userData={{ zona: 'retrovisor' }}><boxGeometry args={[0.2, 0.12, 0.16]} /></mesh>
            <mesh position={[0.02, -0.07, -l * 0.06]} material={m.preto} userData={{ zona: 'retrovisor' }}><boxGeometry args={[0.1, 0.04, 0.1]} /></mesh>
          </group>
          <mesh position={[c.frente - 0.02, c.capoY - 0.09, l * 0.6]} rotation={[0, 0, -0.62]} material={mat(m.farol, `farol_${lado(l)}`)} userData={{ zona: 'farol' }}><boxGeometry args={[0.2, 0.075, 0.44]} /></mesh>
          <mesh position={[c.tras - 0.09, c.cinturaTras - 0.19, l * 0.62]} rotation={[0, 0, 0.3]} material={mat(m.lanterna, `lanterna_${lado(l)}`)} userData={{ zona: 'lanterna' }}><boxGeometry args={[0.09, 0.15, 0.4]} /></mesh>
          <Roda c={c} x={c.eixoD} lado={l} m={{ ...m, pneu: mat(m.pneu, `roda_dianteira_${lado(l)}`), aroAtual: mat(m.aro, `roda_dianteira_${lado(l)}`) }} zona="roda_dianteira" />
          <Roda c={c} x={c.eixoT} lado={l} m={{ ...m, pneu: mat(m.pneu, `roda_traseira_${lado(l)}`), aroAtual: mat(m.aro, `roda_traseira_${lado(l)}`) }} zona="roda_traseira" />
        </group>
      ))}
      <mesh position={parabrisa.position} rotation={parabrisa.rotation} material={mat(m.vidro, 'para_brisa')} userData={{ zona: 'para_brisa' }}><boxGeometry args={parabrisa.args} /></mesh>
      <mesh position={traseiro.position} rotation={traseiro.rotation} material={mat(m.vidro, 'vidro_traseiro')} userData={{ zona: 'vidro_traseiro' }}><boxGeometry args={traseiro.args} /></mesh>
      <mesh position={[c.frente + 0.035, c.base + 0.26, 0]} material={m.preto} userData={{ zona: 'para_choque_dianteiro' }}><boxGeometry args={[0.06, 0.1, 0.9]} /></mesh>
      <mesh position={[c.frente + 0.02, c.base + 0.03, 0]} material={m.preto} userData={{ zona: 'para_choque_dianteiro' }}><boxGeometry args={[0.08, 0.08, 1.3]} /></mesh>
      <mesh position={[c.tras - 0.12, c.base + 0.03, 0]} material={m.preto} userData={{ zona: 'para_choque_traseiro' }}><boxGeometry args={[0.08, 0.09, 1.36]} /></mesh>
      {[[c.frente + 0.075, c.base + 0.15, 'para_choque_dianteiro'], [c.tras - 0.155, c.base + 0.26, 'para_choque_traseiro']].map(([x, y, zona]) => (
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

/** Plataforma giratória com anel neon e marcações, como um elevador de inspeção. */
function Plataforma() {
  const tracos = useRef()
  useEffect(() => {
    const t = tracos.current
    if (!t) return
    const o = new THREE.Object3D()
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2
      o.position.set(Math.cos(a) * 3.86, 0.004, Math.sin(a) * 3.86)
      o.rotation.set(-Math.PI / 2, 0, -a)
      o.updateMatrix()
      t.setMatrixAt(i, o.matrix)
    }
    t.instanceMatrix.needsUpdate = true
  }, [])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
        <circleGeometry args={[4.1, 128]} />
        <meshStandardMaterial color="#0b1230" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <ringGeometry args={[3.48, 3.55, 180]} />
        <meshBasicMaterial color="#5eead4" toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <ringGeometry args={[3.0, 3.02, 160]} />
        <meshBasicMaterial color="#3d5bff" transparent opacity={0.55} toneMapped={false} />
      </mesh>
      <instancedMesh ref={tracos} args={[null, null, 120]}>
        <planeGeometry args={[0.035, 0.16]} />
        <meshBasicMaterial color="#5b7cff" transparent opacity={0.75} toneMapped={false} />
      </instancedMesh>
      <ContactShadows position={[0, 0.004, 0]} opacity={0.75} scale={10} blur={2.2} far={2.4} resolution={512} color="#000615" />
    </group>
  )
}

export const VISTAS = {
  perspectiva: { pos: [5.2, 2.5, 5.6], alvo: [0, 0.6, 0] },
  frente: { pos: [6.8, 1.1, 0], alvo: [0, 0.6, 0] },
  traseira: { pos: [-6.8, 1.1, 0], alvo: [0, 0.6, 0] },
  direita: { pos: [0, 1.2, 8.2], alvo: [0, 0.6, 0] },
  esquerda: { pos: [0, 1.2, -8.2], alvo: [0, 0.6, 0] },
  topo: { pos: [0.01, 8.6, 0.01], alvo: [0, 0.5, 0] },
}

function Camera({ vista }) {
  const { camera, controls, size } = useThree()
  const anim = useRef(null)
  const fator = Math.min(1.7, Math.max(1, 1.35 / (size.width / size.height)))
  useEffect(() => {
    const v = vista || VISTAS.perspectiva
    const alvo = new THREE.Vector3(...v.alvo)
    const pos = new THREE.Vector3(...v.pos)
    if (!v.foco) pos.sub(alvo).multiplyScalar(fator).add(alvo)
    anim.current = { pos, alvo }
  }, [vista, fator])
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

/** Anel no ponto da avaria (o número fica numa camada HTML por cima do canvas). */
function Anel({ a, cor }) {
  const anel = useMemo(() => {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(a.nor_x, a.nor_y, a.nor_z).normalize())
    return { q, pos: [a.pos_x + a.nor_x * 0.006, a.pos_y + a.nor_y * 0.006, a.pos_z + a.nor_z * 0.006] }
  }, [a.pos_x, a.pos_y, a.pos_z, a.nor_x, a.nor_y, a.nor_z])
  return (
    <mesh position={anel.pos} quaternion={anel.q}>
      <ringGeometry args={[0.07, 0.1, 40]} />
      <meshBasicMaterial color={cor} transparent opacity={0.9} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

/** Projeta cada pino na tela a cada quadro e esconde os que ficam de costas para a câmera. */
function Projetor({ pinos, refs }) {
  const { camera, size } = useThree()
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    for (const a of pinos) {
      const el = refs.current[a.chave]
      if (!el) continue
      v.set(a.pos_x + a.nor_x * 0.05, a.pos_y + a.nor_y * 0.05, a.pos_z + a.nor_z * 0.05)
      const dot = a.nor_x * (camera.position.x - v.x) + a.nor_y * (camera.position.y - v.y) + a.nor_z * (camera.position.z - v.z)
      v.project(camera)
      const x = ((v.x + 1) / 2) * size.width
      const y = ((1 - v.y) / 2) * size.height
      const ok = dot > 0.15 && v.z < 1
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
      el.style.opacity = ok ? '1' : '0'
      el.style.pointerEvents = ok ? 'auto' : 'none'
    }
  })
  return null
}

/**
 * Props: carroceria, cor, avarias, rascunho {posicao, normal}, selecionada (id), zonaAtiva,
 * aoClicarPeca({zona, posicao, normal}) — ausente = só leitura, aoSelecionar(avaria),
 * vista, girar, mostrarPinos, destacarAvarias, contagemPorZona.
 */
export default function Carro3D({
  carroceria: tipo = 'hatch', cor, avarias = [], rascunho, selecionada, zonaAtiva, aoClicarPeca, aoSelecionar,
  vista, girar, mostrarPinos = true, destacarAvarias = true, textoDica = 'Clique para inspecionar',
}) {
  const c = carroceria(tipo)
  const refCarro = useRef()
  const dica = useRef()
  const [hover, setHover] = useState(null)
  const refsPinos = useRef({})
  const materiais = useMateriais()
  const editavel = Boolean(aoClicarPeca)
  const corPintura = corDaPintura(cor)

  const sevPorZona = useMemo(() => {
    const r = {}
    for (const a of avarias) if (a.tipo !== 'servico') r[a.zona] = Math.max(r[a.zona] || 0, SEV[a.gravidade] || 0)
    return r
  }, [avarias])
  const qtdPorZona = useMemo(() => {
    const r = {}
    for (const a of avarias) r[a.zona] = (r[a.zona] || 0) + 1
    return r
  }, [avarias])

  const pinos = useMemo(() => {
    const l = mostrarPinos ? avarias.map((a) => ({ ...a, chave: `a${a.id ?? a.numero}`, cor: a.tipo === 'servico' ? '#3d5bff' : corGravidade(a.gravidade) })) : []
    if (rascunho) l.push({ chave: 'rascunho', rascunho: true, cor: '#3d5bff', pos_x: rascunho.posicao.x, pos_y: rascunho.posicao.y, pos_z: rascunho.posicao.z, nor_x: rascunho.normal.x, nor_y: rascunho.normal.y, nor_z: rascunho.normal.z })
    return l
  }, [avarias, rascunho, mostrarPinos])

  function info(e) {
    const n = e.face.normal.clone().transformDirection(e.object.matrixWorld).normalize()
    const p = refCarro.current ? refCarro.current.worldToLocal(e.point.clone()) : e.point.clone()
    let base = e.object.userData.zona
    for (let o = e.object; !base && o; o = o.parent) base = o.userData?.zona
    const zona = base === 'cabine'
      ? (Math.abs(n.z) > 0.55 ? detectarZona('corpo', p, n, c) : 'teto')
      : detectarZona(base, p, n, c)
    return { zona, posicao: { x: +p.x.toFixed(4), y: +p.y.toFixed(4), z: +p.z.toFixed(4) }, normal: { x: +n.x.toFixed(4), y: +n.y.toFixed(4), z: +n.z.toFixed(4) } }
  }

  return (
    <div className="relative size-full" onPointerLeave={() => setHover(null)}>
      <Canvas camera={{ position: VISTAS.perspectiva.pos, fov: 34, near: 0.1, far: 60 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        style={{ touchAction: 'none', cursor: hover ? (editavel ? 'pointer' : 'grab') : 'grab' }} aria-label="Modelo 3D do veículo"
>
        <Ambiente />
        <ambientLight intensity={0.35} />
        <directionalLight position={[5, 8, 4]} intensity={1.15} />
        <directionalLight position={[-6, 3, -5]} intensity={0.6} color="#8aa2ff" />
        <pointLight position={[0, 3.5, 0]} intensity={6} distance={9} color="#c7d2ff" />

        <group
          onClick={(e) => {
            if (!editavel || e.delta > 5) return
            e.stopPropagation()
            aoClicarPeca(info(e))
          }}
          onPointerMove={(e) => {
            e.stopPropagation()
            const { zona } = info(e)
            if (dica.current) dica.current.style.transform = `translate(${e.nativeEvent.offsetX + 16}px, ${e.nativeEvent.offsetY + 14}px)`
            if (zona !== hover) setHover(zona)
          }}
          onPointerOut={() => setHover(null)}
        >
          <Carro c={c} cor={corPintura} m={materiais} refCarro={refCarro} sevPorZona={sevPorZona} realce={hover} realce2={zonaAtiva} destacar={destacarAvarias} />
        </group>

        {pinos.map((a) => <Anel key={a.chave} a={a} cor={a.cor} />)}
        <Projetor pinos={pinos} refs={refsPinos} />

        <Plataforma />
        <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.08} minDistance={3.2} maxDistance={13} maxPolarAngle={1.5}
          target={VISTAS.perspectiva.alvo} autoRotate={girar} autoRotateSpeed={1.2} />
        <Camera vista={vista} />
      </Canvas>

      {/* números das avarias, posicionados pelo Projetor */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {pinos.map((a) => {
          const ativo = a.rascunho || selecionada === a.id
          return (
            <button key={a.chave} ref={(el) => { refsPinos.current[a.chave] = el }} type="button" onClick={() => !a.rascunho && aoSelecionar?.(a)}
              style={{ background: a.cor, transform: 'translate(-9999px, 0)' }} aria-label={a.rascunho ? 'Nova avaria' : `Avaria ${a.numero}`}
              className={`absolute left-0 top-0 grid place-items-center rounded-full font-extrabold text-white shadow-[0_4px_14px_rgba(0,0,0,.45)] ring-2 transition-[opacity,width,height] duration-200 ${ativo ? 'size-9 text-[15px] ring-white z-10' : 'size-7 text-[13px] ring-white/70'}`}>
              {ativo && <span className="absolute inset-0 rounded-full animate-ping opacity-40" style={{ background: a.cor }} />}
              <span className="relative">{a.rascunho ? '+' : a.numero}</span>
            </button>
          )
        })}
      </div>

      {/* dica que segue o ponteiro: nome da peça */}
      <div ref={dica} className={`pointer-events-none absolute left-0 top-0 transition-opacity duration-150 ${hover ? 'opacity-100' : 'opacity-0'}`}>
        <div className="rounded-xl bg-[#050916]/90 backdrop-blur border border-white/10 px-3 py-2 shadow-xl whitespace-nowrap">
          <p className="text-[14px] font-bold text-white">{hover ? nomeZona(hover) : ''}</p>
          <p className="text-[12.5px] text-[#9aa6cf]">
            {hover && qtdPorZona[hover] ? `${qtdPorZona[hover]} ${qtdPorZona[hover] === 1 ? 'registro' : 'registros'} nesta peça` : editavel ? textoDica : 'Sem avarias'}
          </p>
        </div>
      </div>
    </div>
  )
}

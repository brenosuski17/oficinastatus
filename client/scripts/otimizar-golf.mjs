// Gera client/public/modelos/golf.glb a partir do .glb original do Sketchfab (o original não vai para o repositório).
// Uso: node client/scripts/otimizar-golf.mjs caminho/do/original.glb
//
// O que faz: põe o carro nas coordenadas da inspeção (frente em +x, y para cima, +z à direita, centro entre os eixos),
// agrupa as malhas por peça (extras.zona), remove o que não aparece de fora, simplifica e comprime.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, statSync } from 'node:fs'
import { NodeIO, Primitive } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { compactPrimitive, dedup, join, meshopt, prune, simplifyPrimitive, textureCompress, transformMesh, weld } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'

const origem = process.argv[2]
if (!origem) { console.error('Informe o .glb original.'); process.exit(1) }
const destino = fileURLToPath(new URL('../public/modelos/golf.glb', import.meta.url))

// Interior: só o que se enxerga pelos vidros
const INTERIOR_DESCARTADO = /^Int_Airbag|^Int_Back_Shelf|^Int_Wind_Deflector|^Int_Cupholder|^Int_Trunk_Lid|^Int_Seat_Fabric|Glass_Clear$|Stitching|Speaker|Ambilight|Net\.|K149B9|Seatbelts|Seat_Piping/
const EXTERIOR_DESCARTADO = /^Ext_Door_Limiter|^Ext_Trunk_Lid_Hyd/

/** Peça (zona) de cada nó do original. */
function classificar(nome) {
  if (EXTERIOR_DESCARTADO.test(nome)) return null
  if (/^Int/.test(nome)) return INTERIOR_DESCARTADO.test(nome) ? null : { zona: 'interior', interno: true }
  if (/^(Rim|Tire)_F|^Ext_Brake_F/.test(nome)) return { zona: 'roda_dianteira' }
  if (/^(Rim|Tire)_R|^Ext_Brake_Rear/.test(nome)) return { zona: 'roda_traseira' }
  if (/^Ext_Lights/.test(nome)) return { zona: 'farol' }
  if (/^Ext_Taillight|^Ext_Trunk_Lid_Light|^Ext_Trunk_Lid#Glass_Clear/.test(nome)) return { zona: 'lanterna' }
  if (/^Ext_Sunroof/.test(nome)) return { zona: 'teto' }
  if (/^Ext_Window_Windshield/.test(nome)) return { zona: 'para_brisa' }
  if (/^Ext_Window_Rear/.test(nome)) return { zona: 'vidro_traseiro' }
  if (/^Ext_Body_Window|^Ext_Door_..#Windows/.test(nome)) return { zona: 'vidro_lateral' }
  if (/^Ext_Door_F.#(Clear_Glass|Chrome_Stripes)/.test(nome)) return { zona: 'retrovisor' }
  const pintura = /#Car_Paint$/.test(nome)
  if (/^Ext_Door_F/.test(nome)) return { zona: 'porta_dianteira', pintura }
  if (/^Ext_Door_R/.test(nome)) return { zona: 'porta_traseira', pintura }
  if (/^Ext_Trunk_Lid/.test(nome)) return { zona: 'tampa_traseira', pintura }
  if (/^Ext_Body/.test(nome)) return { zona: 'corpo', pintura }
  return null
}

// Fração de triângulos mantida por grupo: a lataria define a silhueta; rodas e interior aguentam mais corte
const FRACAO = { pintura: 0.75, corpo: 0.35, interior: 0.15, roda_dianteira: 0.3, roda_traseira: 0.2, padrao: 0.5 }
const ERRO = { pintura: 0.0005, interior: 0.015, roda_dianteira: 0.005, roda_traseira: 0.005, padrao: 0.002 }

// Peças que existem nos dois lados: cada lado precisa de malha própria para acender sozinho
const COM_LADO = new Set(['porta_dianteira', 'porta_traseira', 'vidro_lateral', 'retrovisor', 'farol', 'lanterna', 'roda_dianteira', 'roda_traseira'])

// Rotação (frente em -z vira +x, direita em +x vira +z) e rodas apoiadas em y = 0
const ALTURA_SOLO = 0.0128
const PARA_INSPECAO = [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, ALTURA_SOLO, 0, 1]

function multiplicar(a, b) {
  const r = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let l = 0; l < 4; l++) for (let k = 0; k < 4; k++) r[c * 4 + l] += a[k * 4 + l] * b[c * 4 + k]
  return r
}

/** Separa do primitivo os triângulos que atendem ao teste e devolve um primitivo novo com eles. */
function separarTriangulos(doc, prim, teste) {
  const pos = prim.getAttribute('POSITION')
  const idx = prim.getIndices()
  const total = idx ? idx.getCount() : pos.getCount()
  const indice = (i) => (idx ? idx.getScalar(i) : i)
  const dentro = []
  const fora = []
  const a = [0, 0, 0]; const b = [0, 0, 0]; const c = [0, 0, 0]
  for (let i = 0; i < total; i += 3) {
    const t = [indice(i), indice(i + 1), indice(i + 2)]
    pos.getElement(t[0], a); pos.getElement(t[1], b); pos.getElement(t[2], c)
    const centro = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
    ;(teste(centro) ? dentro : fora).push(...t)
  }
  if (!dentro.length) return null
  const novo = prim.clone()
  const acessor = (lista) => doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(lista)).setBuffer(doc.getRoot().listBuffers()[0])
  novo.setIndices(acessor(dentro))
  prim.setIndices(acessor(fora))
  return novo
}

// O retrovisor vem colado na malha da porta dianteira; fica fora da linha da cintura, à frente, além da moldura do vidro
const eRetrovisor = ([x, y, z]) => x > 0.35 && x < 0.85 && ((Math.abs(z) > 0.81 && y > 0.95) || (Math.abs(z) > 0.895 && y > 0.85))

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
await MeshoptEncoder.ready
await MeshoptSimplifier.ready

const doc = await io.read(origem)
const raiz = doc.getRoot()
const cena = raiz.listScenes()[0]
for (const a of raiz.listAnimations()) a.dispose()

// 1. Grupos por peça, com a geometria já nas coordenadas da inspeção
const grupos = new Map()
function grupo(info) {
  const k = `${info.zona}|${info.pintura ? 1 : 0}`
  if (!grupos.has(k)) {
    const n = doc.createNode(`peca_${info.zona}${info.pintura ? '_pintura' : ''}`)
    n.setExtras({ zona: info.zona, ...(info.pintura ? { pintura: true } : {}), ...(info.interno ? { interno: true } : {}) })
    grupos.set(k, n)
  }
  return grupos.get(k)
}

const nosOriginais = raiz.listNodes()
const novos = []
for (const no of nosOriginais) {
  const malha = no.getMesh()
  const info = malha && classificar(no.getName())
  if (!info) continue
  // Pneus compartilham a mesma malha entre os nós: cada um precisa de primitivos próprios antes de transformar
  const copia = doc.createMesh(malha.getName())
  for (const p of malha.listPrimitives()) copia.addPrimitive(p.clone())
  transformMesh(copia, multiplicar(PARA_INSPECAO, no.getWorldMatrix()))
  const filho = doc.createNode(no.getName()).setMesh(copia)
  novos.push([grupo(info), filho, no.getName()])
}
for (const n of nosOriginais) n.dispose()
for (const c of cena.listChildren()) cena.removeChild(c)
for (const [g, filho] of novos) g.addChild(filho)
for (const g of grupos.values()) cena.addChild(g)

// 2. Retrovisor: sai da malha das portas dianteiras
const portaPintura = grupos.get('porta_dianteira|1')
const portaOutros = grupos.get('porta_dianteira|0')
const retrovisorPintura = grupo({ zona: 'retrovisor', pintura: true })
const retrovisor = grupo({ zona: 'retrovisor' })
cena.addChild(retrovisorPintura); cena.addChild(retrovisor)
for (const [origemGrupo, alvo] of [[portaPintura, retrovisorPintura], [portaOutros, retrovisor]]) {
  for (const filho of origemGrupo.listChildren()) {
    for (const prim of filho.getMesh().listPrimitives()) {
      const parte = separarTriangulos(doc, prim, eRetrovisor)
      if (parte) alvo.addChild(doc.createNode('retrovisor').setMesh(doc.createMesh('retrovisor').addPrimitive(parte)))
    }
  }
}

// 3. Separa esquerda e direita (triângulo a triângulo: faróis, lanternas e vidros vêm numa malha só)
for (const g of [...cena.listChildren()]) {
  const extras = g.getExtras()
  if (!COM_LADO.has(extras.zona)) continue
  const direita = doc.createNode(`${g.getName()}_direita`).setExtras({ ...extras, lado: 'direita' })
  g.setName(`${g.getName()}_esquerda`).setExtras({ ...extras, lado: 'esquerda' })
  cena.addChild(direita)
  for (const filho of g.listChildren()) {
    for (const prim of filho.getMesh().listPrimitives()) {
      const parte = separarTriangulos(doc, prim, ([, , z]) => z >= 0)
      if (parte) direita.addChild(doc.createNode(filho.getName()).setMesh(doc.createMesh(filho.getName()).addPrimitive(parte)))
      if (!prim.getIndices().getCount()) filho.getMesh().removePrimitive(prim)
    }
    if (!filho.getMesh().listPrimitives().length) g.removeChild(filho)
  }
}

// 4. Junta por material dentro de cada peça, solda e simplifica
await doc.transform(prune({ keepExtras: true, keepLeaves: true }), weld(), join({ keepNamed: false }))

let antes = 0
let depois = 0
const triangulos = (p) => (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3
for (const g of cena.listChildren()) {
  const { zona, pintura } = g.getExtras()
  const fracao = pintura ? FRACAO.pintura : FRACAO[zona] ?? FRACAO.padrao
  const erro = pintura ? ERRO.pintura : ERRO[zona] ?? ERRO.padrao
  for (const filho of g.listChildren()) {
    const malha = filho.getMesh()
    if (!malha) continue
    for (const p of malha.listPrimitives()) {
      if (p.getMode() !== Primitive.Mode.TRIANGLES) continue
      antes += triangulos(p)
      if (triangulos(p) > 40) simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: fracao, error: erro, lockBorder: zona !== 'interior' })
      compactPrimitive(p)
      depois += triangulos(p)
    }
  }
}
console.log(`triângulos: ${Math.round(antes)} -> ${Math.round(depois)}`)

// 5. Texturas em WebP (no máximo 512 px; o carro nunca é visto de perto o bastante para pedir mais) e compressão meshopt.
// A quantização põe uma transformação em cada nó: o shader de realce trabalha em coordenadas de mundo por causa disso.
await doc.transform(
  prune({ keepExtras: true, keepLeaves: true }),
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 80, resize: [512, 512] }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
)

mkdirSync(path.dirname(destino), { recursive: true })
await io.write(destino, doc)
console.log(`gerado: ${destino} (${(statSync(destino).size / 1048576).toFixed(2)} MB)`)
for (const g of doc.getRoot().listScenes()[0].listChildren()) {
  const prims = g.listChildren().flatMap((f) => f.getMesh()?.listPrimitives() ?? [])
  console.log(`  ${g.getName()}: ${prims.length} primitivos, ${Math.round(prims.reduce((t, p) => t + triangulos(p), 0))} triângulos`)
}

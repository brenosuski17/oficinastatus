// Gera client/public/modelos/<carroceria>.glb a partir do .glb original do Sketchfab, pronto para a inspeção 3D.
// Uso: node client/scripts/otimizar-modelo.mjs <hatch|sedan|suv|picape> caminho/do/original.glb
//
// O que faz:
// 1. põe o carro nas coordenadas da inspeção: frente em +x, y para cima, +z à direita, centro entre os eixos,
//    pneus apoiados em y = 0 e o comprimento real do modelo (corrige também um giro pequeno do carro no arquivo);
// 2. separa as peças: pintura (a cor vem do sistema), rodas, vidros, faróis, lanternas e retrovisores, cada uma de
//    um lado, e o resto da lataria, que o shader divide em peças pelas medidas;
// 3. calcula as medidas usadas na detecção da peça clicada (grava em src/vistoria/medidas-modelos.json);
// 4. simplifica, converte as texturas para WebP e comprime com meshopt, para carregar rápido no celular.
// Os modelos de origem e as licenças estão no README (seção "Modelos 3D").
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { NodeIO, Primitive } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { compactPrimitive, dedup, join, meshopt, prune, simplifyPrimitive, textureCompress, transformMesh, weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'

// Cada modelo: comprimento real (m), materiais por função (nome do material, sem diferenciar maiúsculas) e o que
// identifica os pneus (material ou nome do nó). O original tem o comprimento em z, a frente em +z e y para cima.
const CONFIG = {
  hatch: {
    comprimento: 4.29,
    pintura: /^EXT_BODY$/,
    vidro: /^(EXT_GLASS|EXT_WINDOWS|EXT_WINDOWS_DARK|EXT_BLACKGLASS)$/,
    luz: /HEADLIGHT|^EXT_GLASS_(HEAD|TAIL)$|^LIGHT_NM|^GLASS_NM|SQUARELIGHT/,
    espelho: /^MIRROR$/,
    interior: /^(INT_|STEER|STITCH|SEAT|SPEAKER|CARBON|ROPE|AMB|SCREEN|GAUGE|WARNING|DECALS$|HK_|GTI_)/,
    descartar: /^(INT_WINDOWS|DEFROST|WINDOWS_DOT)/,
    pneu: { material: /^EXT_TYRE$/ },
  },
  sedan: {
    comprimento: 4.62,
    pintura: /^e180body$/,
    vidro: /^e180_glass(_out)?$/,
    luz: /^e180_(glassred|lights|tails?|RL|fog|white)$/,
    espelho: /^mirror$/,
    interior: /^(e180_interior|e180_int|e180_intlight|e180_multi|e180_gauge|displaye180|sunburst_engine)$/,
    descartar: /^sunburst_gauges$/,
    pneu: { no: /^Object_(113|274|283|292)$/ },
  },
  picape: {
    comprimento: 5.33,
    pintura: /^oie__prim_env_1$/,
    vidro: /^Matte__1$/,
    luz: /^(Matte__2|vemelho__boolot1|Matte__FFFF1|edge_color2551280255|Color_C02|edge_color25515350255|Color_00[238]|material_0|edge_color178178178255)$/,
    interior: /^(material|cuero__spec_1|interior__spec_[12]|pretozin__spec_2|Matte__FFFFFFFF_1|Matte__FF626262_1|Matte__FF7D7D7D_1|Matte__FF[248]|Matte__FFFB0D0D1|Matte__FF863B1|Matte__FFFFFFFF1|material_4|Color_003_1)$/,
    descartar: /^(edge_color000255|pretozin__prim_1)$/,
    pneu: { material: /^Bridstone$/ },
  },
  suv: {
    comprimento: 4.27,
    pintura: /^BODYY$/,
    vidro: /^(glass|Material\.00[257])$/,
    luz: /^(Farois|Farol_Traseiro|Carlight_|DRL_)/,
    interior: /^Interior$/,
    descartar: /^Windsheld_Wiper$/,
    pneu: { material: /^TiresDecal/ },
  },
}

// Triângulos que cada grupo pode ter no arquivo final (o carro inteiro fica perto de 120 mil)
const ORCAMENTO = { pintura: 55000, corpo: 30000, roda: 3500, vidro: 2500, farol: 5000, lanterna: 4000, retrovisor: 1500, interior: 12000 }
const ERRO = { pintura: 0.004, corpo: 0.006, roda: 0.01, vidro: 0.004, farol: 0.006, lanterna: 0.006, retrovisor: 0.004, interior: 0.08 }
const COM_LADO = new Set(['vidro_lateral', 'retrovisor', 'farol', 'lanterna', 'roda_dianteira', 'roda_traseira'])

const tipo = process.argv[2]
const origem = process.argv[3]
const cfg = CONFIG[tipo]
if (!cfg || !origem) { console.error(`Uso: node otimizar-modelo.mjs <${Object.keys(CONFIG).join('|')}> original.glb`); process.exit(1) }
const destino = fileURLToPath(new URL(`../public/modelos/${tipo}.glb`, import.meta.url))

await MeshoptEncoder.ready
await MeshoptDecoder.ready
await MeshoptSimplifier.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(origem)
const raiz = doc.getRoot()
const cena = raiz.listScenes()[0]
for (const a of raiz.listAnimations()) a.dispose()

// ---------------------------------------------------------------- 1. função de cada primitivo e geometria no mundo
function funcao(material, nomeNo) {
  const nome = material?.getName() || ''
  if (cfg.descartar?.test(nome)) return null
  // Material invisível (contornos exportados pelo SketchUp, por exemplo)
  if (material && material.getAlphaMode() === 'BLEND' && material.getAlpha() < 0.02) return null
  if (cfg.pneu.no?.test(nomeNo) || cfg.pneu.material?.test(nome)) return 'pneu'
  if (cfg.pintura.test(nome)) return 'pintura'
  if (cfg.vidro.test(nome)) return 'vidro'
  if (cfg.luz.test(nome)) return 'luz'
  if (cfg.espelho?.test(nome)) return 'espelho'
  if (cfg.interior.test(nome)) return 'interior'
  return 'corpo'
}

// Do original (comprimento em z, frente em +z) para a inspeção: x' = z, y' = y, z' = -x
const EIXOS = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1]
function multiplicar(a, b) {
  const r = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let l = 0; l < 4; l++) for (let k = 0; k < 4; k++) r[c * 4 + l] += a[k * 4 + l] * b[c * 4 + k]
  return r
}

const pecas = [] // { prim, funcao, nome }
for (const no of raiz.listNodes()) {
  const malha = no.getMesh()
  if (!malha) continue
  const copia = doc.createMesh(malha.getName())
  const funcoes = []
  for (const p of malha.listPrimitives()) {
    if (p.getMode() !== Primitive.Mode.TRIANGLES) continue
    const f = funcao(p.getMaterial(), no.getName())
    if (!f) continue
    copia.addPrimitive(p.clone())
    funcoes.push(f)
  }
  if (!funcoes.length) { copia.dispose(); continue }
  transformMesh(copia, multiplicar(EIXOS, no.getWorldMatrix()))
  copia.listPrimitives().forEach((p, i) => pecas.push({ prim: p, funcao: funcoes[i], nome: no.getName() }))
}
// As malhas originais ficam sem nó e saem no prune; as cópias ganham nós novos, agrupados por peça
for (const n of raiz.listNodes()) n.dispose()

const el = [0, 0, 0]
function* vertices(prim) {
  const pos = prim.getAttribute('POSITION')
  for (let i = 0; i < pos.getCount(); i++) yield pos.getElement(i, el)
}
function caixa(lista) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const { prim } of lista) for (const v of vertices(prim)) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]) }
  return { min, max }
}
function aplicarEmTudo(matriz) {
  const vistas = new Set()
  for (const { prim } of pecas) {
    const pos = prim.getAttribute('POSITION')
    if (vistas.has(pos)) continue
    vistas.add(pos)
    const nor = prim.getAttribute('NORMAL')
    const n = [0, 0, 0]
    for (let i = 0; i < pos.getCount(); i++) {
      const [x, y, z] = pos.getElement(i, el)
      pos.setElement(i, [matriz[0] * x + matriz[4] * y + matriz[8] * z + matriz[12], matriz[1] * x + matriz[5] * y + matriz[9] * z + matriz[13], matriz[2] * x + matriz[6] * y + matriz[10] * z + matriz[14]])
      if (nor && !vistas.has(nor)) {
        nor.getElement(i, n)
        const r = [matriz[0] * n[0] + matriz[4] * n[1] + matriz[8] * n[2], matriz[1] * n[0] + matriz[5] * n[1] + matriz[9] * n[2], matriz[2] * n[0] + matriz[6] * n[1] + matriz[10] * n[2]]
        const L = Math.hypot(...r) || 1
        nor.setElement(i, r.map((v) => v / L))
      }
    }
    if (nor) vistas.add(nor)
  }
}

// ---------------------------------------------------------------- 2. rodas: centros, giro, escala e posição
function centrosDasRodas() {
  const pneus = pecas.filter((p) => p.funcao === 'pneu')
  if (!pneus.length) throw new Error('Nenhum pneu encontrado: confira CONFIG.pneu')
  const geral = caixa(pneus)
  const cx = (geral.min[0] + geral.max[0]) / 2
  const cz = (geral.min[2] + geral.max[2]) / 2
  const q = {}
  for (const { prim } of pneus) for (const v of vertices(prim)) {
    const k = `${v[0] > cx ? 'D' : 'T'}${v[2] > cz ? 'd' : 'e'}`
    const b = (q[k] ||= { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] })
    for (let i = 0; i < 3; i++) { b.min[i] = Math.min(b.min[i], v[i]); b.max[i] = Math.max(b.max[i], v[i]) }
  }
  const r = {}
  for (const [k, b] of Object.entries(q)) r[k] = { centro: b.min.map((v, i) => (v + b.max[i]) / 2), raio: (b.max[1] - b.min[1]) / 2, min: b.min, max: b.max }
  if (Object.keys(r).length !== 4) throw new Error(`Esperava 4 rodas, achei ${Object.keys(r).length}`)
  return r
}

let rodas = centrosDasRodas()
// Giro em torno de y: as rodas do mesmo eixo devem ter o mesmo x (ângulo médio dos dois eixos)
const angulo = (a, b) => Math.atan2(b.centro[0] - a.centro[0], b.centro[2] - a.centro[2])
const giro = -(angulo(rodas.De, rodas.Dd) + angulo(rodas.Te, rodas.Td)) / 2
if (Math.abs(giro) > 0.002) {
  const c = Math.cos(giro); const s = Math.sin(giro)
  // rotação em y: x' = c x + s z, z' = -s x + c z
  aplicarEmTudo([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1])
  rodas = centrosDasRodas()
}
const exterior = pecas.filter((p) => p.funcao !== 'interior')
const cxa = caixa(exterior)
const escala = cfg.comprimento / (cxa.max[0] - cxa.min[0])
const meioEixos = (rodas.De.centro[0] + rodas.Dd.centro[0] + rodas.Te.centro[0] + rodas.Td.centro[0]) / 4
const meioLado = (rodas.De.centro[2] + rodas.Dd.centro[2] + rodas.Te.centro[2] + rodas.Td.centro[2]) / 4
const chao = Math.min(...Object.values(rodas).map((r) => r.min[1]))
aplicarEmTudo([escala, 0, 0, 0, 0, escala, 0, 0, 0, 0, escala, 0, -meioEixos * escala, -chao * escala, -meioLado * escala, 1])
rodas = centrosDasRodas()
console.log(`giro corrigido: ${(giro * 180 / Math.PI).toFixed(2)}° · escala: ${escala.toFixed(4)}`)
for (const [k, r] of Object.entries(rodas)) console.log(`  roda ${k}: centro [${r.centro.map((v) => v.toFixed(3)).join(' ')}] raio ${r.raio.toFixed(3)}`)

// ---------------------------------------------------------------- 3. medidas do carro
const r2 = (v) => Math.round(v * 1000) / 1000
function triangulosDe(lista, cb) {
  const a = [0, 0, 0]; const b = [0, 0, 0]; const c = [0, 0, 0]
  for (const { prim } of lista) {
    const pos = prim.getAttribute('POSITION')
    const idx = prim.getIndices()
    const total = idx ? idx.getCount() : pos.getCount()
    for (let i = 0; i < total; i += 3) {
      const t = idx ? [idx.getScalar(i), idx.getScalar(i + 1), idx.getScalar(i + 2)] : [i, i + 1, i + 2]
      pos.getElement(t[0], a); pos.getElement(t[1], b); pos.getElement(t[2], c)
      const centro = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]
      const area = Math.hypot(...n)
      cb(centro, area ? n.map((v) => v / area) : [0, 1, 0], area / 2)
    }
  }
}

const eixoD = (rodas.De.centro[0] + rodas.Dd.centro[0]) / 2
const eixoT = (rodas.Te.centro[0] + rodas.Td.centro[0]) / 2
const rodaR = Object.values(rodas).reduce((t, r) => t + r.raio, 0) / 4
const ext = caixa(exterior)
const pintura = pecas.filter((p) => p.funcao === 'pintura')
const vidros = pecas.filter((p) => p.funcao === 'vidro')
const cxp = caixa(pintura)
const teto = cxp.max[1]

// Vidros: separa laterais, para-brisa e traseiro pela normal e pela posição
const cxv = caixa(vidros)
const meioCabine = (cxv.min[0] + cxv.max[0]) / 2
const limiteLuz = teto * 0.6 // vidro abaixo disso é lente de farol ou lanterna
const centroCabine = [(eixoD + eixoT) / 2, teto * 0.65, 0]
function tipoVidro(c, nBruta) {
  // À frente do eixo dianteiro não há para-brisa: é lente de farol (importa nos carros altos, como a picape)
  if (c[1] < limiteLuz || c[0] > eixoD - 0.05) return c[0] > 0 ? 'farol' : 'lanterna'
  // Normal virada para fora do carro (vidros vêm com as duas faces)
  const fora = (c[0] - centroCabine[0]) * nBruta[0] + (c[1] - centroCabine[1]) * nBruta[1] + c[2] * nBruta[2]
  const n = fora < 0 ? nBruta.map((v) => -v) : nBruta
  if (Math.abs(n[2]) > 0.6) return 'vidro_lateral'
  if (n[0] > 0.3 && c[0] > centroCabine[0]) return 'para_brisa'
  if (n[0] < -0.3 && c[0] < centroCabine[0]) return 'vidro_traseiro'
  return 'teto'
}
// Extremos de cada vidro por percentil (1 % e 99 %), para um triângulo solto não deslocar a medida
const extremos = (filtro) => {
  const v = [[], [], []]
  triangulosDe(vidros, (c, n) => { if (tipoVidro(c, n) === filtro) for (let k = 0; k < 3; k++) v[k].push(c[k]) })
  const pct = (lista, p) => { const s = [...lista].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
  if (!v[0].length) return null
  return { min: v.map((l) => pct(l, 0.01)), max: v.map((l) => pct(l, 0.99)) }
}
const pb = extremos('para_brisa')
const vt = extremos('vidro_traseiro')
const vl = extremos('vidro_lateral')

// Linha da cintura: base dos vidros laterais na frente e atrás
let cintura = Infinity; let cinturaTras = Infinity
triangulosDe(vidros, (c, n) => {
  if (tipoVidro(c, n) !== 'vidro_lateral') return
  if (c[0] > meioCabine) cintura = Math.min(cintura, c[1]); else cinturaTras = Math.min(cinturaTras, c[1])
})
if (!Number.isFinite(cinturaTras)) cinturaTras = cintura

// Largura pela pele das portas (logo abaixo da cintura, entre os arcos: sem retrovisor nem alargador de para-lama)
// e altura do capô
let meiaLargura = 0; let capoY = 0; let base = Infinity
const frente = ext.max[0]; const tras = ext.min[0]
triangulosDe(pintura, (c) => {
  if (c[1] < cintura - 0.05 && c[1] > cintura - 0.35 && c[0] > eixoT + rodaR + 0.25 && c[0] < eixoD - rodaR - 0.25)
    meiaLargura = Math.max(meiaLargura, Math.abs(c[2]))
  if (c[0] > frente - 0.3 && c[0] < frente - 0.1 && Math.abs(c[2]) < 0.4) capoY = Math.max(capoY, c[1])
})
// Base: fundo da soleira, na lateral de fora e entre os arcos das rodas (a pintura de baixo do carro não conta)
triangulosDe(pintura, (c) => {
  if (Math.abs(c[2]) > meiaLargura - 0.12 && c[0] > eixoT + rodaR + 0.15 && c[0] < eixoD - rodaR - 0.15) base = Math.min(base, c[1])
})
if (!Number.isFinite(base)) base = rodaR * 0.6
// Largura da cabine: vidros laterais por dentro da lataria (o vidro do retrovisor fica de fora)
let meiaCabine = 0
triangulosDe(vidros, (c, n) => { if (tipoVidro(c, n) === 'vidro_lateral' && Math.abs(c[2]) < meiaLargura) meiaCabine = Math.max(meiaCabine, Math.abs(c[2])) })

// Perfil do teto na faixa central: PT e TR são as pontas da parte que chega perto da altura máxima
const perfil = new Map()
triangulosDe(exterior, (c) => {
  if (Math.abs(c[2]) > 0.3) return
  const k = Math.round(c[0] * 50)
  perfil.set(k, Math.max(perfil.get(k) ?? -Infinity, c[1]))
})
// Altura do teto pela mediana das faixas mais altas (uma antena ou rack não vira o teto)
const alturas = [...perfil.values()].sort((a, b) => b - a)
const alturaTeto = alturas[Math.floor(alturas.length * 0.1)] ?? teto
const noTopo = [...perfil].filter(([, y]) => y > alturaTeto - 0.05).map(([k]) => k / 50)
const PTx = Math.max(...noTopo); const TRx = Math.min(...noTopo)
const arco = rodaR + 0.07
// Sem vidro traseiro reconhecido (a picape deste modelo): a traseira da cabine sai do perfil do teto
const TB = vt ? [vt.min[0], vt.min[1]] : [TRx - 0.08, cinturaTras]
// Coluna C: fim da porta traseira (na picape, a traseira da cabine; nos outros, perto do arco da roda traseira)
const colunaC = tipo === 'picape' ? TB[0] - 0.05 : Math.max(eixoT + 0.05, vl.min[0] + 0.2)

// Coluna B: maior vão entre os vidros laterais, entre a coluna C e o para-brisa (35 cm de folga em cada ponta);
// sem vão nesse trecho, fica no meio dele
const ini = colunaC + 0.35; const fim = pb.max[0] - 0.35
const faixas = new Array(100).fill(0)
const passo = (fim - ini) / faixas.length
triangulosDe(vidros, (c, n, area) => {
  if (tipoVidro(c, n) === 'vidro_lateral' && c[0] >= ini && c[0] < fim) faixas[Math.floor((c[0] - ini) / passo)] += area
})
let colunaB = (ini + fim) / 2; let melhor = 0; let inicio = -1
for (let i = 0; i <= faixas.length; i++) {
  if (i < faixas.length && faixas[i] < 1e-5) { if (inicio < 0) inicio = i } else if (inicio >= 0) {
    if (inicio > 0 && i < faixas.length && i - inicio > melhor) { melhor = i - inicio; colunaB = ini + passo * (inicio + i) / 2 }
    inicio = -1
  }
}
const medidas = {
  nome: { hatch: 'Hatch', sedan: 'Sedã', suv: 'SUV', picape: 'Picape' }[tipo],
  base: r2(base), frente: r2(frente), tras: r2(tras), capoY: r2(capoY || teto * 0.55), cintura: r2(cintura), cinturaTras: r2(cinturaTras),
  eixoD: r2(eixoD), eixoT: r2(eixoT), rodaR: r2(rodaR), arco: r2(arco),
  PB: [r2(pb.max[0]), r2(pb.min[1])], PT: [r2(PTx), r2(perfil.get(Math.round(PTx * 50)))], teto: r2(teto),
  TR: [r2(TRx), r2(perfil.get(Math.round(TRx * 50)))], TB: [r2(TB[0]), r2(TB[1])],
  portas: [r2(eixoD - arco - 0.04), r2(colunaB), r2(colunaC)], colunaB: r2(colunaB), colunaC: r2(colunaC),
  largura: r2(meiaLargura * 2), cabineLarg: r2(meiaCabine * 2),
}

// ---------------------------------------------------------------- 4. peças: cada triângulo vai para o grupo da sua peça
const naRoda = (c) => {
  for (const [k, r] of Object.entries(rodas)) {
    const lado = Math.sign(r.centro[2])
    if (Math.hypot(c[0] - r.centro[0], c[1] - r.centro[1]) < r.raio * 1.04 && c[2] * lado > Math.abs(r.centro[2]) - 0.3) return k
  }
  return null
}
const ladoDe = (c) => (c[2] >= 0 ? 'direita' : 'esquerda')
const eRetrovisor = (c) => Math.abs(c[2]) > meiaLargura + 0.015 && c[1] > cintura - 0.15 && c[1] < cintura + 0.35 && c[0] > medidas.PB[0] - 0.85 && c[0] < medidas.PB[0] + 0.15

function destinoDo(funcao, c, n) {
  if (funcao === 'interior') return { zona: 'interior', interno: true }
  const roda = funcao !== 'pintura' && funcao !== 'vidro' && naRoda(c)
  if (funcao === 'pneu' || roda) {
    const k = roda || (c[0] > 0 ? 'D' : 'T')
    return { zona: k[0] === 'D' ? 'roda_dianteira' : 'roda_traseira', lado: ladoDe(c) }
  }
  if (funcao === 'espelho' || (funcao !== 'luz' && eRetrovisor(c))) return { zona: 'retrovisor', lado: ladoDe(c), pintura: funcao === 'pintura' }
  if (funcao === 'luz') return { zona: c[0] > 0 ? 'farol' : 'lanterna', lado: ladoDe(c) }
  if (funcao === 'vidro') {
    const z = tipoVidro(c, n)
    return COM_LADO.has(z) ? { zona: z, lado: ladoDe(c) } : { zona: z }
  }
  return { zona: 'corpo', pintura: funcao === 'pintura' }
}

const grupos = new Map()
function grupo(d) {
  const k = `${d.zona}|${d.lado || ''}|${d.pintura ? 1 : 0}`
  if (!grupos.has(k)) {
    const nome = `peca_${d.zona}${d.lado ? `_${d.lado}` : ''}${d.pintura ? '_pintura' : ''}`
    const extras = { zona: d.zona }
    if (d.lado) extras.lado = d.lado
    if (d.pintura) extras.pintura = true
    if (d.interno) extras.interno = true
    const t = d.interno ? 'interior' : d.zona === 'corpo' ? (d.pintura ? 'pintura' : 'corpo')
      : /vidro|para_brisa|teto/.test(d.zona) ? 'vidro' : d.zona.replace(/_(dianteira|traseira)$/, '')
    grupos.set(k, { no: doc.createNode(nome).setExtras(extras), tipo: t })
  }
  return grupos.get(k)
}

const buffer = raiz.listBuffers()[0]
for (const { prim, funcao: f, nome } of pecas) {
  const pos = prim.getAttribute('POSITION')
  const idx = prim.getIndices()
  const total = idx ? idx.getCount() : pos.getCount()
  const porDestino = new Map()
  const a = [0, 0, 0]; const b = [0, 0, 0]; const c = [0, 0, 0]
  for (let i = 0; i < total; i += 3) {
    const t = idx ? [idx.getScalar(i), idx.getScalar(i + 1), idx.getScalar(i + 2)] : [i, i + 1, i + 2]
    pos.getElement(t[0], a); pos.getElement(t[1], b); pos.getElement(t[2], c)
    const centro = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]
    const L = Math.hypot(...n) || 1
    const g = grupo(destinoDo(f, centro, n.map((v) => v / L)))
    if (!porDestino.has(g)) porDestino.set(g, [])
    porDestino.get(g).push(...t)
  }
  for (const [g, lista] of porDestino) {
    const novo = prim.clone().setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(lista)).setBuffer(buffer))
    g.no.addChild(doc.createNode(nome).setMesh(doc.createMesh(nome).addPrimitive(novo)))
  }
}
for (const { prim } of pecas) prim.dispose()
for (const c of cena.listChildren()) cena.removeChild(c)
for (const g of grupos.values()) cena.addChild(g.no)

// ---------------------------------------------------------------- 5. simplifica cada grupo até o orçamento dele
await doc.transform(prune({ keepExtras: true, keepLeaves: true }), weld(), join({ keepNamed: false }))
const triangulos = (p) => (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3
let antes = 0; let depois = 0
for (const g of grupos.values()) {
  const prims = g.no.listChildren().flatMap((f) => f.getMesh()?.listPrimitives() ?? [])
  const total = prims.reduce((t, p) => t + triangulos(p), 0)
  const fracao = Math.min(1, (ORCAMENTO[g.tipo] ?? ORCAMENTO.corpo) / Math.max(total, 1))
  for (const p of prims) {
    antes += triangulos(p)
    if (fracao < 1 && triangulos(p) > 40) simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: fracao, error: ERRO[g.tipo] ?? ERRO.corpo, lockBorder: false })
    compactPrimitive(p)
    depois += triangulos(p)
  }
}
console.log(`triângulos: ${Math.round(antes)} -> ${Math.round(depois)}`)

// Transmissão (vidro refrativo) obriga o three.js a renderizar a cena duas vezes por quadro: vira transparência comum
for (const m of raiz.listMaterials()) {
  const t = m.getExtension('KHR_materials_transmission')
  if (!t) continue
  m.setExtension('KHR_materials_transmission', null)
  m.setExtension('KHR_materials_volume', null)
  m.setAlphaMode('BLEND').setAlpha(Math.min(m.getAlpha(), 0.35))
}
for (const e of raiz.listExtensionsUsed()) if (['KHR_materials_transmission', 'KHR_materials_volume'].includes(e.extensionName)) e.dispose()

await doc.transform(
  prune({ keepExtras: true, keepLeaves: true }),
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 80, resize: [512, 512] }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
)
mkdirSync(path.dirname(destino), { recursive: true })
await io.write(destino, doc)
// Medidas de todos os modelos num arquivo só, lido por carrocerias.js
const arqMedidas = fileURLToPath(new URL('../src/vistoria/medidas-modelos.json', import.meta.url))
const todas = existsSync(arqMedidas) ? JSON.parse(readFileSync(arqMedidas, 'utf8')) : {}
todas[tipo] = medidas
writeFileSync(arqMedidas, `${JSON.stringify(Object.fromEntries(Object.keys(CONFIG).filter((k) => todas[k]).map((k) => [k, todas[k]])), null, 2)}\n`)
console.log(`gerado: ${destino} (${(statSync(destino).size / 1048576).toFixed(2)} MB)`)
console.log('medidas:', JSON.stringify(medidas))
for (const g of [...grupos.values()].sort((a, b) => a.no.getName().localeCompare(b.no.getName()))) {
  const prims = g.no.listChildren().flatMap((f) => f.getMesh()?.listPrimitives() ?? [])
  console.log(`  ${g.no.getName().padEnd(34)} ${String(Math.round(prims.reduce((t, p) => t + triangulos(p), 0))).padStart(6)} triângulos`)
}

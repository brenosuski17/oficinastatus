// Mostra a estrutura de um .glb (nós com malha, materiais, caixa em coordenadas de mundo e triângulos), para escrever
// a configuração de um carro em otimizar-modelo.mjs. Uso: node client/scripts/inspecionar-modelo.mjs arquivo.glb [filtro]
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'

const [arquivo, filtro] = process.argv.slice(2)
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(arquivo)
const raiz = doc.getRoot()

const aplicar = (m, [x, y, z]) => [
  m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14],
]
const geral = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
const linhas = []
let totalTri = 0
for (const no of raiz.listNodes()) {
  const malha = no.getMesh()
  if (!malha) continue
  const w = no.getWorldMatrix()
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  let tri = 0
  const mats = new Set()
  for (const p of malha.listPrimitives()) {
    const pos = p.getAttribute('POSITION')
    const el = [0, 0, 0]
    const passo = Math.max(1, Math.floor(pos.getCount() / 2000))
    for (let i = 0; i < pos.getCount(); i += passo) {
      const v = aplicar(w, pos.getElement(i, el))
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]) }
    }
    tri += (p.getIndices() ? p.getIndices().getCount() : pos.getCount()) / 3
    mats.add(p.getMaterial()?.getName() || '(sem)')
  }
  totalTri += tri
  for (let k = 0; k < 3; k++) { geral.min[k] = Math.min(geral.min[k], min[k]); geral.max[k] = Math.max(geral.max[k], max[k]) }
  linhas.push({ nome: no.getName(), malha: malha.getName(), mats: [...mats].join(','), tri: Math.round(tri), min, max })
}
const f = (v) => v.map((x) => x.toFixed(2)).join(' ')
console.log(`nós com malha: ${linhas.length} · triângulos: ${Math.round(totalTri)} · texturas: ${raiz.listTextures().length} · materiais: ${raiz.listMaterials().length}`)
console.log(`caixa geral: min [${f(geral.min)}] max [${f(geral.max)}] tamanho [${f(geral.max.map((x, i) => x - geral.min[i]))}]`)
console.log('materiais:', raiz.listMaterials().map((m) => `${m.getName()}(${m.getBaseColorFactor().slice(0, 3).map((c) => c.toFixed(2)).join('/')}${m.getBaseColorTexture() ? ',tex' : ''})`).join(' | '))
if (filtro === '--rodas') {
  // Nós com cara de roda (comprimento em z, altura em y): encostam no chão, altura ~14 % do carro, redondos de lado
  const L = geral.max[2] - geral.min[2]
  const chao = geral.min[1]
  for (const l of linhas) {
    const dx = l.max[0] - l.min[0]; const dy = l.max[1] - l.min[1]; const dz = l.max[2] - l.min[2]
    if (l.min[1] - chao < 0.04 * L && dy > 0.09 * L && dy < 0.2 * L && dz / dy > 0.7 && dz / dy < 1.35 && dx < 0.09 * L)
      console.log(`roda? ${l.nome.padEnd(30).slice(0, 30)} ${String(l.tri).padStart(7)}  centro [${f(l.min.map((v, i) => (v + l.max[i]) / 2))}] diâm ${dy.toFixed(3)} larg ${dx.toFixed(3)}  ${l.mats.slice(0, 40)}`)
  }
  process.exit(0)
}
if (filtro === '--materiais') {
  // Resumo por material: triângulos, nós e caixa
  const porMat = new Map()
  for (const l of linhas) for (const mat of l.mats.split(',')) {
    const r = porMat.get(mat) || { tri: 0, nos: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
    r.tri += l.tri; r.nos++
    for (let k = 0; k < 3; k++) { r.min[k] = Math.min(r.min[k], l.min[k]); r.max[k] = Math.max(r.max[k], l.max[k]) }
    porMat.set(mat, r)
  }
  for (const [mat, r] of [...porMat].sort((a, b) => b[1].tri - a[1].tri))
    console.log(`${mat.padEnd(34).slice(0, 34)} ${String(r.tri).padStart(7)} tri ${String(r.nos).padStart(4)} nós  [${f(r.min)}]..[${f(r.max)}]`)
  process.exit(0)
}
for (const l of linhas.filter((l) => !filtro || new RegExp(filtro, 'i').test(`${l.nome} ${l.malha} ${l.mats}`)))
  console.log(`${l.nome.padEnd(42).slice(0, 42)} ${String(l.tri).padStart(7)}  [${f(l.min)}]..[${f(l.max)}]  ${l.mats.slice(0, 60)}`)

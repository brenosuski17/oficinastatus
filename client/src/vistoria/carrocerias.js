// Medidas de cada carroceria (metros). O carro aponta para +x, y é para cima e +z é o lado direito.
// As mesmas medidas servem para desenhar o modelo e para descobrir qual peça foi clicada.

export const CARROCERIAS = {
  hatch: {
    nome: 'Hatch',
    base: 0.3, frente: 2.17, tras: -2.06, capoY: 0.8, cintura: 0.94, cinturaTras: 0.99,
    eixoD: 1.32, eixoT: -1.32, rodaR: 0.34, arco: 0.44,
    PB: [1.06, 0.92], PT: [0.1, 1.39], teto: 1.44, TR: [-1.18, 1.41], TB: [-1.94, 0.99],
    portas: [0.9, -0.02, -0.96], colunaB: -0.42, colunaC: -1.35, largura: 1.78, cabineLarg: 1.46,
  },
  sedan: {
    nome: 'Sedã',
    base: 0.29, frente: 2.3, tras: -2.3, capoY: 0.79, cintura: 0.93, cinturaTras: 1.0,
    eixoD: 1.38, eixoT: -1.38, rodaR: 0.34, arco: 0.44,
    PB: [1.12, 0.91], PT: [0.12, 1.38], teto: 1.42, TR: [-0.85, 1.39], TB: [-1.52, 1.0],
    portas: [0.95, -0.03, -1.02], colunaB: -0.4, colunaC: -1.2, largura: 1.8, cabineLarg: 1.46,
  },
  suv: {
    nome: 'SUV',
    base: 0.4, frente: 2.22, tras: -2.12, capoY: 0.95, cintura: 1.08, cinturaTras: 1.14,
    eixoD: 1.36, eixoT: -1.36, rodaR: 0.38, arco: 0.48,
    PB: [1.12, 1.06], PT: [0.2, 1.6], teto: 1.65, TR: [-1.55, 1.62], TB: [-2.02, 1.14],
    portas: [0.95, 0.0, -1.0], colunaB: -0.4, colunaC: -1.5, largura: 1.86, cabineLarg: 1.56,
  },
  picape: {
    nome: 'Picape',
    base: 0.36, frente: 2.36, tras: -2.46, capoY: 0.9, cintura: 1.02, cinturaTras: 1.04,
    eixoD: 1.55, eixoT: -1.52, rodaR: 0.37, arco: 0.47,
    PB: [1.12, 1.0], PT: [0.3, 1.52], teto: 1.56, TR: [-0.52, 1.54], TB: [-0.62, 1.04],
    portas: [1.0, 0.22, -0.58], colunaB: 0.2, colunaC: -0.58, largura: 1.84, cabineLarg: 1.52,
  },
}

export const carroceria = (c) => CARROCERIAS[c] || CARROCERIAS.hatch

// Modelos 3D prontos: gerados por client/scripts/otimizar-golf.mjs, nas mesmas coordenadas dos carros desenhados.
// Valem só para as marcas indicadas (um Onix não pode aparecer com o emblema da VW). As medidas seguem o modelo e
// substituem as do desenho na detecção de peça e no centro de cada peça.
export const MODELOS = {
  hatch: {
    url: '/modelos/golf.glb',
    marcas: /\b(vw|volks\s*wagen)\b/i,
    credito: 'Modelo 3D: Volkswagen Golf GTI 2025, Sketchfab (licença Standard)',
    medidas: {
      nome: 'Hatch',
      base: 0.214, frente: 2.196, tras: -2.096, capoY: 0.75, cintura: 0.95, cinturaTras: 1.0,
      eixoD: 1.316, eixoT: -1.316, rodaR: 0.328, arco: 0.4,
      PB: [1.114, 0.954], PT: [0.259, 1.377], teto: 1.47, TR: [-1.548, 1.326], TB: [-1.947, 1.033],
      portas: [0.87, -0.28, -1.3], colunaB: -0.28, colunaC: -1.3, largura: 1.786, cabineLarg: 1.45, retrovisorX: 0.62,
    },
  },
}

export function modeloDe(tipo, marca) {
  const modelo = MODELOS[tipo in CARROCERIAS ? tipo : 'hatch']
  return modelo?.marcas.test(marca || '') ? modelo : null
}

/** Medidas do carro que aparece na tela: as do modelo pronto, se houver, ou as do desenho. */
export const medidasDe = (tipo, marca) => modeloDe(tipo, marca)?.medidas || carroceria(tipo)

// Peças da lataria pintadas pelo shader, na ordem dos índices usados no GLSL
export const ZONAS_LATARIA = [
  'capo', 'teto', 'tampa_traseira', 'para_choque_dianteiro', 'para_choque_traseiro',
  'para_lama_dianteiro_esquerda', 'para_lama_dianteiro_direita',
  'porta_dianteira_esquerda', 'porta_dianteira_direita',
  'porta_traseira_esquerda', 'porta_traseira_direita',
  'lateral_traseira_esquerda', 'lateral_traseira_direita',
  'soleira_esquerda', 'soleira_direita',
]

const COM_LADO = new Set(['para_lama_dianteiro', 'porta_dianteira', 'porta_traseira', 'lateral_traseira', 'soleira', 'vidro_lateral', 'retrovisor', 'farol', 'lanterna', 'roda_dianteira', 'roda_traseira'])

/** Peça da lataria a partir de um ponto e da normal da superfície (mesma lógica do shader). */
export function zonaLataria(p, n, c) {
  const lado = p.z >= 0 ? 'direita' : 'esquerda'
  // Frente e traseira só valem além dos eixos; antes disso, a superfície virada para x é a parte interna do arco da roda
  const frontal = n.x > 0.5 && p.x > c.eixoD
  const traseira = n.x < -0.5 && p.x < c.eixoT
  if (Math.abs(n.z) > 0.55 || (Math.abs(n.x) > 0.5 && !frontal && !traseira)) {
    if (p.x > c.frente - 0.32 && p.y < c.base + 0.36) return 'para_choque_dianteiro'
    if (p.x < c.tras + 0.16 && p.y < c.base + 0.38) return 'para_choque_traseiro'
    if (p.y < c.base + 0.08 && p.x > c.eixoT + c.arco - 0.05 && p.x < c.eixoD - c.arco + 0.05) return `soleira_${lado}`
    let peca
    if (p.y > c.cintura + 0.03) peca = p.x > c.colunaB ? 'porta_dianteira' : p.x > c.colunaC ? 'porta_traseira' : 'lateral_traseira'
    else peca = p.x > c.portas[0] ? 'para_lama_dianteiro' : p.x > c.portas[1] ? 'porta_dianteira' : p.x > c.portas[2] ? 'porta_traseira' : 'lateral_traseira'
    return `${peca}_${lado}`
  }
  if (frontal) return p.y < c.capoY - 0.14 ? 'para_choque_dianteiro' : 'capo'
  if (traseira) return p.y < c.base + 0.38 ? 'para_choque_traseiro' : 'tampa_traseira'
  if (n.y < -0.4) return `soleira_${lado}`
  if (p.x > c.PB[0] - 0.1) return 'capo'
  if (p.x < c.TB[0] + 0.05 && p.y < c.cinturaTras + 0.1) return 'tampa_traseira'
  return 'teto'
}

/** Peça clicada: peças separadas (vidros, rodas, faróis) já vêm com o nome; a lataria é calculada. */
export function detectarZona(base, p, n, c) {
  if (base && base !== 'corpo') return COM_LADO.has(base) ? `${base}_${p.z >= 0 ? 'direita' : 'esquerda'}` : base
  return zonaLataria(p, n, c)
}

/** Ponto de referência de cada peça (para marcar uma avaria escolhida pela lista e para mirar a câmera). */
export function centroDaZona(zona, c) {
  const lado = zona.endsWith('_direita') ? 1 : zona.endsWith('_esquerda') ? -1 : 0
  const z = (c.largura / 2 + 0.07) * lado
  const meio = (a, b) => (a + b) / 2
  const base = zona.replace(/_(direita|esquerda)$/, '')
  const P = {
    capo: [meio(c.PB[0], c.frente) - 0.1, c.capoY + 0.08, 0, 0, 1, 0],
    teto: [meio(c.PT[0], c.TR[0]), c.teto + 0.05, 0, 0, 1, 0],
    tampa_traseira: [c.tras - 0.05, meio(c.base + 0.4, c.cinturaTras), 0, -1, 0, 0],
    para_choque_dianteiro: [c.frente + 0.06, c.base + 0.18, 0, 1, 0, 0],
    para_choque_traseiro: [c.tras - 0.06, c.base + 0.2, 0, -1, 0, 0],
    para_brisa: [meio(c.PB[0], c.PT[0]) + 0.05, meio(c.PB[1], c.PT[1]) + 0.05, 0, 0.5, 0.8, 0],
    vidro_traseiro: [meio(c.TR[0], c.TB[0]) - 0.05, meio(c.TR[1], c.TB[1]) + 0.04, 0, -0.6, 0.7, 0],
    para_lama_dianteiro: [meio(c.portas[0], c.frente - 0.3), c.capoY - 0.08, z, 0, 0, lado],
    porta_dianteira: [meio(c.portas[0], c.portas[1]), c.cintura - 0.22, z, 0, 0, lado],
    porta_traseira: [meio(c.portas[1], c.portas[2]), c.cintura - 0.22, z, 0, 0, lado],
    lateral_traseira: [meio(c.portas[2], c.tras + 0.3), c.cintura - 0.2, z, 0, 0, lado],
    soleira: [0, c.base + 0.04, z, 0, 0, lado],
    vidro_lateral: [meio(c.PB[0], c.TB[0]) * 0.8, meio(c.cintura, c.teto), (c.cabineLarg / 2 + 0.08) * lado, 0, 0, lado],
    retrovisor: [c.retrovisorX ?? c.PB[0] - 0.26, c.cintura + 0.08, (c.largura / 2 + 0.12) * lado, 0, 0, lado],
    farol: [c.frente - 0.02, c.capoY - 0.1, 0.6 * lado, 0.8, 0.4, 0.4 * lado],
    lanterna: [c.tras - 0.07, c.cinturaTras - 0.2, 0.62 * lado, -1, 0, 0.3 * lado],
    roda_dianteira: [c.eixoD, c.rodaR, (c.largura / 2 + 0.02) * lado, 0, 0, lado],
    roda_traseira: [c.eixoT, c.rodaR, (c.largura / 2 + 0.02) * lado, 0, 0, lado],
  }[base]
  if (!P) return null
  const [x, y, zz, nx, ny, nz] = P
  const L = Math.hypot(nx, ny, nz) || 1
  return { posicao: { x, y, z: zz }, normal: { x: nx / L, y: ny / L, z: nz / L } }
}

// Cor da pintura a partir do nome cadastrado
const CORES = [
  [/branc|pérola|perola/, '#ece9e1'], [/pret|grafite escuro/, '#1d2129'], [/prata|silver/, '#b9bec7'],
  [/cinza|grafite|chumbo/, '#6b7280'], [/vermelh|red/, '#b3202a'], [/vinho|bordô|bordo/, '#6e1b2b'],
  [/azul/, '#5b8fd9'], [/verde/, '#2f7a55'], [/amarel/, '#e5b62b'], [/laranja/, '#e0702a'],
  [/marrom|bronze/, '#6b4a33'], [/bege|champagne|dourad|areia/, '#cfc3a4'],
]
export function corDaPintura(nome) {
  const n = String(nome || '').toLowerCase()
  return CORES.find(([r]) => r.test(n))?.[1] || '#d8d3c6'
}

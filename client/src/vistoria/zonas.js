// Peças do carro, tipos e gravidades de avaria (mesmos códigos do servidor)

const LATERAIS = {
  para_lama_dianteiro: 'Para-lama dianteiro', porta_dianteira: 'Porta dianteira', porta_traseira: 'Porta traseira',
  lateral_traseira: 'Lateral traseira', soleira: 'Soleira', vidro_lateral: 'Vidro lateral', retrovisor: 'Retrovisor',
  farol: 'Farol', lanterna: 'Lanterna', roda_dianteira: 'Roda dianteira', roda_traseira: 'Roda traseira',
}
export const ZONAS = {
  capo: 'Capô', teto: 'Teto', tampa_traseira: 'Tampa traseira',
  para_choque_dianteiro: 'Para-choque dianteiro', para_choque_traseiro: 'Para-choque traseiro',
  para_brisa: 'Para-brisa', vidro_traseiro: 'Vidro traseiro',
}
const MASCULINOS = new Set(['para_lama_dianteiro', 'vidro_lateral', 'retrovisor', 'farol'])
for (const [k, n] of Object.entries(LATERAIS)) {
  const m = MASCULINOS.has(k)
  ZONAS[`${k}_esquerda`] = `${n} ${m ? 'esquerdo' : 'esquerda'}`
  ZONAS[`${k}_direita`] = `${n} ${m ? 'direito' : 'direita'}`
}
export const nomeZona = (z) => ZONAS[z] || z

export const TIPOS = [
  { valor: 'amassado', nome: 'Amassado' },
  { valor: 'risco', nome: 'Risco' },
  { valor: 'trinca', nome: 'Trinca' },
  { valor: 'quebra', nome: 'Quebra' },
  { valor: 'corrosao', nome: 'Corrosão' },
  { valor: 'pintura', nome: 'Pintura danificada' },
]
export const nomeTipo = (t) => TIPOS.find((x) => x.valor === t)?.nome || t

export const GRAVIDADES = [
  { valor: 'leve', nome: 'Leve', cor: '#facc15' },
  { valor: 'moderada', nome: 'Moderada', cor: '#fb923c' },
  { valor: 'grave', nome: 'Grave', cor: '#f43f5e' },
]
export const corGravidade = (g) => GRAVIDADES.find((x) => x.valor === g)?.cor || '#3d5bff'

// Explica o que cada gravidade significa para o tipo escolhido
export const DICA_GRAVIDADE = {
  amassado: { leve: 'Sem dano na pintura, sai com martelinho', moderada: 'Afeta a chapa e pede recuperação', grave: 'Chapa deformada, pede recuperação e pintura' },
  risco: { leve: 'Só no verniz, sai no polimento', moderada: 'Atinge a tinta, pede retoque', grave: 'Chega no primer ou na chapa, pede pintura' },
  trinca: { leve: 'Pequena e estável, dá para reparar', moderada: 'Tende a aumentar, avaliar troca', grave: 'Compromete a peça, troca recomendada' },
  quebra: { leve: 'Peça solta ou presilha quebrada', moderada: 'Parte da peça perdida', grave: 'Peça destruída, troca necessária' },
  corrosao: { leve: 'Pontos superficiais de ferrugem', moderada: 'Ferrugem com bolhas na pintura', grave: 'Chapa perfurada' },
  pintura: { leve: 'Desbotamento ou manchas leves', moderada: 'Afeta o acabamento e pede reparo com pintura', grave: 'Tinta descascando em grande área' },
}

const COM_LADO = new Set(Object.keys(LATERAIS))

/**
 * Descobre a peça a partir do ponto clicado no modelo 3D.
 * O carro aponta para +x (frente), y é para cima e +z é o lado direito.
 */
export function detectarZona(base, p, n) {
  const lado = p.z >= 0 ? 'direita' : 'esquerda'
  if (base && base !== 'corpo') return COM_LADO.has(base) ? `${base}_${lado}` : base

  const lateral = Math.abs(n.z) > 0.55
  if (lateral) {
    if (p.x > 1.85 && p.y < 0.66) return 'para_choque_dianteiro'
    if (p.x < -1.9 && p.y < 0.68) return 'para_choque_traseiro'
    if (p.y < 0.38 && p.x > -0.9 && p.x < 0.9) return `soleira_${lado}`
    let peca
    if (p.y > 0.97) peca = p.x > -0.38 ? 'porta_dianteira' : p.x > -1.35 ? 'porta_traseira' : 'lateral_traseira'
    else peca = p.x > 0.9 ? 'para_lama_dianteiro' : p.x > -0.02 ? 'porta_dianteira' : p.x > -0.96 ? 'porta_traseira' : 'lateral_traseira'
    return `${peca}_${lado}`
  }
  if (n.x > 0.5) return p.y < 0.66 ? 'para_choque_dianteiro' : 'capo'
  if (n.x < -0.5) return p.y < 0.68 ? 'para_choque_traseiro' : 'tampa_traseira'
  if (n.y < -0.4) return `soleira_${lado}`
  if (p.x > 0.95) return 'capo'
  if (p.x < -1.7 && p.y < 1.05) return 'tampa_traseira'
  return 'teto'
}

export const formatarTempo = (min) => {
  const m = Math.round(min || 0)
  if (m < 60) return `${m}min`
  return `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') + 'min' : ''}`
}

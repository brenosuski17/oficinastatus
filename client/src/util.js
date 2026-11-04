// Datas do SQLite vêm em UTC sem fuso ("2026-11-04 03:12:00")
export const data = (s) => (s ? new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z') : null)

export const dataHora = (s) =>
  s ? data(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''

export const dia = (s) =>
  s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) : ''

export const moeda = (v) =>
  v == null ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function tempoDesde(s) {
  const min = Math.round((Date.now() - data(s)) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24)
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
}

export const telefone = (t) => {
  const n = String(t || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
  return t
}

// Colunas do quadro, na ordem do fluxo da OS
export const ESTADOS = {
  orcamento: { titulo: 'Em orçamento', curto: 'Orçamento', dica: 'Avaliar o veículo e enviar o orçamento' },
  aprovacao: { titulo: 'Aguardando cliente', curto: 'Aprovação', dica: 'Orçamento enviado, esperando resposta' },
  aprovado: { titulo: 'Aprovado', curto: 'Aprovado', dica: 'Liberado para iniciar o serviço' },
  execucao: { titulo: 'Em execução', curto: 'Execução', dica: 'Serviço em andamento' },
  pronto: { titulo: 'Pronto', curto: 'Pronto', dica: 'Aguardando retirada' },
  recusada: { titulo: 'Recusado', curto: 'Recusado', dica: 'Cliente não aprovou o orçamento' },
  entregue: { titulo: 'Entregue', curto: 'Entregue', dica: 'Veículo retirado pelo cliente' },
}

export const ETAPAS = [
  { tipo: 'orcamento', nome: 'Orçamento' },
  { tipo: 'aprovacao', nome: 'Aprovação' },
  { tipo: 'execucao', nome: 'Execução' },
  { tipo: 'pronto', nome: 'Pronto' },
]

export const TIPOS_VEICULO = [
  { valor: 'cars', nome: 'Carro' },
  { valor: 'motorcycles', nome: 'Moto' },
  { valor: 'trucks', nome: 'Caminhão' },
]

import { Inbox, Stethoscope, Calculator, ThumbsUp, Wrench, CircleCheckBig, KeyRound, BadgeCheck, CircleX } from 'lucide-react'

// As 7 etapas da OS, na ordem
export const ETAPAS = [
  { tipo: 'recebido', nome: 'Recebido', icone: Inbox, cor: 'var(--color-recebido)' },
  { tipo: 'diagnostico', nome: 'Diagnóstico', icone: Stethoscope, cor: 'var(--color-diagnostico)' },
  { tipo: 'orcamento', nome: 'Orçamento', icone: Calculator, cor: 'var(--color-orcamento)' },
  { tipo: 'aprovacao', nome: 'Aprovação', icone: ThumbsUp, cor: 'var(--color-aprovacao)' },
  { tipo: 'execucao', nome: 'Execução', icone: Wrench, cor: 'var(--color-execucao)' },
  { tipo: 'pronto', nome: 'Pronto', icone: CircleCheckBig, cor: 'var(--color-pronto)' },
  { tipo: 'entregue', nome: 'Entregue', icone: KeyRound, cor: 'var(--color-entregue)' },
]

// Estado resumido da OS (coluna do quadro), com textos para a oficina e para o cliente
export const ESTADOS = {
  recebido: { nome: 'Recebido', cor: 'var(--color-recebido)', icone: Inbox, oficina: 'Veículo recebido', cliente: 'Recebemos seu veículo' },
  diagnostico: { nome: 'Diagnóstico', cor: 'var(--color-diagnostico)', icone: Stethoscope, oficina: 'Avaliar o veículo', cliente: 'Estamos avaliando seu veículo' },
  orcamento: { nome: 'Orçamento', cor: 'var(--color-orcamento)', icone: Calculator, oficina: 'Montar e enviar orçamento', cliente: 'Estamos montando seu orçamento' },
  aprovacao: { nome: 'Aguardando cliente', cor: 'var(--color-aprovacao)', icone: ThumbsUp, oficina: 'Orçamento enviado', cliente: 'Seu orçamento está pronto' },
  aprovado: { nome: 'Aprovado', cor: 'var(--color-aprovado)', icone: BadgeCheck, oficina: 'Liberado para iniciar', cliente: 'Orçamento aprovado' },
  execucao: { nome: 'Em execução', cor: 'var(--color-execucao)', icone: Wrench, oficina: 'Serviço em andamento', cliente: 'Serviço em andamento' },
  pronto: { nome: 'Pronto', cor: 'var(--color-pronto)', icone: CircleCheckBig, oficina: 'Aguardando retirada', cliente: 'Pronto para retirada' },
  entregue: { nome: 'Entregue', cor: 'var(--color-entregue)', icone: KeyRound, oficina: 'Retirado pelo cliente', cliente: 'Veículo entregue' },
  recusada: { nome: 'Recusado', cor: 'var(--color-recusada)', icone: CircleX, oficina: 'Orçamento recusado', cliente: 'Orçamento não aprovado' },
}

export const COLUNAS_QUADRO = ['diagnostico', 'orcamento', 'aprovacao', 'aprovado', 'execucao', 'pronto']

/** Índice (0–6) da etapa em que a OS está, para barras de progresso. */
export function indiceAtual(etapas, situacao) {
  if (situacao === 'finalizada') return 6
  const i = etapas.findIndex((e) => e.status === 'em_andamento' || e.status === 'recusada')
  if (i >= 0) return i
  let ultimo = 0
  etapas.forEach((e, k) => { if (e.status === 'concluida') ultimo = k })
  return ultimo + 0.5 // entre etapas (ex.: aprovado, aguardando início)
}

import { Link, Navigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Plus, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { moeda, moedaCurta, nomeVeiculo } from '../lib/formato'
import { Botao, ErroCarga, Esqueleto, NumeroAnimado, Placa, Selo, useDados, lista, itemLista } from '../ui/base'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const COR_SITUACAO = { aguardando: '#f5a300', aprovado: '#12b76a', execucao: '#a78bfa', elaboracao: '#5b7cff', finalizado: '#5ee69a', recusado: '#f04438' }

function Dica({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl bg-[#050916] border border-white/10 text-white px-3.5 py-2.5 shadow-xl text-[13.5px]">
      <p className="text-white/60 font-semibold">{label}</p>
      <p className="font-bold num text-[15px]">{moeda(payload[0].value)}</p>
    </div>
  )
}

const Cartao = ({ children, className = '', atraso = 0 }) => (
  <motion.section className={`rounded-3xl border border-linha bg-superficie/80 backdrop-blur p-6 ${className}`}
    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: atraso, type: 'spring', stiffness: 220, damping: 26 }}>
    {children}
  </motion.section>
)

export default function Painel() {
  const { usuario } = useAuth()
  const { dados: p, erro, recarregar } = useDados(() => (usuario.papel === 'admin' ? api.painel(6) : Promise.resolve(null)), [])
  const { dados: est } = useDados(() => api.integracoes(), [])
  if (usuario.papel !== 'admin') return <Navigate to="/oficina/patio" replace />

  const hoje = new Date()
  const dataTopo = hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()
  const serie = p?.serie.map((s, i, arr) => ({ ...s, nome: MESES[Number(s.mes.slice(5)) - 1], atual: i === arr.length - 1 })) || []
  const variacao = p?.kpis.variacao_faturamento
  const totalSituacoes = p?.situacoes.reduce((t, s) => t + s.total, 0) || 0

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <p className="text-[12px] font-bold tracking-[0.16em] text-tinta-3">{dataTopo}</p>
          <h1 className="text-[34px] font-extrabold tracking-[-0.02em] leading-tight mt-1">Visão geral</h1>
          <p className="text-tinta-2 mt-1">{est?.oficina?.nome || 'Sua oficina'} · indicadores do mês</p>
        </div>
        <Botao as={Link} to="/oficina/ordens/nova" icone={Plus}>Abrir OS</Botao>
      </div>

      {erro && <ErroCarga erro={erro} tentar={recarregar} />}
      {!p && !erro && <div className="grid lg:grid-cols-[1.7fr_1fr] gap-4"><Esqueleto className="h-[380px] !rounded-3xl" /><Esqueleto className="h-[380px] !rounded-3xl" /></div>}

      {p && (
        <>
          <div className="grid xl:grid-cols-[1.7fr_1fr] gap-4">
            <Cartao>
              <p className="text-[12px] font-bold tracking-[0.14em] text-tinta-3">FATURAMENTO DE {MESES_LONGOS[hoje.getMonth()].toUpperCase()}</p>
              <p className="text-[44px] font-extrabold tracking-[-0.03em] leading-tight mt-1"><NumeroAnimado valor={p.kpis.faturamento_mes} formatar={moeda} /></p>
              <p className="flex flex-wrap items-center gap-2 text-[14px] text-tinta-2 mt-1">
                {variacao != null && (
                  <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-bold ${variacao >= 0 ? 'bg-ok-bg text-ok' : 'bg-erro-bg text-erro'}`}>
                    {variacao >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}{variacao >= 0 ? '+' : ''}{Math.round(variacao * 100)}%
                  </span>
                )}
                em relação ao mês anterior · {p.kpis.entregues_mes} {p.kpis.entregues_mes === 1 ? 'serviço entregue' : 'serviços entregues'}
              </p>
              <div className="h-[260px] mt-6 -mx-2">
                <ResponsiveContainer>
                  <BarChart data={serie} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="rgba(255,255,255,.07)" />
                    <XAxis dataKey="nome" axisLine={false} tickLine={false} tick={{ fill: '#7a86b0', fontSize: 13, fontFamily: 'ui-monospace, monospace' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#7a86b0', fontSize: 12, fontFamily: 'ui-monospace, monospace' }} tickFormatter={(v) => (v >= 1000 ? `${v / 1000} mil` : v)} width={58} />
                    <Tooltip content={<Dica />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
                    <Bar dataKey="faturamento" radius={[6, 6, 0, 0]} barSize={34} animationDuration={1100}>
                      {serie.map((s) => <Cell key={s.mes} fill={s.atual ? '#7f98ff' : '#3d5bff'} />)}
                      <LabelList dataKey="faturamento" position="top" content={({ x, y, width, value, index }) => index === serie.length - 1 && value ? <text x={x + width / 2} y={y - 8} textAnchor="middle" fill="#eef1ff" fontSize={13} fontWeight={700}>{moedaCurta(value)}</text> : null} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Cartao>

            <Cartao atraso={0.08} className="flex flex-col">
              <p className="text-[12px] font-bold tracking-[0.14em] text-tinta-3">SITUAÇÃO DAS ORDENS</p>
              <div className="flex h-2.5 rounded-full overflow-hidden mt-4 bg-trilho">
                {p.situacoes.filter((s) => s.total).map((s) => (
                  <motion.span key={s.chave} style={{ background: COR_SITUACAO[s.chave] }} initial={{ width: 0 }} animate={{ width: `${(s.total / (totalSituacoes || 1)) * 100}%` }} transition={{ duration: 0.9, delay: 0.3 }} />
                ))}
              </div>
              <ul className="mt-4 divide-y divide-linha">
                {p.situacoes.map((s) => (
                  <li key={s.chave} className="flex items-center gap-3 py-2.5 text-[15px]">
                    <span className="size-2.5 rounded-full" style={{ background: COR_SITUACAO[s.chave] }} />
                    <span className="flex-1 font-medium">{s.nome}</span>
                    <span className="font-bold num">{s.total}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-4 grid grid-cols-2 gap-4 border-t border-linha">
                <div><p className="text-[24px] font-extrabold num">{moeda(p.kpis.ticket_medio).replace(',00', '')}</p><p className="text-[13px] text-tinta-3">Ticket médio</p></div>
                <div><p className="text-[24px] font-extrabold num">{p.kpis.taxa_aprovacao == null ? '—' : `${Math.round(p.kpis.taxa_aprovacao * 100)}%`}</p><p className="text-[13px] text-tinta-3">Aprovação de orçamentos</p></div>
              </div>
            </Cartao>
          </div>

          <div className="grid xl:grid-cols-2 gap-4 mt-4">
            <Cartao atraso={0.14}>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-[18px] font-bold">Pátio agora</h2>
                <span className="text-[14px] text-tinta-3 num">{p.patio.length} {p.patio.length === 1 ? 'veículo' : 'veículos'}</span>
              </div>
              <motion.ul className="space-y-2" variants={lista} initial="initial" animate="animate">
                {p.patio.map((o) => (
                  <motion.li key={o.id} variants={itemLista}>
                    <Link to={`/oficina/ordens/${o.id}`} className="flex items-center gap-4 rounded-2xl border border-linha bg-white/[.02] hover:bg-white/[.06] hover:border-linha-forte px-4 py-3 transition">
                      <Placa placa={o.placa} tamanho="m" />
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold truncate">{nomeVeiculo(o)}</span>
                        <span className="block text-[13.5px] text-tinta-3 truncate">{o.cliente_nome}</span>
                      </span>
                      <Selo estado={o.aguardando_peca ? 'execucao' : o.etapa_atual} />
                    </Link>
                  </motion.li>
                ))}
                {!p.patio.length && <p className="text-tinta-3 py-6 text-center">Nenhum veículo no pátio.</p>}
              </motion.ul>
            </Cartao>

            <Cartao atraso={0.2}>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-[18px] font-bold">Histórico de inspeções</h2>
                <Link to="/oficina/inspecao" className="text-[14px] font-semibold text-[#9db2ff] inline-flex items-center gap-0.5">Ver todas<ChevronRight className="size-4" /></Link>
              </div>
              <motion.ul className="space-y-2" variants={lista} initial="initial" animate="animate">
                {p.inspecoes.map((o) => (
                  <motion.li key={o.id} variants={itemLista}>
                    <Link to={`/oficina/inspecao/${o.id}`} className="flex items-center gap-4 rounded-2xl border border-linha bg-white/[.02] hover:bg-white/[.06] hover:border-linha-forte px-4 py-3 transition">
                      <Placa placa={o.placa} tamanho="m" />
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold truncate">{nomeVeiculo(o)}</span>
                        <span className="block text-[13.5px] text-tinta-3 truncate">nº {o.id} · {o.cliente_nome} · {o.qtd_avarias} {o.qtd_avarias === 1 ? 'avaria' : 'avarias'}</span>
                      </span>
                      <ChevronRight className="size-5 text-tinta-3" />
                    </Link>
                  </motion.li>
                ))}
              </motion.ul>
            </Cartao>
          </div>
        </>
      )}
    </>
  )
}
